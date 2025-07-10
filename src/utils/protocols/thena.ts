import type { ethers } from "ethers";
import { abis } from "../../config/abis.js";
import { getUnsupportedActionError } from "../error.js";
import { getViemPublicClientFromEthers } from "../ethers2viem.js";
import {
  getABIForProtocol,
  getApproveData,
  getFunctionData,
  getProtocolAddressForChain,
} from "../index.js";
import {
  assert,
  type ContractCallParam,
  type ProtocolActionData,
  type Transaction,
  isHexStr,
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
  let address: string | null = "";
  let abi: ethers.InterfaceAbi = [];
  let funcName = action;
  const value = 0;
  const approveInfo = {
    spender: "",
    tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];
  const token = (tokenInfo?.symbol || "").toLowerCase();

  switch (action) {
    case "lock": {
      if (token !== "the") {
        throw new Error("Token not supported");
      }

      address = getProtocolAddressForChain("thena", chainId, "ve");
      if (!address) {
        throw new Error("Could not find vote escrow contract for Thena lock");
      }
      abi = getABIForProtocol("thena", "ve");
      params.push(amount || 0n);
      params.push(7 * 86400);

      funcName = "create_lock";

      approveInfo.spender = address;
      break;
    }
    case "unlock": {
      if (token !== "the") {
        throw new Error("Token not supported");
      }

      address = getProtocolAddressForChain("thena", chainId, "ve");
      if (!address) {
        throw new Error("Could not find vote escrow contract for Thena unlock");
      }
      assert(isHexStr(accountAddress));
      abi = getABIForProtocol("thena", "ve");
      const tokenId = await (
        await getViemPublicClientFromEthers(provider)
      ).readContract({
        address: address as `0x${string}`,
        abi: abis["thena-ve"],
        functionName: "tokenOfOwnerByIndex",
        args: [accountAddress, 0n],
      });
      params.push(tokenId);

      funcName = "withdraw";
      break;
    }
    // case "vote": {
    //   address = getProtocolAddressForChain("thena", chainId, "voting");
    //   abi = getABIForProtocol("thena", "voting");
    //   params.push(0 /* uint256 _tokenId */);
    //   params.push([] /* address[] _poolVote */);
    //   params.push([] /* uint256[] _weights */);
    //   break;
    // }
    default: {
      throw new Error(
        getUnsupportedActionError(action, ["lock", "unlock"], "Thena"),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo?.symbol, "thena", chainId),
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
