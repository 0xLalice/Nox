import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { NoxV3Actor } from './src/actor.js';

export default class NoxV3Extension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._actor = new NoxV3Actor(import.meta.url, this._settings);
        this._actor.enable();
    }

    disable() {
        this._actor?.disable();
        this._actor = null;
        this._settings = null;
    }
}
