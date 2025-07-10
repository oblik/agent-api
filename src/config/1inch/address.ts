import type { ChainId } from "../../utils/types.js";

const oneinch = {
  1: {
    routerV5: "0x1111111254EEB25477B68fb85Ed929f73A960582",
    routerV4: "0x1111111254fb6c44bAC0beD2854e76F90643097d",
  },
  10: {
    routerV5: "0x1111111254EEB25477B68fb85Ed929f73A960582",
    routerV4: "0x1111111254fb6c44bAC0beD2854e76F90643097d",
  },
  56: {
    routerV5: "0x1111111254EEB25477B68fb85Ed929f73A960582",
    routerV4: "0x1111111254fb6c44bAC0beD2854e76F90643097d",
  },
  // 100: {
  //   routerV5: "0x1111111254EEB25477B68fb85Ed929f73A960582",
  //   routerV4: "0x1111111254fb6c44bAC0beD2854e76F90643097d",
  // },
  137: {
    routerV5: "0x1111111254EEB25477B68fb85Ed929f73A960582",
    routerV4: "0x1111111254fb6c44bAC0beD2854e76F90643097d",
  },
  // 250: {
  //   routerV5: "0x1111111254EEB25477B68fb85Ed929f73A960582",
  //   routerV4: "0x1111111254fb6c44bAC0beD2854e76F90643097d",
  // },
  42161: {
    routerV5: "0x1111111254EEB25477B68fb85Ed929f73A960582",
    routerV4: "0x1111111254fb6c44bAC0beD2854e76F90643097d",
  },
  // 43114: {
  // routerV5: "0x1111111254EEB25477B68fb85Ed929f73A960582",
  // routerV4: "0x1111111254fb6c44bAC0beD2854e76F90643097d",
  // },
} as const satisfies Partial<Record<ChainId, unknown>>;

export default oneinch;
