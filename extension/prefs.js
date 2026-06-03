import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const PROFILES = [
    { id: 'calm', label: 'Calm' },
    { id: 'balanced', label: 'Balanced' },
    { id: 'snappy', label: 'Snappy' },
    { id: 'smooth', label: 'Smooth' },
];

const GRAVITY_PROFILES = [
    { id: 'earth', label: 'Earth-like' },
    { id: 'moon', label: 'Moon-like' },
];

export default class NoxV3Preferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Nox V3' });

        group.add(spinRow(settings, 'nox-scale-percent', 'Size', 20, 200, 5));
        group.add(comboRow(settings, 'movement-profile', 'Movement Profile', PROFILES, 'balanced'));
        group.add(spinRow(settings, 'walking-speed-percent', 'Walking Speed', 40, 160, 5));
        group.add(comboRow(settings, 'gravity-profile', 'Gravity Profile', GRAVITY_PROFILES, 'earth'));

        page.add(group);
        window.add(page);
    }
}

function spinRow(settings, key, title, min, max, step) {
    const row = new Adw.ActionRow({ title });
    const spin = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({ lower: min, upper: max, step_increment: step }),
        numeric: true,
    });
    settings.bind(key, spin, 'value', Gio.SettingsBindFlags.DEFAULT);
    row.add_suffix(spin);
    row.activatable_widget = spin;
    return row;
}

function comboRow(settings, key, title, profiles, fallbackId) {
    const model = Gtk.StringList.new(profiles.map(profile => profile.label));
    const row = new Adw.ComboRow({
        title,
        model,
    });

    const sync = () => {
        const active = profiles.findIndex(profile => profile.id === settings.get_string(key));
        row.selected = active >= 0 ? active : profiles.findIndex(profile => profile.id === fallbackId);
    };

    row.connect('notify::selected', () => {
        const profile = profiles[row.selected] || profiles.find(item => item.id === fallbackId);
        if (settings.get_string(key) !== profile.id)
            settings.set_string(key, profile.id);
    });
    settings.connect(`changed::${key}`, sync);
    sync();
    return row;
}
