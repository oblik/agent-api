import type { PoolData } from "../../utils/protocols/gmx.js";
import type { ChainId } from "../../utils/types.js";

export default {
  42161: {
    "btc-usdc": {
      market: "0x47c031236e19d024b42f8AE6780E44A573170703",
      indexToken: "0x47904963fc8b2340414262125aF798B9655E58Cd",
      longToken: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "eth-usdc": {
      market: "0x70d95587d40a2caf56bd97485ab3eec10bee6336",
      indexToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      longToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "doge-usdc": {
      market: "0x6853EA96FF216fAb11D2d930CE3C508556A4bdc4",
      indexToken: "0xC4da4c24fd591125c3F47b340b6f4f76111883d8",
      longToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "ltc-usdc": {
      market: "0xD9535bB5f58A1a75032416F2dFe7880C30575a41",
      indexToken: "0xB46A094Bc4B0adBD801E14b9DB95e05E28962764",
      longToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "xrp-usdc": {
      market: "0x0CCB4fAa6f1F1B30911619f1184082aB4E25813c",
      indexToken: "0xc14e065b0067dE91534e032868f5Ac6ecf2c6868",
      longToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "atom-usdc": {
      market: "0x248C35760068cE009a13076D573ed3497A47bCD4",
      indexToken: "0x7D7F1765aCbaF847b9A1f7137FE8Ed4931FbfEbA",
      longToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "near-usdc": {
      market: "0x63Dc80EE90F26363B3FCD609007CC9e14c8991BE",
      indexToken: "0x1FF7F3EFBb9481Cbd7db4F932cBCD4467144237C",
      longToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "arb-usdc": {
      market: "0xC25cEf6061Cf5dE5eb761b50E4743c1F5D7E5407",
      indexToken: "0x912CE59144191C1204E64559FE8253a0e49E6548",
      longToken: "0x912CE59144191C1204E64559FE8253a0e49E6548",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "sol-usdc": {
      market: "0x09400D9DB990D5ed3f35D7be61DfAEB900Af03C9",
      indexToken: "0x2bcC6D6CdBbDC0a4071e48bb3B969b06B3330c07",
      longToken: "0x2bcC6D6CdBbDC0a4071e48bb3B969b06B3330c07",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "uni-usdc": {
      market: "0xc7Abb2C5f3BF3CEB389dF0Eecd6120D451170B50",
      indexToken: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0",
      longToken: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "link-usdc": {
      market: "0x7f1fa204bb700853D36994DA19F830b6Ad18455C",
      indexToken: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
      longToken: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "aave-usdc": {
      market: "0x1CbBa6346F110c8A5ea739ef2d1eb182990e4EB2",
      indexToken: "0xba5DdD1f9d7F570dc94a51479a000E3BCE967196",
      longToken: "0xba5DdD1f9d7F570dc94a51479a000E3BCE967196",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "avax-usdc": {
      market: "0x7BbBf946883a5701350007320F525c5379B8178A",
      indexToken: "0x565609fAF65B92F7be02468acF86f8979423e514",
      longToken: "0x565609fAF65B92F7be02468acF86f8979423e514",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "bnb-usdc": {
      market: "0x2d340912Aa47e33c90Efb078e69E70EFe2B34b9B",
      indexToken: "0xa9004A5421372E1D83fB1f85b0fc986c912f91f3",
      longToken: "0xa9004A5421372E1D83fB1f85b0fc986c912f91f3",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "gmx-usdc": {
      market: "0x55391D178Ce46e7AC8eaAEa50A72D1A5a8A622Da",
      indexToken: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a",
      longToken: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "op-usdc": {
      market: "0x4fDd333FF9cA409df583f306B6F5a7fFdE790739",
      indexToken: "0xaC800FD6159c2a2CB8fC31EF74621eB430287a5A",
      longToken: "0xaC800FD6159c2a2CB8fC31EF74621eB430287a5A",
      shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    "usdc-usdc.e": {
      market: "0x9C2433dFD71096C435Be9465220BB2B189375eA7",
      indexToken: "0x0000000000000000000000000000000000000000",
      longToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      shortToken: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    },
    "usdc-usdt": {
      market: "0xB686BcB112660343E6d15BDb65297e110C8311c4",
      indexToken: "0x0000000000000000000000000000000000000000",
      longToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      shortToken: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    },
    "usdc-dai": {
      market: "0xe2fEDb9e6139a182B98e7C2688ccFa3e9A53c665",
      indexToken: "0x0000000000000000000000000000000000000000",
      longToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      shortToken: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    },
  },
  // 43114: {
  // "avax-usdc": {
  // market: "0x913C1F46b48b3eD35E7dc3Cf754d4ae8499F31CF",
  // indexToken: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  // longToken: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  // shortToken: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  // },
  // "btc-usdc": {
  // market: "0xFb02132333A79C8B5Bd0b64E3AbccA5f7fAf2937",
  // indexToken: "0x152b9d0FdC40C096757F570A51E494bd4b943E50",
  // longToken: "0x152b9d0FdC40C096757F570A51E494bd4b943E50",
  // shortToken: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  // },
  // "eth-usdc": {
  // market: "0xB7e69749E3d2EDd90ea59A4932EFEa2D41E245d7",
  // indexToken: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
  // longToken: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
  // shortToken: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  // },
  // "sol-usdc": {
  // market: "0xd2eFd1eA687CD78c41ac262B3Bc9B53889ff1F70",
  // indexToken: "0xFE6B19286885a4F7F55AdAD09C3Cd1f906D2478F",
  // longToken: "0xFE6B19286885a4F7F55AdAD09C3Cd1f906D2478F",
  // shortToken: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  // },
  // "usdc-usdc.e": {
  // market: "0x297e71A931C5825867E8Fb937Ae5cda9891C2E99",
  // indexToken: "0x0000000000000000000000000000000000000000",
  // longToken: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  // shortToken: "0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664",
  // },
  // "usdt-usdt.e": {
  // market: "0xA7b768d6a1f746fd5a513D440DF2970ff099B0fc",
  // indexToken: "0x0000000000000000000000000000000000000000",
  // longToken: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
  // shortToken: "0xc7198437980c041c805A1EDcbA50c1Ce5db95118",
  // },
  // "usdc-usdt.e": {
  // market: "0xf3652Eba45DC761e7ADd4091627d5Cda21F61613",
  // indexToken: "0x0000000000000000000000000000000000000000",
  // longToken: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  // shortToken: "0xc7198437980c041c805A1EDcbA50c1Ce5db95118",
  // },
  // "usdc-dai.e": {
  // market: "0xDf8c9BD26e7C1A331902758Eb013548B2D22ab3b",
  // indexToken: "0x0000000000000000000000000000000000000000",
  // longToken: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  // shortToken: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70",
  // },
  // "doge-usdc": {
  // market: "0x8970B527E84aA17a33d38b65e9a5Ab5817FC0027",
  // indexToken: "0xC301E6fe31062C557aEE806cc6A841aE989A3ac6",
  // longToken: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  // shortToken: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  // },
  // "ltc-usdc": {
  // market: "0xA74586743249243D3b77335E15FE768bA8E1Ec5A",
  // indexToken: "0x8E9C35235C38C44b5a53B56A41eaf6dB9a430cD6",
  // longToken: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  // shortToken: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  // },
  // "xrp-usdc": {
  // market: "0xD1cf931fa12783c1dd5AbB77a0706c27CF352f25",
  // indexToken: "0x34B2885D617cE2ddeD4F60cCB49809fc17bb58Af",
  // longToken: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  // shortToken: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  // },
  // },
} as Record<number | string, Record<string, PoolData>>;
