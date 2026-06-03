import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { createBody } from './core/body.js';
import { NoxV3Controller } from './core/controller.js';
import { TICK_MS, WALK_FRAME_COUNT } from './core/constants.js';
import { readRuntimeConfig } from './config/settings.js';

export class NoxV3Actor {
    constructor(extensionUrl, settings) {
        this.extensionUrl = extensionUrl;
        this.settings = settings;
        this.settingsSignalId = 0;
        this.timerId = 0;
        this.frameIndex = 0;
        this.frameTick = 0;
        this.config = null;
        this.frames = [];
        this.actor = null;
        this.icon = null;
        this.controller = null;
        this.drag = null;
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
        addNoxChrome(this.actor);
        this.#connectDragHandlers();
        this.#applyDirectionMirror();
        this.#layout();
        this.settingsSignalId = this.settings.connect('changed', () => this.#updateConfig());
        this.timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, () => {
            this.#tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this.settingsSignalId) {
            this.settings.disconnect(this.settingsSignalId);
            this.settingsSignalId = 0;
        }
        if (this.timerId) {
            GLib.source_remove(this.timerId);
            this.timerId = 0;
        }
        if (this.actor) {
            Main.layoutManager.removeChrome(this.actor);
            this.actor.destroy();
        }
        this.actor = null;
        this.icon = null;
        this.controller = null;
        this.drag = null;
        this.config = null;
        this.frames = [];
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

    #onDragStart(event) {
        if (event.get_button && event.get_button() !== 1)
            return Clutter.EVENT_PROPAGATE;
        const [stageX, stageY] = event.get_coords();
        const body = this.controller.state.body;
        this.drag = {
            startX: stageX,
            grabOffset: {
                x: stageX - body.x,
                y: stageY - body.y,
            },
        };
        raiseNoxAboveSiblings(this.actor);
        return Clutter.EVENT_STOP;
    }

    #onDragMove(event) {
        if (!this.drag)
            return Clutter.EVENT_PROPAGATE;
        const [stageX, stageY] = event.get_coords();
        this.controller.previewDrag(stageX, stageY, this.drag.grabOffset);
        this.#layout();
        return Clutter.EVENT_STOP;
    }

    #onDragDrop(event) {
        if (!this.drag)
            return Clutter.EVENT_PROPAGATE;
        const [stageX] = event.get_coords();
        this.controller.dropAt(stageX, this.drag.startX);
        this.drag = null;
        this.#applyDirectionMirror();
        this.#layout();
        raiseNoxAboveSiblings(this.actor);
        return Clutter.EVENT_STOP;
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
