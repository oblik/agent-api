import { ethers } from "ethers";
import { abis } from "../../config/abis.js";
import { NATIVE_TOKEN } from "../../constants.js";
import { getUnsupportedActionError } from "../error.js";
import { getViemPublicClientFromEthers } from "../ethers2viem.js";
import {
  getABIForProtocol,
  getApproveData,
  getFunctionData,
  getProtocolAddressForChain,
} from "../index.js";
import { sfConsoleError } from "../log.js";
import type { RetryProvider } from "../retryProvider.js";
import {
  assert,
  type ChainId,
  type ContractCallParam,
  type ProtocolActionData,
  type TokenInfo,
  type Transaction,
  isHexStr,
} from "../types.js";
import { getABIErrorMessage, getProtocolErrorMessage } from "./index.js";

export default async (
  accountAddress: string,
  action: string,
  actionData: ProtocolActionData,
): Promise<{
  transactions: (Transaction | undefined)[];
  funcNames: string[];
}> => {
  const {
    provider,
    amount: amount_,
    chainId,
    tokenInfo,
    repayAll,
  } = actionData;
  const amount = amount_ || 0n;

  let approveTxs: Transaction[] = [];
  let address: string | null = "";
  let abi: ethers.InterfaceAbi = [];
  let funcName = action;
  let value = 0n;
  const approveInfo = {
    spender: "",
    tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];
  const token = (tokenInfo?.symbol || "").toLowerCase();

  switch (action) {
    case "borrow": {
      address = getProtocolAddressForChain("lodestar", chainId, `v1l${token}`);

      if (!address) {
        throw new Error(`Token ${token} is not supported`);
      }

      abi = getABIForProtocol("lodestar", "v1lerc20");
      params.push(amount);
      break;
    }
    case "claim": {
      address = getProtocolAddressForChain("lodestar", chainId, "staking");
      abi = getABIForProtocol("lodestar", "staking");
      funcName = "claimRewards";
      break;
    }
    case "deposit":
    case "lend": {
      address = getProtocolAddressForChain("lodestar", chainId, `v1l${token}`);

      if (!address) {
        throw new Error(`Token ${token} is not supported`);
      }

      const isEth = tokenInfo?.address === NATIVE_TOKEN;
      abi = getABIForProtocol("lodestar", isEth ? "v1leth" : "v1lerc20");
      if (isEth) {
        value = amount;
      } else {
        params.push(amount);
        approveInfo.spender = address;
      }

      funcName = "mint";

      break;
    }
    case "withdraw": {
      address = getProtocolAddressForChain("lodestar", chainId, `v1l${token}`);

      const isEth = tokenInfo?.address === NATIVE_TOKEN;
      abi = getABIForProtocol("lodestar", isEth ? "v1leth" : "v1lerc20");

      funcName = "redeemUnderlying";

      params.push(amount);

      break;
    }
    case "repay": {
      address = getProtocolAddressForChain("lodestar", chainId, `v1l${token}`);

      if (!address) {
        throw new Error(`Token ${token} is not supported`);
      }

      const isEth = tokenInfo?.address === NATIVE_TOKEN;
      abi = getABIForProtocol("lodestar", isEth ? "v1leth" : "v1lerc20");
      if (isEth) {
        value = amount;
      } else {
        if (repayAll) {
          params.push(ethers.MaxUint256);
          approveInfo.amount = ethers.MaxUint256;
        } else {
          params.push(amount);
        }
        approveInfo.spender = address;
      }

      funcName = "repayBorrow";

      if (tokenInfo?.address !== NATIVE_TOKEN) {
        approveInfo.spender = address;
      }
      break;
    }
    case "stake": {
      if (token !== "lode") {
        throw new Error("Token not supported");
      }

      address = getProtocolAddressForChain("lodestar", chainId, "staking");
      if (!address) {
        throw new Error("Could not find address for Lodestar stake");
      }
      abi = getABIForProtocol("lodestar", "staking");
      params.push(amount);
      params.push(7776000 /* uint256 lockTime */); // Can be 10 seconds, 90 days and 180 days

      funcName = "stakeLODE";

      if (tokenInfo?.address !== NATIVE_TOKEN) {
        approveInfo.spender = address;
      }
      break;
    }
    case "unstake": {
      address = getProtocolAddressForChain("lodestar", chainId, "staking");
      abi = getABIForProtocol("lodestar", "staking");
      params.push(amount);

      funcName = "unstakeLODE";
      break;
    }
    // case "vote": {
    //   address = getProtocolAddressForChain("lodestar", chainId, "voting");
    //   abi = getABIForProtocol("lodestar", "voting");
    //   params.push([] /* string[] tokens */);
    //   params.push([] /* VotingConstants.OperationType[] operations */);
    //   params.push([] /* uint256[] shares */);
    //   break;
    // }
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          [
            "borrow",
            "claim",
            "deposit",
            "lend",
            "repay",
            "withdraw",
            "stake",
            "unstake",
          ],
          "Lodestar",
        ),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo?.symbol, "lodestar", chainId),
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

  const data = await getFunctionData(
    address,
    abi,
    funcName,
    params,
    value.toString(),
  );

  let collateralTx: Transaction | undefined;
  if (action === "deposit" || action === "lend" || action === "borrow") {
    const unitrollerAddress = getProtocolAddressForChain(
      "lodestar",
      chainId,
      "unitroller",
    );
    if (!unitrollerAddress) {
      throw new Error("Cannot put assets as collateral");
    }
    abi = getABIForProtocol("lodestar", "unitroller");
    collateralTx = await getFunctionData(
      unitrollerAddress,
      abi,
      "enterMarkets",
      [[address]],
      "0",
    );
  }

  const txs = [...approveTxs, data];
  const funcNames = [...Array(approveTxs.length).fill("Approve"), action];

  if (action === "lend" || action === "deposit") {
    return {
      transactions: [...txs, collateralTx],
      funcNames: [...funcNames, "Enter Markets"],
    };
  }
  if (action === "borrow") {
    return {
      transactions: [collateralTx, ...txs],
      funcNames: ["Enter Markets", ...funcNames],
    };
  }

  return { transactions: txs, funcNames };
};

export const getBorrowableAmountFromLodestar = async (
  chainId: ChainId,
  account: string,
  tokenInfo: TokenInfo,
  provider: RetryProvider,
): Promise<number> => {
  const address = getProtocolAddressForChain("lodestar", chainId, "unitroller");
  const lToken = getProtocolAddressForChain(
    "lodestar",
    chainId,
    `v1l${tokenInfo?.symbol}`,
  );
  const abi = getABIForProtocol("lodestar", "unitroller");

  if (!address || !lToken) {
    throw new Error(
      getProtocolErrorMessage("borrow", tokenInfo?.symbol, "lodestar", chainId),
    );
  }
  if (!abi || abi.length === 0) {
    throw new Error(getABIErrorMessage(address, chainId));
  }

  try {
    const viemClient = await getViemPublicClientFromEthers(provider);
    assert(isHexStr(account));
    assert(isHexStr(address));
    assert(isHexStr(lToken));
    const oracleAddress = await viemClient.readContract({
      address,
      abi: abis["lodestar-unitroller"],
      functionName: "oracle",
    });
    const price = await viemClient.readContract({
      address: oracleAddress,
      abi: abis["lodestar-oracle"],
      functionName: "getUnderlyingPrice",
      args: [lToken],
    });
    const liquidity = await viemClient.readContract({
      address,
      abi: abis["lodestar-unitroller"],
      functionName: "getAccountLiquidity",
      args: [account],
    });
    return +ethers.formatUnits(
      (liquidity[1] * ethers.WeiPerEther) / price,
      tokenInfo?.decimals,
    );
  } catch (err) {
    sfConsoleError(err);
  }
  return 0;
};
