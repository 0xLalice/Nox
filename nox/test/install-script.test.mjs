import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = existsSync('nox') ? '.' : 'v3';
const installer = join(root, 'install-extension.sh');
const installerSource = readFileSync(installer, 'utf8');

describe('Nox GNOME extension installer', () => {
    it('targets only the V3 UUID install directory', () => {
        assert.match(installerSource, /uuid="nox-v3@lalice\.ai"/);
        assert.match(installerSource, /\$install_root\/\$uuid/);
        assert.doesNotMatch(installerSource, /nox@selfhosted\.local/);
        assert.doesNotMatch(installerSource, /gnome-extension\/nox@selfhosted\.local/);
    });

    it('copies only extension source and deletes only exact install dir', () => {
        assert.match(installerSource, /source_dir="\$tmp\/nox"/);
        assert.match(installerSource, /cp -a "\$source_dir\/\." "\$install_dir\/"/);
        assert.match(installerSource, /rm -rf "\$install_dir"/);
        assert.doesNotMatch(installerSource, /rm -rf "\$HOME"/);
    });

    it('auto-enables when gnome-extensions exists and prints concrete enable and Wayland guidance', () => {
        assert.match(installerSource, /command -v gnome-extensions/);
        assert.match(installerSource, /require_gnome_desktop/);
        assert.match(installerSource, /This is the Nox GNOME extension installer/);
        assert.match(installerSource, /Run it on the human GNOME desktop, not on the agent\/backend machine/);
        assert.match(installerSource, /gnome-extensions enable "\$uuid"/);
        assert.match(installerSource, /print_enable_guidance/);
        assert.match(installerSource, /gnome-extensions enable \$uuid/);
        assert.match(installerSource, /On Wayland, after installing or updating Nox, log out and log back in/);
        assert.match(installerSource, /Then run or confirm:/);
        assert.doesNotMatch(installerSource, /if Nox does not appear|preferences do not load/);
    });

    it('compiles V3 schemas during install', () => {
        assert.match(installerSource, /glib-compile-schemas "\$install_dir\/schemas"/);
        assert.match(installerSource, /require_command glib-compile-schemas/);
    });

    it('refuses wrong-machine extension installs before writing extension files', () => {
        const guardIndex = installerSource.indexOf('require_gnome_desktop');
        const writeIndex = installerSource.indexOf('mkdir -p "$install_root"');
        assert.ok(guardIndex >= 0);
        assert.ok(writeIndex > guardIndex);
        assert.doesNotMatch(installerSource, /gnome-extensions not found\./);
    });

    it('is the only supported human extension installer and downloads extension files only', () => {
        assert.equal(statSync(installer).mode & 0o111, 0o111);
        assert.equal(existsSync(join(root, 'nox/install.sh')), false);
        assert.match(installerSource, /api\.github\.com\/repos\/\$repo\/git\/trees\/\$ref\?recursive=1/);
        assert.match(installerSource, /raw\.githubusercontent\.com\/\$repo\/\$ref/);
        assert.match(installerSource, /mktemp -d/);
        assert.match(installerSource, /trap 'rm -rf "\$tmp"' EXIT/);
        assert.match(installerSource, /require_command python3/);
        assert.match(installerSource, /curl -fsSL "\$tree_url"/);
        assert.match(installerSource, /path\.startswith\("nox\/"\)/);
        assert.match(installerSource, /path\.startswith\("nox\/test\/"\)/);
        assert.match(installerSource, /curl -fsSL "\$raw_base_url\/\$path"/);
        assert.doesNotMatch(installerSource, /path == "nox\/install\.sh"/);
        assert.doesNotMatch(installerSource, /archive\/refs\/heads/);
        assert.doesNotMatch(installerSource, /tar -xzf/);
        assert.doesNotMatch(installerSource, /git clone/);
        assert.doesNotMatch(installerSource, /backend\/install\.sh/);
        assert.doesNotMatch(installerSource, /~\/\.nox/);
        assert.doesNotMatch(installerSource, /latest-desktop-token|token\.txt|secret\.txt/);
    });

    it('exits before downloading or writing when gnome-extensions is unavailable', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'nox-remote-install-test-'));
        const result = spawnSync('/bin/bash', [installer], {
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
