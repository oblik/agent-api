import { ethers } from "ethers";
import { abis } from "../../config/abis.js";
import WrappedTokens from "../../config/common/wrapped-token.js";
import { NATIVE_TOKEN } from "../../constants.js";
import { getUnsupportedActionError } from "../error.js";
import { getViemPublicClientFromEthers } from "../ethers2viem.js";
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
  Transaction,
} from "../types.js";
import { assert, isHexStr } from "../types.js";
import { getABIErrorMessage, getProtocolErrorMessage } from "./index.js";

export default async (
  accountAddress: string,
  action: string,
  actionData: ProtocolActionData,
): Promise<{
  transactions: Transaction[];
  funcNames: string[];
}> => {
  const { provider, amount, chainId, tokenInfo } = actionData;
  const viemClient = await getViemPublicClientFromEthers(provider);

  let approveTxs: Transaction[] = [];
  let funcName = action;
  let value = 0n;
  const approveInfo = {
    spender: "",
    tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];

  const isEth = tokenInfo?.address === NATIVE_TOKEN;
  let address: string | null;
  let abi: ethers.InterfaceAbi;
  if (isEth) {
    address = getProtocolAddressForChain("aave", chainId, "wrapper");
    abi = getABIForProtocol("aave", "wrapper");
  } else {
    address = getProtocolAddressForChain("aave", chainId);
    abi = getABIForProtocol("aave");
  }
  if (!address) {
    throw new Error("Could not find address for Aave");
  }
  const poolAddr = getProtocolAddressForChain("aave", chainId);
  if (!poolAddr) {
    throw new Error("Could not find pool for Aave");
  }
  const delegateTxs: Transaction[] = [];

  switch (action) {
    case "borrow": {
      const providerAddress = getProtocolAddressForChain(
        "aave",
        chainId,
        "provider",
      );
      if (!providerAddress) {
        throw new Error("Could not find provider for Aave borrow");
      }
      const providerAbi = abis["aave-provider"];
      let tokenAddress = tokenInfo?.address;
      if (isEth) {
        tokenAddress = (
          await getTokenInfoForChain("weth", getChainNameFromId(chainId))
        )?.address;
      }
      assert(isHexStr(tokenAddress));
      assert(isHexStr(providerAddress));
      const addresses = await viemClient.readContract({
        address: providerAddress,
        abi: providerAbi,
        functionName: "getReserveTokensAddresses",
        args: [tokenAddress],
      });

      const debtTokenAddress = addresses[2] || addresses[1];
      const debtTokenAbi = abis["aave-debt-token"];
      assert(isHexStr(accountAddress));
      assert(isHexStr(address));
      const allowance = await viemClient.readContract({
        address: debtTokenAddress,
        abi: debtTokenAbi,
        functionName: "borrowAllowance",
        args: [accountAddress, address],
      });
      if ((amount || 0n) > allowance) {
        delegateTxs.push(
          await getFunctionData(
            debtTokenAddress,
            debtTokenAbi,
            "approveDelegation",
            [address, (amount || 0n) - allowance],
            "0",
          ),
        );
      }

      if (isEth) {
        params.push(poolAddr);
        params.push(amount || 0n);
        params.push(2); // interest rate mode
        params.push(0);

        funcName = "borrowETH";
      } else {
        params.push(tokenInfo?.address ?? "aave token address?");
        params.push(amount || 0n);
        params.push(2); // interest rate mode
        params.push(0);
        params.push(accountAddress);
      }
      break;
    }
    case "deposit":
    case "lend": {
      if (isEth) {
        params.push(poolAddr);
        params.push(accountAddress);
        params.push(0);

        funcName = "depositETH";

        value = amount || 0n;
      } else {
        params.push(tokenInfo?.address ?? "aave token address?");
        params.push(amount || 0n);
        params.push(accountAddress);
        params.push(0);

        funcName = "supply";

        approveInfo.spender = address;
      }

      break;
    }
    case "repay": {
      if (isEth) {
        params.push(poolAddr);
        params.push(2); // interest rate mode
        params.push(accountAddress);

        funcName = "repayETH";

        value = amount || 0n;
      } else {
        params.push(tokenInfo?.address ?? "aave token address?");
        params.push(amount || 0n);
        params.push(2); // interest rate mode
        params.push(accountAddress);

        approveInfo.spender = address;
      }
      break;
    }
    case "withdraw": {
      if (isEth) {
        params.push(poolAddr);
        params.push(amount || 0n);
        params.push(accountAddress);

        funcName = "withdrawETH";
      } else {
        params.push(tokenInfo?.address ?? "aave token address?");
        params.push(amount || 0n);
        params.push(accountAddress);
      }
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          ["borrow", "deposit", "lend", "repay", "withdraw"],
          "Aave",
        ),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo?.symbol, "aave", chainId),
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

  const collateralTx: Transaction[] = [];
  if (action === "lend") {
    let poolAddress: string | null = address;
    let poolAbi = abi;
    let token = tokenInfo?.address;
    if (isEth) {
      poolAddress = getProtocolAddressForChain("aave", chainId);
      poolAbi = getABIForProtocol("aave");
      token = WrappedTokens[chainId];
    }
    collateralTx.push(
      await getFunctionData(
        poolAddress || "",
        poolAbi,
        "setUserUseReserveAsCollateral",
        [token, true],
        "0",
      ),
    );
  }

  return {
    transactions: [...delegateTxs, ...approveTxs, data, ...collateralTx],
    funcNames: [
      ...Array(delegateTxs.length).fill("Approve Delegation"),
      ...Array(approveTxs.length).fill("Approve"),
      action,
    ],
  };
};

export const getBorrowableAmountFromAave = async (
  chainId: ChainId,
  account: string,
  symbol: string | undefined,
  provider: RetryProvider,
): Promise<number> => {
  const address = getProtocolAddressForChain("aave", chainId);
  const abi = abis.aave;

  assert(
    isHexStr(address),
    getProtocolErrorMessage("borrow", symbol, "aave", chainId),
  );
  assert(isHexStr(account));

  try {
    const accountData = await (
      await getViemPublicClientFromEthers(provider)
    ).readContract({
      address,
      abi,
      functionName: "getUserAccountData",
      args: [account],
    });
    return +ethers.formatUnits(((accountData[2] ?? 0n) * 99n) / 100n, 8);
  } catch (err) {
    sfConsoleError(err);
  }
  return 0;
};
