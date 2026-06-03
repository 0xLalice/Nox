import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { NoxV3ConnectionTester } from './src/connection/transport.js';

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
        this._connectionTester = null;
        const page = new Adw.PreferencesPage();

        const connection = new Adw.PreferencesGroup({ title: 'Connection' });
        page.add(connection);

        const urlRow = new Adw.EntryRow({ title: 'WebSocket URL' });
        settings.bind('websocket-url', urlRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        connection.add(urlRow);

        const tokenRow = new Adw.PasswordEntryRow({ title: 'Token' });
        settings.bind('token', tokenRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        connection.add(tokenRow);

        const fingerprintRow = new Adw.EntryRow({ title: 'Certificate Fingerprint' });
        settings.bind('cert-fingerprint', fingerprintRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        connection.add(fingerprintRow);

        const statusRow = new Adw.ActionRow({ title: 'Current Connection Status' });
        settings.bind('connection-state', statusRow, 'subtitle', Gio.SettingsBindFlags.DEFAULT);
        connection.add(statusRow);

        const pauseRow = new Adw.ActionRow({ title: 'Pause Background Connection' });
        const pauseSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        settings.bind('manual-disconnected', pauseSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        pauseRow.add_suffix(pauseSwitch);
        connection.add(pauseRow);

        const testRow = new Adw.ActionRow({
            title: 'Test Connection',
            subtitle: 'Not tested',
        });
        const testButton = new Gtk.Button({ label: 'Connect', valign: Gtk.Align.CENTER });
        testButton.connect('clicked', () => {
            testButton.sensitive = false;
            testRow.subtitle = 'Connecting...';
            this._connectionTester?.stop();
            this._connectionTester = new NoxV3ConnectionTester(
                settings,
                state => testRow.subtitle = state,
                () => {
                    testButton.sensitive = true;
                    this._connectionTester = null;
                }
            );
            this._connectionTester.start();
        });
        testRow.add_suffix(testButton);
        connection.add(testRow);

        const group = new Adw.PreferencesGroup({ title: 'Nox V3' });

        group.add(spinRow(settings, 'nox-scale-percent', 'Size', 20, 200, 5));
        group.add(comboRow(settings, 'movement-profile', 'Movement Profile', PROFILES, 'balanced'));
        group.add(spinRow(settings, 'walking-speed-percent', 'Walking Speed', 40, 160, 5));
        group.add(spinRow(settings, 'run-length-ticks', 'Run Length', 7, 56, 1));
        group.add(spinRow(settings, 'run-speed-percent', 'Run Speed', 40, 220, 5));
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
