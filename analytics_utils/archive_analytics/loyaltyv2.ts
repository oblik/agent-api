////finds loyalty ratios for each user's most active actions executed time ranges
//
//import https from "node:https";
//import dotenv from "dotenv";
//import moment from "moment-timezone";
//import { QueryTypes } from "sequelize";
//import { sequelize } from "../../src/db/index.js";
//import type { Event, Statistics } from "../types.js";
//
//dotenv.config();
//
//const distinctIdToWallets: Record<string, string[]> = {
//"423d9d47-63b0-4238-9685-5da658e66821": [
//"0x2F73288629af429F435e0CE105473d25bAdc4bC3",
//"0x165aC03531e10DF8E1C4D75C4e69F8a829B8221E",
//"0x68A3Ad44cED5D556C4Fd7E1825B03Af1E70edD3B",
//"0x77b9A8F946E5c2d1487A0F12c262a9DBF29BD399",
//],
//"af5bc1f1-2eb4-4521-9e28-c151ca08e5a1": [
//"0x5addfb98c8d7c35435c3b97e88462b5b0bfaa507",
//"0x46f2ca932bbf4f49313fcd6ccbdfbafc282ba249",
//"0x26ee053134eac5dd53d57528f882d0755cff57ad",
//"0x0b99363648efea66689d58a553bb015957083c57",
//"0xfb63ea001bfc6544420e5e2d5c1080b366d55a64",
//"0x6038038413b7522d004c68a008ea3665b6e3fa4b",
//],
//"c3234865-e9cb-4a1f-bad7-524f3245389a": [
//"0xb33ee37fefb55b3af4bb43715b3036a91d8104d3",
//], //confirmed only can find 1 wallet
//"38fc46ba-0110-48df-b8e8-1703e465ed50": [
//"0x086BBE8577b6e67b479e70F110b801240061B8b4",
//"0xb6af0e59E41F75552af00138a9F62ACAef2B6254",
//"0x35d1d90a1796631427c0657eD24b26E11313b55F",
//],
//"701edb44-e937-48f5-b784-99df0198029d": [
//"0x11153a5ba20bdceeef62564156a63492cb9b2f13",
//], //burner wallet
//"deb69860-77d8-4ffc-b1bd-1d100626f4a6": [
//"0x0e79459D098815bAB924Fb7a8a266448268B9650",
//"0xEF810E10E3059339f2C56eD2070f60afb684BEe8",
//"0xdf6AbB568CeFa2A18d822E040981D6d4DF9956cc",
//],
//"fa1cd359-7811-44dd-a9ec-4e69f3fd32d9": [
//"0xdA38AFF9D34fF382F12a1De111A10491566B9876",
//"0x468f4C726c5da2f8fb97C483c56d7703c18545D6",
//"0x3298492EE2689911866EBb01A1774DB060ad6A7C",
//"0xcb22237f7fFa2114F0ddad9aE71bef747d29eC6A",
//],
//"95369e11-f9f6-4b6a-943b-01e943f53e33": [
//"0x18b782753f37A2Bf29FDF60f8ae9BA61CE4CFF58",
//"0xAe7aB1bD68FE7C2fE9931F6749C4409f114ee03B",
//],
//"17ba76d4-ef0c-4e8f-873e-070efd81fb0c": [
//"0xbFc016652a6708b20ae850Ee92D2Ea23ccA5F31a",
//], //confirmed only can find 1 wallet
//"e36cea20-8300-4817-880a-019dc2e40581": [
//"0x124a2239841a19952b97e04a5105e1da45ca0283",
//"0x4877809ac00cfdc0b81eaed6f715189983a41b7e",
//"0x5d15b8c7a685bcfad059dbb930881cda4b83c3ac",
//"0xef93c8cb3318d782c70bd674e3d21636064f8dde",
//],
//"17b83ccd-7b21-444b-b089-f8d22a7a2b1a": [
//"0x8358Fc2Dd62c00C1a9Cd0fCB577309A4cead2471",
//"0x38c558ecc60ab6850ad922757bbd1311c02e1473",
//"0xCb6ae61dE6B983D7Eb851B00aDd112938fA1EbFf",
//],
//"82bf3ba0-cc82-454b-843b-e3d592628eae": [
//"0x9E4f6fa29F6Fee8aA8e57A6c547D17964D266325",
//], //confirmed only can find 1 wallet
//"15447066-0704-4011-8c57-569dc6ddf59e": [
//"0x7228DC997Fdf0Fe229BB7fE61F1DE55B2bfb2074",
//"0xA07c565326376055DCfA206ef5B84Ae471FB735B",
//"0xaEe497CA6fB23bCAC4957dF782C7ab40D69886f0",
//],
//"d1368cba-34d3-41d7-90b8-362171a580cf": [
//"0x66E751F8a564Be5b796e0E6d5d68FC7fa2c89976",
//"0x372b8c8B1A809149f0964c13a22b9B11Da637526",
//],
//"1df7f051-e953-4248-80cd-2ea627dc45a0": [
//"0x40Ff38496e4d7af91a737d0384c4840A54A6b877",
//"0xfbEe0c7526288A94CDAad27462Fca1Bd7194a104",
//"0xb5Bd88D41BaC88066113f98E763642699C2bFb2D",
//],
//"c711fa0b-dfae-4e22-bfff-af0827a1bb96": [
//"0xe08583e015f358ce59489DEba17B9774833C9F8E",
//"0xEbF3D7d00ec0C3613A40bF0b27Bf1B59aC63C092",
//"0x5871f9d40F609D7c51EeE61DB505d4bc7c5bc7C9",
//],
//"fbc009a7-e9c6-4f53-a78e-eec0f6f784c1": [
//"0x8d506b4972cb65ab764a95c54e486e31198a0d12",
//"0x686cabe21c7a9cbd2e59184608d39e25eb0e4eb6",
//"0x72f0a77db71d8363a14a5e390b98ed14f5def0ba",
//"0xbd18f7d198abd89576fc2bc165b87f3eae0aa97d",
//],
//"4eec327f-2e13-42b7-9f2e-48acc95a0fae": [
//"0x90D96D2620325AA2e002E9c2AfeEceD507850BDB",
//], //burner wallet
//// "f58617b4-24b5-44b2-a2c1-e730a3e7f76c": "r3lentless", //no connected wallet found anywhere
//"55e2f84a-33ca-4715-844e-1bdbd6065759": [
//"0x0B1A89664970EbEb16d6a1a039017049EEa45a20",
//"0x9b47a47237670EcBbC04ba88F6f4D0ce754453b1",
//],
//"cfa468d2-3e07-4d33-8dde-7821cb760a8d": [
//"0x417D8DD72fb27c95680dE4fa5bF26144E2284C28",
//"0x37d6258662ef824a4eacd5712546a875fb6f7f51",
//],
//"4ea21461-54fa-412f-9cbe-6940fe4e30c2": [
//"0x1db8ab0290852bb53de852444fb73c07b00970e2",
//"0x49aef3924a006cb6eaeaf2c2dc627fe1026f86df",
//],
//"fed5b4e2-caaa-4aeb-8f0c-84e5bea148d3": [
//"0x916421ed84d8ccb631786683c50ecf4bbf5ef002",
//"0x701888b4E64205aa2a9F10727FA68aD71bcEdF79",
//],
//"5bed384e-b3af-4b3c-9598-7ad1cbd8f60e": [
//"0x27eA25eEBEBFe0e55c4d85492498A239e28E9fF0",
//], //burner wallet
//"68d8164a-b2fd-4579-8e6e-7f48d130f859": [
//"0xB14130755bdc32F3540B8ff1ab417304C80D0EEF",
//"0xD2E6Ef39F4A6d4BE576C2BD891a2FE8D3D8Aec81",
//],
//"b6b01ecc-6538-4d14-ba9f-7ad9c9d35355": [
//"0xcb66d3da693fa55672a8012ce0e334ce2a8dd30d",
//"0x2e8f1671a40652065d10d8c253ec5e9992b1c6bf",
//"0xeb683293576c20b20ebd90a405fbe778360d4d55",
//"0x505e71695e9bc45943c58adec1650577bca68fd9",
//],
//"52fadf7a-9e82-4d88-97ec-f27521770bff": [
//"0x5bf791A7C62650A04EFbabB23463F63F25b76Acc",
//"0x40a24ea5b6a248f3a138e6bfe3366e78d1cc71cb",
//],
//"4536baec-dccd-4eb5-a779-2ab19c88fab6": [
//"0x7287c3d93b89B7f9153fEE6Ef086Cd2858e9B9EB",
//], //confirmed only can find 1 wallet
//"8e8b73fe-4361-46ee-b96c-bb1c6b9c942b": [
//"0x8813122344DE363F39803131B2f953dF47604E33",
//"0xD359264Dd634EDF74D5D00ed06Ccc44ab20EeBa9",
//"0x37C787193dE657EFA1F792a3E65586331552f335",
//"0x0D2874220eBb986484137E9085c89a4a465aeAED",
//],
//"371aad77-7a48-4f24-a52f-f4486b82ba8e": [
//"0x1Db71e663bf469e3bAe5055eEDd307dA04B2EDd9",
//"0xE27E52d071d1cc324cDe18279c8B05fb018371CC",
//],
//"779f0143-5710-45d7-a71b-0e3d6a4f9e03": [
//"0x1c62c89cf3f57eae7d61f1490c985ee82452752c",
//"0x6d3f7946d8ee4f7fe5bdc9c87bdcefc29846a790",
//"0x40495a781095932e2fc8dcca69f5e358711fdd41",
//],
//"a9cec308-0696-4d2a-abb7-4b50cf359be4": [
//"0x133D93566f9699B3Af46fE150daA8a67a9563ED6",
//], //confirmed only can find 1 wallet
//"276394ac-6099-4f61-9952-6e17c33ec917": [
//"Tobyyy#0x1B18dd461cD91a88b931550577361225d8115f4B",
//], //burner wallet
//"7dd29df3-90d1-4abc-b122-b6f0ca3730b7": [
//"0x94EA4Bd36C04aEf8720e08891d9Ec13FcfC6E1F1",
//], //confirmed only can find 1 wallet
//"22f7f493-7249-4887-bf45-be25a4c08bab": [
//"0x895f39cEC8D6c2A4c956ee1eEd854B86E4e2B7a2, 0x69892E7DCcAcbcA746FeDA66BbE2cB6AfD70A545",
//], //burner wallets
//"c8d1cf9d-eda9-4145-8fb0-0fafcafae395": [
//"0xe1C3B6a99f2ED278E4a6Ba774312eb81BF24942A",
//"0x6A33D28d7f1E7CcAD132304a6AbD87336A7754Fa",
//],
//"5e1ffe8b-ee74-4d72-b645-5c98e78ae96f": [
//"0x5881d9BfFf787C8655A9b7F3484aE1a6f7a966E8",
//"0xacAD95570031453BE812b88Da058A074C26E3535",
//"0xa5Cddc9648Dc779DD20DCb63a3Ac1A5F90a28A9e",
//],
//"4ffcd856-d407-446c-accb-4aef467779c9": [
//"0xB39f5C87E06C201a03a8b1bF9641217c31d8DE57",
//"0xFE39100c74daeec55B6D270b6670EE99788116aD",
//],
//"aa00949a-6c81-4861-94a0-b0bd9fc7b848": [
//"0xD8e360Db31D77867CfB21280dd264E9f7A230ee6",
//], //confirmed only can find 1 wallet
//"3e42204a-3bc3-4460-aff2-6b19733dfd7e": [
//"0x7886DaCE06ABdeb54929984CC9adeA78b42ed290",
//"0xa7ff0bc6f74fc6c49ccba87f3df51b1adf98543d",
//],
//"79ec8b10-a781-4f08-8ce8-d0ccc3d86ae2": [
//"0xDb5ee516B26F70739eC1A18b155ace18A1168d00",
//], //confirmed only can find 1 wallet
//"accc3289-7516-4c1a-9eca-a51d87b5ebac": [
//"0x8636d4bae80f6b5141aa57abfd672b274bc0f0f6",
//"0xf7f1f47ec265f64cc5f569ff87da572a5ab51fa6",
//"0xdf8a9f065bea0214ddce88a0d6afaf6a42a2f279",
//],
//"da5769cc-1769-495a-9210-6977add3e5eb": [
//"0xb0e47186d3b72860fd1d1ff6de64af56d7013451",
//"0xb8d1047861979e496ead3c37dd0370d122b095d2",
//"0x7328b4b78c919def3beb4338ae3b2d7769e831c7",
//],
//"3cb28945-238e-4e12-84db-46a929478932": [
//"0x23c17b2fe71220daa0a248b51dc0e66a3952193c",
//"0x6291bc1f82df8e46d70df1320b0837689c0bcffe",
//"0x454e8ac180602f524f3369f3b843c56ee1e7012e",
//],
//"9dd5af22-469f-45c4-8e33-9a872ed5e0de": [
//"0xb9318b1731c98a5cd0bc7ce830c9a6bd10f72e8c",
//"0xc9e871a3bc1320e49e5e22731574c3b3026abfe9",
//"0xd0f9f4623a28cb58c6b9a4c522ec7957cd53640d",
//],
//"f6c6c75a-b373-4213-a03b-d77572504586": [
//"0x3aef500f0e728e0a85efb461974412d7e72f5c77",
//"0x2f04ed87b5ac8b703565469311341b0b44e315d7",
//"0x61e60af04805d7ddfb0cfde0a96a3b1c15f3748f",
//"0xa9c3eb1b8250daddf039a010b67a089d8384f648",
//],
//"95f3fbe4-6e22-4529-b614-2842438239cc": [
//"0xfc96a1e192f1337efb4dae223906e85416d135d1",
//"0x80b70c055f4595544f325f3671cb98bd97ed65f3",
//"0x4991933554fbc17d85880eba460d3be7e892dcc6",
//],
//"0dc5f81a-f40d-4719-96a0-fc70d0ee206d": [
//"0x97d448ceb404a1bf23021a689a4c3b5de6ce5baa",
//"0xdc4f5b2bef394b1fcf7e50b4290ed1505840f51e",
//"0xfdb7f6cd26cdb2d9b9553db3e148411e87055fce",
//"0xf95f532a50fbc339b5fb204730a778f13d814d54",
//"0x44861be88b31f08ad0f5734d4890ea010113cc61",
//],
//"40f38df1-f9e2-4723-9305-ccbe7148348a": [
//"0x2e9e49fe30f74ea823d02525cc445932142b60d5",
//"0xac57df25f08e67122c2d191546fdf1e027c0127d",
//"0x363fee8d6cc96d8ae846c8b85bff329b8abde26c",
//"0xb97315dd3e85c6d491131b1665978628a715682b",
//"0x2e9e49fe30f74ea823d02525cc445932142b60d5",
//],
//"88a6b3cd-4e99-4a24-8cd5-00ff49d6c34a": [
//"0xd0e82dbd5a0fa63e571e62f4021caaab31b52a95",
//"0xa91a4aa9cd09a10e35aba1cae6d410bd2945e79c",
//"0xa2917120c698fb5f2a03e3fd3524bda85a3eaef6",
//"0xd95dc82da062969c1a89fe9788151333944f04fa",
//],
//"6f757ed9-f92c-446c-b52e-e1b9032589b1": [
//"0x16a55d6c1d1991dfe63af7a0b8f19749791c9f52",
//"0x16a55d6c1d1991dfe63af7a0b8f19749791c9f52",
//"0xfabaf526f7ddd970bcc214f41bc00b90f40bffab",
//],
//"3a19ba81-6e7a-4a9d-93dc-461dd8436e35": [
//"0x513aedace44cc9a0724ca276a8ceeee950903576",
//], //confirmed only can find 1 wallet
//"326ffb21-fe5d-400a-b7de-3e3695d732e4": [
//"0xc9a4ddbc437d2dd5ea8a69b1d803122818a39a0a",
//"0x6adcf08deaaf5913079707f923279ef4c6d5225e",
//"0x9f5b8f8fcc32712d32644add0b23978d56af3e2d",
//"0x2115f525c610bcf932e3de74fca15c4834900b1c",
//],
//"770342fd-00a7-47f2-8d3f-63189f5815ff": [
//"0xa2ddab885adeea075397acbde71dc55ed710e2a8",
//"0x14e405d9ff39d33f60dc1af8cb44cbd9e115bbc4",
//"0x24a299102e0a052ba481a489d337728a1b064540",
//"0xd96583d8b4334c08a752f8fcc9e8c4d92ed090ea",
//"0xa9b8968557c81763652c1fa951dab74b635105e8",
//],
//"6ef41ff4-ab39-4609-aa84-515459e52fe7": [
//"0xe35078385bfdb35655a257ea5ca2ccc727412325",
//], //burner wallet
//"81c128ee-1800-4dfa-bbc0-ba3a4a26bb27": [
//"0x848F82Dc443d26434F2d5225e120DfcFe9a4A864",
//"0x5a330E8DD8a163dF4cC92b2faC1c70474333174b",
//"0x18C46420f24D06F0939076C304599816D3748258",
//],
//"3a2bfa84-6b06-4526-a685-3d6d18d5724f": [
//"0xC5B8d3Ab81Cef92e97bb4F1D7C4a8f2798b9E40B",
//"0x9175aa7a3E4e3B57944Ec23B22d4c80fC2eE4776",
//],
//"1d3e5575-f94e-412d-b5f9-072f0d0c5e5e": [
//"0xc6579463baB5BCB90a9635bef91CcAa78fFFD7b1",
//], //confirmed only can find 1 wallet
//// "81c7feaf-2cf5-401f-a1d6-90ae11016d69": "sngwinner", //did not send external wallet
//"bd5f93ba-4df1-40cc-91df-712aed7f974b": [
//"0x50A354f9EDAa453D59FFe1F88096b3B8225E7afE",
//"0xd793beB2B87EB2EC1D96f045C5EA12a667a946AE",
//"0x7ACFc599fb1528cFB85F4bA7b0944A89E396833a",
//"0xb7A3fc22051D587AB1F760113335F4B99a898EC9",
//"0xc93B0Fd477ef0689FdbaB82aBba18b725893aaa3",
//],
//"047d3cab-87bb-4744-b900-fecb129406f1": [
//"0x777777afefc8890551b9e93D75b99C3444C6E715",
//"0x33be3f919730f7Fc7a03aFf6bc7B9bFF35856544",
//"0x0969fCf4d4c8ee3962fFa5Fa340D826c11F0640F",
//"0x888888464720698050E0bBB23F2346B4B2A62557",
//"0x111111d436C95CC17F3dD9876e90b46869A4214c",
//],
//"62a45beb-fa8a-4ae9-800b-21e00d13977a": [
//"0xE86174Ea7e5F8065708e8B50C62780A938011389",
//"0x484e2Be931fB5e92fbA4F33E2fA0219eDFE61Ae4",
//"0x365283cC2178eA4aEE64AE7D551529C738d626f5",
//"0x8BBFfa953F2FdB61D79e3906Eb1CFC5a4A9359d8",
//"0xf53b3898608fFcB7550D4111ffb868b390E516AF",
//],
//"ced11682-1ad1-4ba1-a0d6-8a0b7518caaf": [
//"0xB40a9E8117f11D8024FFaDC3fB892Fa76a730ee0",
//"0xe64063c7688DB1Ac863D0DaA3dBca41aB4E6b465",
//"0x0326c4eCe65bf3e40f64BA8F72D5f33aF4C5727d",
//"0x5b456235dAbcc5938A206C5A1Db4ec40A607135B",
//"0x3823199232eBCDfC911336e44AF987aeDc36Aa44",
//"0x56b06Ff12843BE1D9d160D40164f1B9491bfff4C",
//],
//"2e4fdc35-5d54-4a3b-817b-cbc8f45fd602": [
//"0x6a137EE563c2533eE932fbB14D9004c3e6e72198",
//"0x95F308fDE5D2a3960937d1d7D2f0be174d587b93",
//], //burner wallets
//};
//
//const distinctIdToUsername: { [key: string]: string } = {
//"423d9d47-63b0-4238-9685-5da658e66821": "busty_jd",
//"af5bc1f1-2eb4-4521-9e28-c151ca08e5a1": "0xkp",
//"c3234865-e9cb-4a1f-bad7-524f3245389a": "manito3369",
//"38fc46ba-0110-48df-b8e8-1703e465ed50": "saltypickle24",
//"701edb44-e937-48f5-b784-99df0198029d": "jshugs",
//"deb69860-77d8-4ffc-b1bd-1d100626f4a6": "mrlaidbacc_",
//"fa1cd359-7811-44dd-a9ec-4e69f3fd32d9": "_bagg",
//"95369e11-f9f6-4b6a-943b-01e943f53e33": "grimmonacci",
//"17ba76d4-ef0c-4e8f-873e-070efd81fb0c": "outperforming",
//"e36cea20-8300-4817-880a-019dc2e40581": "hwxfrank",
//"17b83ccd-7b21-444b-b089-f8d22a7a2b1a": "0x009",
//"82bf3ba0-cc82-454b-843b-e3d592628eae": "0xivan",
//"15447066-0704-4011-8c57-569dc6ddf59e": "shix0n",
//"d1368cba-34d3-41d7-90b8-362171a580cf": "dippuccino",
//"1df7f051-e953-4248-80cd-2ea627dc45a0": "akig",
//"c711fa0b-dfae-4e22-bfff-af0827a1bb96": "gemhunter8679",
//"fbc009a7-e9c6-4f53-a78e-eec0f6f784c1": "astha22",
//"4eec327f-2e13-42b7-9f2e-48acc95a0fae": "cryon.eth",
//"f58617b4-24b5-44b2-a2c1-e730a3e7f76c": "r3lentless",
//"55e2f84a-33ca-4715-844e-1bdbd6065759": "ndscrypt",
//"cfa468d2-3e07-4d33-8dde-7821cb760a8d": "mehdi.mhd",
//"4ea21461-54fa-412f-9cbe-6940fe4e30c2": "pussy5layer666",
//"fed5b4e2-caaa-4aeb-8f0c-84e5bea148d3": "lezzybruv",
//"5bed384e-b3af-4b3c-9598-7ad1cbd8f60e": "d_knght",
//"68d8164a-b2fd-4579-8e6e-7f48d130f859": "verquer",
//"b6b01ecc-6538-4d14-ba9f-7ad9c9d35355": "manuelmindx",
//"52fadf7a-9e82-4d88-97ec-f27521770bff": "jerame20",
//"4536baec-dccd-4eb5-a779-2ab19c88fab6": "Meynad#4251",
//"8e8b73fe-4361-46ee-b96c-bb1c6b9c942b": "gconcept",
//"371aad77-7a48-4f24-a52f-f4486b82ba8e": "_xhades_",
//"779f0143-5710-45d7-a71b-0e3d6a4f9e03": "witcheer",
//"a9cec308-0696-4d2a-abb7-4b50cf359be4": "daochemist",
//"276394ac-6099-4f61-9952-6e17c33ec917": "Tobyyy#6658",
//"7dd29df3-90d1-4abc-b122-b6f0ca3730b7": "noral",
//"22f7f493-7249-4887-bf45-be25a4c08bab": "chadnik",
//"c8d1cf9d-eda9-4145-8fb0-0fafcafae395": "thebigskuu",
//"5e1ffe8b-ee74-4d72-b645-5c98e78ae96f": ".meaningoflife",
//"4ffcd856-d407-446c-accb-4aef467779c9": "0xmedivh",
//"aa00949a-6c81-4861-94a0-b0bd9fc7b848": "pasaift",
//"3e42204a-3bc3-4460-aff2-6b19733dfd7e": "zk0t",
//"79ec8b10-a781-4f08-8ce8-d0ccc3d86ae2": "vic9000",
//"accc3289-7516-4c1a-9eca-a51d87b5ebac": "hydroboat",
//"da5769cc-1769-495a-9210-6977add3e5eb": "veggiechicken",
//"3cb28945-238e-4e12-84db-46a929478932": "0xn4r",
//"9dd5af22-469f-45c4-8e33-9a872ed5e0de": "voiced_007",
//"f6c6c75a-b373-4213-a03b-d77572504586": "philipp668",
//"95f3fbe4-6e22-4529-b614-2842438239cc": "gokubutwithnohair",
//"0dc5f81a-f40d-4719-96a0-fc70d0ee206d": "kayy0727",
//"40f38df1-f9e2-4723-9305-ccbe7148348a": "thade",
//"88a6b3cd-4e99-4a24-8cd5-00ff49d6c34a": "lazer420",
//"6f757ed9-f92c-446c-b52e-e1b9032589b1": "coolthecool",
//"3a19ba81-6e7a-4a9d-93dc-461dd8436e35": "darkfingah",
//"326ffb21-fe5d-400a-b7de-3e3695d732e4": "degenoccultist",
//"770342fd-00a7-47f2-8d3f-63189f5815ff": "bill_researcher",
//"6ef41ff4-ab39-4609-aa84-515459e52fe7": "yedamax",
//"81c128ee-1800-4dfa-bbc0-ba3a4a26bb27": "_rebenga",
//"3a2bfa84-6b06-4526-a685-3d6d18d5724f": "trembl3",
//"1d3e5575-f94e-412d-b5f9-072f0d0c5e5e": "tyro90",
//"81c7feaf-2cf5-401f-a1d6-90ae11016d69": "sngwinner",
//"bd5f93ba-4df1-40cc-91df-712aed7f974b": "dr.bouma",
//"047d3cab-87bb-4744-b900-fecb129406f1": "0xsik",
//"62a45beb-fa8a-4ae9-800b-21e00d13977a": "frans6cur",
//"ced11682-1ad1-4ba1-a0d6-8a0b7518caaf": "jacq404",
//"2e4fdc35-5d54-4a3b-817b-cbc8f45fd602": "btcjev",
//"376e7843-1d15-4175-89c6-52230a8923fa": "turnssy",
//"d6d95a14-b12f-4209-96a6-c73cabbdc5e8": "alu23",
//"b6101b58-8a40-4737-b6af-3b7c87c4517c": "0xjulio",
//"fd6e126d-739d-4cf1-a64a-0b8702a2cff6": "natgan",
//"f71a372d-145c-4e17-95e9-3c50f527eabd": "mjul23",
//"50a11759-444c-4586-80d5-2f2610dfcec2": "cryptato",
//"6b95ec89-563c-4555-9a2e-f42346100495": "kalius",
//"d3df51f8-0f71-470b-87e5-ff7e77a6c56e": "panos7564",
//"a92a48b1-4b9c-459e-878d-98d56d197d34": "pableoo",
//"0c02e201-b8ea-4150-98d7-c37d7f2a6959": "0xotf",
//"e17890ba-21f1-49fd-8de4-2b6562aa3fd8": "jus_izzy",
//};
//
//const getEvents = async (fromDate: string, toDate: string) => {
//const actionExecutedEvent = encodeURIComponent('["Action Executed"]');
//const project_id = process.env.MIXPANEL_PROD_PROJECT_ID;
//const service_account_username =
//process.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME;
//const service_account_secret = process.env.MIXPANEL_SERVICE_ACCOUNT_SECRET;
//
//const formattedFromDate = moment.utc(fromDate).format("YYYY-MM-DD");
//const formattedToDate = moment.utc(toDate).format("YYYY-MM-DD");
//
//const getEventData = async (event: string): Promise<Event[]> => {
//const options = {
//hostname: "data.mixpanel.com",
//path: `/api/2.0/export?from_date=${formattedFromDate}&to_date=${formattedToDate}&event=${event}&project_id=${project_id}`,
//method: "GET",
//headers: {
//Authorization: `Basic ${Buffer.from(
//`${service_account_username}:${service_account_secret}`,
//).toString("base64")}`,
//},
//};
//
//return new Promise((resolve, reject) => {
//const req = https.request(options, (res) => {
//let data = "";
//
//res.on("data", (chunk) => {
//data += chunk;
//});
//
//res.on("end", () => {
//if (res.statusCode !== 200) {
//console.error("API request failed with status:", res.statusCode);
//console.error("Error message:", data.trim());
//reject(new Error("API request failed"));
//return;
//}
//
//if (!data || data.trim() === "") {
//console.warn("Empty response received from Mixpanel API");
//resolve([]);
//return;
//}
//
//try {
//const eventsData = data.trim().split("\n");
//const events = eventsData.map((eventData) => JSON.parse(eventData));
//resolve(events);
//} catch (error) {
//console.error("Error parsing response:", error);
//console.error("Response data:", data);
//reject(error);
//}
//});
//});
//
//req.on("error", (error) => {
//console.error("Error making API request:", error);
//reject(error);
//});
//
//req.end();
//});
//};
//
//const actionExecutedEvents: Event[] = await getEventData(actionExecutedEvent);
//
//const events = [
//...actionExecutedEvents.filter(
//(event) => event.properties.Status === "Success",
//),
//];
//
//return events;
//};
//
//const findMaxActionsExecuted = (events: Event[], distinctId: string) => {
//const userEvents = events.filter(
//(event) => event.properties.distinct_id === distinctId,
//);
//
//userEvents.sort((a, b) => a.properties.time - b.properties.time);
//
//let maxActionsExecuted = 0;
//let maxTimeRanges: string[][] = [];
//
//for (let i = 0; i < userEvents.length; i++) {
//const startTime = userEvents[i].properties.time;
//const endTime = startTime + 30 * 24 * 60 * 60; // 30 days in seconds
//
//const actionsExecuted = userEvents.filter(
//(event) =>
//event.properties.time >= startTime && event.properties.time <= endTime,
//).length;
//
//if (actionsExecuted > maxActionsExecuted) {
//maxActionsExecuted = actionsExecuted;
//maxTimeRanges = [
//[
//new Date(startTime * 1000).toISOString(),
//new Date(endTime * 1000).toISOString(),
//],
//];
//} else if (actionsExecuted === maxActionsExecuted) {
//maxTimeRanges.push([
//new Date(startTime * 1000).toISOString(),
//new Date(endTime * 1000).toISOString(),
//]);
//}
//}
//
//return {
//maxActionsExecuted,
//maxTimeRanges,
//};
//};
//
//const countTransactionsBetweenDates = async (
//addresses: string[],
//startDate: Date,
//endDate: Date,
//) => {
//const startTimestamp = Math.floor(startDate.getTime() / 1000);
//const endTimestamp = Math.floor(endDate.getTime() / 1000);
//
//let count = 0;
//
//for (const address of addresses) {
//const lowercaseAddress = address.toLowerCase();
//const transactions = await sequelize.query<{ count: number }>(
//`
//SELECT COUNT(*) AS count
//FROM accounttransaction
//WHERE (LOWER("fromAddress") = :address OR LOWER("toAddress") = :address)
//AND "timeStamp" BETWEEN :startTimestamp AND :endTimestamp
//`,
//{
//replacements: {
//address: lowercaseAddress,
//startTimestamp,
//endTimestamp,
//},
//type: QueryTypes.SELECT,
//},
//);
//
//count += transactions[0].count;
//}
//
//return count;
//};
//
//const formatDateTimeEST = (dateString: string) => {
//return moment.tz(dateString, "America/New_York").format("MMM D, YYYY h:mm A");
//};
//
//const analyzeEvents = async () => {
//const fromDate = "2023-06-10";
//const today = new Date();
//const events = await getEvents(fromDate, today.toISOString());
//
//const userStatistics: Statistics[] = [];
//
//for (const distinctId in distinctIdToWallets) {
//const { maxActionsExecuted, maxTimeRanges } = findMaxActionsExecuted(
//events,
//distinctId,
//);
//
//const transactionCounts = await Promise.all(
//maxTimeRanges.map(async (range) => {
//const startDate = new Date(range[0]);
//const endDate = new Date(range[1]);
//return countTransactionsBetweenDates(
//distinctIdToWallets[distinctId],
//startDate,
//endDate,
//);
//}),
//);
//
//const loyaltyValues = maxTimeRanges.map((_, i) => {
//const transactionCount = transactionCounts[i];
//return maxActionsExecuted / (maxActionsExecuted + transactionCount);
//});
//
//const maxLoyalty = Math.max(...loyaltyValues);
//
//userStatistics.push({
//username: distinctIdToUsername[distinctId],
//maxActionsExecuted,
//maxTimeRanges,
//transactionCounts,
//maxLoyalty,
//});
//}
//
//// Sort userStatistics array based on maxLoyalty in descending order
//// biome-ignore lint/style/noNonNullAssertion: <explanation>
//userStatistics.sort((a, b) => b.maxLoyalty! - a.maxLoyalty!);
//
//// Print the user statistics
//userStatistics.forEach((user, index) => {
//console.log(`Username: ${user.username}`);
//console.log(`Max Actions Executed: ${user.maxActionsExecuted}`);
//console.log("Time Ranges:");
//
//user.maxTimeRanges.forEach((range, i) => {
//const startTime = formatDateTimeEST(range[0]);
//const endTime = formatDateTimeEST(range[1]);
//// biome-ignore lint/style/noNonNullAssertion: <explanation>
//const transactionCount = user.transactionCounts![i];
//const loyalty =
//// biome-ignore lint/style/noNonNullAssertion: <explanation>
//user.maxActionsExecuted! /
//// biome-ignore lint/style/noNonNullAssertion: <explanation>
//(user.maxActionsExecuted! + transactionCount);
//
//console.log(`  ${startTime} to ${endTime}`);
//console.log(`    Transactions: ${transactionCount}`);
//console.log(`    Loyalty: ${loyalty.toFixed(4)}`);
//});
//
//console.log("---");
//});
//};
//
//analyzeEvents();
