/* eslint-disable no-await-in-loop */
import { ethers } from "ethers";
import request from "supertest";
import app from "../../app.js";
import { abis } from "../../config/abis.js";
import ChainIDs from "../../config/common/chainid.js";
import { getNoPositionError } from "../../utils/error.js";
import { getViemPublicClientFromEthers } from "../../utils/ethers2viem.js";
import {
  checkUniswapLikeDeposits,
  convertAmount,
  fromActions,
  getChainIdFromName,
  getCoinData,
  getEthBalanceForUser,
  getNativeTokenSymbolForChain,
  getOutputTokenSymbolForBridge,
  getPrevActionIndexes,
  getTokenFromOnChain,
  getTokenInfoForChain,
  isNaNValue,
  sfParseUnits,
} from "../../utils/index.js";
import { getGMXPositions, getPoolData } from "../../utils/protocols/gmx.js";
import {
  getAlternativeChain,
  getBorrowableAmountForToken,
  getTokensForAction,
} from "../../utils/protocols/index.js";
import { RetryProvider } from "../../utils/retryProvider.js";
import { checkPrevActions } from "../../utils/simulate.js";
import type {
  GMXPosition,
  JSONObject,
  SimResultAction,
  TokenInfo,
} from "../../utils/types.js";
import {
  assert,
  type ChainId,
  isChainId,
  isDefined,
  isHexStr,
} from "../../utils/types.js";
import {
  createVnet,
  destroyVnet,
  duplicateVnet,
  increaseTokenBalance,
  runTxsOnVnet,
  setErc20Balance,
} from "../helper.js";
import { backendSecret } from "./common.js";

type TestToken = {
  chain: string;
  token: string;
};

export async function getTokenPrices(
  account: string,
  tokens: string[],
  chainId = 1,
) {
  const prices = await Promise.all(
    tokens.map((token) =>
      getCoinData(account, token, isChainId(chainId) ? chainId : undefined),
    ),
  );
  return prices.map(({ price }) => price || 1);
}

export async function test(
  accountAddress: string,
  actions: JSONObject[],
  connectedChainName: string,
  blockNumber: JSONObject,
  initialBalances: JSONObject = {},
  balanceChanges: JSONObject = {},
  amountUnitsCheck = false,
  chainAllTest: { token: string; chain: string } | undefined = undefined,
) {
  const initialTokens: TestToken[] = [];
  const checkTokens: TestToken[] = [];
  const actionData = actions;
  let chains = Object.keys(initialBalances);
  for (const chain of chains) {
    const tokens = Object.keys(initialBalances[chain]);
    for (const token of tokens) {
      initialTokens.push({ chain, token });
    }
  }

  chains = Object.keys(balanceChanges);
  for (const chain of chains) {
    const tokens = Object.keys(balanceChanges[chain]);
    for (const token of tokens) {
      checkTokens.push({ chain, token });
    }
  }

  await request(app).get("/status");

  const { vnetIds, rpcUrls } = await createVnets(blockNumber);
  const { vnetIds: vnetIds2, rpcUrls: rpcUrls2 } =
    await createVnets(blockNumber);

  const tokenInfos = await getTokenInfos(initialTokens, checkTokens);

  await topupBalances(
    accountAddress,
    vnetIds,
    rpcUrls,
    initialTokens,
    initialBalances,
    tokenInfos,
  );
  await topupBalances(
    accountAddress,
    vnetIds2,
    rpcUrls2,
    initialTokens,
    initialBalances,
    tokenInfos,
  );

  const beforeBalances = await getBalances(
    accountAddress,
    rpcUrls,
    checkTokens,
    tokenInfos,
  );

  const updatedActions = await simulate(
    accountAddress,
    actionData as SimResultAction[],
    connectedChainName,
    blockNumber,
    rpcUrls,
  );

  const hyperliquidActions = updatedActions.filter(
    (x) => x.args.protocolName === "hyperliquid",
  );
  if (hyperliquidActions.length > 0) {
    return;
  }

  await execute(
    accountAddress,
    updatedActions,
    vnetIds2,
    rpcUrls2,
    tokenInfos,
    blockNumber,
  );

  console.log("executed!");

  const afterBalances = await getBalances(
    accountAddress,
    rpcUrls2,
    checkTokens,
    tokenInfos,
  );

  checkBalances(
    updatedActions,
    beforeBalances,
    afterBalances,
    balanceChanges,
    tokenInfos,
    chainAllTest ? { ...chainAllTest, actions: updatedActions } : undefined,
  );

  if (amountUnitsCheck) {
    const token =
      actionData[0].args.token || actionData[0].args.inputToken || "";
    const beforeBalance = beforeBalances[connectedChainName][token];
    const afterBalance = afterBalances[connectedChainName][token];
    const delta = ethers.getBigInt(beforeBalance - afterBalance);
    const { decimals } = tokenInfos[connectedChainName][token];
    const convertedAmount = sfParseUnits(
      Number(
        await convertAmount({
          ...actionData[0].args,
          chainId: getChainIdFromName(
            actionData[0].args.chainName ||
              actionData[0].args.sourceChainName ||
              connectedChainName ||
              "1",
          ),
        }),
      ).toFixed(decimals),
      decimals,
    );
    expect(
      ethers.getNumber(
        ((delta > convertedAmount
          ? delta - convertedAmount
          : convertedAmount - delta) *
          100n) /
          convertedAmount,
      ),
    ).toBeLessThan(6);
  }

  if (rpcUrls[ChainIDs.zksync]) {
    await destroyVnet(rpcUrls[ChainIDs.zksync]);
  }
}

export async function testFail(
  accountAddress: string,
  actions: JSONObject[],
  connectedChainName: string,
  blockNumber: JSONObject,
  errMsg: RegExp | string | undefined = undefined,
  initialBalances: JSONObject = {},
) {
  const initialTokens: TestToken[] = [];
  const chains = Object.keys(initialBalances);
  for (const chain of chains) {
    const tokens = Object.keys(initialBalances[chain]);
    for (const token of tokens) {
      initialTokens.push({ chain, token });
    }
  }

  await request(app).get("/status");

  const { vnetIds, rpcUrls } = await createVnets(blockNumber);

  const tokenInfos = await getTokenInfos(initialTokens, []);

  await topupBalances(
    accountAddress,
    vnetIds,
    rpcUrls,
    initialTokens,
    initialBalances,
    tokenInfos,
  );

  const res = await request(app)
    .post(`/simulate?secret=${backendSecret}`)
    .send({
      actions,
      conditions: [],
      accountAddress,
      connectedChainName,
      blockNumber,
      rpcs: rpcUrls,
    });
  expect(res.statusCode).toEqual(400);
  expect(res.body).toHaveProperty("status", "error");
  expect(res.body).toHaveProperty("message");
  if (errMsg) {
    if (typeof errMsg === "string") {
      expect(res.body.message).toEqual(errMsg);
    } else if (errMsg instanceof RegExp) {
      expect(errMsg.test(res.body.message)).toEqual(true);
    }
  }
}

async function simulate(
  user: string,
  actions: SimResultAction[],
  connectedChainName: string,
  blockNumber: JSONObject,
  rpcUrls: JSONObject | undefined,
): Promise<SimResultAction[]> {
  const res = await request(app)
    .post(`/simulate?secret=${backendSecret}`)
    .send({
      actions,
      conditions: [],
      accountAddress: user,
      connectedChainName,
      blockNumber,
      rpcs: rpcUrls,
    });
  if (res.statusCode !== 200) console.log(res.body);
  else console.log(JSON.stringify(res.body.actions, null, 2));
  expect(res.statusCode).toEqual(200);
  expect(res.body).toHaveProperty("status", "success");
  expect(res.body).toHaveProperty("actions");
  expect(res.body.actions.length).toBeGreaterThan(0);

  return res.body.actions;
}

async function execute(
  accountAddress: string,
  actions: SimResultAction[],
  vnetIds: JSONObject,
  rpcUrls: JSONObject,
  tokenInfos: JSONObject,
  blockNumber: JSONObject,
) {
  for (let i = 0; i < actions.length; i++) {
    let token: string | { address: string } | undefined = "";
    let chainName: string | undefined;

    const action = actions[i];

    const curToken = (
      action.args.token1Address ||
      action.args.inputToken ||
      action.args.token ||
      ""
    ).toLowerCase();
    const token2 = (
      action.args.token2Address ||
      action.args.token2 ||
      ""
    ).toLowerCase();
    const sourceChainName =
      action.args.sourceChainName || action.args.chainName;
    chainName = sourceChainName;
    const chainId = getChainIdFromName(sourceChainName, true);
    if (!chainId) {
      throw new Error(`Invalid chain name: ${sourceChainName}`);
    }
    const nativeTokenSymbol =
      getNativeTokenSymbolForChain(chainId)?.toLowerCase();
    const protocol = action.args.protocolName?.toLowerCase() || "";

    let id = vnetIds[chainId];

    if (!id) {
      const { vnetId, rpcUrl } = await createVnet(chainId);
      vnetIds[chainId] = id = vnetId;
      rpcUrls[chainId] = rpcUrl;
    }

    const rpcUrl = rpcUrls[chainId];

    const provider = new RetryProvider(rpcUrl, chainId);

    if (sourceChainName) {
      if (
        !tokenInfos[sourceChainName] ||
        !tokenInfos[sourceChainName][curToken]
      ) {
        if (!tokenInfos[sourceChainName]) {
          tokenInfos[sourceChainName] = {};
        }

        tokenInfos[sourceChainName][curToken] = await getTokenInfoForChain(
          curToken,
          sourceChainName,
        );
      }
      if (token2) {
        if (
          !tokenInfos[sourceChainName] ||
          !tokenInfos[sourceChainName][token2]
        ) {
          if (!tokenInfos[sourceChainName]) {
            tokenInfos[sourceChainName] = {};
          }

          tokenInfos[sourceChainName][token2] = await getTokenInfoForChain(
            token2,
            sourceChainName,
          );
        }
      }
    }

    const amountKeys = ["amount", "amount2"];
    await loopAmtKeys(
      amountKeys,
      action,
      token2,
      curToken,
      tokenInfos,
      sourceChainName || "",
      protocol,
      accountAddress,
      provider,
      chainId,
      rpcUrls,
      rpcUrl,
      nativeTokenSymbol,
      actions,
      i,
    );

    let gmxPositions: GMXPosition[] = [];
    if (action.name === "close" && protocol === "gmx") {
      const outputToken = (
        action.args.outputToken || action.args.inputToken
      )?.toLowerCase();
      let poolData = getPoolData(chainId, `${outputToken}-usdc`);
      if (!poolData) {
        poolData = getPoolData(chainId, `usdc-${outputToken}`);
      }
      try {
        gmxPositions = await getGMXPositions(
          accountAddress,
          { chainId, provider },
          poolData,
        );
      } catch {
        /* empty */
      }
    }
    const res = await request(app)
      .post(`/${action.name}?secret=${backendSecret}`)
      .send({
        ...action.args,
        provider: undefined,
        rpc: rpcUrl,
        blockNumber:
          typeof blockNumber === "object" ? blockNumber[chainId] : blockNumber,
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    if (res.body.transactions.length === 0) {
      expect(Object.keys(res.body).includes("signData")).toEqual(true);
    }

    ({ token, chainName } = getTokenNChain(
      action,
      token,
      chainName,
      sourceChainName || "",
      protocol,
    ));
    if (!chainName) {
      throw new Error("Missing chain name");
    }
    const destChainId = getChainIdFromName(chainName);

    if (destChainId && !vnetIds[destChainId]) {
      const { vnetId, rpcUrl } = await createVnet(destChainId);
      vnetIds[destChainId] = vnetId;
      rpcUrls[destChainId] = rpcUrl;
    }

    const destProvider = !destChainId
      ? null
      : new RetryProvider(rpcUrls[destChainId], destChainId);

    if (destProvider) {
      await destProvider.ready;
    }

    let outTokenInfo: TokenInfo | undefined;
    if (typeof token === "object") {
      outTokenInfo = await getTokenFromOnChain(token.address, chainName);
    } else if (chainName && token) {
      if (!tokenInfos[chainName] || !tokenInfos[chainName][token]) {
        if (!tokenInfos[chainName]) {
          tokenInfos[chainName] = {};
        }

        tokenInfos[chainName][token] = await getTokenInfoForChain(
          token,
          chainName,
        );
      }

      outTokenInfo = tokenInfos[chainName][token];
    }

    let beforeBalance = 0n;
    if (destProvider)
      beforeBalance = await getTokenBalance(
        accountAddress,
        destProvider,
        outTokenInfo,
      );

    let success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
      { chainId, vnetId: id, action: action.name },
    );
    if (!success) {
      if (action.name === "swap" || action.name === "bridge") {
        for (let i = 1; i < (res.body.routes || []).length; i++) {
          success = await runTxsOnVnet(
            provider,
            accountAddress,
            res.body.routes[i],
            { chainId, vnetId: id, action: action.name },
          );
          if (success) break;
        }
      }
      if (!success) {
        console.log(
          "Simulation was successful but execution failed. Try again in few minutes.",
        );
      }
    }
    expect(success).toEqual(true);

    // increase token balance on destination chain
    await incBalOnDest(
      token,
      chainName,
      destChainId,
      action,
      rpcUrls,
      accountAddress,
      res,
      provider,
      chainId,
      outTokenInfo,
      protocol,
      tokenInfos,
      sourceChainName || "",
      curToken,
      gmxPositions,
    );

    let afterBalance = 0n;
    if (destProvider)
      afterBalance = await getTokenBalance(
        accountAddress,
        destProvider,
        outTokenInfo,
      );

    const outputAmount = afterBalance - beforeBalance;
    if (outputAmount > 0n) {
      action.args.outputAmount = ethers.formatUnits(
        outputAmount,
        outTokenInfo?.decimals,
      );
    }
  }
}

async function incBalOnDest(
  token: string | { address: string } | undefined,
  chainName: string,
  destChainId: ChainId | undefined,
  action: SimResultAction,
  rpcUrls: JSONObject,
  accountAddress: string,
  res: request.Response,
  provider: RetryProvider,
  chainId: ChainId,
  outTokenInfo: TokenInfo | undefined,
  protocol: string,
  tokenInfos: JSONObject,
  sourceChainName: string,
  curToken: string,
  gmxPositions: GMXPosition[],
) {
  const viemClient = await getViemPublicClientFromEthers(provider);
  if (token && chainName && destChainId) {
    if (action.name === "bridge") {
      await increaseTokenBalance(
        rpcUrls[destChainId],
        accountAddress,
        chainName,
        token,
        action.args.realAmount || action.args.amount || "0",
      );
    } else if (
      action.name === "swap" &&
      res.body.source === "cowswap" &&
      res.body.signData
    ) {
      const tokenInfo = await getTokenInfoForChain(
        action.args.inputToken,
        chainName,
      );
      if (tokenInfo?.address) {
        assert(isHexStr(tokenInfo.address));
        assert(isHexStr(accountAddress));
        const currentBalance = await viemClient.readContract({
          address: tokenInfo.address,
          abi: abis.erc20,
          functionName: "balanceOf",
          args: [accountAddress],
        });
        const newBalance =
          currentBalance - ethers.getBigInt(res.body.signData.quote.sellAmount);
        await setErc20Balance(
          provider,
          tokenInfo?.address,
          accountAddress,
          newBalance,
        );
        await increaseTokenBalance(
          rpcUrls[chainId],
          accountAddress,
          chainName,
          token,
          ethers.formatUnits(
            res.body.signData.quote.buyAmount,
            outTokenInfo?.decimals,
          ),
        );
      }
    } else if (
      action.name === "withdraw" &&
      protocol === "hyperliquid" &&
      res.body.signData
    ) {
      await increaseTokenBalance(
        rpcUrls[chainId],
        accountAddress,
        chainName,
        token,
        res.body.signData.amount,
      );
    } else if (
      action.name === "swap" &&
      protocol === "hyperliquid" &&
      res.body.signData
    ) {
      await increaseTokenBalance(
        rpcUrls[chainId],
        accountAddress,
        chainName,
        token,
        res.body.signData.outputAmount,
      );
    } else if (
      protocol === "gmx" &&
      ["withdraw", "close"].includes(action.name)
    ) {
      // mock gmx balance changes
      let amount: number | string =
        action.args.inputAmount || action.args.amount || "";
      let _tokenInfo = tokenInfos[sourceChainName][curToken];
      if (gmxPositions.length > 0) {
        _tokenInfo = await getTokenInfoForChain("usdc", sourceChainName);
        amount = gmxPositions.reduce(
          (a, b) =>
            a +
            +ethers.formatUnits(
              b.numbers.collateralAmount,
              _tokenInfo.decimals,
            ),
          0,
        );
        const price = (
          await getCoinData(accountAddress, _tokenInfo.symbol, chainId, false)
        ).price;
        assert(isDefined(price));
        if (!isNaNValue(price)) amount /= price;
        amount = amount.toLocaleString("fullwide", {
          useGrouping: false,
          minimumFractionDigits: _tokenInfo.decimals,
          maximumFractionDigits: _tokenInfo.decimals,
        });
      }

      assert(isHexStr(_tokenInfo.address));
      assert(isHexStr(accountAddress));
      const currentBalance = await viemClient.readContract({
        address: _tokenInfo.address,
        abi: abis.erc20,
        functionName: "balanceOf",
        args: [accountAddress],
      });
      const newBalance =
        currentBalance + sfParseUnits(amount, _tokenInfo.decimals);
      await setErc20Balance(
        provider,
        _tokenInfo.address,
        accountAddress,
        newBalance,
      );
    }
  }
}

function getTokenNChain(
  action: SimResultAction,
  token0: string | { address: string } | undefined,
  chainName0: string | undefined,
  sourceChainName: string,
  protocol: string,
) {
  let token = token0;
  let chainName = chainName0;
  if (
    action.name === "swap" ||
    action.name === "withdraw" ||
    action.name === "borrow" ||
    action.name === "claim" ||
    action.name === "bridge" ||
    action.name === "transfer"
  ) {
    token = action.args.outputToken || action.args.token;
    chainName = action.args.destinationChainName || action.args.chainName;
    if (action.name === "bridge") {
      token = getOutputTokenSymbolForBridge(
        token || "",
        sourceChainName,
        chainName || "",
      );
    } else if (action.name === "claim") {
      if (protocol === "jonesdao") token = "jones";
      else if (protocol === "lodestar") token = "weth";
      else if (protocol === "plutus") token = "plsDPX";
      else if (protocol === "stargate") token = "stg";
      if (!token || token === "any") {
        const pool = action.args.poolName?.toLowerCase();
        if (pool && pool !== "all" && pool !== "any")
          token = action.args.poolName;
      }
      action.args.token = token;
    }
  } else if (action.name === "deposit" && action.lp) {
    token = action.lp as { address: string };
    chainName = action.args.chainName;
  }
  return { token, chainName };
}

async function loopAmtKeys(
  amountKeys: string[],
  action: SimResultAction,
  token2: string,
  curToken: string,
  tokenInfos: JSONObject,
  sourceChainName: string,
  protocol: string,
  accountAddress: string,
  provider: RetryProvider,
  chainId: ChainId,
  rpcUrls: JSONObject,
  rpcUrl: string,
  nativeTokenSymbol: string | undefined,
  actions: SimResultAction[],
  i: number,
) {
  for (const amountKey of amountKeys) {
    if (amountKey === "amount2" && !action.args.token2) {
      continue;
    }
    if (
      action.name === "claim" &&
      (action.args.protocolName || "").toLowerCase() === "camelot"
    ) {
      continue;
    }

    const token_ = amountKey === "amount2" ? token2 : curToken;
    let tokenSymbol =
      amountKey === "amount2"
        ? action.args.token2?.toLowerCase()
        : (action.args.inputToken || action.args.token)?.toLowerCase();
    if (action.name === "close") {
      tokenSymbol = action.args.outputToken || tokenSymbol || "";
    }
    let tokenInfo = tokenInfos[sourceChainName][token_];
    if (action.name === "close" && !token_) {
      tokenInfo = await getTokenInfoForChain("usdc", sourceChainName, true);
    }
    const amount =
      action.args.inputAmount ||
      ((action.args as JSONObject)[amountKey] as string) ||
      "all";
    await checkForExecute(
      action,
      amount,
      protocol,
      accountAddress,
      provider,
      chainId,
      tokenSymbol || "",
      rpcUrls,
      sourceChainName,
      token_,
      rpcUrl,
      tokenInfo,
      nativeTokenSymbol,
      amountKey,
      actions,
      i,
      curToken,
    );
  }
}

async function checkForExecute(
  action: SimResultAction,
  amount: string,
  protocol: string,
  accountAddress: string,
  provider: RetryProvider,
  chainId: ChainId,
  tokenSymbol: string,
  rpcUrls: JSONObject,
  sourceChainName: string,
  token_: string,
  rpcUrl: string,
  tokenInfo: TokenInfo,
  nativeTokenSymbol: string | undefined,
  amountKey: string,
  actions: SimResultAction[],
  i: number,
  curToken: string,
) {
  if (action.name === "swap" && !isNaNValue(action.args.outputAmount)) {
    action.args.inputAmount = action.args.amount = undefined;
  } else if (isNaNValue(amount) && action.name !== "claim") {
    let newAmount = 0n;
    if (amount === "all" || amount === "half" || amount.endsWith("%")) {
      // get all balance first > newAmount
      newAmount = await handleSymAmount(
        protocol,
        newAmount,
        action,
        accountAddress,
        provider,
        chainId,
        tokenSymbol,
        rpcUrls,
        sourceChainName,
        token_,
        rpcUrl,
        tokenInfo,
        nativeTokenSymbol,
        amountKey,
        actions,
        i,
        amount,
      );
    } else {
      // sum up same token, same chain output amount from previous actions > prevAmount
      const prevActionIndexes = getPrevActionIndexes(actions, i);
      const startIndex =
        prevActionIndexes.length > 0
          ? prevActionIndexes[prevActionIndexes.length - 1]
          : 0;
      for (let j = startIndex; j >= 0; j--) {
        const { name, args } = actions[j];
        const _token = (args.outputToken || args.token || "").toLowerCase();
        if (
          action.args.protocolName?.toLowerCase() === "hyperliquid" &&
          action.name !== "deposit"
        ) {
          if (
            args.protocolName?.toLowerCase() !== "hyperliquid" ||
            ["long", "short"].includes(name)
          ) {
            break;
          }
          const key = name === "deposit" ? "amount" : "outputAmount";
          if (
            _token === "usdc" &&
            !isNaNValue(args[key]) &&
            !args.isOutAmountUsed
          ) {
            newAmount += sfParseUnits(args[key] || "0", tokenInfo?.decimals);
            args.outputAmount = undefined;
            if (name === "deposit") args.isOutAmountUsed = true;
          }
        } else {
          const _chainName = (
            args.destinationChainName || args.chainName
          )?.toLowerCase();
          if (sourceChainName.toLowerCase() !== _chainName) {
            break;
          }
          if (tokenSymbol === _token && !isNaNValue(args.outputAmount)) {
            const amountIncrease = sfParseUnits(
              (+(args.outputAmount || "0")).toFixed(tokenInfo.decimals),
              tokenInfo.decimals,
            );
            newAmount += (amountIncrease * 999999n) / 1000000n;
            args.outputAmount = undefined;
          }
        }
      }
      if (newAmount === 0n) {
        // if no amount for same token, sum up wrap applied token, same chain output amount from previous actions > prevAmount
        for (let j = startIndex; j >= 0; j--) {
          const { args } = actions[j];
          const _token = (args.outputToken || args.token || "").toLowerCase();
          const _chainName = (
            args.destinationChainName || args.chainName
          )?.toLowerCase();
          if (sourceChainName.toLowerCase() !== _chainName) {
            break;
          }
          if (
            (`w${tokenSymbol}` === _token || tokenSymbol === `w${_token}`) &&
            !isNaNValue(args.outputAmount)
          ) {
            const amountIncrease = sfParseUnits(
              (+(args.outputAmount || "0")).toFixed(tokenInfo.decimals),
              tokenInfo.decimals,
            );
            newAmount += (amountIncrease * 999999n) / 1000000n;
            args.outputAmount = undefined;
          }
        }
      }
    }

    if (newAmount > 0n) {
      const newAmountStr = ethers.formatUnits(newAmount, tokenInfo?.decimals);
      if (action.args.inputAmount) action.args.inputAmount = newAmountStr;
      if (amountKey in action.args)
        (action.args as JSONObject)[amountKey] = newAmountStr;
    } else if (amountKey !== "amount2") {
      const errorMsg = checkPrevActions(
        actions,
        i,
        action,
        curToken,
        sourceChainName,
        tokenSymbol,
      );
      throw new Error(errorMsg);
    }
  }
}

async function handleSymAmount(
  protocol: string,
  newAmount0: bigint,
  action: SimResultAction,
  accountAddress: string,
  provider: RetryProvider,
  chainId: ChainId,
  tokenSymbol: string,
  rpcUrls: JSONObject,
  sourceChainName: string,
  token_: string,
  rpcUrl: string,
  tokenInfo: TokenInfo,
  nativeTokenSymbol: string | undefined,
  amountKey: string,
  actions: SimResultAction[],
  i: number,
  amount: string,
) {
  let newAmount = newAmount0;
  if (protocol === "etherfi") {
    newAmount = 1n;
  } else if (fromActions.includes(action.name)) {
    let tokens = await getTokensForAction(
      accountAddress,
      action.name,
      action.args,
      { provider, chainId },
    );
    const temp = tokens.filter(
      (x) => x.symbol.toLowerCase() === tokenSymbol.toLowerCase(),
    );
    if (temp.length > 0) tokens = temp;
    if (tokens.length === 0) {
      const { chains } = await getAlternativeChain(
        accountAddress,
        action,
        chainId,
        rpcUrls,
      );
      throw new Error(
        getNoPositionError(
          action.name,
          sourceChainName,
          chains,
          undefined,
          tokenSymbol,
          tokens.map((x) => x.symbol),
        ),
      );
    }
    newAmount = tokens[0].amount;
  } else if (action.name === "borrow") {
    const borrowableAmount = await getBorrowableAmountForToken(
      chainId,
      protocol,
      accountAddress,
      token_,
      rpcUrl,
      action.args.poolName?.toLowerCase(),
    );
    newAmount = sfParseUnits(borrowableAmount, tokenInfo.decimals);
  } else if (action.name !== "swap" || !action.args.outputAmount) {
    if (!tokenInfo) {
      throw new Error(`Token ${tokenSymbol} not found on ${sourceChainName}.`);
    }
    try {
      if (tokenInfo.symbol.toLowerCase() === nativeTokenSymbol) {
        const ethBalance = await getEthBalanceForUser(
          chainId,
          accountAddress,
          rpcUrl,
        );
        newAmount = ethBalance;
      } else {
        assert(isHexStr(tokenInfo.address));
        assert(isHexStr(accountAddress));
        const tokenBalance = await (
          await getViemPublicClientFromEthers(provider)
        ).readContract({
          address: tokenInfo.address,
          abi: abis.erc20,
          functionName: "balanceOf",
          args: [accountAddress],
        });
        newAmount = tokenBalance;
        (action.args as JSONObject)[amountKey] = ethers.formatUnits(
          newAmount,
          tokenInfo.decimals,
        );
      }
    } catch (err) {
      console.log(err);
      throw new Error(`Cannot fill amount for ${tokenSymbol} token:`);
    }
  }
  if (newAmount === 0n) {
    // sum up same token, same chain output amount from previous actions in sequence > prevAmount
    let prevActionIndexes = getPrevActionIndexes(actions, i);
    let j = 0;
    let count = 0;
    while (j < prevActionIndexes.length) {
      const { args } = actions[prevActionIndexes[j]];
      const _token = (args.outputToken || args.token || "").toLowerCase();
      const _chainName = args.destinationChainName || args.chainName;
      if (sourceChainName.toLowerCase() !== _chainName?.toLowerCase()) {
        break;
      }
      if (tokenSymbol === _token && !isNaNValue(args.outputAmount)) {
        count++;
        const amountIncrease = sfParseUnits(
          (+(args.outputAmount || "0")).toFixed(tokenInfo.decimals),
          tokenInfo.decimals,
        );
        newAmount += (amountIncrease * 999999n) / 1000000n;
        if (amount !== "half") {
          args.outputAmount = undefined;
        } else {
          args.outputAmount = ethers.formatUnits(
            amountIncrease / 2n,
            tokenInfo.decimals,
          );
        }
      }
      j++;
      if (j === prevActionIndexes.length && count > 0) {
        j = 0;
        count = 0;
        prevActionIndexes = getPrevActionIndexes(actions, prevActionIndexes[0]);
      }
    }
    if (newAmount === 0n) {
      // if no amount for same token, sum up wrap applied token, same chain output amount from previous actions in sequence > prevAmount
      prevActionIndexes = getPrevActionIndexes(actions, i);
      j = 0;
      count = 0;
      while (j < prevActionIndexes.length) {
        const { args } = actions[prevActionIndexes[j]];
        const _token = (args.outputToken || args.token || "").toLowerCase();
        const _chainName = args.destinationChainName || args.chainName;
        if (sourceChainName.toLowerCase() !== _chainName?.toLowerCase()) {
          break;
        }
        if (
          (`w${tokenSymbol}` === _token || tokenSymbol === `w${_token}`) &&
          !isNaNValue(args.outputAmount)
        ) {
          count++;
          const amountIncrease = sfParseUnits(
            (+(args.outputAmount || "0")).toFixed(tokenInfo.decimals),
            tokenInfo.decimals,
          );
          newAmount += (amountIncrease * 999999n) / 1000000n;
          if (amount !== "half") {
            args.outputAmount = undefined;
          } else {
            args.outputAmount = ethers.formatUnits(
              amountIncrease / 2n,
              tokenInfo.decimals,
            );
          }
        }
        j++;
        if (j === prevActionIndexes.length && count > 0) {
          j = 0;
          count = 0;
          prevActionIndexes = getPrevActionIndexes(
            actions,
            prevActionIndexes[0],
          );
        }
      }
    }
  }
  if (amount === "all") {
    /* empty */
  } else if (amount === "half") {
    newAmount =
      (newAmount * ((await checkUniswapLikeDeposits(actions, i)) ? 49n : 50n)) /
      100n;
  } else {
    let percent = Number.parseFloat(amount.slice(0, -1));
    percent = Math.round(percent * 100);
    newAmount = (newAmount * ethers.getBigInt(percent)) / 10000n;
  }
  return newAmount;
}

async function getTokenInfos(
  initialTokens: { chain: string; token: string }[],
  checkTokens: { chain: string; token: string }[],
) {
  const tokenInfos: JSONObject = {};
  const data = [...initialTokens];

  for (const { chain, token } of checkTokens) {
    if (
      !initialTokens.find(
        (data) => data.chain === chain && data.token === token,
      )
    ) {
      data.push({ chain, token });
    }
  }

  const results = await Promise.all(
    data.map(({ chain, token }) => getTokenInfoForChain(token, chain)),
  );

  results.forEach((result, index) => {
    const { chain, token } = data[index];

    if (!tokenInfos[chain]) {
      tokenInfos[chain] = {};
    }

    tokenInfos[chain][token] = result;
  });

  return tokenInfos;
}

async function topupBalances(
  account: string,
  vnetIds: JSONObject,
  rpcUrls: JSONObject,
  initialTokens: { chain: string; token: string }[],
  initialBalances: JSONObject,
  tokenInfos: JSONObject,
) {
  const data: { chain: string; token: string; rpc: string }[] = [];

  for (const { chain, token } of initialTokens) {
    const chainId = getChainIdFromName(chain);
    if (!chainId) {
      throw new Error(`Invalid chain name: ${chain}`);
    }
    const id = vnetIds[chainId];
    let rpc = rpcUrls[chainId];
    if (!id) {
      const { vnetId, rpcUrl } = await createVnet(chainId);
      vnetIds[chainId] = vnetId;
      rpcUrls[chainId] = rpc = rpcUrl;
    }

    data.push({ chain, token, rpc });
  }

  const currentBalances = await getBalances(
    account,
    rpcUrls,
    initialTokens,
    tokenInfos,
  );

  for (const { chain, token, rpc } of data) {
    await increaseTokenBalance(
      rpc,
      account,
      chain,
      token,
      initialBalances[chain][token].toString(),
      tokenInfos[chain][token],
      currentBalances[chain][token],
    );
  }
}

async function getBalances(
  account: string,
  rpcUrls: JSONObject,
  tokens: { chain: string; token: string }[],
  tokenInfos: JSONObject,
) {
  const balances: JSONObject = {};
  const data: {
    chain: string;
    token: string;
    provider: RetryProvider;
  }[] = [];

  for (const { chain, token } of tokens) {
    const chainId = getChainIdFromName(chain);
    if (!chainId) {
      throw new Error(`Invalid chain name: ${chain}`);
    }
    const provider = new RetryProvider(rpcUrls[chainId], chainId);
    await provider.ready;
    data.push({ chain, token, provider });
  }

  const results = await Promise.all(
    data.map(({ chain, token, provider }) =>
      getTokenBalance(account, provider, tokenInfos[chain][token]),
    ),
  );

  results.forEach((result, index) => {
    const { chain, token } = data[index];

    if (!balances[chain]) {
      balances[chain] = {};
    }

    balances[chain][token] = result;
  });

  return balances;
}

async function getTokenBalance(
  account: string,
  provider: RetryProvider,
  tokenInfo: TokenInfo | undefined,
) {
  if (!tokenInfo || !tokenInfo.address) return 0n;
  const nativeTokenSymbol = getNativeTokenSymbolForChain(
    Number((await provider.getNetwork()).chainId),
  )?.toLowerCase();
  if (tokenInfo.symbol.toLowerCase() === nativeTokenSymbol) {
    return await provider.getBalance(account);
  }
  assert(isHexStr(tokenInfo.address));
  assert(isHexStr(account));
  return await (await getViemPublicClientFromEthers(provider)).readContract({
    address: tokenInfo.address,
    abi: abis.erc20,
    functionName: "balanceOf",
    args: [account],
  });
}

function checkBalances(
  actions: SimResultAction[],
  beforeBalances: JSONObject,
  afterBalances: JSONObject,
  balanceChanges: JSONObject,
  tokenInfos: JSONObject,
  chainAllTest:
    | { actions: SimResultAction[]; chain: string; token: string }
    | undefined,
) {
  let chains = Object.keys(balanceChanges);
  if (chainAllTest) {
    const passedChains = chainAllTest.actions.map(
      (x) => x.args.sourceChainName,
    );
    let balance = 0;
    for (const chain of chains) {
      if (!passedChains.includes(chain) || chain === chainAllTest.chain) {
        if (chain !== chainAllTest.chain) {
          delete balanceChanges[chain];
        }
        continue;
      }
      const tokenInfo = tokenInfos[chain]?.[chainAllTest.token];
      balance += +ethers.formatUnits(
        beforeBalances[chain][chainAllTest.token],
        tokenInfo.decimals || 18,
      );
    }
    balanceChanges[chainAllTest.chain][chainAllTest.token] = balance;
  }
  chains = Object.keys(balanceChanges);
  for (let i = 0; i < chains.length; i++) {
    const chain = chains[i];
    const chainId = getChainIdFromName(chain);
    if (!chainId) {
      throw new Error(`Invalid chain name: ${chain}`);
    }
    const nativeTokenSymbol =
      getNativeTokenSymbolForChain(chainId)?.toLowerCase();
    const tokens = Object.keys(balanceChanges[chain]);
    for (let j = 0; j < tokens.length; j++) {
      const token = tokens[j];
      const tokenInfo = tokenInfos[chain][token];
      if (!tokenInfo) continue;
      if (tokenInfo.symbol.toLowerCase() === nativeTokenSymbol) {
        console.log("skip native token slippage check due to gas usage");
        continue;
      }

      const isCowUsed = actions.find(
        (x) =>
          x.name === "swap" &&
          x.args.provider === "cowswap" &&
          x.args.chainName?.toLowerCase() === chain.toLowerCase() &&
          (x.args.inputToken?.toLowerCase() ===
            tokenInfo.symbol.toLowerCase() ||
            x.args.inputToken?.toLowerCase() ===
              tokenInfo.address.toLowerCase() ||
            x.args.outputToken?.toLowerCase() ===
              tokenInfo.symbol.toLowerCase() ||
            x.args.outputToken?.toLowerCase() ===
              tokenInfo.address.toLowerCase()),
      );
      if (isCowUsed) continue;
      if (actions.find((x) => x.name === "close")) continue;

      const beforeBalance = beforeBalances[chain][token];
      const afterBalance = afterBalances[chain][token];
      const change = balanceChanges[chain][token];

      if (typeof change === "string") {
        if (change === "-") {
          // Balance should be decreased.
          expect(afterBalance < beforeBalance).toEqual(true);
        } else if (change === "+") {
          // Balance should be increased.
          expect(afterBalance > beforeBalance).toEqual(true);
        } else if (change.startsWith("≈")) {
          // Check approximate equality.
          expect(beforeBalance > 0).toEqual(true);
          expect(
            Number.parseFloat(
              ethers.formatUnits(afterBalance, tokenInfo.decimals),
            ),
          ).toBeCloseTo(Number.parseFloat(change.split("≈")[1]));
        }
      } else if (change === 0) {
        expect(beforeBalance > 0).toEqual(true);
        expect(afterBalance === 0n).toEqual(true);
      } else {
        const scale = 10 ** tokenInfo.decimals;
        const expectDiff = Math.floor(Math.abs(change) * scale) / scale;
        const balanceDiff =
          change < 0
            ? beforeBalance - afterBalance
            : afterBalance - beforeBalance;
        expect(
          (Math.abs(
            Number.parseFloat(
              ethers.formatUnits(balanceDiff, tokenInfo.decimals),
            ) - expectDiff,
          ) *
            100) /
            expectDiff,
        ).toBeLessThan(5); // 5% slippage
      }
    }
  }
}

async function createVnets(blockNumber: JSONObject) {
  const vnetIds: JSONObject = {};
  const rpcUrls: JSONObject = {};

  const chainIds = Object.keys(blockNumber);
  const vnets = await Promise.all(
    chainIds.map((chainId) => createVnet(chainId, blockNumber[chainId])),
  );

  chainIds.forEach((chainId, index) => {
    vnetIds[chainId] = vnets[index].vnetId;
    rpcUrls[chainId] = vnets[index].rpcUrl;
  });

  return { vnetIds, rpcUrls, chainIds };
}
