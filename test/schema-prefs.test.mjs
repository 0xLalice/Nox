import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = existsSync('extension') ? '.' : 'v3';
const metadata = JSON.parse(readFileSync(join(root, 'extension/metadata.json'), 'utf8'));
const schemaPath = join(root, 'extension/schemas/org.gnome.shell.extensions.nox-v3.gschema.xml');
const schema = readFileSync(schemaPath, 'utf8');
const prefs = readFileSync(join(root, 'extension/prefs.js'), 'utf8');
const transport = readFileSync(join(root, 'extension/src/connection/transport.js'), 'utf8');
const readme = readFileSync(join(root, 'README.md'), 'utf8');

describe('Nox V3 schema and prefs', () => {
    it('metadata points to the V3 schema', () => {
        assert.equal(metadata.uuid, 'nox-v3@lalice.ai');
        assert.equal(metadata['settings-schema'], 'org.gnome.shell.extensions.nox-v3');
        assert.match(metadata.description, /v0\.1 client extension/);
        assert.doesNotMatch(metadata.description, /walking foundation/i);
    });

    it('schema XML parses and contains only V3 foundation settings plus jump reach and manual rest/jump commands', () => {
        const result = spawnSync('python3', ['-c', `import xml.etree.ElementTree as ET; ET.parse(${JSON.stringify(schemaPath)})`]);
        assert.equal(result.status, 0, result.stderr.toString());
        assert.doesNotMatch(schema, /name="nox-scale-percent"/);
        assert.doesNotMatch(schema, /name="movement-profile"/);
        assert.doesNotMatch(schema, /name="walking-speed-percent"/);
        assert.doesNotMatch(schema, /name="run-length-ticks"/);
        assert.doesNotMatch(schema, /name="run-speed-percent"/);
        assert.match(schema, /name="gravity-profile"/);
        assert.match(schema, /<default>'earth'<\/default>/);
        assert.match(schema, /<choice value="earth"\/>/);
        assert.match(schema, /<choice value="moon"\/>/);
        assert.doesNotMatch(schema, /gravity-percent|gravity-strength|fall-strength/i);
        assert.match(schema, /name="jump-reach-distance"/);
        assert.match(schema, /<default>280<\/default>/);
        assert.match(schema, /<range min="80" max="900"\/>/);
        assert.doesNotMatch(schema, /jump-height-percent|jump-horizontal-percent/);
        assert.match(schema, /name="websocket-url"/);
        assert.match(schema, /name="token"/);
        assert.match(schema, /name="cert-fingerprint"/);
        assert.match(schema, /name="connection-state"/);
        assert.match(schema, /name="manual-disconnected"/);
        assert.match(schema, /name="jump-command-seq"/);
        assert.match(schema, /name="jump-command-result"/);
        assert.match(schema, /name="generated-jump-command-seq"/);
        assert.match(schema, /name="generated-jump-command-result"/);
        assert.match(schema, /name="jetpack-jump-command-seq"/);
        assert.match(schema, /name="jetpack-jump-command-result"/);
        assert.match(schema, /name="rest-command-seq"/);
        assert.match(schema, /name="rest-command-result"/);
        assert.doesNotMatch(schema, /test-trigger|message-facing|sit|uturn|wall-bang/i);
    });

    it('prefs page is V3-only and hides consolidated movement, size, and run controls', () => {
        assert.match(prefs, /title: 'Nox V3'/);
        assert.doesNotMatch(prefs, /'Size'/);
        assert.doesNotMatch(prefs, /nox-scale-percent/);
        assert.doesNotMatch(prefs, /'Movement Profile'/);
        assert.doesNotMatch(prefs, /movement-profile/);
        assert.doesNotMatch(prefs, /'Walking Speed'/);
        assert.doesNotMatch(prefs, /walking-speed-percent/);
        assert.doesNotMatch(prefs, /'Run Length'/);
        assert.doesNotMatch(prefs, /run-length-ticks/);
        assert.doesNotMatch(prefs, /'Run Speed'/);
        assert.doesNotMatch(prefs, /run-speed-percent/);
        assert.match(prefs, /'Gravity Profile'/);
        assert.match(prefs, /Earth-like/);
        assert.match(prefs, /Moon-like/);
        assert.match(prefs, /'Jump Reach'/);
        assert.match(prefs, /jump-reach-distance/);
        assert.match(prefs, /spinRow\(settings, 'jump-reach-distance', 'Jump Reach', 80, 900\)/);
        assert.doesNotMatch(prefs, /jump-height-percent|jump-horizontal-percent|Jump Height|Jump Horizontal Reach/);
        assert.match(prefs, /title: 'Connection'/);
        assert.match(prefs, /'WebSocket URL'/);
        assert.match(prefs, /'Token'/);
        assert.match(prefs, /'Certificate Fingerprint'/);
        assert.match(prefs, /'Current Connection Status'/);
        assert.match(prefs, /'Pause Background Connection'/);
        assert.match(prefs, /'Test Connection'/);
        assert.match(prefs, /NoxV3ConnectionTester/);
        assert.match(prefs, /'Try V1 jump now'/);
        assert.match(prefs, /jump-command-seq/);
        assert.match(prefs, /jump-command-result/);
        assert.match(prefs, /'Try generated jump now'/);
        assert.match(prefs, /generated-jump-command-seq/);
        assert.match(prefs, /generated-jump-command-result/);
        assert.match(prefs, /'Try jetpack jump now'/);
        assert.match(prefs, /jetpack-jump-command-seq/);
        assert.match(prefs, /jetpack-jump-command-result/);
        assert.match(prefs, /'Try rest now'/);
        assert.match(prefs, /rest-command-seq/);
        assert.match(prefs, /rest-command-result/);
        assert.doesNotMatch(prefs, /gravity.*spinRow|spinRow\(settings, 'gravity/i);
        assert.doesNotMatch(prefs, /Message|U-turn|Wall/i);
    });

    it('connection transport cancels and ignores stale async WebSocket connects', () => {
        assert.match(transport, /this\.connectGeneration = 0/);
        assert.match(transport, /this\.connectGeneration\+\+/);
        assert.match(transport, /websocket_connect_async\(message, null, \[\], GLib\.PRIORITY_DEFAULT, cancellable/);
        assert.match(transport, /#isCurrentConnect\(generation, cancellable\)/);
        assert.match(transport, /closeWebSocket\(socket\)/);
        assert.match(transport, /if \(this\.stopped\)\s*return;/);
        assert.match(transport, /if \(this\.stopped \|\| this\.reconnectId \|\| this\.cancellable\.is_cancelled\(\)\)/);
    });

    it('prefs connection tester stops on preferences cleanup and avoids destroyed UI mutation', () => {
        assert.match(prefs, /cleanupConnectionTester/);
        assert.match(prefs, /safeConnect\(window, 'close-request'/);
        assert.match(prefs, /safeConnect\(page, 'unrealize'/);
        assert.match(prefs, /this\._prefsDisposed = true/);
        assert.match(prefs, /this\._connectionTester\?\.stop\(\)/);
        assert.match(prefs, /if \(this\._prefsDisposed\)\s*return;\s*testRow\.subtitle = state;/);
        assert.match(prefs, /if \(this\._prefsDisposed\)\s*return;\s*testButton\.sensitive = true;/);
    });

    it('README describes current v0.1 client scope and no removed preference controls', () => {
        assert.match(readme, /Nox v0\.1 is the GNOME Shell client extension/);
        assert.match(readme, /window top borders as platform surfaces/);
        assert.match(readme, /Try jetpack jump now/);
        assert.match(readme, /client only; it does not install or start a backend service/);
        assert.match(readme, /token is sent in the WebSocket hello frame/);
        assert.doesNotMatch(readme, /walking foundation/i);
        assert.doesNotMatch(readme, /Movement Profile: Calm|Walking Speed|Size/);
    });
});
