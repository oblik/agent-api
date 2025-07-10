import type { ChainId } from "../../utils/types.js";

const across = {
  1: {
    spokePool: "0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5",
    spokePoolVerifier: "0xB4A8d45647445EA9FC3E1058096142390683dBC2",
  },
  137: {
    spokePool: "0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096",
    spokePoolVerifier: "0xB4A8d45647445EA9FC3E1058096142390683dBC2",
  },
  324: {
    spokePool: "0xE0B015E54d54fc84a6cB9B666099c46adE9335FF",
    spokePoolVerifier: "0xB4A8d45647445EA9FC3E1058096142390683dBC2",
  },
  10: {
    spokePool: "0x6f26Bf09B1C792e3228e5467807a900A503c0281",
    spokePoolVerifier: "0xB4A8d45647445EA9FC3E1058096142390683dBC2",
  },
  8453: {
    spokePool: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
    spokePoolVerifier: "0xB4A8d45647445EA9FC3E1058096142390683dBC2",
  },
  42161: {
    spokePool: "0xe35e9842fceaca96570b734083f4a58e8f7c5f2a",
    spokePoolVerifier: "0xB4A8d45647445EA9FC3E1058096142390683dBC2",
  },
} as const satisfies Partial<Record<ChainId, unknown>>;

export default across;
