import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = existsSync('nox') ? '.' : 'v3';
const script = join(root, 'nox/install.sh');
const source = readFileSync(script, 'utf8');
const remoteScript = join(root, 'install-extension.sh');
const remoteSource = readFileSync(remoteScript, 'utf8');

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
        assert.match(source, /require_gnome_desktop/);
        assert.match(source, /This is the Nox GNOME extension installer/);
        assert.match(source, /Run it on the human GNOME desktop, not on the agent\/backend machine/);
        assert.match(source, /gnome-extensions enable "\$uuid"/);
        assert.match(source, /print_enable_guidance/);
        assert.match(source, /gnome-extensions enable \$uuid/);
        assert.match(source, /On Wayland, after installing or updating Nox, log out and log back in/);
        assert.match(source, /Then run or confirm:/);
        assert.doesNotMatch(source, /if Nox does not appear|preferences do not load/);
    });

    it('compiles V3 schemas during install', () => {
        assert.match(source, /glib-compile-schemas "\$install_dir\/schemas"/);
        assert.match(source, /required for V3 preferences/);
    });

    it('refuses wrong-machine extension installs before writing extension files', () => {
        const guardIndex = source.indexOf('require_gnome_desktop');
        const writeIndex = source.indexOf('mkdir -p "$install_root"');
        assert.ok(guardIndex >= 0);
        assert.ok(writeIndex > guardIndex);
        assert.doesNotMatch(source, /gnome-extensions not found\./);
    });

    it('local extension installer exits before writing when gnome-extensions is unavailable', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'nox-install-test-'));
        const bin = join(tmp, 'bin');
        mkdirSync(bin);
        symlinkSync('/usr/bin/dirname', join(bin, 'dirname'));
        const result = spawnSync('/bin/bash', [script, 'install'], {
            env: {
                PATH: bin,
                XDG_DATA_HOME: tmp,
            },
            encoding: 'utf8',
        });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /This is the Nox GNOME extension installer/);
        assert.match(result.stderr, /human GNOME desktop, not on the agent\/backend machine/);
        assert.equal(existsSync(join(tmp, 'gnome-shell/extensions/nox-v3@lalice.ai')), false);
    });

    it('provides a root extension-only installer for humans', () => {
        assert.equal(statSync(remoteScript).mode & 0o111, 0o111);
        assert.match(remoteSource, /uuid="nox-v3@lalice\.ai"/);
        assert.match(remoteSource, /api\.github\.com\/repos\/\$repo\/git\/trees\/\$ref\?recursive=1/);
        assert.match(remoteSource, /raw\.githubusercontent\.com\/\$repo\/\$ref/);
        assert.match(remoteSource, /mktemp -d/);
        assert.match(remoteSource, /trap 'rm -rf "\$tmp"' EXIT/);
        assert.match(remoteSource, /require_command python3/);
        assert.match(remoteSource, /require_gnome_desktop/);
        assert.match(remoteSource, /This is the Nox GNOME extension installer/);
        assert.match(remoteSource, /Run it on the human GNOME desktop, not on the agent\/backend machine/);
        assert.match(remoteSource, /curl -fsSL "\$tree_url"/);
        assert.match(remoteSource, /path\.startswith\("nox\/"\)/);
        assert.match(remoteSource, /path\.startswith\("nox\/test\/"\)/);
        assert.match(remoteSource, /path == "nox\/install\.sh"/);
        assert.match(remoteSource, /curl -fsSL "\$raw_base_url\/\$path"/);
        assert.match(remoteSource, /cp -a "\$source_dir\/\." "\$install_dir\/"/);
        assert.match(remoteSource, /glib-compile-schemas "\$install_dir\/schemas"/);
        assert.match(remoteSource, /gnome-extensions enable "\$uuid"/);
        assert.match(remoteSource, /On Wayland, after installing or updating Nox, log out and log back in/);
        assert.match(remoteSource, /Then run or confirm:/);
        assert.doesNotMatch(remoteSource, /if Nox does not appear|preferences do not load/);
        assert.doesNotMatch(remoteSource, /archive\/refs\/heads/);
        assert.doesNotMatch(remoteSource, /tar -xzf/);
        assert.doesNotMatch(remoteSource, /git clone/);
        assert.doesNotMatch(remoteSource, /backend\/install\.sh/);
        assert.doesNotMatch(remoteSource, /~\/\.nox/);
        assert.doesNotMatch(remoteSource, /latest-desktop-token|token\.txt|secret\.txt/);
    });

    it('root extension installer refuses wrong-machine installs before writing extension files', () => {
        const guardIndex = remoteSource.indexOf('require_gnome_desktop');
        const writeIndex = remoteSource.indexOf('mkdir -p "$install_root"');
        assert.ok(guardIndex >= 0);
        assert.ok(writeIndex > guardIndex);
        assert.doesNotMatch(remoteSource, /gnome-extensions not found\./);
    });

    it('root extension installer exits before downloading or writing when gnome-extensions is unavailable', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'nox-remote-install-test-'));
        const result = spawnSync('/bin/bash', [remoteScript], {
            env: {
                PATH: tmp,
                XDG_DATA_HOME: tmp,
            },
            encoding: 'utf8',
        });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /This is the Nox GNOME extension installer/);
        assert.match(result.stderr, /human GNOME desktop, not on the agent\/backend machine/);
        assert.equal(existsSync(join(tmp, 'gnome-shell/extensions/nox-v3@lalice.ai')), false);
    });
});
