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
    case "deposit": {
      //   address = getProtocolAddressForChain("dopex", chainId, poolName);
      //   abi = getABIForProtocol("dopex", "ssov");
      //   params.push(0); // TODO: strike ID
      //   params.push(amount);
      //   params.push(address);
      //   if (tokenInfo.address !== NATIVE_TOKEN) {
      //     approveInfo.spender = address;
      //   }
      break;
    }
    case "withdraw": {
      //   address = getProtocolAddressForChain("dopex", chainId, poolName);
      //   abi = getABIForProtocol("dopex", "ssov");
      //   const contract = new ethers.Contract(address, abi, provider);
      //   const tokenId = await contract.tokenOfOwnerByIndex(accountAddress, 0);
      //   params.push(tokenId);
      //   params.push(address);
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(action, ["deposit", "withdraw"], "Dopex"),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo?.symbol, "dopex", chainId),
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
