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

export default class NoxV3Preferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Nox V3' });

        group.add(spinRow(settings, 'nox-scale-percent', 'Size', 20, 200, 5));
        group.add(profileRow(settings));
        group.add(spinRow(settings, 'walking-speed-percent', 'Walking Speed', 40, 160, 5));

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

function profileRow(settings) {
    const model = Gtk.StringList.new(PROFILES.map(profile => profile.label));
    const row = new Adw.ComboRow({
        title: 'Movement Profile',
        model,
    });

    const sync = () => {
        const active = PROFILES.findIndex(profile => profile.id === settings.get_string('movement-profile'));
        row.selected = active >= 0 ? active : PROFILES.findIndex(profile => profile.id === 'balanced');
    };

    row.connect('notify::selected', () => {
        const profile = PROFILES[row.selected] || PROFILES[1];
        if (settings.get_string('movement-profile') !== profile.id)
            settings.set_string('movement-profile', profile.id);
    });
    settings.connect('changed::movement-profile', sync);
    sync();
    return row;
}
