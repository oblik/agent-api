import type { ChainId } from "../../utils/types.js";

const juice = {
  81457: {
    usdb: "0x4A1d9220e11a47d8Ab22Ccd82DA616740CF0920a",
    weth: "0x44f33bC796f7d3df55040cd3C631628B560715C2",
    amusdb: "0x105e285f1a2370D325046fed1424D4e73F6Fa2B0",
    amweth: "0x23eBa06981B5c2a6f1a985BdCE41BD64D18e6dFA",
    amezeth: "0xc81A630806d1aF3fd7509187E1AfC501Fd46e818",
    lusdb: "0x29c55Eb48e578Cc498F9ACE4CBEFBa1b37E3374d",
    lweth: "0xDd67f29F01Fd351A4b206CEb3fe0e7B9061d5Bc2",
    dusdb: "0x04beE2B151C4e829a28f838e43722112D537C9B2",
    dweth: "0xE2e453B31aa354e26a2510891949e95C85113B43",
  },
} as const satisfies Partial<Record<ChainId, unknown>>;

export default juice;
