import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = existsSync('extension') ? '.' : 'v3';
const allowedFiles = new Set([
    'README.md',
    'nox-v3.sh',
    'extension/extension.js',
    'extension/metadata.json',
    'extension/prefs.js',
    'extension/stylesheet.css',
    'extension/schemas/org.gnome.shell.extensions.nox-v3.gschema.xml',
    'extension/assets/nox/walk/0.webp',
    'extension/assets/nox/walk/1.webp',
    'extension/assets/nox/walk/2.webp',
    'extension/assets/nox/walk/3.webp',
    'extension/assets/nox/walk/4.webp',
    'extension/assets/nox/walk/5.webp',
    'extension/assets/nox/walk/6.webp',
    'extension/assets/nox/walk/7.webp',
    'extension/assets/nox/walk/8.webp',
    'extension/assets/nox/walk/9.webp',
    'extension/assets/nox/walk/10.webp',
    'extension/assets/nox/walk/11.webp',
    'extension/assets/nox/walk/12.webp',
    'extension/assets/nox/walk/13.webp',
    'extension/assets/nox/walk/14.webp',
    'extension/assets/nox/walk/15.webp',
    'extension/src/actions/flip-at-wall.js',
    'extension/src/actions/walk.js',
    'extension/src/actor.js',
    'extension/src/behavior/conditions.js',
    'extension/src/behavior/registry.js',
    'extension/src/behavior/selector.js',
    'extension/src/behavior/tree.js',
    'extension/src/core/body.js',
    'extension/src/core/constants.js',
    'extension/src/core/context.js',
    'extension/src/core/controller.js',
    'extension/src/core/geometry.js',
    'extension/src/core/locomotion.js',
    'extension/src/core/types.js',
    'extension/src/config/movement-profiles.js',
    'extension/src/config/settings.js',
    'test/assets.test.mjs',
    'test/clean-folder.test.mjs',
    'test/config.test.mjs',
    'test/foundation.test.mjs',
    'test/install-script.test.mjs',
    'test/schema-prefs.test.mjs',
]);

const forbidden = [
    /nox@selfhosted\.local/i,
    /movement-v2/i,
    /MovementControllerV2/,
    /\bwebsocket\b/i,
    /\btest panel\b/i,
    /\bmessage\b/i,
    /\bjump\b/i,
    /\bsit\b/i,
    /\buturn\b/i,
    /\bu-turn\b/i,
    /\bjetpack\b/i,
    /\bwall-bang\b/i,
    /\bwallbang\b/i,
];

function files(dir) {
    const found = [];
    for (const name of readdirSync(dir)) {
        if (name === '.git')
            continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory())
            found.push(...files(path));
        else
            found.push(relative(root, path));
    }
    return found.sort();
}

describe('clean V3 extension boundary', () => {
    it('contains only approved V3 files', () => {
        assert.deepEqual(files(root), [...allowedFiles].sort());
    });

    it('does not reference legacy feature systems', () => {
        const exempt = new Set([
            'test/clean-folder.test.mjs',
            'test/assets.test.mjs',
            'test/schema-prefs.test.mjs',
            'README.md',
        ]);
        for (const file of files(root)) {
            if (exempt.has(file) || file.endsWith('.webp'))
                continue;
            const text = readFileSync(join(root, file), 'utf8');
            for (const pattern of forbidden)
                assert.equal(pattern.test(text), false, `${file} references ${pattern}`);
        }
    });
});
