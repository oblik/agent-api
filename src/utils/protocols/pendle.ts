import axios from "axios";
import * as chrono from "chrono-node";
import { ethers } from "ethers";
import ProtocolAddresses from "../../config/addresses.js";
import { NATIVE_TOKEN } from "../../constants.js";
import {
  getMissingPoolNameError,
  getUnsupportedActionError,
} from "../error.js";
import {
  getABIForProtocol,
  getApproveData,
  getChainNameFromId,
  getCoinData,
  getErrorMessage,
  getFunctionData,
  getProtocolAddressForChain,
  getTokenBalance,
  getTokenFromOnChain,
  isNaNValue,
  withRetry,
} from "../index.js";
import type { RetryProvider } from "../retryProvider.js";
import type {
  ChainId,
  ContractCallParam,
  JSONObject,
  ProtocolActionData,
  TokenInfo,
  Transaction,
} from "../types.js";
import { assert, isDefined } from "../types.js";
import { getABIErrorMessage, getProtocolErrorMessage } from "./index.js";

export const pendleKeyPrefixes = ["sy", "pt", "yt"];
export const pendleKeySuffixes = ["lp"];
export const pendleChainIds = [1, 42161, 10, 56];

export default async (
  accountAddress: string,
  action: string,
  actionData: ProtocolActionData,
): Promise<{
  transactions: Transaction[];
  funcNames?: string[];
}> => {
  const { provider, poolName, chainId, tokenInfo, amount } = actionData;

  let approveTxs: Transaction[] = [];
  let address: string | null = "";
  let abi: ethers.InterfaceAbi = [];
  let funcName: string;
  const approveInfo = {
    spender: "",
    tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];
  const token = (tokenInfo?.symbol || "").toLowerCase();

  switch (action) {
    case "deposit":
    case "withdraw": {
      return {
        transactions: await getDepositWithdrawTx(
          accountAddress,
          action,
          actionData,
        ),
      };
    }
    case "lock": {
      if (token !== "pendle") {
        throw new Error(`Token ${token} is not supported`);
      }

      address = getProtocolAddressForChain("pendle", chainId, "ve");
      if (!address) {
        throw new Error("Could not find address for Pendle lock");
      }
      abi = getABIForProtocol("pendle", "ve");

      params.push(amount || 0n);
      params.push(
        (Math.floor(Date.now() / 1000 / 86400 / 7) + 30) * 86400 * 7,
      ); /* uint128 newExpiry */

      funcName = "increaseLockPosition";

      approveInfo.spender = address;
      break;
    }
    case "unlock": {
      if (token !== "pendle") {
        throw new Error(`Token ${token} is not supported`);
      }

      address = getProtocolAddressForChain("pendle", chainId, "ve");
      if (!address) {
        throw new Error("Could not find address for Pendle unlock");
      }
      abi = getABIForProtocol("pendle", "ve");

      funcName = "withdraw";
      break;
    }
    // case "vote": {
    //   address = getProtocolAddressForChain("pendle", chainId, "voting");
    //   abi = getABIForProtocol("pendle", "voting");
    //   params.push([] /* address[] pools */);
    //   params.push([] /* uint64[] weights */);
    //   break;
    // }
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          ["deposit", "withdraw", "lock", "unlock"],
          "Pendle",
        ),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(
        action,
        tokenInfo?.symbol,
        "pendle",
        chainId,
        poolName,
      ),
    );
  }

  if (!abi || abi.length === 0) {
    throw new Error(getABIErrorMessage(address, chainId));
  }

  if (approveInfo.spender) {
    approveTxs = await getApproveData(
      provider,
      approveInfo.tokenInfo,
      approveInfo.amount,
      accountAddress,
      approveInfo.spender,
    );
  }

  const data = await getFunctionData(address, abi, funcName, params, "0");

  return {
    transactions: [...approveTxs, data],
    funcNames: [...Array(approveTxs.length).fill("Approve"), action],
  };
};

export const extractPendleToken = (key: string | undefined) => {
  if (!key) return "";

  const keyParts = key.toLowerCase().split("-");
  let tokenParts = keyParts;

  // Remove prefixes
  while (pendleKeyPrefixes.includes(tokenParts[0]) && tokenParts.length > 1) {
    tokenParts = tokenParts.slice(1);
  }

  // Remove suffixes
  while (
    pendleKeySuffixes.includes(tokenParts[tokenParts.length - 1]) &&
    tokenParts.length > 1
  ) {
    tokenParts = tokenParts.slice(0, -1);
  }

  // Remove last part if it corresponds to a day-month-year structure
  const lastPart = tokenParts[tokenParts.length - 1].toLowerCase();
  const pattern =
    /^(?:(\d{2}))?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\d{4})$/;
  if (pattern.test(lastPart)) {
    tokenParts = tokenParts.slice(0, -1);
  }

  return tokenParts.join("-");
};

export const getPendleConfigFromPool = async (
  provider: RetryProvider,
  chainId: ChainId,
  poolName: string | undefined,
): Promise<JSONObject | null> => {
  if (!(chainId in ProtocolAddresses.pendle)) return null;

  const token = extractPendleToken(poolName);
  const lpKeys = Object.keys(ProtocolAddresses.pendle[chainId]).filter((x) =>
    x.endsWith("-lp"),
  );
  let selectedMaturity: string | undefined;
  let maturities: string[] = [];
  for (const key of lpKeys) {
    if (token === extractPendleToken(key)) {
      const keyStr = key.split("-");
      const maturity = keyStr[keyStr.length - 2];
      if (poolName?.toLowerCase().includes(maturity))
        selectedMaturity = maturity;
      if (maturity && maturities.indexOf(maturity) < 0)
        maturities.push(maturity);
    }
  }
  if (!selectedMaturity && maturities.length === 0) return null;

  let newConfig: JSONObject | undefined;
  if (!selectedMaturity || checkExpired(selectedMaturity)) {
    const temp = maturities.filter((x) => !checkExpired(x));
    if (temp.length > 0) maturities = temp;

    const tvlPromises = maturities.map((maturity) =>
      getTVLFromMaturity(provider, chainId, token, maturity),
    );

    const tvls = await Promise.all(tvlPromises);

    const sortedTvls = tvls
      .map((tvl, index) => ({ tvl, index }))
      .sort((a, b) => b.tvl - a.tvl);

    if (sortedTvls[0].tvl === 0) {
      throw new Error(`Pendle market for pool ${poolName} does not exist`);
    }

    const maturity = maturities[sortedTvls[0].index];
    if (!selectedMaturity) selectedMaturity = maturity;
    else if (!checkExpired(maturity)) {
      newConfig = {
        lp: getProtocolAddressForChain(
          "pendle",
          chainId,
          `${token}-${maturity}-lp`,
        ),
        sy: getProtocolAddressForChain("pendle", chainId, `sy-${token}`),
        pt: getProtocolAddressForChain(
          "pendle",
          chainId,
          `pt-${token}-${maturity}`,
        ),
        yt: getProtocolAddressForChain(
          "pendle",
          chainId,
          `yt-${token}-${maturity}`,
        ),
        token: getProtocolAddressForChain("pendle", chainId, token),
      };
    }
  }
  return {
    newConfig,
    isExpired: checkExpired(selectedMaturity),
    lp: getProtocolAddressForChain(
      "pendle",
      chainId,
      `${token}-${selectedMaturity}-lp`,
    ),
    sy: getProtocolAddressForChain("pendle", chainId, `sy-${token}`),
    pt: getProtocolAddressForChain(
      "pendle",
      chainId,
      `pt-${token}-${selectedMaturity}`,
    ),
    yt: getProtocolAddressForChain(
      "pendle",
      chainId,
      `yt-${token}-${selectedMaturity}`,
    ),
    token: getProtocolAddressForChain("pendle", chainId, token),
  };
};

const checkExpired = (maturity: string) => {
  const str = `${maturity.slice(0, 2)}-${maturity.slice(2, 5)}-${maturity.slice(
    5,
  )}`;
  const date = chrono.parseDate(str);
  if (date && date.getTime() + 86400000 > Date.now()) return false;
  return true;
};

const getDepositWithdrawTx = async (
  accountAddress: string,
  action: string,
  actionData: ProtocolActionData,
) => {
  const { provider, chainId, chainName, slippage, tokenInfo2, amount2 } =
    actionData;
  let { poolName, tokenInfo, amount } = actionData;
  if (!poolName) {
    if (action === "withdraw") {
      throw new Error(
        getMissingPoolNameError(
          chainName || "Ethereum",
          "Pendle",
          tokenInfo?.symbol,
          "withdraw",
        ),
      );
    }
    poolName = tokenInfo?.symbol;
  }

  const validateUnderlyingToken = () => {
    const pool = poolName?.toLowerCase();
    let symbol = tokenInfo?.symbol.toLowerCase();
    if (symbol === "pendle-lpt") {
      symbol =
        Object.entries(
          ProtocolAddresses.pendle[chainId] as Record<string, string>,
        ).find(
          ([key, addr]) =>
            key.endsWith("-lp") &&
            addr.toLowerCase() === tokenInfo?.address?.toLowerCase(),
        )?.[0] || "";
    }
    const poolToken = extractPendleToken(pool);
    const token = extractPendleToken(symbol);
    if (poolToken !== token) {
      const poolStat =
        pendleKeyPrefixes.reduce(
          (a, b) => pool?.startsWith(b) || pool?.endsWith(b) || a,
          false,
        ) || pendleKeySuffixes.reduce((a, b) => pool?.endsWith(b) || a, false);
      const tokenStat =
        pendleKeyPrefixes.reduce(
          (a, b) => symbol?.startsWith(b) || symbol?.endsWith(b) || a,
          false,
        ) ||
        pendleKeySuffixes.reduce((a, b) => symbol?.endsWith(b) || a, false);
      if (poolStat && tokenStat) {
        throw new Error(`${pool} and ${symbol} differ on underlying token`);
      }
      if (action.toLowerCase() === "withdraw") {
        throw new Error(`${pool} and ${symbol} differ on underlying token`);
      }
    }
  };
  validateUnderlyingToken();

  const config = await getPendleConfigFromPool(provider, chainId, poolName);
  const pendleTokens = (await Promise.allSettled([
    getTokenFromOnChain(config?.lp, getChainNameFromId(chainId)),
    getTokenFromOnChain(config?.sy, getChainNameFromId(chainId)),
    getTokenFromOnChain(config?.pt, getChainNameFromId(chainId)),
    getTokenFromOnChain(config?.yt, getChainNameFromId(chainId)),
  ])) as { value: TokenInfo }[];

  const routerAddress = getProtocolAddressForChain("pendle", chainId, "router");
  const routerAbi = getABIForProtocol("pendle", "router");

  if (!routerAddress) {
    throw new Error(
      getProtocolErrorMessage(
        action,
        tokenInfo?.symbol,
        "pendle",
        chainId,
        poolName,
      ),
    );
  }

  if (!routerAbi || routerAbi.length === 0) {
    throw new Error(getABIErrorMessage(routerAddress, chainId));
  }

  const BASE_URI = "https://api-v2.pendle.finance/core/v1/sdk";
  const defaultParams = `receiver=${accountAddress}&slippage=${
    (slippage || 0.2) / 100
  }`;

  const getTransactionsFromSDK = async (
    methodName: string,
    extraParams: string,
  ): Promise<{ txs: Transaction[]; amountOut: bigint }> => {
    if (methodName.includes("/undefined/"))
      throw new Error(`Pendle market for pool ${poolName} does not exist`);
    console.log(methodName, defaultParams, extraParams);
    let approveTxs: Transaction[] = [];
    try {
      const res = await withRetry(accountAddress, () =>
        axios.get(`${BASE_URI}/${methodName}?${defaultParams}&${extraParams}`),
      );
      if (action === "deposit") {
        approveTxs = await getApproveData(
          provider,
          tokenInfo,
          amount,
          accountAddress,
          res.data.tx.to,
        );
        if (tokenInfo2) {
          const moreApproveTxs = await getApproveData(
            provider,
            tokenInfo2,
            amount2,
            accountAddress,
            res.data.tx.to,
          );
          approveTxs.push(...moreApproveTxs);
        }
      } else if (methodName.includes("liquidity")) {
        approveTxs = await getApproveData(
          provider,
          pendleTokens[0].value,
          amount,
          accountAddress,
          res.data.tx.to,
        );
      } else if (methodName.includes("redeem")) {
        const temp1 = await getApproveData(
          provider,
          pendleTokens[2].value,
          amount,
          accountAddress,
          res.data.tx.to,
        );
        const temp2 = await getApproveData(
          provider,
          pendleTokens[3].value,
          amount,
          accountAddress,
          res.data.tx.to,
        );
        approveTxs = [...temp1, ...temp2];
      } else if (methodName.includes("roll-over")) {
        approveTxs = await getApproveData(
          provider,
          pendleTokens[2].value,
          amount,
          accountAddress,
          res.data.tx.to,
        );
      } else {
        const tokenIn = extraParams
          .split("&")
          .filter((x) => x.startsWith("tokenIn"))[0]
          .split("=")[1];
        approveTxs = await getApproveData(
          provider,
          { address: tokenIn },
          amount,
          accountAddress,
          res.data.tx.to,
        );
      }
      const tx = {
        to: res.data.tx.to,
        value:
          tokenInfo?.address === NATIVE_TOKEN && amount
            ? amount.toString()
            : "0",
        data: res.data.tx.data,
      };
      const amountOut = Object.entries(res.data.data).find(([key]) =>
        key?.includes("Out"),
      )?.[1] as string;
      return {
        txs: [...approveTxs, tx],
        amountOut: (ethers.getBigInt(amountOut) * 99999n) / 100000n,
      };
    } catch (err) {
      let message = getErrorMessage(err);
      if (Array.isArray(message)) message = message[0];
      if (message.includes("Reference ID"))
        message = message.slice(0, message.indexOf("Reference ID") - 2);
      if (message[message.length - 1] === "]")
        message = JSON.parse(message)[0].message;
      if (message === "Unsupported method")
        message += ` for ${poolName} pool ${action}`;

      if (
        message.includes("MarketRateScalarBelowZero") ||
        message.toLowerCase().includes("expired")
      ) {
        console.log("handling expired");
        if (methodName.includes("swap")) {
          const tokenOut = extraParams
            .split("&")
            .filter((x) => x.startsWith("tokenOut"))[0]
            .split("=")[1];
          if (tokenOut === tokenInfo?.address) {
            console.log(
              tokenOut,
              BASE_URI,
              chainId,
              defaultParams,
              extraParams,
            );
            try {
              const extraParams = `yt=${config?.yt}&amountIn=${amount}&tokenOut=${tokenInfo?.address}`;
              const res = await withRetry(accountAddress, () =>
                axios.get(
                  `${BASE_URI}/${chainId}/redeem?${defaultParams}&${extraParams}`,
                ),
              );
              approveTxs = await getApproveData(
                provider,
                pendleTokens[2].value,
                amount,
                accountAddress,
                res.data.tx.to,
              );
              const tx = {
                to: res.data.tx.to,
                value:
                  tokenInfo?.address === NATIVE_TOKEN && amount
                    ? amount.toString()
                    : "0",
                data: res.data.tx.data,
              };
              const amountOut = Object.entries(res.data.data).find(([key]) =>
                key?.includes("Out"),
              )?.[1] as string;
              console.log(amountOut);
              return {
                txs: [...approveTxs, tx],
                amountOut: (ethers.getBigInt(amountOut) * 99999n) / 100000n,
              };
            } catch (error) {
              let message = getErrorMessage(error);
              if (Array.isArray(message)) message = message[0];
              throw new Error(
                `Error redeeming ${tokenOut} from pendle: ${message}`,
              );
            }
          }
        }
        throw new Error(`Pendle pool ${poolName} is expired`);
      }
      throw new Error(`Error building transaction from pendle SDK: ${message}`);
    }
  };

  const isSymbolSy = tokenInfo?.symbol.toLowerCase().startsWith("sy");
  const isSymbolPt = tokenInfo?.symbol.toLowerCase().startsWith("pt");
  const isSymbolYt = tokenInfo?.symbol.toLowerCase().startsWith("yt");
  const isSymbolLp = tokenInfo?.symbol.toLowerCase() === "pendle-lpt";
  const isPoolNameSy = poolName?.toLowerCase().startsWith("sy");
  const isPoolNameYt = poolName?.toLowerCase().startsWith("yt");
  const isPoolNamePt = poolName?.toLowerCase().startsWith("pt");

  if (tokenInfo2) {
    const transactions: Transaction[] = [];

    if (isSymbolPt) {
      const { txs } = await getTransactionsFromSDK(
        `${chainId}/markets/${config?.lp}/add-liquidity-dual`,
        `tokenIn=${tokenInfo2.address}&amountTokenIn=${amount2}&amountPtIn=${amount}`,
      );
      transactions.push(...txs);
    } else {
      const { txs } = await getTransactionsFromSDK(
        `${chainId}/markets/${config?.lp}/add-liquidity-dual`,
        `tokenIn=${tokenInfo?.address}&amountTokenIn=${amount}&amountPtIn=${amount2}`,
      );
      transactions.push(...txs);
    }
    return transactions;
  }

  const transactions: Transaction[] = [];

  if (action === "deposit") {
    if (isSymbolSy) {
      if (isPoolNamePt || isPoolNameYt) {
        const { txs } = await getTransactionsFromSDK(
          `${chainId}/markets/${config?.lp}/swap`,
          `tokenIn=${tokenInfo?.address}&amountIn=${amount}&tokenOut=${
            isPoolNamePt ? config?.pt : config?.yt
          }`,
        );
        transactions.push(...txs);
      } else {
        const { txs } = await getTransactionsFromSDK(
          `${chainId}/markets/${config?.lp}/add-liquidity`,
          `tokenIn=${tokenInfo?.address}&amountIn=${amount}`,
        );
        transactions.push(...txs);
      }
    } else if (isSymbolPt) {
      if (isPoolNameSy || isPoolNameYt) {
        const { txs, amountOut } = await getTransactionsFromSDK(
          `${chainId}/markets/${config?.lp}/swap`,
          `tokenIn=${tokenInfo?.address}&amountIn=${amount}&tokenOut=${config?.sy}`,
        );
        transactions.push(...txs);

        if (isPoolNameYt) {
          tokenInfo = pendleTokens[1].value;
          amount = amountOut;

          const { txs: moreTxs } = await getTransactionsFromSDK(
            `${chainId}/markets/${config?.lp}/swap`,
            `tokenIn=${tokenInfo?.address}&amountIn=${amount}&tokenOut=${config?.yt}`,
          );
          transactions.push(...moreTxs);
        }
      } else {
        const { txs } = await getTransactionsFromSDK(
          `${chainId}/markets/${config?.lp}/add-liquidity`,
          `tokenIn=${tokenInfo?.address}&amountIn=${amount}`,
        );
        transactions.push(...txs);
      }
    } else if (isSymbolYt) {
      const { txs, amountOut } = await getTransactionsFromSDK(
        `${chainId}/markets/${config?.lp}/swap`,
        `tokenIn=${tokenInfo?.address}&amountIn=${amount}&tokenOut=${config?.sy}`,
      );
      transactions.push(...txs);
      tokenInfo = pendleTokens[1].value;
      amount = amountOut;

      if (isPoolNamePt) {
        const { txs: moreTxs } = await getTransactionsFromSDK(
          `${chainId}/markets/${config?.lp}/swap`,
          `tokenIn=${tokenInfo?.address}&amountIn=${amount}&tokenOut=${config?.pt}`,
        );
        transactions.push(...moreTxs);
      } else if (!isPoolNameSy) {
        const { txs: moreTxs } = await getTransactionsFromSDK(
          `${chainId}/markets/${config?.lp}/add-liquidity`,
          `tokenIn=${tokenInfo?.address}&amountIn=${amount}`,
        );
        transactions.push(...moreTxs);
      }
    } else if (!isSymbolLp) {
      if (isPoolNameSy || isPoolNamePt || isPoolNameYt) {
        const { txs, amountOut } = await getTransactionsFromSDK(
          `${chainId}/markets/${config?.lp}/swap`,
          `tokenIn=${tokenInfo?.address}&amountIn=${amount}&tokenOut=${isPoolNameYt ? config?.yt : config?.pt}&enableAggregator=true`,
        );
        transactions.push(...txs);

        if (isPoolNameSy) {
          tokenInfo = pendleTokens[2].value;
          amount = amountOut;

          const { txs: moreTxs } = await getTransactionsFromSDK(
            `${chainId}/markets/${config?.lp}/swap`,
            `tokenIn=${tokenInfo?.address}&amountIn=${amount}&tokenOut=${config?.sy}`,
          );
          transactions.push(...moreTxs);
        }
      } else {
        const { txs } = await getTransactionsFromSDK(
          `${chainId}/markets/${config?.lp}/add-liquidity`,
          `tokenIn=${tokenInfo?.address}&amountIn=${amount}&zpi=false&enableAggregator=true`,
        );
        transactions.push(...txs);
      }
    } else {
      throw new Error("Cannot deposit LP token to Pendle");
    }
  } else if ((isPoolNameYt || isSymbolYt) && config?.isExpired) {
    throw new Error(
      `Cannot execute YT related withdrawal since Pendle pool ${poolName} is expired`,
    );
  } else if (isSymbolLp) {
    const { txs, amountOut } = await getTransactionsFromSDK(
      `${chainId}/markets/${config?.lp}/remove-liquidity`,
      `amountIn=${amount}&tokenOut=${
        isPoolNamePt
          ? config?.pt
          : isPoolNameYt || isPoolNameSy
            ? config?.sy
            : config?.token || tokenInfo?.address
      }`,
    );
    transactions.push(...txs);

    if (isPoolNameYt) {
      tokenInfo = pendleTokens[1].value;
      amount = amountOut;

      const { txs: moreTxs } = await getTransactionsFromSDK(
        `${chainId}/markets/${config?.lp}/swap`,
        `tokenIn=${config?.sy}&amountIn=${amount}&tokenOut=${config?.yt}`,
      );
      transactions.push(...moreTxs);
    }
  } else if (isSymbolSy) {
    if (isPoolNamePt || isPoolNameYt) {
      const { txs } = await getTransactionsFromSDK(
        `${chainId}/markets/${config?.lp}/swap`,
        `tokenIn=${
          isPoolNamePt ? config?.pt : config?.yt
        }&amountIn=${amount}&tokenOut=${tokenInfo?.address}`,
      );
      transactions.push(...txs);
    } else {
      const { txs } = await getTransactionsFromSDK(
        `${chainId}/markets/${config?.lp}/remove-liquidity`,
        `amountIn=${amount}&tokenOut=${tokenInfo?.address}`,
      );
      transactions.push(...txs);
    }
  } else if (isSymbolPt) {
    if (isPoolNameSy || isPoolNameYt) {
      if (isPoolNameYt) {
        const { txs, amountOut } = await getTransactionsFromSDK(
          `${chainId}/markets/${config?.lp}/swap`,
          `tokenIn=${config?.yt}&amountIn=${amount}&tokenOut=${config?.sy}`,
        );
        transactions.push(...txs);
        amount = amountOut;
      }

      const { txs: moreTxs } = await getTransactionsFromSDK(
        `${chainId}/markets/${config?.lp}/swap`,
        `tokenIn=${config?.sy}&amountIn=${amount}&tokenOut=${tokenInfo?.address}`,
      );
      transactions.push(...moreTxs);
    } else if (isPoolNamePt && config?.newConfig?.lp) {
      const { txs } = await getTransactionsFromSDK(
        `${chainId}/markets/${config?.lp}/roll-over-pt`,
        `ptAmount=${amount}&dstMarket=${config.newConfig.lp}`, // should this be newConfig?.lp
      );
      transactions.push(...txs);
    } else {
      const { txs } = await getTransactionsFromSDK(
        `${chainId}/markets/${config?.lp}/remove-liquidity`,
        `amountIn=${amount}&tokenOut=${tokenInfo?.address}`,
      );
      transactions.push(...txs);
    }
  } else if (isSymbolYt) {
    if (isPoolNamePt) {
      const { txs, amountOut } = await getTransactionsFromSDK(
        `${chainId}/markets/${config?.lp}/swap`,
        `tokenIn=${config?.pt}&amountIn=${amount}&tokenOut=${config?.sy}`,
      );
      transactions.push(...txs);
      amount = amountOut;
    } else if (!isPoolNameSy) {
      const { txs, amountOut } = await getTransactionsFromSDK(
        `${chainId}/markets/${config?.lp}/remove-liquidity`,
        `amountIn=${amount}&tokenOut=${config?.sy}`,
      );
      transactions.push(...txs);
      amount = amountOut;
    }

    const { txs: moreTxs } = await getTransactionsFromSDK(
      `${chainId}/markets/${config?.lp}/swap`,
      `tokenIn=${config?.sy}&amountIn=${amount}&tokenOut=${tokenInfo?.address}`,
    );
    transactions.push(...moreTxs);
  } else {
    if (isPoolNameSy || isPoolNamePt || isPoolNameYt) {
      if (isPoolNameSy) {
        const { txs, amountOut } = await getTransactionsFromSDK(
          `${chainId}/markets/${config?.lp}/swap`,
          `tokenIn=${config?.sy}&amountIn=${amount}&tokenOut=${config?.pt}`,
        );
        transactions.push(...txs);
        amount = amountOut;
      }

      // const { txs: moreTxs } = await getTransactionsFromSDK(
      // `${chainId}/redeem`,
      // `yt=${config?.yt}&amountIn=${amount}&tokenOut=${tokenInfo?.address}`,
      // );
      // transactions.push(...moreTxs);
      if (isPoolNamePt || isPoolNameSy) {
        const { txs: moreTxs } = await getTransactionsFromSDK(
          `${chainId}/markets/${config?.lp}/swap`,
          `tokenIn=${config?.pt}&amountIn=${amount}&tokenOut=${tokenInfo?.address}`,
        );
        transactions.push(...moreTxs);
      } else if (isPoolNameYt) {
        const { txs: moreTxs } = await getTransactionsFromSDK(
          `${chainId}/markets/${config?.lp}/swap`,
          `tokenIn=${config?.yt}&amountIn=${amount}&tokenOut=${tokenInfo?.address}`,
        );
        transactions.push(...moreTxs);
      }
    } else {
      const { txs } = await getTransactionsFromSDK(
        `${chainId}/markets/${config?.lp}/remove-liquidity`,
        `amountIn=${amount}&tokenOut=${config?.token || tokenInfo?.address}`,
      );
      transactions.push(...txs);
    }
  }
  return transactions;
};

export const isMultiSideDeposit = (_token1: string, _token2: string) => {
  const token1 = _token1.toLowerCase();
  const token2 = _token2.toLowerCase();
  const token1_ = extractPendleToken(token1);
  const token2_ = extractPendleToken(token2);
  if (token1_ !== token2_) return "";

  if (
    (token1.startsWith("pt") && token2 === token2_) ||
    (token1 === token1_ && token2.startsWith("pt"))
  ) {
    return token1_;
  }
  if (
    (token1.startsWith("pt") && token2.startsWith("sy")) ||
    (token1.startsWith("sy") && token2.startsWith("pt"))
  ) {
    return token1_;
  }
  return "";
};

const getTVLFromMaturity = async (
  provider: RetryProvider,
  chainId: ChainId,
  token: string,
  maturity: string,
) => {
  const lpAddr = getProtocolAddressForChain(
    "pendle",
    chainId,
    `${token}-${maturity}-lp`,
  );
  const syAddr = getProtocolAddressForChain("pendle", chainId, `sy-${token}`);
  const ptAddr = getProtocolAddressForChain(
    "pendle",
    chainId,
    `pt-${token}-${maturity}`,
  );
  const syBalance = await getTokenBalance(
    lpAddr ?? "",
    getChainNameFromId(chainId) || "ethereum",
    syAddr,
    provider._getConnection().url,
  );
  const ptBalance = await getTokenBalance(
    lpAddr ?? "",
    getChainNameFromId(chainId) || "ethereum",
    ptAddr,
    provider._getConnection().url,
  );
  const price = (await getCoinData(lpAddr ?? undefined, token, chainId, false))
    .price;
  if (isNaNValue(price)) return 0;
  assert(isDefined(price));
  return (syBalance + ptBalance) * price;
};

const __pendleCache: { [key: string]: { data: JSONObject; ts: number } } = {};
export const getPendlePoolInfo = async (): Promise<JSONObject> => {
  const key = "pendlePoolInfo";
  const now = Date.now();
  const cachedValue = __pendleCache[key];

  // Cache duration: 24 hours
  if (cachedValue && now - cachedValue.ts < 86400000) {
    return cachedValue.data;
  }

  try {
    const allMarkets = await fetchPendleApyData();
    const processedData = processPendleApyData(allMarkets);
    __pendleCache[key] = { data: processedData, ts: now };
    return processedData;
  } catch (error) {
    console.error("Error fetching Pendle pool info:", error);
    throw error;
  }
};

export const fetchPendleApyData = async (): Promise<JSONObject[]> => {
  const allMarkets: JSONObject[] = [];

  for (const chainId of pendleChainIds) {
    let skip = 0;
    let limit = 100;
    let hasMore = true;

    while (hasMore) {
      /* eslint-disable no-await-in-loop */
      try {
        const response = await axios.get(
          `https://api-v2.pendle.finance/core/v1/${chainId}/markets`,
          {
            params: {
              order_by: "name:1",
              skip,
              limit,
            },
          },
        );

        const data = response.data;
        skip += limit;
        limit = Math.min(data.total - skip, 100);
        allMarkets.push(...data.results);
        if (data.total - skip <= 0) {
          hasMore = false;
        }
      } catch (error) {
        console.error(`Failed to fetch markets for chain ${chainId}:`, error);
        // Continue to next chainId
      }
    }
  }

  return allMarkets;
};

export const processPendleApyData = (
  allMarkets: JSONObject[],
): { [poolAddress: string]: JSONObject } => {
  // a clean array of market data with only the required properties
  const cleanData = allMarkets.map((market) => {
    const { chainId, expiry, impliedApy, ytFloatingApy, aggregatedApy } =
      market;

    // Extract only the required properties from pt, yt, and lp
    const pt = {
      symbol: market.pt ? market.pt.symbol : null,
      address: market.pt ? market.pt.address.toLowerCase() : null,
    };

    const yt = {
      address: market.yt ? market.yt.address.toLowerCase() : null,
    };

    const lp = {
      address: market.lp ? market.lp.address.toLowerCase() : null,
    };

    return {
      chainId,
      expiry,
      pt,
      yt,
      lp,
      impliedApy,
      ytFloatingApy,
      aggregatedApy,
    };
  });

  // a mapping from pool addresses to their APY data
  const apyDataMap: { [poolAddress: string]: JSONObject } = {};

  for (const market of cleanData) {
    const {
      chainId,
      expiry,
      pt,
      yt,
      lp,
      impliedApy,
      ytFloatingApy,
      aggregatedApy,
    } = market;

    // Use the LP address as the key, assuming it's the pool address
    const poolAddress = lp?.address ? lp.address : null;

    if (poolAddress) {
      apyDataMap[poolAddress] = {
        chainId,
        expiry,
        ptSymbol: pt.symbol,
        ptAddress: pt.address,
        ytAddress: yt.address,
        lpAddress: poolAddress,
        impliedApy,
        ytFloatingApy,
        aggregatedApy,
      };
    }
  }

  return apyDataMap;
};

export const getProtocolEntitiesSort = (filteredPoolNames: string[]) => {
  // Filter out names starting with "sy-" and those not ending with a number
  const newFilteredPoolNames = filteredPoolNames.filter(
    (name) => !name.startsWith("sy-") && /\d$/.test(name),
  );

  // Custom sorting function
  const customSort = (a: string, b: string) => {
    // Split the name into parts
    const [prefixA, middleA, dateA] = a.split("-");
    const [prefixB, middleB, dateB] = b.split("-");

    // First, sort by prefix (PT before YT)
    if (prefixA !== prefixB) {
      return prefixA.localeCompare(prefixB);
    }

    // Then, sort by the middle part
    if (middleA !== middleB) {
      return middleA.localeCompare(middleB);
    }

    // Finally, sort by date (earliest first)
    const parseDate = (dateStr: string) => {
      const months: { [key: string]: number } = {
        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dec: 11,
      };
      const [day, month, year] = [
        dateStr.slice(0, 2),
        dateStr.slice(2, 5).toLowerCase(),
        dateStr.slice(5),
      ];
      return new Date(
        Number.parseInt(year),
        months[month],
        Number.parseInt(day),
      );
    };

    const dateObjA = parseDate(dateA);
    const dateObjB = parseDate(dateB);

    return dateObjA.getTime() - dateObjB.getTime();
  };

  newFilteredPoolNames.sort(customSort);
  return newFilteredPoolNames;
};
