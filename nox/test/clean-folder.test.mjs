import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = existsSync('nox') ? '.' : 'v3';

const allowedTopLevel = new Set(['.gitignore', 'README.md', 'backend', 'nox']);
const forbidden = [
    /nox@selfhosted\.local/i,
    /nox-codex-workspace/i,
    /\.runtime/i,
    /~\/\.config\/nox/i,
    /~\/\.local\/share\/nox/i,
    /~\/\.cache\/nox/i,
    /latest-desktop-token/i,
    /token\.txt/i,
    /secret\.txt/i,
    /movement-v2/i,
    /MovementControllerV2/,
    /\btest panel\b/i,
    /\bsit\b/i,
    /\buturn\b/i,
    /\bu-turn\b/i,
    /\bwall-bang\b/i,
    /\bwallbang\b/i,
];

function topLevelEntries() {
    return readdirSync(root)
        .filter(name => !['.git', '.agents', '.codex', '__pycache__'].includes(name))
        .sort();
}

function files(dir) {
    const found = [];
    for (const name of readdirSync(dir)) {
        if (name === '.git' || name === '.agents' || name === '.codex' || name === '__pycache__')
            continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory())
            found.push(...files(path));
        else
            found.push(relative(root, path));
    }
    return found.sort();
}

describe('Nox v0.1 source boundary', () => {
    it('keeps the source payload to backend, nox, and one root README', () => {
        assert.deepEqual(topLevelEntries(), [...allowedTopLevel].sort());
    });

    it('contains no legacy paths or plaintext token file references', () => {
        const exempt = new Set([
            'nox/test/clean-folder.test.mjs',
            'nox/test/schema-prefs.test.mjs',
            'backend/tests/test_install_script.py',
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
