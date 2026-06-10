import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = existsSync('nox') ? '.' : 'v3';
const metadata = JSON.parse(readFileSync(join(root, 'nox/metadata.json'), 'utf8'));
const schemaPath = join(root, 'nox/schemas/org.gnome.shell.extensions.nox-v3.gschema.xml');
const schema = readFileSync(schemaPath, 'utf8');
const prefs = readFileSync(join(root, 'nox/prefs.js'), 'utf8');
const transport = readFileSync(join(root, 'nox/src/connection/transport.js'), 'utf8');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const agentInstall = readFileSync(join(root, 'AGENT_INSTALL.md'), 'utf8');

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

    it('README presents Nox as a desktop companion and links to the agent install guide', () => {
        assert.match(readme, /animated GNOME Shell pet\/companion/);
        assert.match(readme, /walks, jumps, rests/);
        assert.match(readme, /messages from a remote agent through a small Linux backend/);
        assert.match(readme, /\[AGENT_INSTALL\.md\]\(AGENT_INSTALL\.md\)/);
        assert.match(readme, /backend never stores the pairing secret in plaintext/i);
        assert.match(readme, /GNOME extension stores the pairing secret locally/i);
        assert.doesNotMatch(readme, /nox init --public-url/);
        assert.doesNotMatch(readme, /\.\/backend\/install\.sh/);
        assert.doesNotMatch(readme, /\.\/nox\/install\.sh install/);
        assert.doesNotMatch(readme, /desktop notification bubble/i);
        assert.doesNotMatch(readme, /Linux-native bridge from a remote agent command line/i);
    });

    it('AGENT_INSTALL.md contains the operational v0.1 agent and human setup flow', () => {
        assert.match(agentInstall, /\.\/backend\/install\.sh/);
        assert.ok(
            agentInstall.indexOf('## Agent: Send The Human Client Install Steps') >
                agentInstall.indexOf('## Agent: Install The Backend')
        );
        assert.ok(
            agentInstall.indexOf('## Agent: Initialize Pairing') >
                agentInstall.indexOf('## Agent: Send The Human Client Install Steps')
        );
        assert.match(agentInstall, /nox init --public-url wss:\/\/AGENT_HOST:8765\/nox\/ws/);
        assert.match(agentInstall, /Tell the human to keep the Nox extension preferences open/);
        assert.match(agentInstall, /Relay those values to the human/);
        assert.match(agentInstall, /curl -fsSL https:\/\/raw\.githubusercontent\.com\/0xLalice\/Nox\/main\/install-extension\.sh \| bash/);
        assert.match(agentInstall, /less \/tmp\/install-nox-extension\.sh/);
        assert.match(agentInstall, /fresh client reinstall/i);
        assert.doesNotMatch(agentInstall, /git clone https:\/\/github\.com\/0xLalice\/Nox\.git\ncd Nox\n\.\/nox\/install\.sh install/);
        assert.match(agentInstall, /gnome-extensions enable nox-v3@lalice\.ai/);
        assert.match(agentInstall, /On Wayland, tell the human: after installing or updating Nox, log out and log back in/);
        assert.match(agentInstall, /Then run or confirm the enable command/);
        assert.doesNotMatch(agentInstall, /if Nox does not appear|preferences do not load/);
        assert.match(agentInstall, /nox send "Nox is connected\."/);
        assert.match(agentInstall, /~\/\.nox\/config\.json/);
        assert.match(agentInstall, /backend never stores the pairing secret in plaintext/i);
        assert.match(agentInstall, /GNOME extension stores the pairing secret locally/i);
        assert.doesNotMatch(readme, /walking foundation/i);
        assert.doesNotMatch(readme, /Movement Profile: Calm|Walking Speed|Size/);
    });
});
