import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { NoxV3Actor } from './src/actor.js';

export default class NoxV3Extension extends Extension {
    enable() {
        this._actor = new NoxV3Actor(this.path);
        this._actor.enable();
    }

    disable() {
        this._actor?.disable();
        this._actor = null;
    }
}
