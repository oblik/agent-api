import type { ChainId } from "../../utils/types.js";

const zerox = {
  1: {
    default: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
  },
  10: {
    default: "0xdef1abe32c034e558cdd535791643c58a13acc10",
  },
  56: {
    default: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
  },
  137: {
    default: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
  },
  // 250: {
  //   default: "0xdef189deaef76e379df891899eb5a00a94cbc250",
  // },
  42161: {
    default: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
  },
  // 42220: {
  //   default: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
  // },
  43114: {
    default: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
  },
} as const satisfies Partial<Record<ChainId, unknown>>;

export default zerox;
