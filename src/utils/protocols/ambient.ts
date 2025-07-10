import { ethers } from "ethers";
import { abis } from "../../config/abis.js";
import { NATIVE_TOKEN } from "../../constants.js";
import { getUnsupportedActionError } from "../error.js";
import {
  getABIForProtocol,
  getAmbientCallPathForLiq,
  getApproveData,
  getCoinData,
  getFunctionData,
  getNativeTokenSymbolForChain,
  getProtocolAddressForChain,
  getTokenInfoForChain,
  priceToTick,
  sfParseUnits,
  splitPool,
  tickToPrice,
} from "../index.js";
import type {
  ContractCallParam,
  ProtocolActionData,
  TokenInfo,
  Transaction,
} from "../types.js";
import { assert, isDefined } from "../types.js";
import { getABIErrorMessage, getProtocolErrorMessage } from "./index.js";

export default async (
  accountAddress: string,
  action: string,
  actionData: ProtocolActionData,
): Promise<{
  transactions: Transaction[];
  funcNames: string[];
}> => {
  const {
    provider,
    token,
    amount: amount_,
    amount2: amount2_,
    chainName,
    chainId,
    tokenInfo,
    tokenInfo2,
    poolName,
    range,
    lowerTick,
    upperTick,
  } = actionData;
  const amount = amount_ || 0n;
  const amount2 = amount2_ || 0n;

  if (!poolName) {
    throw new Error(
      `Missing a pool to ${action} on Ambient. The pool name should be token-token format.`,
    );
  }

  if (poolName.toLowerCase().includes("usdt")) {
    throw new Error(`Token USDT is not supported for ${action} on Ambient`);
  }
  const wethInfo = await getTokenInfoForChain("weth", chainName);
  let approveTxs: Transaction[] = [];
  const address = getProtocolAddressForChain("ambient", chainId);
  if (!address) {
    throw new Error("Could not find address for Ambient");
  }
  const abi = getABIForProtocol("ambient");
  const funcName = "userCmd";
  let value = 0n;
  let wrapData: Transaction | undefined;
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

  const nativeTokenSymbol = getNativeTokenSymbolForChain(chainId);
  const isNative =
    token && token.toLowerCase() === nativeTokenSymbol?.toLowerCase();

  const queryAddress = getProtocolAddressForChain("ambient", chainId, "query");
  if (!queryAddress) {
    throw new Error("Could not find query contract for Ambient");
  }
  const queryAbi = getABIForProtocol("ambient", "query");
  const queryContract = new ethers.Contract(queryAddress, queryAbi, provider);

  switch (action) {
    case "deposit": {
      let token0: TokenInfo | undefined = tokenInfo;
      let amount0: bigint = amount;
      let token1: TokenInfo | undefined;
      let amount1: bigint;
      if (tokenInfo2) {
        token1 = tokenInfo2;
        amount1 = amount2 ?? -1n;
      } else {
        const tokenSymbols = splitPool(poolName);
        let token1Symbol =
          tokenSymbols[0] === tokenInfo?.symbol
            ? tokenSymbols[1]
            : tokenSymbols[0];

        if (
          token &&
          token.toLowerCase() !== tokenSymbols[1].toLowerCase() &&
          token.toLowerCase() !== tokenSymbols[0].toLowerCase()
        ) {
          if (
            tokenInfo?.address === NATIVE_TOKEN &&
            (tokenSymbols[0].toLowerCase() === "weth" ||
              tokenSymbols[1].toLowerCase() === "weth") &&
            wethInfo
          ) {
            token0 = wethInfo;
            token1Symbol =
              tokenSymbols[0] === token0.symbol
                ? tokenSymbols[1]
                : tokenSymbols[0];
            wrapData = await getFunctionData(
              wethInfo.address,
              abis.weth,
              "deposit",
              [],
              amount.toString(),
            );
            approveInfo.tokenInfo = wethInfo;
          } else {
            throw new Error(
              `${action} Ambient ${poolName} pool is not supported with ${token}. Try depositing ${tokenSymbols[0].toLowerCase()} or ${tokenSymbols[1].toLowerCase()}.`,
            );
          }
        }

        token1 = await getTokenInfoForChain(token1Symbol, chainName, true);
        const { price: token0Price } = await getCoinData(
          accountAddress,
          token0?.symbol,
          chainId,
        );
        const { price: token1Price } = await getCoinData(
          accountAddress,
          token1?.symbol,
          chainId,
        );
        assert(isDefined(token0Price) && isDefined(token1Price));
        amount1 = sfParseUnits(
          (+ethers.formatUnits(amount0, token0?.decimals) * token0Price) /
            token1Price,
          token1?.decimals,
        );
        amount1 = (amount1 * 101n) / 100n;
      }

      if (token1?.symbol.toLowerCase() === nativeTokenSymbol?.toLowerCase()) {
        [token0, token1] = [token1, token0];
        [amount0, amount1] = [amount1, amount0];
      } else if (
        tokenInfo?.symbol.toLowerCase() !== nativeTokenSymbol?.toLowerCase()
      ) {
        throw new Error("Invalid pool");
      }

      const args = [ethers.ZeroAddress, token1?.address, 420];
      const [price, tick] = await Promise.all([
        queryContract.queryPrice(...args),
        queryContract.queryCurveTick(...args),
      ]);

      const code = range ? (isNative ? 11 : 12) : isNative ? 31 : 32;
      const base = ethers.ZeroAddress;
      const quote = token1?.address;
      const poolIdx = 420;
      let bidTick = 0;
      let askTick = 0;
      if (range) {
        const currentPrice = tickToPrice(Number.parseFloat(tick.toString()));
        const bidPrice =
          (currentPrice * (100 - Number.parseFloat(range))) / 100.0;
        const askPrice =
          (currentPrice * (100 + Number.parseFloat(range))) / 100.0;
        bidTick = priceToTick(bidPrice);
        askTick = priceToTick(askPrice);
        const gridSize = 16;
        bidTick = Math.floor(bidTick / gridSize) * gridSize;
        askTick = Math.floor(askTick / gridSize) * gridSize;
      }
      const qty = isNative ? amount0 : amount1;
      const limitLower = (price * 99n) / 100n;
      const limitHigher = (price * 101n) / 100n;
      const settleFlags = 0;
      const lpConduit = ethers.ZeroAddress;
      const cmd = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          "uint8",
          "address",
          "address",
          "uint256",
          "int24",
          "int24",
          "uint128",
          "uint128",
          "uint128",
          "uint8",
          "address",
        ],
        [
          code,
          base,
          quote,
          poolIdx,
          bidTick,
          askTick,
          qty,
          limitLower,
          limitHigher,
          settleFlags,
          lpConduit,
        ],
      );
      params.push(getAmbientCallPathForLiq(chainId)); // callpath
      params.push(cmd);

      value = (amount0 * (range ? 120n : 101n)) / 100n;

      approveInfo.spender = address;
      approveInfo.amount = amount1;
      approveInfo.tokenInfo = token1;
      break;
    }
    case "withdraw": {
      let token0: TokenInfo | undefined = tokenInfo;
      let amount0 = amount;
      let token1: TokenInfo | undefined;
      let amount1: bigint;
      if (tokenInfo2) {
        token1 = tokenInfo2;
        amount1 = amount2 ?? -1n;
      } else {
        const tokenSymbols = splitPool(poolName);
        const token1Symbol =
          tokenSymbols[0] === tokenInfo?.symbol
            ? tokenSymbols[1]
            : tokenSymbols[0];

        if (
          token &&
          token.toLowerCase() !== tokenSymbols[1].toLowerCase() &&
          token.toLowerCase() !== tokenSymbols[0].toLowerCase()
        ) {
          throw new Error(
            `${action} Ambient ${poolName} pool is not supported with ${token}. Try depositing ${tokenSymbols[0].toLowerCase()} or ${tokenSymbols[1].toLowerCase()}.`,
          );
        }

        token1 = await getTokenInfoForChain(token1Symbol, chainName, true);
        const { price: token0Price } = await getCoinData(
          accountAddress,
          token0?.symbol,
          chainId,
        );
        const { price: token1Price } = await getCoinData(
          accountAddress,
          token1?.symbol,
          chainId,
        );
        assert(isDefined(token0Price) && isDefined(token1Price));
        amount1 = sfParseUnits(
          (+ethers.formatUnits(amount0, token0?.decimals) * token0Price) /
            token1Price,
          token1?.decimals,
        );
        amount1 = (amount1 * 101n) / 100n;
      }

      if (token1?.symbol.toLowerCase() === nativeTokenSymbol?.toLowerCase()) {
        [token0, token1] = [token1, token0];
        [amount0, amount1] = [amount1, amount0];
      } else if (
        tokenInfo?.symbol.toLowerCase() !== nativeTokenSymbol?.toLowerCase()
      ) {
        throw new Error("Invalid pool");
      }

      const args = [ethers.ZeroAddress, token1?.address, 420];
      const price = await queryContract.queryPrice(...args);

      params.push(getAmbientCallPathForLiq(chainId)); // callpath
      const code = range ? (isNative ? 21 : 22) : isNative ? 41 : 42;
      const base = ethers.ZeroAddress;
      const quote = token1?.address;
      const poolIdx = 420;
      let bidTick: number | undefined = 0;
      let askTick: number | undefined = 0;
      if (range) {
        bidTick = lowerTick;
        askTick = upperTick;
      }
      let positionData: { baseQty?: number; quoteQty?: number };
      if (range) {
        positionData = await queryContract.queryRangeTokens(
          accountAddress,
          ...args,
          lowerTick,
          upperTick,
        );
      } else {
        positionData = await queryContract.queryAmbientTokens(
          accountAddress,
          ...args,
        );
      }
      const tokenQty = isNative ? positionData.baseQty : positionData.quoteQty;
      await queryContract.queryPrice(...args);
      const qty = isNative ? amount0 : amount1;
      const nativeToken = isNative ? token0 : token1;
      if (tokenQty && tokenQty < qty && nativeToken) {
        throw new Error(
          `Insufficient ${nativeToken.symbol.toLowerCase()} to withdraw.`,
        );
      }
      const limitLower = (price * 99n) / 100n;
      const limitHigher = (price * 101n) / 100n;
      const settleFlags = 0;
      const lpConduit = ethers.ZeroAddress;
      const cmd = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          "uint8",
          "address",
          "address",
          "uint256",
          "int24",
          "int24",
          "uint128",
          "uint128",
          "uint128",
          "uint8",
          "address",
        ],
        [
          code,
          base,
          quote,
          poolIdx,
          bidTick,
          askTick,
          qty,
          limitLower,
          limitHigher,
          settleFlags,
          lpConduit,
        ],
      );
      params.push(cmd);
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(action, ["deposit", "withdraw"], "Ambient"),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(
        action,
        tokenInfo?.symbol,
        "ambient",
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

  if (wrapData) {
    return {
      transactions: [wrapData, ...approveTxs, data],
      funcNames: [
        "Deposit",
        ...Array(approveTxs.length).fill("Approve"),
        action,
      ],
    };
  }

  return {
    transactions: [...approveTxs, data],
    funcNames: [...Array(approveTxs.length).fill("Approve"), action],
  };
};
