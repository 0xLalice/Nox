import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = existsSync('extension') ? '.' : 'v3';
const sourceDir = 'gnome-extension/nox@selfhosted.local/images/Nox';
const walkDir = join(root, 'extension/assets/nox/walk');
const runDir = join(root, 'extension/assets/nox/run');
const restDir = join(root, 'extension/assets/nox/rest');
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
const expectedRunHashes = new Map([
    ['0.webp', '2d9b97df8c2a0521bd68a17869fe673b4941e37d24f004cea39a1bea6c1fcf6b'],
    ['1.webp', '558474c3c3c810b9a36a256d40be9bd2190c8be98dd0b5b646a386700e15cb88'],
    ['2.webp', '13075e1cba221831984ee7c6d47626aad37376111c5223d0482028af516d8e08'],
    ['3.webp', 'a9d1713e385559e3c2b4c47facde06ce773c5c58fb28feffd057e0aae875e035'],
    ['4.webp', '24e6e639ae977d2dd7741bb5c752c1ca83f8ed21606f98340981f2a61c597430'],
    ['5.webp', 'de1d9e84499fddd254cdcc837b619a1031e45dc3ab8222cb570cb916c2c134cf'],
    ['6.webp', '9d7f6c726e0848da5cc1b246d3776f6dc679203f14756be0cd4718584b1b1d13'],
    ['7.webp', '31d916b8310c32aca08c94eedb59fe7b3dea3a4f825ba921e0adb7c64b64b368'],
    ['8.webp', '6d4c09f293c4ccdb95fc2d830ad0d68f2a9d5134aae0e8ca943d5c6b75f3ac01'],
    ['9.webp', '2fd5ff71b6bf0d645be654963b8d98994444d2bc6d710e5f23e4c6b89751bc56'],
    ['10.webp', 'df8828102fb3e41d752cdbe8a8b435da05ddb98d78fedb2de99a805425be0b3c'],
    ['11.webp', '382e3a5576277615a4a719a18a73d166d61ab1ea80ee06ef36f36c69b2d72cb2'],
    ['12.webp', '60b0338d0e891d64d0f1f5484cf9be94e6bce18c64ddab68d80268231f3f4996'],
    ['13.webp', 'f1b9cfeb4ea60d8e5c73dd50e26524e02c0c852df35c2277381fa2aa2573e6a4'],
]);
const expectedRestHashes = new Map([
    ['0.webp', '54fd19d92b24844ba456a4a717e522da5c526af8989c555ad3046cfe795cc804'],
    ['1.webp', '174ae18789affb0f7ba280783d9210a1ba3c04cbf7549010a4168c2befc82f00'],
    ['2.webp', '466c060144d954f0e65219592839b5b061ebab8d6870be55cf42c1490e41029a'],
    ['3.webp', '6e1244f116855879b1401f44c9a2fb111a4855a53ff35b273d12821b2ee061c9'],
    ['4.webp', '52b966379d4c564664785ae14bed2494aae1d1e59b1d1a1b3653ca8fda14740a'],
    ['5.webp', '1a75a43f3f46d9c98b0ef3a4ccb729c72bf50c662d9b64e6063700e219021ce7'],
    ['6.webp', '3ce784b528254cb8776582ae041ac26ab881c140723506f2492983d348340ed8'],
    ['7.webp', '28c0375e8db0082f1fb326143617bfd4b0324c7f27cc9c13a29e00d6db1fb014'],
    ['8.webp', '36f31793573238f910aec9fdfdfc0c5dc710d7c9904023d2ffa0ed2b9a860ce7'],
    ['9.webp', '3a7b079dae1772500c90a34d8d4de25379b6670f2aa2a831d883a32feb1fcced'],
    ['10.webp', '2a6368ce872427703a821d0b796024bab4289b3573e638258df02599f2c8c2f2'],
    ['11.webp', 'eebd04467668990babd2c3b69964393dedbf9a541bf66aa6c97fbb6f3a1c788c'],
    ['12.webp', 'a17de3798d80251d50d08bbd91dee904504aa11074fa73024d2550452dea4b29'],
    ['13.webp', '4b0aadaa15b483197ded3f05732bc60921392fe7ebdcb5d3322aa3e073267d8c'],
    ['14.webp', 'f3bb94b3a84e8e2b6c3f6af2d01c91ee5daad9ae1f17f2d2215f843ff27c416f'],
    ['15.webp', '9f1e774ef98d04ca9acf7775ac77ed20eb0ac09746ccb5f5fc48898e464a9ab3'],
    ['16.webp', '09d32bd999cafa3d5818c6302320650a5c3b0485cb4ca753e31bffe0d75fc59e'],
    ['17.webp', '64ec5d7e45ec02bd38389eb7fe8a299c3eb95df1973a8c5995dc8be5b13f00ea'],
    ['18.webp', 'fcabc2e50f36f2ab65c6c65430ef7c9c12f0bce5daeabfc92708ea3d0a6fae49'],
    ['19.webp', '84930ba0ecaa99b8b5759dd77706dbf1950c671fd6cd129adc0408b41e25c3a1'],
    ['20.webp', 'e0f6f298fd25d915ec776e2a2bff79e8ee141114f16a18d40931f5e91911d6bc'],
    ['21.webp', '49e3ad07efbfe58a702189f057086d97de71a026ea6d5db960f9773bc35984df'],
    ['22.webp', 'e17d86cec0615f90c99b8ff23de9c2f47eec492d1778315c2edeb0a8cf37acc9'],
    ['23.webp', '2c06ce80d8ed14a3f662f7bcd18b7a8d6653724209ddc56ce651b9890cae9830'],
    ['24.webp', '8f386a4a738fe3eb0f0770e9f8ef0e38c98d01be6a32986c0127548232643b2f'],
    ['25.webp', '58fb59eeaf98cbc7094d22a6bf48c5df750822aac8cb51cb9fc977f5989651df'],
    ['26.webp', '6c06bf098d28fcc54c16e9fe5e151025880f5edad517821fddbd833ad5ff4418'],
    ['27.webp', '62be92448bb092c60ee6af283dc4181630a79a0f5fea0627b05ff860d9e60361'],
    ['28.webp', '07f92cde73f8497de97c8d00c679a493dcb296f46cd1633aa07d171bb871fd52'],
    ['29.webp', 'd49968eaec328d9bdda1fed4dbccfaff0207adc1b0fd590917d10fbe4638e829'],
    ['30.webp', 'ef9bad5890afc6f5c497061d463ec8fee04f3db729f33d3582d7a3f99b5022f5'],
    ['31.webp', '2ac0acdad5a00f601c47a2f0cd92bf7e3ca5d2104fea75c9a4343d75ce3c7bf3'],
    ['32.webp', '5a7819312f18fd63ec6910511e74bdf3247110c2d6be57ae54159a65bb8c3462'],
    ['33.webp', '83d655602595a685c2fcae062c7e871a600490383a3fe42ee97e3ae3e7268d7d'],
]);

function sha256(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('Nox V3 approved animation assets', () => {
    it('contains exactly V1 walk WebP frames 0.webp..15.webp', () => {
        const expected = Array.from({ length: 16 }, (_, i) => `${i}.webp`);
        assert.deepEqual(readdirSync(walkDir).sort(numericSort), expected);
    });

    it('contains exactly V1 run WebP frames 0.webp..13.webp', () => {
        const expected = Array.from({ length: 14 }, (_, i) => `${i}.webp`);
        assert.deepEqual(readdirSync(runDir).sort(numericSort), expected);
    });

    it('contains exactly V1 rest WebP frames 0.webp..33.webp', () => {
        const expected = Array.from({ length: 34 }, (_, i) => `${i}.webp`);
        assert.deepEqual(readdirSync(restDir).sort(numericSort), expected);
    });

    it('contains no other asset files or folders', () => {
        assert.deepEqual(readdirSync(join(root, 'extension/assets')), ['nox']);
        assert.deepEqual(readdirSync(join(root, 'extension/assets/nox')).sort(), ['rest', 'run', 'walk']);
        assert.equal(statSync(walkDir).isDirectory(), true);
        assert.equal(statSync(runDir).isDirectory(), true);
        assert.equal(statSync(restDir).isDirectory(), true);
    });

    it('does not include duplicated left-direction assets', () => {
        assert.equal(statSync(walkDir).isDirectory(), true);
        assert.deepEqual(readdirSync(join(root, 'extension/assets/nox')).filter(name => name.includes('left')), []);
    });

    it('matches the approved V1 walking asset hashes exactly', () => {
        for (let i = 0; i < 16; i++) {
            const name = `${i}.webp`;
            assert.equal(sha256(join(walkDir, name)), expectedHashes.get(name), name);
            if (existsSync(join(sourceDir, name)))
                assert.equal(sha256(join(walkDir, name)), sha256(join(sourceDir, name)), name);
        }
    });

    it('matches the approved V1 running asset hashes exactly', () => {
        for (let i = 0; i < 14; i++) {
            const name = `${i}.webp`;
            assert.equal(sha256(join(runDir, name)), expectedRunHashes.get(name), name);
            if (existsSync(join(sourceDir, 'run', name)))
                assert.equal(sha256(join(runDir, name)), sha256(join(sourceDir, 'run', name)), name);
        }
    });

    it('matches the approved V1 rest asset hashes exactly', () => {
        for (let i = 0; i < 34; i++) {
            const name = `${i}.webp`;
            assert.equal(sha256(join(restDir, name)), expectedRestHashes.get(name), name);
        }
    });
});

function numericSort(a, b) {
    return Number(a.replace('.webp', '')) - Number(b.replace('.webp', ''));
}
