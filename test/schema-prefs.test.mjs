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

describe('Nox V3 schema and prefs', () => {
    it('metadata points to the V3 schema', () => {
        assert.equal(metadata.uuid, 'nox-v3@lalice.ai');
        assert.equal(metadata['settings-schema'], 'org.gnome.shell.extensions.nox-v3');
    });

    it('schema XML parses and contains only V3 foundation settings', () => {
        const result = spawnSync('python3', ['-c', `import xml.etree.ElementTree as ET; ET.parse(${JSON.stringify(schemaPath)})`]);
        assert.equal(result.status, 0, result.stderr.toString());
        assert.match(schema, /name="nox-scale-percent"/);
        assert.match(schema, /<range min="20" max="200"\/>/);
        assert.match(schema, /name="movement-profile"/);
        assert.match(schema, /name="walking-speed-percent"/);
        assert.match(schema, /name="gravity-profile"/);
        assert.match(schema, /<default>'earth'<\/default>/);
        assert.match(schema, /<choice value="earth"\/>/);
        assert.match(schema, /<choice value="moon"\/>/);
        assert.doesNotMatch(schema, /gravity-percent|gravity-strength|fall-strength/i);
        assert.match(schema, /name="websocket-url"/);
        assert.match(schema, /name="token"/);
        assert.match(schema, /name="cert-fingerprint"/);
        assert.match(schema, /name="connection-state"/);
        assert.match(schema, /name="manual-disconnected"/);
        assert.doesNotMatch(schema, /test-trigger|message-facing|jump|sit|uturn|jetpack|wall-bang/i);
    });

    it('prefs page is V3-only and exposes exactly the requested controls', () => {
        assert.match(prefs, /title: 'Nox V3'/);
        assert.match(prefs, /'Size'/);
        assert.match(prefs, /'nox-scale-percent', 'Size', 20, 200, 5/);
        assert.match(prefs, /'Movement Profile'/);
        assert.match(prefs, /'Walking Speed'/);
        assert.match(prefs, /'Gravity Profile'/);
        assert.match(prefs, /Earth-like/);
        assert.match(prefs, /Moon-like/);
        assert.match(prefs, /title: 'Connection'/);
        assert.match(prefs, /'WebSocket URL'/);
        assert.match(prefs, /'Token'/);
        assert.match(prefs, /'Certificate Fingerprint'/);
        assert.match(prefs, /'Current Connection Status'/);
        assert.match(prefs, /'Pause Background Connection'/);
        assert.match(prefs, /'Test Connection'/);
        assert.match(prefs, /NoxV3ConnectionTester/);
        assert.doesNotMatch(prefs, /gravity.*spinRow|spinRow\(settings, 'gravity/i);
        assert.doesNotMatch(prefs, /Message|Jump|U-turn|Jetpack|Wall/i);
    });
});
