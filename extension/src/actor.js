import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { createBody } from './core/body.js';
import { NoxV3Controller } from './core/controller.js';
import { CLICK_RUN_MAX_DISTANCE, JumpAnimationVariant, TICK_MS } from './core/constants.js';
import { isRestHoldAction } from './core/action-state.js';
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
import { createWorldSnapshot } from './world/world.js';
import { windowPlatformSurfaces } from './shell/windows.js';
import { loadAnimationFrames } from './animation/catalog.js';
import { AnimationPlayback, renderModeForState } from './animation/playback.js';

const FATIGUE_GAUGE_CLASSES = Object.freeze([
    'nox-v3-fatigue-fill-rested',
    'nox-v3-fatigue-fill-mid',
    'nox-v3-fatigue-fill-low',
    'nox-v3-fatigue-fill-resting',
]);

export class NoxV3Actor {
    constructor(extensionUrl, settings) {
        this.extensionUrl = extensionUrl;
        this.settings = settings;
        this.settingsSignalIds = [];
        this.timerId = 0;
        this.animation = new AnimationPlayback();
        this.config = null;
        this.frames = null;
        this.actor = null;
        this.icon = null;
        this.fatigueGauge = null;
        this.fatigueGaugeFill = null;
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
        this.worldTick = 0;
    }

    enable() {
        const screen = primaryScreen();
        this.config = readRuntimeConfig(this.settings);
        const world = this.#worldSnapshot(screen);
        this.controller = new NoxV3Controller({
            screen,
            world,
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
        this.fatigueGauge = new St.Widget({
            style_class: 'nox-v3-fatigue-gauge',
            visible: true,
            reactive: false,
        });
        this.fatigueGaugeFill = new St.Widget({
            style_class: 'nox-v3-fatigue-fill',
            visible: true,
            reactive: false,
        });
        this.fatigueGauge.add_child(this.fatigueGaugeFill);
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
        addNoxChrome(this.fatigueGauge);
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
        if (this.fatigueGauge) {
            Main.layoutManager.removeChrome(this.fatigueGauge);
            this.fatigueGauge.destroy();
        }
        this.#stopConnection();
        this.#destroyDragShield();
        this.actor = null;
        this.icon = null;
        this.fatigueGauge = null;
        this.fatigueGaugeFill = null;
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
        this.animation.clearRestVariant();
        this.worldTick = 0;
    }

    #tick() {
        if (this.drag)
            return;
        this.controller.tick(this.#worldSnapshot());
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
        for (const key of ['gravity-profile'])
            this.settingsSignalIds.push(this.settings.connect(`changed::${key}`, () => this.#updateConfig()));
        this.settingsSignalIds.push(this.settings.connect('changed::jump-command-seq', () => this.#tryManualJump(
            JumpAnimationVariant.V1,
            'jump-command-result'
        )));
        this.settingsSignalIds.push(this.settings.connect('changed::generated-jump-command-seq', () => this.#tryManualJump(
            JumpAnimationVariant.GENERATED,
            'generated-jump-command-result'
        )));
        this.settingsSignalIds.push(this.settings.connect('changed::rest-command-seq', () => this.#tryManualRest()));
        for (const key of ['websocket-url', 'token', 'cert-fingerprint', 'manual-disconnected'])
            this.settingsSignalIds.push(this.settings.connect(`changed::${key}`, () => this.#restartConnection()));
    }

    #tryManualRest() {
        const result = this.controller.tryRestNow(this.#worldSnapshot());
        this.settings.set_string('rest-command-result', restCommandResultLabel(result));
        if (result === 'started') {
            this.#resetFrameAnimation();
            this.#applyDirectionMirror();
            this.#layout();
        }
    }

    #tryManualJump(animationVariant, resultKey) {
        const result = this.controller.tryJumpNow(this.#worldSnapshot(), animationVariant);
        this.settings.set_string(resultKey, jumpCommandResultLabel(result));
        if (result === 'started') {
            this.#resetFrameAnimation();
            this.#applyDirectionMirror();
            this.#layout();
        }
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
            if (clickDistance(pendingDrag, stageX, stageY) <= CLICK_RUN_MAX_DISTANCE && !this.#messageBubbleVisible()) {
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
        const frame = this.animation.advance(this.controller.state, this.frames, this.config);
        if (frame)
            this.icon.set_gicon(frame);
    }

    #resetFrameAnimation(mode = renderModeForState(this.controller.state)) {
        this.icon?.set_gicon(this.animation.reset(mode, this.frames));
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
        this.#layoutFatigueGauge(body);
        if (this.bubble?.visible) {
            const layout = bubbleLayout(this.controller.state.screen, body, this.bubbleText.text);
            this.bubble.set_position(Math.round(layout.x), Math.round(layout.y));
            this.bubble.set_size(layout.width, layout.height);
            this.bubbleText.set_width(bubbleTextWidth(layout));
        }
    }

    #layoutFatigueGauge(body) {
        if (!this.fatigueGauge || !this.fatigueGaugeFill)
            return;
        const fatigue = this.controller.state.needs.fatigue;
        const gaugeWidth = Math.max(14, Math.round(body.width * 0.36));
        const gaugeHeight = 4;
        const screen = this.controller.state.screen;
        const fillWidth = Math.max(1, Math.round(gaugeWidth * fatigue / 100));
        const x = body.x + (body.width - gaugeWidth) / 2;
        const y = Math.max(screen.y + 2, body.y - gaugeHeight - 4);
        this.fatigueGauge.set_position(Math.round(x), Math.round(y));
        this.fatigueGauge.set_size(gaugeWidth, gaugeHeight);
        this.fatigueGaugeFill.set_position(0, 0);
        this.fatigueGaugeFill.set_size(fillWidth, gaugeHeight);
        this.#setFatigueGaugeClass(fatigueGaugeClass(fatigue, isRestHoldAction(this.controller.state.activeAction)));
    }

    #setFatigueGaugeClass(styleClass) {
        for (const name of FATIGUE_GAUGE_CLASSES)
            this.fatigueGaugeFill.remove_style_class_name?.(name);
        this.fatigueGaugeFill.add_style_class_name?.(styleClass);
    }

    #showMessageBubble(message) {
        this.messageQueue = enqueueMessage(this.messageQueue, message);
        this.#showActiveMessage();
    }

    #showActiveMessage() {
        const message = activeMessage(this.messageQueue);
        if (!message) {
            this.controller.releaseMessageHold();
            this.bubble.visible = false;
            this.#syncControllerConfig();
            return;
        }
        this.controller.startMessageHold();
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

    #worldSnapshot(screen = primaryScreen()) {
        return createWorldSnapshot(screen, windowPlatformSurfaces(screen), this.worldTick++);
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

function fatigueGaugeClass(fatigue, resting) {
    if (resting)
        return 'nox-v3-fatigue-fill-resting';
    if (fatigue < 20)
        return 'nox-v3-fatigue-fill-low';
    if (fatigue < 55)
        return 'nox-v3-fatigue-fill-mid';
    return 'nox-v3-fatigue-fill-rested';
}

function jumpCommandResultLabel(result) {
    return {
        started: 'Jump started',
        waiting: 'Waiting for next opportunity',
        'roll-failed': 'No jump this roll',
        fatigued: 'Too fatigued',
        busy: 'Busy',
        'not-grounded': 'Not grounded',
        unsupported: 'No support',
        'no-candidate': 'No reachable target',
    }[result] || 'No jump';
}

function restCommandResultLabel(result) {
    return {
        started: 'Rest started',
        waiting: 'Waiting for next opportunity',
        'roll-failed': 'No rest this roll',
        'not-fatigued': 'Not fatigued',
        busy: 'Busy',
        'not-grounded': 'Not grounded',
        unsupported: 'No support',
    }[result] || 'No rest';
}
