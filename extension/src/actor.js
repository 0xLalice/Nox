import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { createBody } from './core/body.js';
import { NoxV3Controller } from './core/controller.js';
import { TICK_MS, WALK_FRAME_COUNT } from './core/constants.js';
import { readRuntimeConfig } from './config/settings.js';
import { createDragTracker, estimateThrowVelocity, recordPointerSample } from './core/drag-tracker.js';
import { exceedsDragThreshold } from './core/drag-drop.js';
import { bubbleLayout } from './message/bubble.js';
import { connectionVisualState, ConnectionVisual } from './connection/visual.js';
import { NoxV3Connection } from './connection/transport.js';

export class NoxV3Actor {
    constructor(extensionUrl, settings) {
        this.extensionUrl = extensionUrl;
        this.settings = settings;
        this.settingsSignalIds = [];
        this.timerId = 0;
        this.frameIndex = 0;
        this.frameTick = 0;
        this.config = null;
        this.frames = [];
        this.actor = null;
        this.icon = null;
        this.controller = null;
        this.pendingDrag = null;
        this.drag = null;
        this.dragShield = null;
        this.bubble = null;
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
        this.frames = loadWalkFrames(this.extensionUrl);
        this.actor = new St.Widget({
            style_class: 'nox-v3-root',
            visible: true,
            reactive: true,
        });
        this.icon = new St.Icon({
            gicon: this.frames[0],
            icon_size: this.controller.state.body.height,
            style: 'padding: 0px; object-fit: fill;',
        });
        this.actor.add_child(this.icon);
        this.bubble = new St.Label({
            style_class: 'nox-v3-message-bubble',
            visible: false,
        });
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
        this.connection = null;
        this.config = null;
        this.frames = [];
    }

    #tick() {
        if (this.drag || this.pendingDrag)
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
        for (const key of ['nox-scale-percent', 'movement-profile', 'walking-speed-percent', 'gravity-profile'])
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
            this.pendingDrag = null;
            this.#destroyDragShield();
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
        this.frameTick++;
        if (this.frameTick < this.config.walkFrameTicks)
            return;
        this.frameTick = 0;
        this.frameIndex = (this.frameIndex + 1) % this.frames.length;
        this.icon.set_gicon(this.frames[this.frameIndex]);
    }

    #updateConfig() {
        this.config = readRuntimeConfig(this.settings);
        this.controller.updateConfig(this.config);
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
            const layout = bubbleLayout(this.controller.state.screen, body);
            this.bubble.set_position(Math.round(layout.x), Math.round(layout.y));
            this.bubble.set_size(layout.width, layout.height);
        }
    }

    #showMessageBubble(message) {
        this.bubble.text = message.text;
        this.bubble.visible = true;
        this.#layout();
        raiseNoxAboveSiblings(this.bubble);
    }

    #restartConnection() {
        this.#stopConnection();
        this.connection = new NoxV3Connection(this.settings, {
            onState: state => this.#setConnectionState(state),
            onMessage: message => {
                this.#showMessageBubble(message);
                this.connection?.ackAll(message.id);
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
        const visual = connectionVisualState(this.connectionState);
        const connected = visual === ConnectionVisual.CONNECTED;
        this.icon.opacity = connected ? 255 : 150;
        if (!connected && Clutter.DesaturateEffect && this.icon.add_effect_with_name)
            this.icon.add_effect_with_name('nox-v3-connection-desaturate', new Clutter.DesaturateEffect({ factor: 1.0 }));
        else if (connected && this.icon.remove_effect_by_name)
            this.icon.remove_effect_by_name('nox-v3-connection-desaturate');
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

function primaryScreen() {
    const monitor = Main.layoutManager.primaryMonitor;
    return {
        x: monitor.x,
        y: monitor.y,
        width: monitor.width,
        height: monitor.height,
    };
}

function loadWalkFrames(extensionUrl) {
    const root = Gio.File.new_for_uri(extensionUrl)
        .get_parent()
        .get_child('assets')
        .get_child('nox')
        .get_child('walk');
    const frames = [];
    for (let i = 0; i < WALK_FRAME_COUNT; i++)
        frames.push(new Gio.FileIcon({ file: root.get_child(`${i}.webp`) }));
    return frames;
}

function eventTimeMs(event) {
    if (event.get_time)
        return event.get_time();
    return Math.floor(GLib.get_monotonic_time() / 1000);
}
