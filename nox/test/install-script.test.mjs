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

    it('packages only extension source and installs through gnome-extensions', () => {
        assert.match(installerSource, /source_dir="\$archive_root\/nox"/);
        assert.match(installerSource, /package="\$tmp\/\$uuid\.shell-extension\.zip"/);
        assert.match(installerSource, /make_extension_zip/);
        assert.match(installerSource, /zipfile\.ZipFile\(package, "w", zipfile\.ZIP_DEFLATED\)/);
        assert.match(installerSource, /gnome-extensions install --force "\$package"/);
        assert.doesNotMatch(installerSource, /cp -a "\$source_dir\/\." "\$install_dir\/"/);
        assert.doesNotMatch(installerSource, /rm -rf "\$install_dir"/);
        assert.doesNotMatch(installerSource, /rm -rf "\$HOME"/);
    });

    it('does not enable during install and prints post-login enable guidance', () => {
        assert.match(installerSource, /command -v gnome-extensions/);
        assert.match(installerSource, /require_gnome_desktop/);
        assert.match(installerSource, /This is the Nox GNOME extension installer/);
        assert.match(installerSource, /Run it on the human GNOME desktop, not on the agent\/backend machine/);
        assert.doesNotMatch(installerSource, /gnome-extensions enable "\$uuid"/);
        assert.doesNotMatch(installerSource, /enable_output=/);
        assert.doesNotMatch(installerSource, /enable_status=/);
        assert.match(installerSource, /print_enable_guidance/);
        assert.match(installerSource, /gnome-extensions enable \$uuid/);
        assert.match(installerSource, /Log out and log back in/);
        assert.match(installerSource, /Enable Nox in GNOME Extensions settings/);
        assert.match(installerSource, /does not enable Nox during install/);
        assert.match(installerSource, /may not see the newly installed extension until after login/);
        assert.doesNotMatch(installerSource, /if Nox does not appear|preferences do not load/);
    });

    it('compiles V3 schemas during install', () => {
        assert.match(installerSource, /glib-compile-schemas "\$source_dir\/schemas"/);
        assert.match(installerSource, /glib-compile-schemas "\$install_dir\/schemas"/);
        assert.match(installerSource, /require_command glib-compile-schemas/);
    });

    it('refuses wrong-machine extension installs before writing extension files', () => {
        const guardIndex = installerSource.indexOf('require_gnome_desktop');
        const downloadIndex = installerSource.indexOf('curl -fL --progress-bar "$archive_url" -o "$archive"');
        const installIndex = installerSource.indexOf('gnome-extensions install --force "$package"');
        assert.ok(guardIndex >= 0);
        assert.ok(downloadIndex > guardIndex);
        assert.ok(installIndex > guardIndex);
        assert.doesNotMatch(installerSource, /gnome-extensions not found\./);
    });

    it('is the only supported human extension installer and downloads extension files only', () => {
        assert.equal(statSync(installer).mode & 0o111, 0o111);
        assert.equal(existsSync(join(root, 'nox/install.sh')), false);
        assert.match(installerSource, /codeload\.github\.com\/\$repo\/tar\.gz\/\$ref/);
        assert.match(installerSource, /mktemp -d/);
        assert.match(installerSource, /trap 'rm -rf "\$tmp"' EXIT/);
        assert.match(installerSource, /require_command python3/);
        assert.match(installerSource, /require_command tar/);
        assert.match(installerSource, /curl -fL --progress-bar "\$archive_url" -o "\$archive"/);
        assert.match(installerSource, /tar -xzf "\$archive" -C "\$extract_dir"/);
        assert.match(installerSource, /rm -rf "\$source_dir\/test"/);
        assert.match(installerSource, /gnome-extensions install --force "\$package"/);
        assert.match(installerSource, /Nox V3 extension install summary/);
        assert.match(installerSource, /Total downloaded:/);
        assert.match(installerSource, /Installed extension size:/);
        assert.match(installerSource, /Jump-jetpack asset size:/);
        assert.match(installerSource, /Installed file count:/);
        assert.match(installerSource, /Install path:/);
        assert.doesNotMatch(installerSource, /api\.github\.com\/repos\/\$repo\/git\/trees/);
        assert.doesNotMatch(installerSource, /raw\.githubusercontent\.com\/\$repo\/\$ref/);
        assert.doesNotMatch(installerSource, /path == "nox\/install\.sh"/);
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
