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
import {
  assert,
  type ContractCallParam,
  type ProtocolActionData,
  type Transaction,
  isHexStr,
} from "../types.js";

export default async (
  accountAddress: string,
  action: string,
  actionData: ProtocolActionData,
): Promise<{
  transactions: Transaction[];
  funcNames: string[];
}> => {
  if (action !== "stake") {
    throw new Error(getUnsupportedActionError(action, ["stake"], "KelpDAO"));
  }

  const { provider, amount: amount_, chainId, tokenInfo } = actionData;
  const viemClient = await getViemPublicClientFromEthers(provider);
  const amount = amount_ || 0n;

  const approveInfo = {
    spender: "",
    tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];
  const token = (tokenInfo?.symbol || "").toLowerCase();
  const address = getProtocolAddressForChain("kelpdao", chainId);
  if (!address) {
    throw new Error("Could not find address for KelpDAO stake");
  }
  const abi = getABIForProtocol("kelpdao");

  let value = 0n;
  let funcName: string;
  if (tokenInfo?.address !== NATIVE_TOKEN) {
    assert(isHexStr(address));
    const configAddress = await viemClient.readContract({
      address,
      abi: abis.kelpdao,
      functionName: "lrtConfig",
    });
    const supportedAssets = await viemClient.readContract({
      address: configAddress,
      abi: abis["kelpdao-config"],
      functionName: "getSupportedAssetList",
    });
    if (
      tokenInfo?.address &&
      !supportedAssets
        .map((x: string) => x.toLowerCase())
        .includes(tokenInfo.address.toLowerCase())
    ) {
      throw new Error(
        `The token ${token} is not supported in KelpDAO staking.`,
      );
    }

    approveInfo.spender = address;
    funcName = "depositAsset";
    params.push(tokenInfo?.address ?? "kelpdao token address?");
    params.push(amount);
    params.push(0);
    params.push("");
  } else {
    funcName = "depositETH";
    value = amount;
    params.push(0);
    params.push("");
  }

  let approveTxs: Transaction[] = [];
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
