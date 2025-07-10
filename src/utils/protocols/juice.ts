// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck: temporarily disabled
import { ethers } from "ethers";
import LPAddresses from "../../config/lptokens.js";
import { getUnsupportedActionError } from "../error.js";
import {
  getABIForProtocol,
  getApproveData,
  getChainNameFromId,
  getFunctionData,
  getProtocolAddressForChain,
  getTokenInfoForChain,
} from "../index.js";
import { sfConsoleError } from "../log.js";
import type { RetryProvider } from "../retryProvider.js";
import type {
  ChainId,
  ContractCallParam,
  ProtocolActionData,
  TokenInfo,
  Transaction,
} from "../types.js";
import { getABIErrorMessage, getProtocolErrorMessage } from "./index.js";

export default async (
  accountAddress: string,
  action: string,
  actionData: ProtocolActionData,
): Promise<{
  transactions: Transaction[];
  funcNames: string[];
}> => {
  const { provider, poolName, amount, chainId, tokenInfo } = actionData;
  let { token } = actionData;
  if (!poolName && !token) {
    throw new Error("Missing pool and token for this juice action.");
  }

  let approveTxs: Transaction[] = [];
  let address: string | null = "";
  let abi: ethers.InterfaceAbi = [];
  let funcName = action;
  const value = 0;
  const approveInfo: {
    spender: string;
    tokenInfo?: TokenInfo;
    amount?: bigint;
  } = {
    spender: "",
    tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];
  token = (tokenInfo?.symbol || "").toLowerCase();

  const pool = (poolName || token).toLowerCase();

  let accountTxs: Transaction[] = [];
  switch (action) {
    case "deposit": {
      address = getProtocolAddressForChain("juice", chainId, pool);
      abi = getABIForProtocol("juice", "pool");

      if (!address) {
        throw new Error(
          `Token ${token} is not supported for depositing on Juice`,
        );
      }

      params.push(amount);
      approveInfo.spender = address;
      break;
    }
    case "withdraw": {
      address = getProtocolAddressForChain("juice", chainId, pool);
      abi = getABIForProtocol("juice", "pool");

      if (!address) {
        throw new Error(
          `Token ${token} is not supported for withdrawing from Juice`,
        );
      }

      params.push(amount);
      break;
    }
    case "lend": {
      address = getProtocolAddressForChain("juice", chainId, `am${pool}`);
      abi = getABIForProtocol("juice", "manager");

      if (!address) {
        throw new Error(`Token ${token} is not supported for lending on Juice`);
      }

      const contract = new ethers.Contract(address, abi, provider);
      const account = await contract.getAccount(accountAddress);
      const code = await provider.getCode(account);
      if (code === "0x") {
        accountTxs = [
          await getFunctionData(address, abi, "createAccount", [], "0"),
        ];
      }

      params.push(amount);
      params.push(accountAddress);
      approveInfo.spender = address;
      if (pool === "ezeth" && token.toLowerCase() !== "ezeth") {
        approveInfo.tokenInfo = await getTokenInfoForChain(
          "ezeth",
          getChainNameFromId(chainId),
        );
      }
      if (pool !== "ezeth" && token !== "weth") {
        approveInfo.tokenInfo = await getTokenInfoForChain(
          "weth",
          getChainNameFromId(chainId),
        );
      }
      funcName = "deposit";
      break;
    }
    case "borrow":
    case "repay": {
      const managerAddress = getProtocolAddressForChain(
        "juice",
        chainId,
        `am${pool}`,
      );
      if (!managerAddress) {
        throw new Error(
          `Token ${token} is not supported for borrow/repay on Juice`,
        );
      }

      const managerAbi = getABIForProtocol("juice", "manager");
      const manager = new ethers.Contract(managerAddress, managerAbi, provider);
      address = await manager.getAccount(accountAddress);
      abi = getABIForProtocol("juice", "account");
      const code =
        typeof address === "string"
          ? await provider.getCode(address)
          : undefined;
      if (code === "0x") {
        if (action === "repay")
          throw new Error("You don't have any debt to repay right now.");

        accountTxs = [
          await getFunctionData(
            managerAddress,
            managerAbi,
            "createAccount",
            [],
            "0",
          ),
        ];
      }

      params.push(amount);
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          ["borrow", "deposit", "lend", "repay", "withdraw"],
          "Juice",
        ),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo.symbol, "juice", chainId),
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
  } else if (action === "withdraw") {
    const lpTokenInfo = LPAddresses.juice[81457][pool];
    approveTxs = await getApproveData(
      provider,
      lpTokenInfo,
      approveInfo.amount,
      accountAddress,
      address,
    );
  }

  const data = await getFunctionData(
    address,
    abi,
    funcName,
    params,
    value.toString(),
  );

  return {
    transactions: [...approveTxs, ...accountTxs, data],
    funcNames: [
      ...Array(approveTxs.length).fill("Approve"),
      ...Array(accountTxs.length).fill("Create Account"),
      action,
    ],
  };
};

export const getBorrowableAmountFromJuice = async (
  chainId: ChainId,
  account: string,
  tokenInfo: TokenInfo,
  provider: RetryProvider,
  poolName: string | undefined = undefined,
): Promise<number> => {
  const symbol = tokenInfo.symbol.toLowerCase();
  const pool = poolName || symbol;
  if (pool === "ezeth" || symbol === "ezeth") return 0;
  const managerAddress = getProtocolAddressForChain(
    "juice",
    chainId,
    `am${symbol}`,
  );
  const poolAddress = getProtocolAddressForChain("juice", chainId, pool);
  if (!managerAddress || !poolAddress) {
    throw new Error(
      getProtocolErrorMessage("borrow", symbol, "juice", chainId),
    );
  }
  const managerAbi = getABIForProtocol("juice", "manager");
  if (!managerAbi || managerAbi.length === 0) {
    throw new Error(getABIErrorMessage(managerAddress, chainId));
  }
  const poolAbi = getABIForProtocol("juice", "pool");
  if (!poolAbi || poolAbi.length === 0) {
    throw new Error(getABIErrorMessage(poolAddress, chainId));
  }
  try {
    const pool = new ethers.Contract(poolAddress, poolAbi, provider);
    const [totalDebt, reserve, strategyAddress]: [bigint, bigint[], string] =
      await Promise.all([
        pool.getTotalBorrow(),
        pool.reserve(),
        pool.strategy(),
      ]);

    const strategyAbi = getABIForProtocol("juice", "strategy");
    if (!strategyAbi || strategyAbi.length === 0) {
      throw new Error(getABIErrorMessage(strategyAddress, chainId));
    }
    const strategy = new ethers.Contract(
      strategyAddress,
      strategyAbi,
      provider,
    );
    const [utilCap, minLiquidity]: [bigint, bigint] = await Promise.all([
      strategy.utilizationRateCap(),
      strategy.minimumLendingPoolBalance(),
    ]);

    const manager = new ethers.Contract(managerAddress, managerAbi, provider);
    const wallet = await manager.getAccount(account);
    const [health, maxLtv, colRatio]: [bigint[], bigint, bigint] =
      await Promise.all([
        manager.getAccountHealth(wallet),
        manager.maxLtv(),
        symbol === "usdb" ? manager.collateralRatio() : manager.riskThreshold(),
      ]);

    const first = +ethers.formatEther(
      (totalDebt * utilCap - reserve[1] * (ethers.WeiPerEther - utilCap)) /
        ethers.WeiPerEther,
    );
    const second = +ethers.formatEther(reserve[1] - minLiquidity);
    const third = +ethers.formatEther(
      (health[1] * maxLtv) / ethers.WeiPerEther - health[0],
    );
    const fourth = +ethers.formatEther(
      ((health[1] + health[2] - (health[0] * colRatio) / ethers.WeiPerEther) *
        ethers.WeiPerEther) /
        (colRatio - ethers.WeiPerEther),
    );
    return Math.max(Math.min(first, second, third, fourth), 0);
  } catch (err) {
    sfConsoleError(err);
  }
  return 0;
};
