import type { ethers } from "ethers";
import { abis } from "../../config/abis.js";
import { NATIVE_TOKEN } from "../../constants.js";
import { getUnsupportedActionError } from "../error.js";
import { getViemPublicClientFromEthers } from "../ethers2viem.js";
import {
  getABIForProtocol,
  getApproveData,
  getFunctionData,
  getProtocolAddressForChain,
  getStargatePoolId,
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
) => {
  const {
    provider,
    poolName,
    amount: amount_,
    isAllAmount,
    chainId,
    tokenInfo,
  } = actionData;
  const amount = amount_ || 0n;

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
    case "claim": {
      let key = "staking";
      address = getProtocolAddressForChain("stargate", chainId, key);
      if (!address) {
        key = "staking-time";
        address = getProtocolAddressForChain("stargate", chainId, key);
      }
      abi = getABIForProtocol("stargate", key);
      const pid = getStargatePoolId(
        chainId,
        poolName?.startsWith("s*") ? poolName : `s*${poolName}`,
      );
      if (pid === undefined) {
        throw new Error("Pool does not exist for the token");
      }
      params.push(pid);
      params.push(0);

      funcName = "deposit";
      break;
    }
    case "deposit": {
      const poolId = getStargatePoolId(chainId, token);
      if (poolId === undefined) {
        throw new Error("Pool does not exist for the token");
      }

      address = getProtocolAddressForChain("stargate", chainId, "router");
      if (!address) {
        throw new Error("Could not find router for Stargate deposit");
      }
      abi = getABIForProtocol("stargate", "router");

      params.push(poolId);
      params.push(amount);
      params.push(accountAddress);

      funcName = "addLiquidity";

      if (tokenInfo?.address !== NATIVE_TOKEN) {
        approveInfo.spender = address;
      }
      break;
    }
    case "stake": {
      let key = "staking";
      address = getProtocolAddressForChain("stargate", chainId, key);
      if (!address) {
        key = "staking-time";
        address = getProtocolAddressForChain("stargate", chainId, key);
      }
      if (!address) {
        throw new Error("Could not find address for Stargate stake");
      }
      abi = getABIForProtocol("stargate", key);
      const poolId = getStargatePoolId(chainId, token);
      if (poolId === undefined) {
        throw new Error("Pool does not exist for the token");
      }
      params.push(poolId);
      params.push(amount);

      funcName = "deposit";

      if (tokenInfo?.address !== NATIVE_TOKEN) {
        approveInfo.spender = address;
      }
      break;
    }
    case "unstake": {
      let key = "staking";
      address = getProtocolAddressForChain("stargate", chainId, key);
      if (!address) {
        key = "staking-time";
        address = getProtocolAddressForChain("stargate", chainId, key);
      }
      if (!address) {
        throw new Error("Could not find address for Stargate unstake");
      }
      abi = getABIForProtocol("stargate", key);
      const poolId = getStargatePoolId(chainId, token);
      if (poolId === undefined) {
        throw new Error("Pool does not exist for the token");
      }
      params.push(poolId);
      params.push(amount);

      funcName = "withdraw";
      break;
    }
    case "withdraw": {
      const poolId = getStargatePoolId(chainId, token);
      if (poolId === undefined) {
        throw new Error("Pool does not exist for the token");
      }

      address = getProtocolAddressForChain("stargate", chainId, "router");
      const factoryAddress = getProtocolAddressForChain(
        "stargate",
        chainId,
        "factory",
      );
      if (!address) {
        throw new Error("Could not find router for Stargate withdraw");
      }
      if (!factoryAddress) {
        throw new Error("Could not find factory for Stargate withdraw");
      }
      assert(isHexStr(address));
      assert(isHexStr(factoryAddress));
      abi = getABIForProtocol("stargate", "router");

      const viemClient = await getViemPublicClientFromEthers(provider);
      const poolAddress = await viemClient.readContract({
        address: factoryAddress,
        abi: abis["stargate-factory"],
        functionName: "getPool",
        args: [BigInt(poolId)],
      });

      assert(isHexStr(accountAddress));
      let lpAmount: bigint;
      if (isAllAmount) {
        lpAmount = await viemClient.readContract({
          address: poolAddress,
          abi: abis["stargate-pool"],
          functionName: "balanceOf",
          args: [accountAddress],
        });
      } else {
        const [totalSupply, totalLiquidity, convertRate] = await Promise.all([
          viemClient.readContract({
            address: poolAddress,
            abi: abis["stargate-pool"],
            functionName: "totalSupply",
          }),
          viemClient.readContract({
            address: poolAddress,
            abi: abis["stargate-pool"],
            functionName: "totalLiquidity",
          }),
          viemClient.readContract({
            address: poolAddress,
            abi: abis["stargate-pool"],
            functionName: "convertRate",
          }),
        ]);

        lpAmount = (amount * totalSupply) / totalLiquidity / convertRate;
      }

      params.push(poolId);
      params.push(lpAmount);
      params.push(accountAddress);

      funcName = "instantRedeemLocal";
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          ["claim", "deposit", "withdraw", "stake", "unstake"],
          "Stargate",
        ),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(
        action,
        tokenInfo?.symbol,
        "stargate",
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

  const data = await getFunctionData(
    address,
    abi,
    funcName,
    params,
    value.toString(),
  );

  return <{ transactions: Transaction[]; funcNames: string[] }>{
    transactions: [...approveTxs, data],
    funcNames: [...Array<string>(approveTxs.length).fill("Approve"), action],
  };
};
