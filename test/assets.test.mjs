import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = existsSync('extension') ? '.' : 'v3';
const sourceDir = 'gnome-extension/nox@selfhosted.local/images/Nox';
const walkDir = join(root, 'extension/assets/nox/walk');
const expectedHashes = new Map([
    ['0.webp', '4901347a2d181db245b918404cc278fee445676d69f9313ea3aa7bea6457cfee'],
    ['1.webp', '0747c2a53a8a05d7e362b587a718b2abc09598323fafd612225a47a8946f5130'],
    ['2.webp', '7a3e605d9f20e9f917e1a8852c305dc5856a9c031ed6315d3cd8b0825741aad0'],
    ['3.webp', '23dcd654edba105db778f3d0c295fa97d9775ef0219786c2238488d670e2a881'],
    ['4.webp', '9f5a00b2f0c810cb19fac70bd7ec9ee9798746f8c7d347b97b9597f0f42ec1a3'],
    ['5.webp', 'ee25f93b63a36b147cd479db67111ee88ceb6ceb9997af8d8078ad67f3a414d7'],
    ['6.webp', '56c18dca29641612a83b30d475d4fb6eb5eec654ba4eaf15aded70048e1d8764'],
    ['7.webp', 'c17fc0e2afb772105e4f3a04d9ce772a035da75c2f1fd42035ab4ee5f8d5aabd'],
    ['8.webp', 'b10f3627701699aa1ec6202572bda8e2944604e4d036d3cc714ff75f2bd6318a'],
    ['9.webp', 'b1ea3aba5897f15b961acc466eee6fd7b68809be899831314bcfcada24ae7024'],
    ['10.webp', 'd59f634bd944b8dcce5ad0a9c2fe0e522dfaaa9374ccd70d7095362b354b8966'],
    ['11.webp', '8c909e17519eb2ed5ff997ee7b8d0579fa6a84f953f7cad0332f7ab0cf253b49'],
    ['12.webp', '71298ad3b2adacc4035fa1d2eacd8f93593e6e4707a00dcf93827a56888a081a'],
    ['13.webp', 'f94c5986e6d40269078bde810d8acdc1f4517990d08b0a913c054e1f5703ff2c'],
    ['14.webp', '289f2d23e34a06b72c9fc8661204a6d61ce0dbe78e6bb2fc703a9de6b56c48a5'],
    ['15.webp', 'a612a508bd89a643dd9cf2e970e43200789a561a58973a9505594c8441d5c037'],
]);

function sha256(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('Nox V3 walking assets', () => {
    it('contains exactly V1 walk WebP frames 0.webp..15.webp', () => {
        const expected = Array.from({ length: 16 }, (_, i) => `${i}.webp`);
        assert.deepEqual(readdirSync(walkDir).sort(numericSort), expected);
    });

    it('contains no other asset files or folders', () => {
        assert.deepEqual(readdirSync(join(root, 'extension/assets')), ['nox']);
        assert.deepEqual(readdirSync(join(root, 'extension/assets/nox')), ['walk']);
        assert.equal(statSync(walkDir).isDirectory(), true);
    });

    it('does not include duplicated left-direction assets', () => {
        assert.equal(statSync(walkDir).isDirectory(), true);
        assert.deepEqual(readdirSync(join(root, 'extension/assets/nox')).filter(name => name !== 'walk'), []);
    });

    it('matches the approved V1 walking asset hashes exactly', () => {
        for (let i = 0; i < 16; i++) {
            const name = `${i}.webp`;
            assert.equal(sha256(join(walkDir, name)), expectedHashes.get(name), name);
            if (existsSync(join(sourceDir, name)))
                assert.equal(sha256(join(walkDir, name)), sha256(join(sourceDir, name)), name);
        }
    });
});

function numericSort(a, b) {
    return Number(a.replace('.webp', '')) - Number(b.replace('.webp', ''));
}
