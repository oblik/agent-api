import type { InterfaceAbi } from "ethers";
import { getUnsupportedActionError } from "../error.js";
import { getApproveData, getFunctionData } from "../index.js";
import type {
  ContractCallParam,
  ProtocolActionData,
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
  const { provider, amount, chainId, tokenInfo } = actionData;

  let approveTxs: Transaction[] = [];
  const address = null;
  const abi: InterfaceAbi = [];
  const funcName = action;
  const value = 0;
  const approveInfo = {
    spender: "",
    tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];

  switch (action) {
    case "borrow": {
      //   address = getProtocolAddressForChain("rodeo", chainId, "pool");
      //   abi = getABIForProtocol("rodeo", "pool");
      //   params.push(amount);
      break;
    }
    case "deposit":
    case "lend": {
      //   address = getProtocolAddressForChain("rodeo", chainId, "farm");
      //   const pool = getProtocolAddressForChain("rodeo", chainId, "pool");

      //   abi = getABIForProtocol("rodeo", "farm");
      //   params.push(accountAddress);
      //   params.push(pool);
      //   params.push(getStrategyId(poolName) /* uint256 str */);
      //   params.push(amount);
      //   params.push(0 /* uint256 bor */);
      //   params.push("0x" /* bytes dat */);

      //   funcName = "mint"

      //   if (tokenInfo.address !== NATIVE_TOKEN) {
      //     approveInfo.spender = address;
      //   }
      break;
    }
    case "repay": {
      //   address = getProtocolAddressForChain("rodeo", chainId, "pool");
      //   abi = getABIForProtocol("rodeo", "pool");
      //   params.push(amount);

      //   if (tokenInfo.address !== NATIVE_TOKEN) {
      //     approveInfo.spender = address;
      //   }
      break;
    }
    case "withdraw": {
      //   address = getProtocolAddressForChain("rodeo", chainId, "farm");
      //   abi = getABIForProtocol("rodeo", "farm");
      //   // Should call `Edit` function first to manage the deposited tokens
      //   // Then `Burn` function should be called to burn ERC-721 NFT
      //   params.push(getStrategyId(poolName) /* uint256 str */);
      //   funcName = "burn";
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          ["deposit", "withdraw", "borrow", "lend", "repay"],
          "Rodeo",
        ),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo?.symbol, "rodeo", chainId),
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

  return {
    transactions: [...approveTxs, data],
    funcNames: [...Array(approveTxs.length).fill("Approve"), action],
  };
};
