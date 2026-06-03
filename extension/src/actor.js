import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { createBody } from './core/body.js';
import { NoxV3Controller } from './core/controller.js';
import { TICK_MS, WALK_FRAME_COUNT, WALK_FRAME_TICKS } from './core/constants.js';

export class NoxV3Actor {
    constructor(extensionPath) {
        this.extensionPath = extensionPath;
        this.timerId = 0;
        this.frameIndex = 0;
        this.frameTick = 0;
        this.frames = [];
        this.actor = null;
        this.icon = null;
        this.controller = null;
    }

    enable() {
        const screen = primaryScreen();
        this.controller = new NoxV3Controller({
            screen,
            body: createBody(screen),
        });
        this.frames = loadWalkFrames(this.extensionPath);
        this.actor = new St.Widget({
            style_class: 'nox-v3-root',
            visible: true,
            reactive: false,
        });
        this.icon = new St.Icon({
            gicon: this.frames[0],
            icon_size: this.controller.state.body.height,
            style: 'padding: 0px; object-fit: fill;',
        });
        this.actor.add_child(this.icon);
        Main.layoutManager.addChrome(this.actor);
        this.#layout();
        this.timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, () => {
            this.#tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
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
        this.frames = [];
    }

    #tick() {
        this.controller.tick();
        this.#advanceWalkFrame();
        this.#layout();
    }

    #advanceWalkFrame() {
        this.frameTick++;
        if (this.frameTick < WALK_FRAME_TICKS)
            return;
        this.frameTick = 0;
        this.frameIndex = (this.frameIndex + 1) % this.frames.length;
        this.icon.set_gicon(this.frames[this.frameIndex]);
    }

    #layout() {
        const body = this.controller.state.body;
        this.actor.set_position(Math.round(body.x), Math.round(body.y));
        this.actor.set_size(Math.ceil(body.width), Math.ceil(body.height));
        this.icon.set_size(Math.ceil(body.width), Math.ceil(body.height));
        this.icon.set_icon_size(Math.ceil(body.height));
    }
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

function loadWalkFrames(extensionPath) {
    const root = Gio.File.new_for_path(extensionPath)
        .get_child('assets')
        .get_child('nox')
        .get_child('walk');
    const frames = [];
    for (let i = 0; i < WALK_FRAME_COUNT; i++)
        frames.push(new Gio.FileIcon({ file: root.get_child(`${i}.webp`) }));
    return frames;
}
