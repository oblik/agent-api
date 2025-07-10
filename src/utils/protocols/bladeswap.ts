// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck: temporarily disabled
import {
  type Addressable,
  type BigNumberish,
  ethers,
  getBigInt,
  parseEther,
  solidityPacked,
} from "ethers";
import { INT128_MAX, NATIVE_TOKEN, NATIVE_TOKEN2 } from "../../constants.js";
import { getUnsupportedActionError } from "../error.js";
import {
  getApproveData,
  getChainNameFromId,
  getLPTokenInfo,
  getProtocolAddressForChain,
  getTokenInfoForChain,
} from "../index.js";

import { abis } from "../../config/abis.js";
import type { TokenInfo, Transaction } from "../types.js";

export const toToken = (
  spec: string,
  id: BigNumberish,
  addr: string | Addressable,
) =>
  solidityPacked(
    ["uint8", "uint88", "address"],
    [["erc20", "erc721", "erc1155"].indexOf(spec), id, addr],
  );

export const poolId = (i: number, poolAddress: string) =>
  solidityPacked(["uint8", "uint88", "address"], [i, 0, poolAddress]);

export const tokenInformation = (
  index: number,
  amountType: string,
  amount: bigint,
) =>
  solidityPacked(
    ["uint8", "uint8", "uint112", "int128"],
    [
      index,
      ["exactly", "at most", "all", "flashloan"].indexOf(amountType),
      0,
      amount,
    ],
  );

export const compileAndExecute = (
  value: bigint,
  ops: [string, [string, string, bigint][]][],
) => {
  const tokenRef = [
    ...new Set(ops.flatMap((x) => x[1].map((i) => i[0]))),
  ].sort();
  const address = getProtocolAddressForChain("bladeswap", 81457, "vault");
  if (!address) {
    throw new Error("Could not find vault for BladeSwap");
  }
  const contract = new ethers.Contract(address, abis["bladeswap-vault"]);
  const calldata = contract.interface.encodeFunctionData("execute", [
    tokenRef,
    new Array(tokenRef.length).fill(0),
    ops.map((op) => ({
      poolId: op[0],
      tokenInformations: op[1]
        .map((i) => tokenInformation(tokenRef.indexOf(i[0]), i[1], i[2]))
        .sort(),
      data: "0x00",
    })),
  ]);
  return { calldata, value: value.toString() };
};

export default async (
  accountAddress: string,
  action: string,
  actionData: RawAction,
): { transactions: Transaction[]; funcNames: string[]; signData: null } => {
  const { provider, poolName, amount, chainId, tokenInfo } = actionData;
  const WETH = getProtocolAddressForChain("bladeswap", chainId, "weth");

  const parsedBladeToken = await getProtocolAddressForChain(
    "bladeswap",
    chainId,
    "blade",
  );

  const parsedveBladeToken = await getProtocolAddressForChain(
    "bladeswap",
    chainId,
    "veblade",
  );

  const wrappedBladeToken = parsedBladeToken
    ? toToken("erc20", 0, parsedBladeToken)
    : undefined;
  const wrappedveBladeToken = parsedveBladeToken
    ? toToken("erc20", 0, parsedveBladeToken)
    : undefined;

  let approveTokenInfo: TokenInfo | undefined;
  let approveTokenAmount = 0n;
  let lpTokenInfo: { lp: TokenInfo | null } | undefined;
  let poolContract: Contract;
  let parseTokenA = "";
  let parseTokenB = "";
  let wrappedLP: string | undefined = "";
  let rateA = 0n;
  let rateB = 0n;
  let isTokenANative: boolean | undefined;
  let isTokenBNative: boolean | undefined;
  let depositAmountA = 0n;
  let depositAmountB = 0n;
  const wrappedInputToken = toToken(
    "erc20",
    0,
    tokenInfo.address === NATIVE_TOKEN
      ? NATIVE_TOKEN2.toLowerCase()
      : tokenInfo.address,
  );
  // withdraw, claim
  if (poolName) {
    lpTokenInfo = await getLPTokenInfo(
      { protocolName: "bladeswap", poolName: `${poolName}-vlp`, token: null },
      chainId,
      provider,
    );
    wrappedLP = lpTokenInfo.lp?.address
      ? toToken("erc20", 0, lpTokenInfo.lp?.address)
      : undefined;

    if (lpTokenInfo?.lp?.address) {
      poolContract = new ethers.Contract(
        lpTokenInfo.lp.address,
        abis["bladeswap-pool"],
        provider,
      );

      const tokenA = await poolContract.token0();
      const tokenB = await poolContract.token1();
      isTokenANative = tokenA === WETH;
      isTokenBNative = tokenB === WETH;

      parseTokenA = isTokenANative
        ? NATIVE_TOKEN.toLowerCase()
        : tokenA.toLowerCase();
      parseTokenB = isTokenBNative
        ? NATIVE_TOKEN.toLowerCase()
        : tokenB.toLowerCase();

      [rateA, rateB] = await poolContract.getReserves();
    }
  }

  let tx: { calldata: string; value: string } = { calldata: "", value: "0" };
  let value = 0;
  let tokenContract: Contract;
  switch (action) {
    case "deposit":
      depositAmountA =
        tokenInfo.address === parseTokenA ? amount : (amount / rateB) * rateA;
      depositAmountB =
        tokenInfo.address === parseTokenB ? amount : (amount / rateA) * rateB;

      value = tokenInfo.address === NATIVE_TOKEN ? amount : parseEther("0");
      // isTokenANative || isTokenBNative
      //   ? isTokenANative
      //     ? depositAmountA
      //     : depositAmountB
      //   : parseEther("0");
      tx = compileAndExecute(value, [
        [
          poolId(0, lpTokenInfo?.lp?.address),
          [
            [
              wrappedInputToken,
              tokenInfo.address !== NATIVE_TOKEN ? "exactly" : "all",
              tokenInfo.address !== NATIVE_TOKEN ? amount : INT128_MAX,
            ],
            // [
            //   wrappedTokenB,
            //   !isTokenBNative ? (rateA < rateB ? "exactly" : "at most") : "all",
            //   !isTokenBNative ? depositAmountB : INT128_MAX,
            // ],
            [wrappedLP, "at most", 0],
          ],
          poolId(1, lpTokenInfo?.lp?.address),
          [
            [wrappedLP, "all", INT128_MAX],
            [wrappedBladeToken, "at most", 0],
          ],
        ],
      ]);

      break;
    case "withdraw":
      approveTokenInfo = await getTokenInfoForChain(
        `${poolName.toLowerCase()}-vlp`,
        getChainNameFromId(chainId),
      );
      if (approveTokenInfo?.address) {
        tokenContract = new ethers.Contract(
          approveTokenInfo.address,
          abis.erc20,
          provider,
        );
        approveTokenAmount = await tokenContract.balanceOf(accountAddress);
        tx = compileAndExecute(0n, [
          [
            poolId(0, lpTokenInfo?.lp?.address),
            [
              [wrappedInputToken, "at most", amount],
              [wrappedLP, "exactly", approveTokenAmount],
            ],
            poolId(1, lpTokenInfo?.lp?.address),
            [
              [wrappedLP, "exactly", getBigInt(-1) * approveTokenAmount],
              [wrappedBladeToken, "at most", 0],
            ],
          ],
        ]);
      }
      break;
    case "claim":
      tx = compileAndExecute(0n, [
        [
          poolId(1, lpTokenInfo?.lp?.address),
          [
            // harvest
            [wrappedBladeToken, "at most", 0], // vc must be included to receive emissions. it will revert otherwise
          ],
        ],
      ]);
      break;
    case "lock":
      approveTokenInfo = tokenInfo;
      approveTokenAmount = amount;
      tx = compileAndExecute(0n, [
        [
          poolId(0, parsedveBladeToken),
          [
            [wrappedBladeToken, "exactly", amount],
            [wrappedveBladeToken, "at most", 0],
          ],
        ],
      ]);
      break;
    case "unlock":
      tx = compileAndExecute(0n, [
        [
          poolId(0, parsedveBladeToken),
          [
            [wrappedBladeToken, "exactly", amount],
            [wrappedveBladeToken, "at most", 0],
          ],
        ],
      ]);
      break;
    case "vote":
      approveTokenInfo = tokenInfo;
      approveTokenAmount = amount;
      tx = compileAndExecute(0n, [
        [
          poolId(4, lpTokenInfo?.lp?.address),
          [[wrappedveBladeToken, "exactly", amount]],
        ],
      ]);
      break;
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          ["claim", "deposit", "withdraw", "lock", "unlock", "vote"],
          "BladeSwap",
        ),
      );
    }
  }
  let approveTxs: Transaction[] = [];
  let approveTxs1: Transaction[] = [];
  if (action !== "deposit") {
    approveTxs = await getApproveData(
      provider,
      approveTokenInfo,
      approveTokenAmount,
      accountAddress,
      getProtocolAddressForChain("bladeswap", chainId, "vault"),
    );
  } else {
    if (parseTokenA !== NATIVE_TOKEN) {
      const tokenContract = new ethers.Contract(
        parseTokenA,
        abis.erc20,
        provider,
      );
      const [symbol, name, decimals] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.name(),
        tokenContract.decimals(),
      ]);
      approveTxs = await getApproveData(
        provider,
        {
          name,
          symbol,
          address: parseTokenA,
          decimals,
        },
        depositAmountA,
        accountAddress,
        getProtocolAddressForChain("bladeswap", chainId, "vault"),
      );
    }
    if (parseTokenB !== NATIVE_TOKEN) {
      const tokenContract = new ethers.Contract(
        parseTokenB,
        abis.erc20,
        provider,
      );
      const [symbol, name, decimals] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.name(),
        tokenContract.decimals(),
      ]);
      approveTxs1 = await getApproveData(
        provider,
        {
          name,
          symbol,
          address: parseTokenB,
          decimals,
        },
        depositAmountB,
        accountAddress,
        getProtocolAddressForChain("bladeswap", chainId, "vault"),
      );
    }
  }

  return {
    transactions: [
      ...approveTxs,
      ...approveTxs1,
      {
        data: tx.calldata,
        value: value.toString(),
        to: getProtocolAddressForChain("bladeswap", chainId, "vault"),
      },
    ],
    funcNames: [
      ...Array(approveTxs.length).fill("Approve"),
      ...Array(approveTxs1.length).fill("Approve"),
      action,
    ],
    signData: null,
  };
};
