import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { createBody } from './core/body.js';
import { NoxV3Controller } from './core/controller.js';
import { CLICK_RUN_MAX_DISTANCE, RUN_FRAME_COUNT, RUN_FRAME_TICKS, TICK_MS, WALK_FRAME_COUNT } from './core/constants.js';
import { MotionMode } from './core/types.js';
import { readRuntimeConfig } from './config/settings.js';
import { createDragTracker, estimateThrowVelocity, recordPointerSample } from './core/drag-tracker.js';
import { exceedsDragThreshold } from './core/drag-drop.js';
import { bubbleLayout, bubbleTextWidth } from './message/bubble.js';
import { messageMovementConfig } from './message/movement-modifier.js';
import {
    ackDisplayedSequence,
    activeMessage,
    createMessageQueue,
    enqueueMessage,
    messageControls,
    nextMessage,
    previousMessage,
} from './message/queue.js';
import { connectionIconVisualPlan } from './connection/visual.js';
import { NoxV3Connection } from './connection/transport.js';

export class NoxV3Actor {
    constructor(extensionUrl, settings) {
        this.extensionUrl = extensionUrl;
        this.settings = settings;
        this.settingsSignalIds = [];
        this.timerId = 0;
        this.frameIndex = 0;
        this.frameTick = 0;
        this.frameMode = MotionMode.GROUNDED;
        this.config = null;
        this.frames = null;
        this.actor = null;
        this.icon = null;
        this.controller = null;
        this.pendingDrag = null;
        this.drag = null;
        this.dragShield = null;
        this.bubble = null;
        this.bubbleText = null;
        this.bubbleControls = null;
        this.bubbleCounter = null;
        this.bubblePreviousButton = null;
        this.bubbleNextButton = null;
        this.bubbleButton = null;
        this.messageQueue = createMessageQueue();
        this.connection = null;
        this.connectionState = 'not-started';
    }

    enable() {
        const screen = primaryScreen();
        this.config = readRuntimeConfig(this.settings);
        this.controller = new NoxV3Controller({
            screen,
            config: this.config,
            body: createBody(screen, this.config),
        });
        this.frames = loadAnimationFrames(this.extensionUrl);
        this.actor = new St.Widget({
            style_class: 'nox-v3-root',
            visible: true,
            reactive: true,
        });
        this.icon = new St.Icon({
            gicon: this.frames.walk[0],
            icon_size: this.controller.state.body.height,
            style: 'padding: 0px; object-fit: fill;',
        });
        this.actor.add_child(this.icon);
        this.bubble = new St.BoxLayout({
            style_class: 'nox-v3-message-bubble',
            visible: false,
            vertical: true,
        });
        this.bubbleText = new St.Label({
            style_class: 'nox-v3-message-text',
            x_expand: true,
        });
        this.bubbleText.clutter_text.set_line_wrap(true);
        this.bubbleText.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        this.bubbleText.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        this.bubbleButton = new St.Button({
            label: 'OK',
            style_class: 'nox-v3-message-ok',
            reactive: true,
            can_focus: true,
        });
        this.bubbleControls = new St.BoxLayout({
            style_class: 'nox-v3-message-controls',
        });
        this.bubbleCounter = new St.Label({
            style_class: 'nox-v3-message-counter',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.bubblePreviousButton = new St.Button({
            label: '<',
            style_class: 'nox-v3-message-nav',
            reactive: true,
            can_focus: true,
        });
        this.bubbleNextButton = new St.Button({
            label: '>',
            style_class: 'nox-v3-message-nav',
            reactive: true,
            can_focus: true,
        });
        this.bubblePreviousButton.connect('clicked', () => this.#showPreviousMessage());
        this.bubbleNextButton.connect('clicked', () => this.#showNextMessage());
        this.bubbleButton.connect('clicked', () => this.#ackVisibleMessage());
        this.bubble.add_child(this.bubbleText);
        this.bubbleControls.add_child(this.bubblePreviousButton);
        this.bubbleControls.add_child(this.bubbleCounter);
        this.bubbleControls.add_child(this.bubbleNextButton);
        this.bubbleControls.add_child(this.bubbleButton);
        this.bubble.add_child(this.bubbleControls);
        addNoxChrome(this.bubble);
        addNoxChrome(this.actor);
        this.#connectDragHandlers();
        this.#applyDirectionMirror();
        this.#applyConnectionVisual();
        this.#layout();
        this.#connectSettings();
        this.#restartConnection();
        this.timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, () => {
            this.#tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        for (const signalId of this.settingsSignalIds)
            this.settings.disconnect(signalId);
        this.settingsSignalIds = [];
        if (this.timerId) {
            GLib.source_remove(this.timerId);
            this.timerId = 0;
        }
        if (this.actor) {
            Main.layoutManager.removeChrome(this.actor);
            this.actor.destroy();
        }
        if (this.bubble) {
            Main.layoutManager.removeChrome(this.bubble);
            this.bubble.destroy();
        }
        this.#stopConnection();
        this.#destroyDragShield();
        this.actor = null;
        this.icon = null;
        this.controller = null;
        this.pendingDrag = null;
        this.drag = null;
        this.dragShield = null;
        this.bubble = null;
        this.bubbleText = null;
        this.bubbleControls = null;
        this.bubbleCounter = null;
        this.bubblePreviousButton = null;
        this.bubbleNextButton = null;
        this.bubbleButton = null;
        this.messageQueue = createMessageQueue();
        this.connection = null;
        this.config = null;
        this.frames = null;
    }

    #tick() {
        if (this.drag)
            return;
        this.controller.tick();
        this.#advanceWalkFrame();
        this.#applyDirectionMirror();
        this.#layout();
    }

    #connectDragHandlers() {
        this.actor.connect('button-press-event', (_actor, event) => this.#onDragStart(event));
        this.actor.connect('motion-event', (_actor, event) => this.#onDragMove(event));
        this.actor.connect('button-release-event', (_actor, event) => this.#onDragDrop(event));
    }

    #connectSettings() {
        for (const key of ['nox-scale-percent', 'movement-profile', 'walking-speed-percent', 'run-length-ticks', 'run-speed-percent', 'gravity-profile'])
            this.settingsSignalIds.push(this.settings.connect(`changed::${key}`, () => this.#updateConfig()));
        for (const key of ['websocket-url', 'token', 'cert-fingerprint', 'manual-disconnected'])
            this.settingsSignalIds.push(this.settings.connect(`changed::${key}`, () => this.#restartConnection()));
    }

    #onDragStart(event) {
        if (event.get_button && event.get_button() !== 1)
            return Clutter.EVENT_PROPAGATE;
        const [stageX, stageY] = event.get_coords();
        const timeMs = eventTimeMs(event);
        const body = this.controller.state.body;
        this.pendingDrag = {
            startX: stageX,
            startY: stageY,
            grabOffset: {
                x: stageX - body.x,
                y: stageY - body.y,
            },
            tracker: createDragTracker(stageX, stageY, timeMs),
        };
        this.#createDragShield();
        raiseNoxAboveSiblings(this.actor);
        return Clutter.EVENT_STOP;
    }

    #onDragMove(event) {
        if (!this.drag && !this.pendingDrag)
            return Clutter.EVENT_PROPAGATE;
        const [stageX, stageY] = event.get_coords();
        const current = this.drag || this.pendingDrag;
        current.tracker = recordPointerSample(current.tracker, stageX, stageY, eventTimeMs(event));
        if (!this.drag) {
            if (!exceedsDragThreshold(current.startX, current.startY, stageX, stageY))
                return Clutter.EVENT_STOP;
            this.drag = current;
            this.pendingDrag = null;
            this.controller.startDrag();
        }
        this.controller.previewDrag(stageX, stageY, this.drag.grabOffset);
        this.#layout();
        return Clutter.EVENT_STOP;
    }

    #onDragDrop(event) {
        if (!this.drag && !this.pendingDrag)
            return Clutter.EVENT_PROPAGATE;
        const [stageX, stageY] = event.get_coords();
        if (!this.drag) {
            const pendingDrag = this.pendingDrag;
            this.pendingDrag = null;
            this.#destroyDragShield();
            if (clickDistance(pendingDrag, stageX, stageY) <= CLICK_RUN_MAX_DISTANCE) {
                this.controller.startRun();
                this.#resetFrameAnimation();
                this.#applyDirectionMirror();
                this.#layout();
            }
            return Clutter.EVENT_STOP;
        }
        this.drag.tracker = recordPointerSample(this.drag.tracker, stageX, stageY, eventTimeMs(event));
        this.controller.previewDrag(stageX, stageY, this.drag.grabOffset);
        this.controller.releaseDrag(stageX, this.drag.startX, estimateThrowVelocity(this.drag.tracker, TICK_MS));
        this.drag = null;
        this.#destroyDragShield();
        this.#applyDirectionMirror();
        this.#layout();
        raiseNoxAboveSiblings(this.actor);
        return Clutter.EVENT_STOP;
    }

    #createDragShield() {
        this.#destroyDragShield();
        const screen = this.controller.state.screen;
        this.dragShield = new St.Widget({
            style_class: 'nox-v3-drag-shield',
            visible: true,
            reactive: true,
        });
        this.dragShield.set_position(screen.x, screen.y);
        this.dragShield.set_size(screen.width, screen.height);
        this.dragShield.connect('motion-event', (_actor, event) => this.#onDragMove(event));
        this.dragShield.connect('button-release-event', (_actor, event) => this.#onDragDrop(event));
        addNoxChrome(this.dragShield);
        raiseNoxAboveSiblings(this.actor);
    }

    #destroyDragShield() {
        if (!this.dragShield)
            return;
        Main.layoutManager.removeChrome(this.dragShield);
        this.dragShield.destroy();
        this.dragShield = null;
    }

    #advanceWalkFrame() {
        const mode = this.controller.state.motion.mode === MotionMode.RUNNING
            ? MotionMode.RUNNING
            : MotionMode.GROUNDED;
        if (mode !== this.frameMode)
            this.#resetFrameAnimation(mode);
        const frameSet = mode === MotionMode.RUNNING ? this.frames.run : this.frames.walk;
        const frameTicks = mode === MotionMode.RUNNING ? RUN_FRAME_TICKS : this.config.walkFrameTicks;
        this.frameTick++;
        if (this.frameTick < frameTicks)
            return;
        this.frameTick = 0;
        this.frameIndex = (this.frameIndex + 1) % frameSet.length;
        this.icon.set_gicon(frameSet[this.frameIndex]);
    }

    #resetFrameAnimation(mode = this.controller.state.motion.mode) {
        this.frameMode = mode === MotionMode.RUNNING ? MotionMode.RUNNING : MotionMode.GROUNDED;
        this.frameIndex = 0;
        this.frameTick = 0;
        const frameSet = this.frameMode === MotionMode.RUNNING ? this.frames.run : this.frames.walk;
        this.icon?.set_gicon(frameSet[0]);
    }

    #updateConfig() {
        this.config = readRuntimeConfig(this.settings);
        this.#syncControllerConfig();
        this.#applyDirectionMirror();
        this.#layout();
    }

    #applyDirectionMirror() {
        this.icon.set_pivot_point(0.5, 0.5);
        this.icon.set_scale(this.controller.state.body.direction < 0 ? -1 : 1, 1);
    }

    #layout() {
        const body = this.controller.state.body;
        this.actor.set_position(Math.round(body.x), Math.round(body.y));
        this.actor.set_size(Math.ceil(body.width), Math.ceil(body.height));
        this.icon.set_size(Math.ceil(body.width), Math.ceil(body.height));
        this.icon.set_icon_size(Math.ceil(body.height));
        if (this.bubble?.visible) {
            const layout = bubbleLayout(this.controller.state.screen, body, this.bubbleText.text);
            this.bubble.set_position(Math.round(layout.x), Math.round(layout.y));
            this.bubble.set_size(layout.width, layout.height);
            this.bubbleText.set_width(bubbleTextWidth(layout));
        }
    }

    #showMessageBubble(message) {
        this.messageQueue = enqueueMessage(this.messageQueue, message);
        this.#showActiveMessage();
    }

    #showActiveMessage() {
        const message = activeMessage(this.messageQueue);
        if (!message) {
            this.bubble.visible = false;
            this.#syncControllerConfig();
            return;
        }
        const controls = messageControls(this.messageQueue);
        this.bubbleText.text = message.text;
        this.bubbleCounter.text = controls.counterLabel;
        this.bubblePreviousButton.visible = controls.canPrevious;
        this.bubbleNextButton.visible = controls.canNext;
        this.bubbleButton.visible = controls.canDone;
        this.bubble.visible = true;
        this.#syncControllerConfig();
        this.#layout();
        raiseNoxAboveSiblings(this.bubble);
    }

    #showPreviousMessage() {
        this.messageQueue = previousMessage(this.messageQueue);
        this.#showActiveMessage();
    }

    #showNextMessage() {
        this.messageQueue = nextMessage(this.messageQueue);
        this.#showActiveMessage();
    }

    #ackVisibleMessage() {
        const result = ackDisplayedSequence(this.messageQueue);
        this.messageQueue = result.queue;
        if (result.ackLastId)
            this.connection?.ackAll(result.ackLastId);
        this.#showActiveMessage();
    }

    #syncControllerConfig() {
        this.controller.updateConfig(messageMovementConfig(this.config, this.#messageBubbleVisible()));
    }

    #messageBubbleVisible() {
        return Boolean(this.bubble?.visible);
    }

    #restartConnection() {
        this.#stopConnection();
        this.connection = new NoxV3Connection(this.settings, {
            onState: state => this.#setConnectionState(state),
            onMessage: message => {
                this.#showMessageBubble(message);
            },
        });
        this.connection.start();
    }

    #stopConnection() {
        this.connection?.stop();
        this.connection = null;
    }

    #setConnectionState(state) {
        this.connectionState = state;
        try {
            this.settings.set_string('connection-state', state);
        } catch (e) {
        }
        this.#applyConnectionVisual();
    }

    #applyConnectionVisual() {
        const plan = connectionIconVisualPlan(this.connectionState);
        this.icon.opacity = plan.opacity;
        removeNamedEffect(this.icon, plan.effectName);
        if (plan.forceGrayscale && Clutter.DesaturateEffect && this.icon.add_effect_with_name)
            this.icon.add_effect_with_name(plan.effectName, new Clutter.DesaturateEffect({ factor: 1.0 }));
    }
}

function addNoxChrome(actor) {
    if (Main.layoutManager.addTopChrome)
        Main.layoutManager.addTopChrome(actor);
    else
        Main.layoutManager.addChrome(actor);
    raiseNoxAboveSiblings(actor);
}

function raiseNoxAboveSiblings(actor) {
    const uiGroup = Main.layoutManager.uiGroup;
    if (!uiGroup?.set_child_above_sibling || actor.get_parent?.() !== uiGroup)
        return;

    const dockContainer = findDockContainer(uiGroup);
    if (dockContainer?.get_parent?.() === uiGroup)
        uiGroup.set_child_above_sibling(actor, dockContainer);
    else
        uiGroup.set_child_above_sibling(actor, null);
}

function findDockContainer(uiGroup) {
    for (const child of uiGroup.get_children?.() || []) {
        if (child.constructor?.name === 'DashToDock')
            return child;
        if (child.first_child?.first_child?.style_class?.startsWith('dashtopanelPanel'))
            return child;
    }
    return null;
}

function removeNamedEffect(actor, effectName) {
    actor.remove_effect_by_name?.(effectName);
    const effect = actor.get_effect?.(effectName);
    if (effect)
        actor.remove_effect?.(effect);
}

function primaryScreen() {
    const monitor = Main.layoutManager.primaryMonitor;
    return {
        x: monitor.x,
        y: monitor.y,
        width: monitor.width,
        height: monitor.height,
    };
}

function loadAnimationFrames(extensionUrl) {
    const root = Gio.File.new_for_uri(extensionUrl)
        .get_parent()
        .get_child('assets')
        .get_child('nox')
    return Object.freeze({
        walk: loadNumberedFrames(root.get_child('walk'), WALK_FRAME_COUNT),
        run: loadNumberedFrames(root.get_child('run'), RUN_FRAME_COUNT),
    });
}

function loadNumberedFrames(root, count) {
    const frames = [];
    for (let i = 0; i < count; i++)
        frames.push(new Gio.FileIcon({ file: root.get_child(`${i}.webp`) }));
    return frames;
}

function eventTimeMs(event) {
    if (event.get_time)
        return event.get_time();
    return Math.floor(GLib.get_monotonic_time() / 1000);
}

function clickDistance(pendingDrag, stageX, stageY) {
    if (!pendingDrag)
        return Number.POSITIVE_INFINITY;
    return Math.hypot(stageX - pendingDrag.startX, stageY - pendingDrag.startY);
}
