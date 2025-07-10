import axios from "axios";
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
import type { RetryProvider } from "../retryProvider.js";
import {
  assert,
  type ChainId,
  type ContractCallParam,
  type JSONObject,
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
  const { provider, amount: amount_, chainId } = actionData;
  const viemClient = await getViemPublicClientFromEthers(provider);
  let { token } = actionData;
  const amount = amount_ || 0n;

  let approveTxs: Transaction[] = [];
  let address: string | null = "";
  let abi: ethers.InterfaceAbi = [];
  let funcName = action;
  let value = 0n;
  const approveInfo = {
    spender: "",
    amount,
  };
  const params: ContractCallParam[] = [];

  if (!token) token = "eth";
  else token = token.toLowerCase();
  if (token !== "eth")
    throw new Error(
      getProtocolErrorMessage(action, token, "ether.fi", chainId),
    );

  switch (action) {
    case "claim": {
      address = await getNFTAddress(provider, chainId);
      abi = getABIForProtocol("etherfi-nft");
      const tokenId = await validateClaim(provider, chainId, accountAddress);
      params.push(tokenId);
      funcName = "claimWithdraw";
      break;
    }
    case "stake": {
      address = getProtocolAddressForChain("etherfi", chainId);
      abi = getABIForProtocol("etherfi");
      value = amount;

      funcName = "deposit()";
      break;
    }
    case "unstake": {
      address = getProtocolAddressForChain("etherfi", chainId);
      if (!address) {
        throw new Error("Could not find address for Etherfi unstake");
      }
      abi = getABIForProtocol("etherfi");

      assert(isHexStr(address));
      assert(isHexStr(accountAddress));
      const eeth = await viemClient.readContract({
        address,
        abi: abis.etherfi,
        functionName: "eETH",
      });
      const balance = await viemClient.readContract({
        address: eeth,
        abi: abis.erc20,
        functionName: "balanceOf",
        args: [accountAddress],
      });
      if (balance < amount) {
        const tokenId = await validateClaim(
          provider,
          chainId,
          accountAddress,
          false,
        );
        address = await getNFTAddress(provider, chainId);
        if (!address) {
          throw new Error("Could not find address for Etherfi NFT");
        }
        abi = getABIForProtocol("etherfi-nft");
        params.push(tokenId);
        funcName = "claimWithdraw";
      } else {
        params.push(accountAddress);
        params.push(amount);
        funcName = "requestWithdraw";
      }

      approveInfo.spender = address;
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(action, ["stake", "unstake"], "ether.fi"),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, token, "ether.fi", chainId),
    );
  }
  if (!abi || abi.length === 0) {
    throw new Error(getABIErrorMessage(address, chainId));
  }

  if (approveInfo.spender) {
    assert(isHexStr(address));
    const eeth = await viemClient.readContract({
      address,
      abi: abis.etherfi,
      functionName: "eETH",
    });
    approveTxs = await getApproveData(
      provider,
      { address: eeth },
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

const getNFTAddress = async (provider: RetryProvider, chainId: ChainId) => {
  const address = getProtocolAddressForChain("etherfi", chainId);
  if (!address) {
    throw new Error("Could not find address for Etherfi NFT");
  }
  assert(isHexStr(address));
  return await (await getViemPublicClientFromEthers(provider)).readContract({
    address,
    abi: abis.etherfi,
    functionName: "withdrawRequestNFT",
  });
};

const getTokenIds = async (nft: string, address: string): Promise<number[]> => {
  const {
    data: { tokens },
  } = await axios.get(
    `https://api.reservoir.tools/users/${address}/tokens/v10?collection=${nft}`,
  );
  return tokens.map((x: JSONObject) => +x.token.tokenId);
};

const validateClaim = async (
  provider: RetryProvider,
  chainId: ChainId,
  account: string,
  isOriginal = true,
) => {
  const address = await getNFTAddress(provider, chainId);
  const tokenIds = await getTokenIds(address, account);
  if (tokenIds.length === 0) {
    throw new Error(
      isOriginal
        ? `No pending request to claim for ${account} on etherfi`
        : "You don't have enough eETH to request withdraw",
    );
  }
  if (tokenIds.length > 1) {
    if (isOriginal) {
      throw new Error(
        `Ambiguous to execute claim action because ${account} owns ${tokenIds.length} pending requests.`,
      );
    }
    tokenIds.sort();
    const tokenIdStr = `${tokenIds.slice(0, tokenIds.length - 1).join(", ")}, and ${tokenIds[tokenIds.length - 1]}`;
    throw new Error(
      `You don't have enough eETH to request withdraw, but have pending requests for NFTs(${tokenIdStr}).`,
    );
  }
  try {
    await (await getViemPublicClientFromEthers(provider)).readContract({
      address,
      abi: abis["etherfi-nft"],
      functionName: "getClaimableAmount",
      args: [BigInt(tokenIds[0])],
    });
  } catch {
    throw new Error(
      `Not ready to claim or invalid request for NFT${tokenIds[0]}`,
    );
  }
  return tokenIds[0];
};
