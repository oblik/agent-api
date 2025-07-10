import { ZeroAddress, ethers, getBigInt } from "ethers";
import { abis } from "../../config/abis.js";
import isStable from "../../config/stablecoins.js";
import { NATIVE_TOKEN } from "../../constants.js";
import { getUnsupportedActionError } from "../error.js";
import {
  getABIForProtocol,
  getApproveData,
  getFunctionData,
  getProtocolAddressForChain,
  getTokenAmount,
  getTokenInfoForChain,
  priceToTick,
  sfParseUnits,
  splitPool,
  tickToPrice,
} from "../index.js";
import type { RetryProvider } from "../retryProvider.js";
import type {
  ChainId,
  ContractCallParam,
  ProtocolActionData,
  TokenInfo,
  Transaction,
} from "../types.js";
import { Flow, Unwind, noop } from "../types.js";
import { getABIErrorMessage, getProtocolErrorMessage } from "./index.js";

const maxUint128 = getBigInt("0xffffffffffffffffffffffffffffffff");

export default async (
  accountAddress: string,
  action: string,
  actionData: ProtocolActionData,
): Promise<{
  transactions: Transaction[];
  funcNames?: string[];
}> => {
  const {
    provider,
    amount: amount_,
    amount2: amount2_,
    chainName,
    chainId,
    tokenInfo,
    tokenInfo2,
    poolName,
    range,
    tokenId,
    liquidity0,
    liquidity1,
  } = actionData;
  let { isAllAmount } = actionData;
  const amount = amount_ || 0n;
  const amount2 = amount2_ || 0n;

  const wethInfo = await getTokenInfoForChain("weth", chainName);
  let approveTxs: Transaction[] = [];
  let address: string | null = "";
  let abi: ethers.InterfaceAbi = [];
  let funcName = action;
  let value: number | bigint = 0n;
  let wrapData: Transaction | undefined;
  const approveInfo: {
    spender: string;
    tokenInfo: TokenInfo | undefined;
    amount: bigint;
  } = {
    spender: "",
    tokenInfo: tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];

  const aerodromeFactoryAbi = getABIForProtocol("aerodrome", "factory");
  const aerodromePoolAbi = getABIForProtocol("aerodrome", "pool");
  const factoryAddress = getProtocolAddressForChain(
    "aerodrome",
    chainId,
    "factory",
  );
  const tokenName = actionData.token;
  if (!factoryAddress) {
    throw new Error("Could not find factory for Aerodrome");
  }

  switch (action) {
    case "deposit": {
      ({ wrapData, address, abi, funcName, value, approveTxs } =
        await adDeposit(
          poolName,
          tokenInfo,
          amount,
          tokenInfo2,
          amount2,
          tokenName,
          wethInfo,
          wrapData,
          approveInfo,
          chainName,
          range,
          address,
          chainId,
          abi,
          provider,
          tokenId,
          accountAddress,
          funcName,
          params,
          value,
          approveTxs,
          factoryAddress,
          aerodromeFactoryAbi,
          aerodromePoolAbi,
        ));
      break;
    }
    case "withdraw": {
      ({ address, abi, funcName, isAllAmount, approveTxs } = await adWithdraw(
        poolName,
        tokenInfo,
        amount,
        tokenInfo2,
        amount2,
        tokenName,
        wethInfo,
        chainName,
        range,
        tokenId,
        address,
        chainId,
        abi,
        funcName,
        provider,
        isAllAmount,
        liquidity0,
        liquidity1,
        accountAddress,
        params,
        factoryAddress,
        aerodromeFactoryAbi,
        aerodromePoolAbi,
        approveTxs,
      ));
      break;
    }
    case "lock": {
      if (tokenInfo?.symbol.toLowerCase() !== "aero") {
        throw new Error("Token not supported");
      }

      address = getProtocolAddressForChain("aerodrome", chainId, "ve");
      if (!address) {
        throw new Error("Could not find vote escrow contract for Aerodrome");
      }
      abi = getABIForProtocol("aerodrome", "ve");
      params.push(amount);
      params.push(7 * 86400);

      funcName = "createLock";

      approveInfo.spender = address;
      break;
    }
    case "unlock": {
      address = getProtocolAddressForChain("aerodrome", chainId, "ve");
      if (!address) {
        throw new Error("Could not find vote escrow contract for Aerodrome");
      }
      abi = getABIForProtocol("aerodrome", "ve");
      const veContract = new ethers.Contract(address, abi, provider);
      const balance = await veContract.balanceOf(accountAddress);
      if (balance > 1) {
        throw new Error(
          `Ambiguous to execute unlock action because ${accountAddress} owns ${ethers.getNumber(balance)} veNFTs.`,
        );
      }
      if (balance === 0n) {
        throw new Error("No veNFT to unlock");
      }
      const tokenId = ethers.getNumber(
        await veContract.ownerToNFTokenIdList(accountAddress, 0),
      );

      const transactions: Transaction[] = [];

      const allowance =
        (await veContract.isApprovedOrOwner(address, tokenId)) ||
        (await veContract.isApprovedForAll(accountAddress, address));
      if (!allowance) {
        transactions.push(
          await getFunctionData(
            address,
            abi,
            "approve",
            [address, tokenId],
            "0",
          ),
        );
      }

      transactions.push(
        await getFunctionData(
          address,
          abi,
          "withdraw",
          [tokenId],
          value.toString(),
        ),
      );
      return { transactions };
    }
    case "claim": {
      const veAddress = getProtocolAddressForChain("aerodrome", chainId, "ve");
      if (!veAddress) {
        throw new Error("Could not find vote escrow contract for Aerodrome");
      }
      const veAbi = getABIForProtocol("aerodrome", "ve");
      const veContract = new ethers.Contract(veAddress, veAbi, provider);
      const balance = await veContract.balanceOf(accountAddress);
      if (balance > 1) {
        throw new Error(
          `Ambiguous to execute unlock action because ${accountAddress} owns ${ethers.getNumber(balance)} veNFTs.`,
        );
      }
      if (balance === 0n) {
        throw new Error("No veNFT to claim");
      }
      const tokenId = ethers.getNumber(
        await veContract.ownerToNFTokenIdList(accountAddress, 0),
      );

      address = getProtocolAddressForChain("aerodrome", chainId, "rewards");
      abi = getABIForProtocol("aerodrome", "rewards");
      params.push(tokenId);
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          ["deposit", "withdraw", "lock", "unlock", "claim"],
          "Aerodrome",
        ),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(
        action,
        tokenInfo?.symbol,
        "aerodrome",
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

const getPoolAddress = async (
  chainId: ChainId,
  provider: ethers.ContractRunner,
  token0: string,
  token1: string,
  feeTier: number,
) => {
  const factoryV3Address = getProtocolAddressForChain(
    "aerodrome",
    chainId,
    "factoryV3",
  );
  if (!factoryV3Address) {
    throw new Error("Could not find factory for Aerodrome");
  }
  const factoryV3Abi = getABIForProtocol("aerodrome", "factory-v3");
  const factoryV3 = new ethers.Contract(
    factoryV3Address,
    factoryV3Abi,
    provider,
  );
  return await factoryV3.getPool(token0, token1, feeTier);
};

const fillAmounts = (
  amount0: bigint,
  amount1: bigint,
  token0Decimal: number,
  token1Decimal: number,
  currentPrice: number,
) => {
  if (amount0 && !amount1) {
    return [
      amount0,
      sfParseUnits(
        Number.parseFloat(ethers.formatUnits(amount0, token0Decimal)) *
          currentPrice,
        token1Decimal,
      ),
    ];
  }
  if (!amount0 && amount1) {
    return [
      sfParseUnits(
        Number.parseFloat(ethers.formatUnits(amount1, token1Decimal)) /
          currentPrice,
        token0Decimal,
      ),
      amount1,
    ];
  }

  return [amount0, amount1];
};

async function adWithdraw(
  poolName: string | undefined,
  tokenInfo: TokenInfo | undefined,
  amount: bigint,
  tokenInfo2: TokenInfo | undefined,
  amount2: bigint | undefined,
  tokenName: string | undefined,
  wethInfo: TokenInfo | undefined,
  chainName: string | undefined,
  range: string | undefined,
  tokenId: string | undefined,
  address0: string | null,
  chainId: ChainId,
  abi0: ethers.InterfaceAbi,
  funcName0: string,
  provider: RetryProvider,
  isAllAmount0: boolean | undefined,
  liquidity0: number | undefined,
  liquidity1: number | undefined,
  accountAddress: string,
  params: ContractCallParam[],
  factoryAddress: string,
  aerodromeFactoryAbi: ethers.InterfaceAbi,
  aerodromePoolAbi: ethers.InterfaceAbi,
  approveTxs0: Transaction[],
) {
  let address = address0;
  let abi = abi0;
  let funcName = funcName0;
  let isAllAmount = isAllAmount0;
  let approveTxs = approveTxs0;
  try {
    if (!poolName) {
      throw new Error("The pool name must be provided.");
    }

    let token0: TokenInfo | undefined = tokenInfo;
    let amount0 = amount;
    let token1: TokenInfo | undefined;
    let amount1 = 0n;
    if (tokenInfo2 && amount2) {
      token1 = tokenInfo2;
      amount1 = amount2;
    } else {
      const tokenSymbols = splitPool(poolName);
      let token1Symbol =
        tokenSymbols[0] === tokenInfo?.symbol
          ? tokenSymbols[1]
          : tokenSymbols[0];
      if (
        tokenName?.toLowerCase() !== tokenSymbols[1].toLowerCase() &&
        tokenName?.toLowerCase() !== tokenSymbols[0].toLowerCase()
      ) {
        if (
          tokenInfo?.address === NATIVE_TOKEN &&
          (tokenSymbols[0].toLowerCase() === "weth" ||
            tokenSymbols[1].toLowerCase() === "weth")
        ) {
          token0 = wethInfo;
          token1Symbol =
            tokenSymbols[0] === token0?.symbol
              ? tokenSymbols[1]
              : tokenSymbols[0];
        } else {
          throw new Error(
            `Withdrawing from Aerodrome ${poolName} pool is not supported with ${tokenName}. Try withdrawing ${tokenSymbols[0].toLowerCase()} or ${tokenSymbols[1].toLowerCase()}.`,
          );
        }
      }
      token1 = await getTokenInfoForChain(token1Symbol, chainName, true);
    }

    let isToken0Eth = token0?.symbol.toLowerCase() === "eth";
    let isToken1Eth = token1?.symbol.toLowerCase() === "eth";
    const hasEth = isToken0Eth || isToken1Eth;

    const deadline = Math.floor(Date.now() / 1000) + 1200;

    if (range) {
      if (!tokenId) {
        throw new Error("The token id must be provided.");
      }

      address = getProtocolAddressForChain(
        "aerodrome",
        chainId,
        "positionManager",
      );
      if (!address) {
        throw new Error("Could not find position manager for Aerodrome");
      }
      abi = getABIForProtocol("aerodrome", "position-manager");
      funcName = "multicall";

      const manager = new ethers.Contract(address, abi, provider);
      const positionData = await manager.positions(tokenId);
      if (
        token0?.address?.toLowerCase() === positionData.token1.toLowerCase()
      ) {
        [token0, token1] = [token1, token0];
        [amount0, amount1] = [amount1, amount0];
        [isToken0Eth, isToken1Eth] = [isToken1Eth, isToken0Eth];
      }

      let lpAmount: bigint;
      if (isAllAmount) {
        lpAmount = positionData.liquidity;
      } else {
        let lpAmount0 = 0n;
        let lpAmount1 = 0n;
        if (amount0 && liquidity0) {
          lpAmount0 =
            (amount0 * positionData.liquidity) / getBigInt(liquidity0);
        }
        if (amount1 && liquidity1) {
          lpAmount1 =
            (amount1 * positionData.liquidity) / getBigInt(liquidity1);
        }
        if (lpAmount0 && lpAmount1) {
          lpAmount = lpAmount0 > lpAmount1 ? lpAmount1 : lpAmount0;
        } else if (lpAmount0) {
          lpAmount = lpAmount0;
        } else {
          lpAmount = lpAmount1;
        }
        if (liquidity0) {
          amount0 = (getBigInt(liquidity0) * lpAmount) / positionData.liquidity;
        }
        if (liquidity1) {
          amount1 = (getBigInt(liquidity1) * lpAmount) / positionData.liquidity;
        }
      }
      if (lpAmount === positionData.liquidity) {
        isAllAmount = true;
      }

      const multicallParams: string[] = [];

      const decreaseLiquidityParams = [
        {
          tokenId,
          liquidity: lpAmount,
          amount0Min: 0,
          amount1Min: 0,
          deadline,
        },
      ];
      const { data: decreaseLiquidityCalldata } = await getFunctionData(
        address,
        abi,
        "decreaseLiquidity",
        decreaseLiquidityParams,
      );

      multicallParams.push(decreaseLiquidityCalldata);

      const collectParams = [
        {
          tokenId,
          recipient: hasEth ? ZeroAddress : accountAddress,
          amount0Max: maxUint128,
          amount1Max: maxUint128,
        },
      ];
      const { data: collectCalldata } = await getFunctionData(
        address,
        abi,
        "collect",
        collectParams,
      );

      multicallParams.push(collectCalldata);
      const nonEthToken = isToken0Eth ? token1 : token0;
      if (!nonEthToken) {
        throw new Error("Required token information is missing");
      }
      if (hasEth) {
        const { data: unwrapWETHCallData } = await getFunctionData(
          address,
          abi,
          "unwrapWETH9",
          [
            (getBigInt(isToken0Eth ? amount0 : amount1) * 99n) / 100n,
            accountAddress,
          ],
        );
        const { data: sweepTokenCalldata } = await getFunctionData(
          address,
          abi,
          "sweepToken",
          [
            nonEthToken.address,
            ((isToken0Eth ? amount1 : amount0) * 99n) / 100n,
            accountAddress,
          ],
        );
        multicallParams.push(unwrapWETHCallData, sweepTokenCalldata);
      }

      params.push(multicallParams);

      throw new Unwind(Flow.Break, "ad/withdraw");
    }

    address = getProtocolAddressForChain("aerodrome", chainId);
    if (!address) {
      throw new Error("Could not find address for Aerodrome");
    }
    abi = getABIForProtocol("aerodrome");

    const routerContract = new ethers.Contract(address, abi, provider);
    const weth = await routerContract.weth();
    const factoryContract = new ethers.Contract(
      factoryAddress,
      aerodromeFactoryAbi,
      provider,
    );
    const stable = isStable(token0?.symbol) && isStable(token1?.symbol);
    const poolAddr = await factoryContract["getPool(address,address,bool)"](
      token0?.address === NATIVE_TOKEN ? weth : token0?.address,
      token1?.address === NATIVE_TOKEN ? weth : token1?.address,
      stable,
    );
    if (poolAddr === NATIVE_TOKEN) {
      throw new Error("Pool does not exist");
    }

    const poolContract = new ethers.Contract(
      poolAddr,
      aerodromePoolAbi,
      provider,
    );

    let lpAmount: bigint;
    if (isAllAmount) {
      lpAmount = await poolContract.balanceOf(accountAddress);
    } else {
      const [token0Addr, token1Addr, [reserve0, reserve1], totalSupply] =
        await Promise.all([
          poolContract.token0(),
          poolContract.token1(),
          poolContract.getReserves(),
          poolContract.totalSupply(),
        ]);

      if (
        token0?.address?.toLowerCase() === token0Addr.toLowerCase() ||
        token1?.address?.toLowerCase() === token1Addr.toLowerCase()
      ) {
        if (!amount2) {
          if (!reserve0) {
            throw new Error(
              "Aerodrome failed to return swap data for this swap, please try again.",
            );
          }
          amount1 = (amount0 * reserve1) / reserve0;
        }
      } else {
        [token0, token1] = [token1, token0];
        [isToken0Eth, isToken1Eth] = [isToken1Eth, isToken0Eth];
        if (!amount2) {
          amount1 = amount0;
          if (!reserve1) {
            throw new Error(
              "Aerodrome failed to return swap data for this swap, please try again.",
            );
          }
          amount0 = (amount1 * reserve0) / reserve1;
        } else {
          [amount0, amount1] = [amount1, amount0];
        }
      }

      const lpAmount0 = (amount0 * totalSupply) / reserve0;
      const lpAmount1 = (amount1 * totalSupply) / reserve1;
      lpAmount = lpAmount0 > lpAmount1 ? lpAmount0 : lpAmount1;
    }
    if (hasEth) {
      const firstParam = isToken0Eth ? token1?.address : token0?.address;
      if (!firstParam) {
        throw new Error("Token addresses are required for Aerodrome withdraw");
      }
      // removeLiquidityETH
      funcName = "removeLiquidityETH";
      params.push(firstParam);
      params.push(stable);
      params.push(lpAmount);
      params.push(0);
      params.push(0);
    } else {
      if (!token0?.address || !token1?.address) {
        throw new Error("Token addresses are required for Aerodrome withdraw");
      }
      // removeLiquidity
      funcName = "removeLiquidity";
      params.push(token0.address);
      params.push(token1.address);
      params.push(stable);
      params.push(lpAmount);
      params.push(0);
      params.push(0);
    }
    approveTxs = await getApproveData(
      provider,
      {
        address: poolAddr,
        symbol: "AERO",
      },
      lpAmount,
      accountAddress,
      address,
    );
    params.push(accountAddress);
    params.push(deadline);
  } catch (o) {
    if (
      o instanceof Unwind &&
      o.label === "ad/withdraw" &&
      o.flow === Flow.Break
    )
      noop();
    throw o;
  }
  return { address, abi, funcName, isAllAmount, approveTxs };
}

async function adDeposit(
  poolName: string | undefined,
  tokenInfo: TokenInfo | undefined,
  amount: bigint,
  tokenInfo2: TokenInfo | undefined,
  amount2: bigint | undefined,
  tokenName: string | undefined,
  wethInfo: TokenInfo | undefined,
  wrapData0: Transaction | undefined,
  approveInfo: {
    spender: string;
    tokenInfo: TokenInfo | undefined;
    amount: bigint;
  },
  chainName: string | undefined,
  range: string | undefined,
  address0: string | null,
  chainId: ChainId,
  abi0: ethers.InterfaceAbi,
  provider: RetryProvider,
  tokenId: string | undefined,
  accountAddress: string,
  funcName0: string,
  params: ContractCallParam[],
  value0: number | bigint,
  approveTxs0: Transaction[],
  factoryAddress: string,
  aerodromeFactoryAbi: ethers.InterfaceAbi,
  aerodromePoolAbi: ethers.InterfaceAbi,
) {
  let wrapData = wrapData0;
  let address = address0;
  let abi = abi0;
  let funcName = funcName0;
  let value = value0;
  let approveTxs = approveTxs0;
  try {
    if (!poolName) {
      throw new Error(
        "Missing a pool to deposit into on Aerodrome. The pool name should be token-token format.",
      );
    }

    let token0: TokenInfo | undefined = tokenInfo;
    let amount0 = amount;
    let token1: TokenInfo | undefined;
    let amount1 = 0n;
    if (tokenInfo2 && amount2) {
      token1 = tokenInfo2;
      amount1 = amount2;
    } else {
      const tokenSymbols = splitPool(poolName);
      let token1Symbol =
        tokenSymbols[0] === tokenInfo?.symbol
          ? tokenSymbols[1]
          : tokenSymbols[0];
      if (
        tokenName?.toLowerCase() !== tokenSymbols[1].toLowerCase() &&
        tokenName?.toLowerCase() !== tokenSymbols[0].toLowerCase()
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
            `Depositing into Aerodrome ${poolName} pool is not supported with ${tokenName}. Try depositing ${tokenSymbols[0].toLowerCase()} or ${tokenSymbols[1].toLowerCase()}.`,
          );
        }
      }
      token1 = await getTokenInfoForChain(token1Symbol, chainName, true);
    }

    const deadline = Math.floor(Date.now() / 1000) + 1200;

    if (range) {
      address = getProtocolAddressForChain(
        "aerodrome",
        chainId,
        "positionManager",
      );
      if (!address) {
        throw new Error("Could not find position manager for Aerodrome");
      }
      abi = getABIForProtocol("aerodrome", "position-manager");
      const manager = new ethers.Contract(address, abi, provider);
      const WETH = (await manager.WETH9()).toLowerCase();
      const poolV3Abi = getABIForProtocol("aerodrome", "pool-v3");

      if (!tokenId) {
        // mint & add liquidity to v3
        let token0Address =
          token0?.symbol.toLowerCase() === "eth"
            ? WETH
            : token0?.address?.toLowerCase();
        let token1Address =
          token1?.symbol.toLowerCase() === "eth"
            ? WETH
            : token1?.address?.toLowerCase();
        if (token0Address > token1Address) {
          [token0Address, token1Address] = [token1Address, token0Address];
          [token0, token1] = [token1, token0];
          [amount0, amount1] = [amount1, amount0];
        }

        const tickSpacings = [1, 50, 100, 200, 2000];
        let tickSpacing = 0;
        let poolAddr: string | undefined;

        const poolAddresses = await Promise.all(
          tickSpacings.map((tick) =>
            getPoolAddress(
              chainId,
              provider,
              token0Address,
              token1Address,
              tick,
            ),
          ),
        );

        const validPoolIndex = poolAddresses.findIndex(
          (addr) => addr && addr !== NATIVE_TOKEN,
        );

        if (validPoolIndex !== -1) {
          tickSpacing = tickSpacings[validPoolIndex];
          poolAddr = poolAddresses[validPoolIndex];
        }
        if (!poolAddr) {
          throw new Error("Pool address is undefined");
        }
        const poolContract = new ethers.Contract(poolAddr, poolV3Abi, provider);
        const slot0Data = await poolContract.slot0();
        const currentTick = Number.parseFloat(slot0Data[1].toString());
        const currentPrice = tickToPrice(
          currentTick,
          token0?.decimals,
          token1?.decimals,
        );
        const lowerPrice =
          (currentPrice * (100 - Number.parseFloat(range))) / 100.0;
        const upperPrice =
          (currentPrice * (100 + Number.parseFloat(range))) / 100.0;
        let tickLower = priceToTick(
          lowerPrice,
          token0?.decimals,
          token1?.decimals,
        );
        let tickUpper = priceToTick(
          upperPrice,
          token0?.decimals,
          token1?.decimals,
        );
        tickLower = Math.floor(tickLower / tickSpacing) * tickSpacing;
        tickUpper = Math.floor(tickUpper / tickSpacing) * tickSpacing;

        [amount0, amount1] = fillAmounts(
          amount0,
          amount1,
          token0?.decimals || 18,
          token1?.decimals || 18,
          currentPrice,
        );

        const mintParams = {
          token0: token0Address,
          token1: token1Address,
          tickSpacing,
          tickLower,
          tickUpper,
          amount0Desired: amount0,
          amount1Desired: amount1,
          amount0Min: 0,
          amount1Min: 0,
          recipient: accountAddress,
          deadline,
          sqrtPriceX96: 0,
        };

        funcName = "mint";
        params.push(mintParams);
      } else {
        // increase liquidity
        funcName = "multicall";

        const positionData = await manager.positions(tokenId);
        if (
          token0?.address?.toLowerCase() ===
            positionData.token1.toLowerCase() ||
          (token0?.symbol.toLowerCase() === "eth" &&
            positionData.token1.toLowerCase() === WETH)
        ) {
          [token0, token1] = [token1, token0];
          [amount0, amount1] = [amount1, amount0];
        }
        const poolAddr = await getPoolAddress(
          chainId,
          provider,
          positionData.token0,
          positionData.token1,
          positionData.fee,
        );
        const poolContract = new ethers.Contract(poolAddr, poolV3Abi, provider);
        const currentTick = Number.parseFloat(
          (await poolContract.slot0())[1].toString(),
        );
        const currentPrice = tickToPrice(
          currentTick,
          token0?.decimals,
          token1?.decimals,
        );
        [amount0, amount1] = fillAmounts(
          amount0,
          amount1,
          token0?.decimals || 18,
          token1?.decimals || 18,
          currentPrice,
        );

        const increaseLiquidityParams = [
          {
            tokenId,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: 0,
            amount1Min: 0,
            deadline,
          },
        ];
        const { data: increaseLiquidityCalldata } = await getFunctionData(
          address,
          abi,
          "increaseLiquidity",
          increaseLiquidityParams,
        );
        params.push([increaseLiquidityCalldata]);
      }

      const isToken0Eth = token0?.symbol.toLowerCase() === "eth";
      const isToken1Eth = token1?.symbol.toLowerCase() === "eth";
      const hasEth = isToken0Eth || isToken1Eth;
      if (hasEth) {
        approveInfo.spender = address;
        approveInfo.amount = isToken0Eth ? amount1 : amount0;
        approveInfo.tokenInfo = isToken0Eth ? token1 : token0;

        value = isToken0Eth ? amount0 : amount1;
      } else {
        const approveTx0 = await getApproveData(
          provider,
          token0,
          amount0,
          accountAddress,
          address,
        );
        const approveTx1 = await getApproveData(
          provider,
          token1,
          amount1,
          accountAddress,
          address,
        );
        approveTxs = [...approveTx0, ...approveTx1];
      }

      throw new Unwind(Flow.Break, "ad/deposit");
    }

    // support for multi sided deposit
    address = getProtocolAddressForChain("aerodrome", chainId);
    if (!address) {
      throw new Error("Could not find address for Aerodrome");
    }
    abi = getABIForProtocol("aerodrome");

    const routerContract = new ethers.Contract(address, abi, provider);
    const weth = await routerContract.weth();
    const factoryContract = new ethers.Contract(
      factoryAddress,
      aerodromeFactoryAbi,
      provider,
    );
    const stable = isStable(token0?.symbol) && isStable(token1?.symbol);
    const poolAddr = await factoryContract["getPool(address,address,bool)"](
      token0?.address === NATIVE_TOKEN ? weth : token0?.address,
      token1?.address === NATIVE_TOKEN ? weth : token1?.address,
      stable,
    );
    if (poolAddr === NATIVE_TOKEN) {
      throw new Error("Pool does not exist");
    }

    const { amount: balance } = await getTokenAmount(
      provider,
      token1,
      accountAddress,
    );

    const poolContract = new ethers.Contract(
      poolAddr,
      aerodromePoolAbi,
      provider,
    );

    const [token0Addr, token1Addr, [reserve0, reserve1]] = await Promise.all([
      poolContract.token0(),
      poolContract.token1(),
      poolContract.getReserves(),
    ]);
    // sort tokens, calc second token amount for deposit
    if (
      token0?.address?.toLowerCase() === token0Addr.toLowerCase() ||
      token1?.address?.toLowerCase() === token1Addr.toLowerCase()
    ) {
      if (!amount2) {
        if (!reserve0) {
          throw new Error(
            "Aerodrome failed to return swap data for this swap, please try again.",
          );
        }
        amount1 = (amount0 * reserve1) / reserve0;
        amount1 = (amount1 * 101n) / 100n; // consider slippage
      }
      if (amount1 > balance) {
        throw new Error(
          `Insufficient ${token1?.symbol} balance to deposit on ${chainName}. Please onboard ${ethers.formatUnits(amount1 - balance, token1?.decimals)} more ${token1?.symbol} and try again.`,
        );
      }
    } else {
      [token0, token1] = [token1, token0];
      if (!amount2) {
        amount1 = amount0;
        if (!reserve1) {
          throw new Error(
            "Aerodrome failed to return swap data for this swap, please try again.",
          );
        }
        amount0 = (amount1 * reserve0) / reserve1;
        amount0 = (amount0 * 101n) / 100n; // consider slippage
      } else {
        [amount0, amount1] = [amount1, amount0];
      }
      if (amount0 > balance) {
        throw new Error(
          `Insufficient ${token0?.symbol} balance to deposit on ${chainName}. Please onboard ${ethers.formatUnits(amount0 - balance, token0?.decimals)} more ${token0?.symbol} and try again.`,
        );
      }
    }
    if (!token0?.address || !token1?.address) {
      throw new Error("Token addresses are required for Aerodrome deposit");
    }
    const isToken0Eth = token0?.symbol.toLowerCase() === "eth";
    const isToken1Eth = token1?.symbol.toLowerCase() === "eth";
    const hasEth = isToken0Eth || isToken1Eth;
    if (hasEth) {
      // addLiquidityETH
      funcName = "addLiquidityETH";
      value = isToken0Eth ? amount0 : amount1;
      params.push(isToken0Eth ? token1?.address : token0?.address);
      params.push(stable);
      params.push(isToken0Eth ? amount1 : amount0);
      params.push(0);
      params.push(0);

      approveInfo.spender = address;
      approveInfo.amount = isToken0Eth ? amount1 : amount0;
      approveInfo.tokenInfo = isToken0Eth ? token1 : token0;
    } else {
      // addLiquidity
      funcName = "addLiquidity";
      params.push(token0?.address);
      params.push(token1?.address);
      params.push(stable);
      params.push(amount0);
      params.push(amount1);
      params.push(0);
      params.push(0);

      const approveTx0 = await getApproveData(
        provider,
        token0,
        amount0,
        accountAddress,
        address,
      );
      const approveTx1 = await getApproveData(
        provider,
        token1,
        amount1,
        accountAddress,
        address,
      );
      approveTxs = [...approveTx0, ...approveTx1];
    }
    params.push(accountAddress);
    params.push(deadline);
  } catch (o) {
    if (
      o instanceof Unwind &&
      o.label === "ad/deposit" &&
      o.flow === Flow.Break
    )
      noop();
    throw o;
  }
  return { wrapData, address, abi, funcName, value, approveTxs };
}
