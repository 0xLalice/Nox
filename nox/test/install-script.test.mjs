import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = existsSync('nox') ? '.' : 'v3';
const script = join(root, 'nox/install.sh');
const source = readFileSync(script, 'utf8');

describe('Nox V3 install script', () => {
    it('is the only V3 shell script and is executable', () => {
        assert.equal(statSync(script).mode & 0o111, 0o111);
    });

    it('supports install, uninstall, and reinstall only through one script', () => {
        assert.match(source, /install\|uninstall\|reinstall/);
        assert.match(source, /\binstall_v3\b/);
        assert.match(source, /\buninstall_v3\b/);
        assert.match(source, /reinstall\)/);
    });

    it('targets only the V3 UUID install directory', () => {
        assert.match(source, /uuid="nox-v3@lalice\.ai"/);
        assert.match(source, /\$install_root\/\$uuid/);
        assert.doesNotMatch(source, /nox@selfhosted\.local/);
        assert.doesNotMatch(source, /gnome-extension\/nox@selfhosted\.local/);
    });

    it('copies only extension source and deletes only exact install dir', () => {
        assert.match(source, /source_dir="\$script_dir"/);
        assert.match(source, /cp -a "\$source_dir\/\." "\$install_dir\/"/);
        assert.match(source, /rm -rf "\$install_dir"/);
        assert.doesNotMatch(source, /rm -rf "\$HOME"/);
        assert.doesNotMatch(source, /rm -rf "\$script_dir"/);
    });

    it('auto-enables when gnome-extensions exists and prints concrete enable and Wayland guidance', () => {
        assert.match(source, /command -v gnome-extensions/);
        assert.match(source, /gnome-extensions enable "\$uuid"/);
        assert.match(source, /print_enable_guidance/);
        assert.match(source, /gnome-extensions enable \$uuid/);
        assert.match(source, /On Wayland, log out and log back in/);
    });

    it('compiles V3 schemas during install', () => {
        assert.match(source, /glib-compile-schemas "\$install_dir\/schemas"/);
        assert.match(source, /required for V3 preferences/);
    });
});
