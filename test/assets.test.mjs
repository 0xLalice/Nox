import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = existsSync('extension') ? '.' : 'v3';
const sourceDir = 'gnome-extension/nox@selfhosted.local/images/Nox';
const walkDir = join(root, 'extension/assets/nox/walk');
const runDir = join(root, 'extension/assets/nox/run');
const jumpDir = join(root, 'extension/assets/nox/jump');
const generatedJumpDir = join(root, 'extension/assets/nox/jump-generated');
const restDir = join(root, 'extension/assets/nox/rest');
const restProfileDir = join(root, 'extension/assets/nox/rest-profile');
const restProfileCroppedDir = join(root, 'extension/assets/nox/rest-profile-cropped');
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
const expectedJumpHashes = new Map([
    ['0.webp', '501110767e54b89092b633c5d394b2d8ad3c6e91e68187274947f6a948051cba'],
    ['7.webp', '847d2d413261b6de389ef504dcaf5d7cfca4d8bc831cc18f42b16561f5fdd1b2'],
    ['13.webp', '6ae9ba74ddad3bdbcc93a6381fdd6ecd30903559945d917ab2d4543089a97495'],
]);
const expectedGeneratedJumpHashes = new Map([
    ['0.webp', '6c1d9fd26b64e37ad9b427b412a912a26b3c4b4335c956681fda6bb5b2e809de'],
    ['72.webp', 'd59c2935f01a2c11c262cdfbccd96a7181bb170ae591599a7c0af33d6b52e2a3'],
    ['144.webp', 'c74ceaf808193078dd332344681a751482d4e323c9ee35a48cfcd78f08ca2ffd'],
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
const expectedRestProfileHashes = new Map([
    ['0.webp', '1d47ccef4b9eddb4d014122f3902d18cd2983366b113437781216c09013cfb5b'],
    ['1.webp', '0399abf81db3d2aebc8c1c41c05844fe63d1a74bd28efd139574d5cb01044b9d'],
    ['2.webp', '4688b44ae2d7c0b0a58cae0f67792d378022d10062913758f0f710aea198353e'],
    ['3.webp', 'f03e6d25e7eda2eeafb44fa3fa084880413aecedf63557f0a1714e056bda8614'],
    ['4.webp', '1390163f818f3fcce7b76475cb06cf958cf504120107cd88ff9e791fa701887c'],
    ['5.webp', '406e79dfc6bf72d0e5c3a8f1f97c64844cc30e61233c4f72efb5ba056baf94a5'],
    ['6.webp', 'f3636d4bd616967d2f12483695d88276b5bc804d4fd07dbcb79b4e29a6113792'],
    ['7.webp', '305f476f915e3b9ffa4782bc5467e1dfdd003cfbb568bca473ba1a3238fa2aab'],
    ['8.webp', '2fff34d15bc63585931155cde7e6e5d44f95ffa1bbc4f16fe31f8630632fa890'],
    ['9.webp', '3a47a3c50c728c3d81337ce64da281d8eddaa492ba6a765a2922797914e5e553'],
    ['10.webp', '7c7feac40a519a2ce5266d768c1fedb6c6b314014b0800fab2db6c711d2ffeef'],
    ['11.webp', 'c22ab60f658ee147d89a4a00e55c1bf29ad8c17518538f4ec7d3645ed82fde0f'],
    ['12.webp', '30052cbaab4e2ad470f253f167500830631eff4e353e75396511e30bf824bcaa'],
    ['13.webp', 'd1ecf576c0b7293576355ab057b14d9b861ad48e45d24cf0141f56940328f71d'],
    ['14.webp', 'a5ef579bd7ad5bd361f00c02aedc93b18e01a3225a81965266b5205f76140049'],
    ['15.webp', 'add3faee97dc32bc85f3e8a2a97ab34b585b74a736b93310fbe126a8ecdbc1fa'],
    ['16.webp', '244d57743a27d0e50a00131aa638b740cabf31ee62b2cbbc82fa37340abe3031'],
    ['17.webp', '8009428065bf165d718f57e9f5301f4dcdaa8ca9903147d2b64b4862dee009d1'],
    ['18.webp', '441c707287031f8cc65b7947c996336371349b54d2af16dcb134019b725d65e8'],
    ['19.webp', '4b3a659573c57131d097a468846c163c150a00b4debaa0f307e91ed82ce27ac0'],
    ['20.webp', 'e753e8bd0c1cba1bec99b9ba3088b657f6bc96b39bf295e2f4f0f67174f6baff'],
    ['21.webp', 'a7775003b9270340880a398c39d6e88879bc5a383b1f8a83c06858686930aeff'],
    ['22.webp', '6d45be79f00cc322f1096d27412e4a82eb146f444a36e394c0cabae776dfc8cd'],
    ['23.webp', '547ee44921bc20832380f28fe6de2533f99a13da20c6f8bdb43c1b3945d9a730'],
    ['24.webp', 'cdbb5c16c28dee03bb619e58c4e5e3c6b636422b72f808c0a3d22f1a5c2aba65'],
    ['25.webp', '6c9bd1762cb2e7d71202fcd101cd3c08926e57b05f0e4273386c1d992aed96cd'],
    ['26.webp', 'e3c4b6947f092b115c6178951f65384d449f5188bed47d121de3c395333e3b32'],
    ['27.webp', 'e56f59f536e3c2212cc02df5b24213a3a3f72b142802aacc1c4a53645a392253'],
    ['28.webp', '4b248a1397b2541f83bca2ca0eb69325fc6d1c34e59edc2aa1dec435c348cc21'],
    ['29.webp', '15bfacd60cfbbe3483eb543a548679575eb97fe2171432cd5fcd81f87b45028a'],
    ['30.webp', '5babe2a9cbe230d0585c6c9ee7fe3dc291e12591f0969320b7eeacb92b079c07'],
    ['31.webp', '00f1255a7998adf8caabfe3cbb0ff09b438f16f7f303d0a1d5b551886a0b3c05'],
    ['32.webp', '186891714f9cd50ffc4787d44e66c159595a92b8907a9757e4e27781e61fce0d'],
    ['33.webp', '763476cc36e01af9f6def2ec41e39bb158cec592c88757d14adf7ccc8dbdba09'],
    ['34.webp', 'def817abd24432b833121a812dc0569015a848abbfccccecff3a799096f7b3e9'],
    ['35.webp', '90a61d0bdac96afafc98e17260da4b613dd9d2dc5659c2132954078255b80982'],
    ['36.webp', 'f7f65ac1c41b3be3177f6749986eed9f64564f8bd0c04469cbfaaed39acc72fc'],
    ['37.webp', '1707132aca416c30f62a89a2b18d9009927fb31d6702967d7e936f690938438b'],
    ['38.webp', '4747a4becbf5ba305b658a07dfacc45fe32bbb313b380d0f3126cf34376ad0c3'],
    ['39.webp', '92b7d0b47d82bacec2b5e643c6b6f8a70f42b764492a9dd0af6d50a93dafb295'],
    ['40.webp', '9b9c02eee6eee4e76ab303a484c7a0429effce719d35dceae7c88df966f4ed48'],
    ['41.webp', '4f4db1f247f853d0c089c85ec58616534138913816cdd5ba08020f1c5e17403f'],
    ['42.webp', '0d916fb4f52b608016de80b31cb920af4d32ad537f1ed8e87ca0060ea6df95fa'],
    ['43.webp', '9946fc961bca5265ae7bf664132da1a6d0b83e0a6f70b6929980b49bc11eaa98'],
    ['44.webp', '8d7f349343dacdef8f1f0e97f66a4b4fccb7a55094c088339e82aad576c51ba1'],
    ['45.webp', 'c47356548d7b6590f63869e9191aa4cffc96e6f57ec253c482717d6409963aef'],
    ['46.webp', 'f401f4f3c32db5aba4d127848c9a6c8b69f06bed6881ae2c82006a57e16b7c59'],
    ['47.webp', '5efa73da785497d869c4748f4ac48ec9b1938e838badeb5f1896a340c035d637'],
    ['48.webp', '835c45a730cbafe30fd69130550a4470b192e9c91a3f5fafd2ec28c365cd0a11'],
    ['49.webp', '155bf01d0298d9d99c514a4ac5b660c5d0ecb068f06178e283f75f145e17e795'],
    ['50.webp', 'c0767034251ed99b393393fb7103befadc5d0c59b422c24a520b86441d2e6687'],
    ['51.webp', '4a3fff41c665ff665e676617a57d3146e2aac249efca86b035dd152438f37caa'],
    ['52.webp', '8a12ab77984cf00f2f53bc45d3e90ba20c228e1ecdebd0edb85fab9e660eb916'],
    ['53.webp', '30ee0c3e48ff3c6e43d8227a7a2207165c00fc6b847a86c568e714444be7a2a1'],
]);
const expectedRestProfileCroppedHashes = new Map([
    ['0.webp', 'cbc677e29737b99eff59879c2df69e72e7d32fcb1165655b12b2fc353de18b44'],
    ['1.webp', '44db6c484eb4f9a42fb624d73563c2dafdb9b6fa6e607929708107ba8f710b65'],
    ['2.webp', 'dabd4e0ffe4dcbff60e2d089917f971b3b18e7604d08e98eea92f03652bb395c'],
    ['3.webp', '82d49edb2b3d3c10d9c3fb2f4375fc04f903b20a1b693bc44881c532ff53162d'],
    ['4.webp', '24c7a51b48fb269d0722054bab52b5ed0781d92e2f08a317a900196e5c13c0ee'],
    ['5.webp', 'd933441489af2fc0519cb63aa01ee62b3688b74c7fc5d16f64c2502b2c03eafc'],
    ['6.webp', 'e8f88d48d8925e0d5ec59c5989c60b54399c245ad097977575dc9140634493cf'],
    ['7.webp', '01c1f6d9e4a002bbe8c0c6243d99598035a957e6ca6d8e40bf1ee2de4a58cc4e'],
    ['8.webp', 'e46bb0b2109491c69058527b18ff2a6fc260ed4f2f14fe4b5329cd99f772ac48'],
    ['9.webp', 'b8d1ca5fb7fd706b2e7b97154ef66fd4188f0ce9f13b95807398983d7fda1d95'],
    ['10.webp', '4388badbc2cf93b747d202b38f0f4a4b5712d3a3e6fad22934c51cd7d674bfc1'],
    ['11.webp', '09aac08a8a517a1d878fcc9e52eb3e0e0319ba3c24cbe625e2320bc6e1449276'],
    ['12.webp', 'd455f00625a4bf8d37ca8ed6169a27ae7790654d2eeaeb47fe751d1363349248'],
    ['13.webp', 'b19254772bc368b6f9f394c3b77e70dfefceaaefe8c525825c5e2802a3cbb59e'],
    ['14.webp', '8d37bae9eaf54fbea8b624b55e40619af996d6aae774124c53f9fe973781489d'],
    ['15.webp', '0d60bc9a2c9dc2a155e08ee24755ebc083f3e1565fb6001d4c4665fae9fa4e53'],
    ['16.webp', 'a344a8d0443898fb7400d4c9399d1ad67e6f5fb48ea917c09044eeb39a5c8629'],
    ['17.webp', '2bbaa0a1ced81c55313f94f53728dad6bfedecf08de85bac07e3fe2a60aabc94'],
    ['18.webp', 'eb9aa8031442ce7d661c15ae0e2945347584b859e477ca91a2fca0ff037e1206'],
    ['19.webp', '17e4ceeaf37014107308d21c15e4c2107d3e22f944d165840766667656e3fbf5'],
    ['20.webp', 'e8414642b91ac5aaeab1cea3270049b65c66cf638b1283341f15f3ab0f58dea2'],
    ['21.webp', 'f8788d0a4b34cc6a0a0ef35970409c89ae92000fc950564e7a54cf317633f5b1'],
    ['22.webp', 'b6a37135e62f026e00314c689b2e766b3024d186eea6a182b92fe1028766050c'],
    ['23.webp', 'd6ca5eb1861585ab3f699e940c670cacbaef8ab50860dc5cc0dff6091ecdd61b'],
    ['24.webp', '8a8ca8d666fdf6cc9e678ff4bb6bf4ca5ed5baa2d6a9c8133dcac83513191ce7'],
    ['25.webp', '55f50a369016dd3f24f57c140e96b5396345ab35afd95a5d59f5b49f5388b7cf'],
    ['26.webp', '889a4e868f2a1e4dec3c7625c227365a5128c146e2f5b77a0d325010bee6539c'],
    ['27.webp', 'fa55f872db2cb8de9481ac9bb5f778165a365add2fc41adac26ecb069573037d'],
    ['28.webp', 'b295922693a69e3794d542b1b8012c9019f7525526f09481dc8c79cdf3efa6f6'],
    ['29.webp', 'e7a307d329d7d029876f60eaf4d2aba03b3283b34e625f9e7d3aa0ca690127c4'],
    ['30.webp', '36b7242d5cea5b2a488f5495bf13e975762859c0b4c7fbdd9f28cdf753632695'],
    ['31.webp', '82e91abf9e3f9c7b44e5ff7acfb1fc1a27860041c0c268365fa842e03a6fcf6c'],
    ['32.webp', 'c491f08f58b1c44d69dcba1972b4d2da9f3b31a37d57a6ca25256a8e3c7b8b36'],
    ['33.webp', '96e551175097c3a95d4d893f3e58aaaf3721dae0cb339316f7971c2eb1d6b12e'],
    ['34.webp', '75dde75db2f28c430aa9b3a13cf8dd30abc9dbafcb5b8987d897af9e20664397'],
    ['35.webp', '6903703f477dc347393e8518bebe4bf96665b06e75d74d361c546ccdbc1fac54'],
    ['36.webp', '29cc1e6026fb7aa04e33ece35c1270af6501ab4bfdfbb1077ca9c6d612bd6acf'],
    ['37.webp', '4871c07ffb3a249ca207d53b0593fa4427c8cfdb93b8b46b2248f3d38d758f8e'],
    ['38.webp', 'b43ad54a3224e79160e73223ba6f55ee2b3e64033b905f4105f5b872c9d18ff7'],
    ['39.webp', '09c742aa33e9f33d7d1eb587f4628799e479f13796bfdbde7cbdea85147e0189'],
    ['40.webp', '378f57f2ae883eca3fd9052c52982cae224fcbff0488f55971894f7adab86982'],
    ['41.webp', '1336a5a60ff7c943be1f9daf67cef4cfe17a65bd79cc038064c94c735fb21b0b'],
    ['42.webp', 'e472b303624190f7a1c63fcaf92769d151512b3f33c5b9d4660d8f279dd37654'],
    ['43.webp', '39aaa27e9540101fe86bdbc35942576a796aee5e3dd47b6e4e06405c186cc0f7'],
    ['44.webp', '1613957ba8888397e69db700f5b7a04a0f22408bfa652c6cf6c0ab7baf2603a6'],
    ['45.webp', '4bb3da45f589941537b6fdfe8e5ca645f1b4ff2a2188019c385e9eb588c2769a'],
    ['46.webp', '631a9016012f5fed276826332c84366c92d2045a4e3cc78ed477df4a0e163f41'],
    ['47.webp', 'a92e180d26d599163b3ee2d2166e9adba510ac411b0d69468e125b2548dd3e0f'],
    ['48.webp', '4627c0fcb285577d8a603729f2d80902918fc3d258f1fdd61a657058e4e040da'],
    ['49.webp', '999602c1caa3248bd9d92982128fd7c8564130d5c698fa4625fa6939a267157c'],
    ['50.webp', 'ffed3b4b24262faa500e8fcf1c7c84afa8c20e3ba95de321c24025e7eee747a2'],
    ['51.webp', 'ea968185c43640ab80143f03f4489dc19848e0e0dddd754ca3160a8a80770f61'],
    ['52.webp', '5cbf35038a7cbac5cad88f3188460a364d9d84a9749f4b96681991e1e7a01584'],
    ['53.webp', 'de9e266cd5e1bdc2a0327508f66d15d312ac758428a406f92266183b72170649'],
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

    it('contains exactly V1 normal jump WebP frames 0.webp..13.webp', () => {
        const expected = Array.from({ length: 14 }, (_, i) => `${i}.webp`);
        assert.deepEqual(readdirSync(jumpDir).sort(numericSort), expected);
    });

    it('contains exactly generated jump WebP frames 0.webp..144.webp', () => {
        const expected = Array.from({ length: 145 }, (_, i) => `${i}.webp`);
        assert.deepEqual(readdirSync(generatedJumpDir).sort(numericSort), expected);
    });

    it('contains exactly V1 rest WebP frames 0.webp..33.webp', () => {
        const expected = Array.from({ length: 34 }, (_, i) => `${i}.webp`);
        assert.deepEqual(readdirSync(restDir).sort(numericSort), expected);
    });

    it('contains exactly V1 rest profile WebP frames 0.webp..53.webp', () => {
        const expected = Array.from({ length: 54 }, (_, i) => `${i}.webp`);
        assert.deepEqual(readdirSync(restProfileDir).sort(numericSort), expected);
    });

    it('contains exactly cropped rest profile WebP frames 0.webp..53.webp', () => {
        const expected = Array.from({ length: 54 }, (_, i) => `${i}.webp`);
        assert.deepEqual(readdirSync(restProfileCroppedDir).sort(numericSort), expected);
    });

    it('contains no other asset files or folders', () => {
        assert.deepEqual(readdirSync(join(root, 'extension/assets')), ['nox']);
        assert.deepEqual(readdirSync(join(root, 'extension/assets/nox')).sort(), ['jump', 'jump-generated', 'rest', 'rest-profile', 'rest-profile-cropped', 'run', 'walk']);
        assert.equal(statSync(walkDir).isDirectory(), true);
        assert.equal(statSync(runDir).isDirectory(), true);
        assert.equal(statSync(jumpDir).isDirectory(), true);
        assert.equal(statSync(generatedJumpDir).isDirectory(), true);
        assert.equal(statSync(restDir).isDirectory(), true);
        assert.equal(statSync(restProfileDir).isDirectory(), true);
        assert.equal(statSync(restProfileCroppedDir).isDirectory(), true);
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

    it('matches representative V1 normal jump asset hashes exactly', () => {
        for (const [name, hash] of expectedJumpHashes)
            assert.equal(sha256(join(jumpDir, name)), hash, name);
    });

    it('matches representative generated jump asset hashes exactly', () => {
        for (const [name, hash] of expectedGeneratedJumpHashes)
            assert.equal(sha256(join(generatedJumpDir, name)), hash, name);
    });

    it('matches the approved V1 rest asset hashes exactly', () => {
        for (let i = 0; i < 34; i++) {
            const name = `${i}.webp`;
            assert.equal(sha256(join(restDir, name)), expectedRestHashes.get(name), name);
        }
    });

    it('matches the approved V1 rest profile asset hashes exactly', () => {
        for (let i = 0; i < 54; i++) {
            const name = `${i}.webp`;
            assert.equal(sha256(join(restProfileDir, name)), expectedRestProfileHashes.get(name), name);
        }
    });

    it('matches the approved cropped rest profile asset hashes exactly', () => {
        for (let i = 0; i < 54; i++) {
            const name = `${i}.webp`;
            assert.equal(sha256(join(restProfileCroppedDir, name)), expectedRestProfileCroppedHashes.get(name), name);
        }
    });
});

function numericSort(a, b) {
    return Number(a.replace('.webp', '')) - Number(b.replace('.webp', ''));
}
