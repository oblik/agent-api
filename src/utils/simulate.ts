import { AxiosError } from "axios";
import { ethers } from "ethers";
import type { TransactionReceipt } from "ethers";
import {
  createVnet,
  getVnetIdFromRpc,
  setErc20Balance,
} from "../__tests__/helper.js";
import { abis } from "../config/abis.js";
import ChainIDs from "../config/common/chainid.js";
import NativeTokens from "../config/common/native-token.js";
import LPAddresses from "../config/lptokens.js";
import { NATIVE_TOKEN, NATIVE_TOKEN2 } from "../constants.js";
import {
  getChainError,
  getNoBridgeRouteError,
  getNoPositionError,
  getNoSwapRouteError,
} from "./error.js";
import { getViemPublicClientFromEthers } from "./ethers2viem.js";
import {
  checkBridgeActions,
  checkHyperliquidChainName,
  checkIfOnlyOrigin,
  checkUniswapLikeDeposits,
  clearTokenCache,
  convertAmount,
  convertToHexString,
  extractProvider,
  fillAmountForUnits,
  fillBody,
  fillChainName,
  findHighestEthBalance,
  findHighestMCChain,
  fromActions,
  getAmountKey,
  getChainIdFromName,
  getChainIdsFromActions,
  getChainKey,
  getCoinData,
  getDstChainKey,
  getErrorMessage,
  getEthBalanceForUser,
  getFeeConfig,
  getGasForNextActions,
  getLPTokenInfo,
  getMiddleToken,
  getNativeTokenSymbolForChain,
  getOutputToken,
  getOutputTokenSymbolForBridge,
  getPrevActionIndexes,
  getProtocolPoolNameForChain,
  getRevertReason,
  getRoughAmountInForInference,
  getRpcUrlForChain,
  getTokenAmount,
  getTokenBalanceForAllChains,
  getTokenFromOnChain,
  getTokenInfoForChain,
  getTokenKey,
  getTokenOwningChains,
  getTokenPortfolio,
  getTransactions,
  getUserOwnedTokens,
  getUserProtocolPositionsFromHyperliquid,
  handleAllChainsCases,
  increaseBalanceOnChain,
  isHyperliquidAction,
  isNaNValue,
  isSolanaAddress,
  isValidAddress,
  isValidHyperliquidAddress,
  nonProtocolNames,
  resetVnetStates,
  resimulateWithBalance,
  saveToken,
  sfParseUnits,
  splitPool,
  toActions,
  uniswapLikeProtocols,
  updateChains,
  validateActions,
  validatePoolNames,
  validateProtocolNames,
  validateToken,
  validateTokenForChain,
  withRetry,
} from "./index.js";
import { sfConsoleError, usePrintError, usePrintLog } from "./log.js";
import {
  getGMXPositions,
  getGMXTokensToClose,
  getPoolData,
  simulateExecute,
} from "./protocols/gmx.js";
import {
  getHyperliquidTokenInfo,
  getHyperliquidTokensToClose,
} from "./protocols/hyperliquid.js";
import {
  getAlternativeChain,
  getBorrowableAmountForToken,
  getKeysForAction,
  getPoolsForProtocol,
  getTokensForAction,
  getTokensForDeposit,
  getUserPositions,
  protocolValidActions,
} from "./protocols/index.js";
import { extractPendleToken, isMultiSideDeposit } from "./protocols/pendle.js";
import { RetryProvider } from "./retryProvider.js";
import { simulateSolanaActions } from "./simulate-sol.js";
import { sendInference } from "./sse.js";
import type {
  Call,
  ChainId,
  CommonArgs,
  DebankTokenInfoR,
  FeeConfig,
  GMXPosition,
  JSONObject,
  PortfolioToken,
  RawAction,
  SimAction,
  SimResult,
  SimResultAction,
  TokenInfo,
  Transaction,
} from "./types.js";
import { assert, Flow, Unwind, isHexStr } from "./types.js";

const MAX_RECUR = 5;

// Simulate given actions with conditions.
// rpc: Vnet rpc url. If it's specified, it simulates on the rpc.
// blockNumber: Block number to simulate. It can be object or number.
//              If it's a number, it applies to all actions.
//              If it's an object, block number applies to specific chains.
export async function simulateActions(
  rawActions: RawAction[],
  conditions: Call[],
  address: string,
  _: string,
  simulationId: string,
  rpcs: JSONObject = {},
  blockNumber: string | JSONObject | undefined = undefined,
  retry = true,
  recur: number[] = [],
  baseLiquidity = 50000,
): Promise<SimResult> {
  // start off with basic checks
  if (!address) {
    const message = "Account address is required for simulation.";
    sfConsoleError(message);
    return { success: false, message };
  }
  if (isSolanaAddress(address)) {
    const result = await simulateSolanaActions(address, rawActions[0]);
    console.log("Solana simulation result:", result);
    return result;
  }

  const printLog = usePrintLog(address);
  const printError = usePrintError(address);

  const checkpoints = {};
  try {
    await Promise.all(
      Object.keys(rpcs).map(saveCheckpoint(checkpoints, rpcs, address)),
    );
  } catch (err) {
    if (err instanceof Unwind) throw err;
    return {
      success: false,
      message:
        "Failed to simulate due to issue with rpc checkpointing, please try again.",
    };
  }

  let connectedChainName =
    rawActions[0]?.args[getChainKey(rawActions[0]?.name)];
  const isFirstChainMissing = !connectedChainName;
  if (isFirstChainMissing) {
    try {
      connectedChainName = await getFirstChain(address, rawActions, rpcs);
    } catch (err) {
      return { success: false, message: getErrorMessage(err) };
    }
  }
  if (!connectedChainName) {
    return {
      success: false,
      message:
        "Not able to find a proper chain for first action. Ensure you specify a chain properly in your next prompt.",
    };
  }

  try {
    // simaction
    basicChecks(recur, printError, rawActions);

    updateWithValidProtocolActions(rawActions);

    // initialize a deep copy
    let actions = JSON.parse(JSON.stringify(rawActions));

    verifyActions(actions);

    // initialize fee config
    const feeConfig = await getFeeConfig(address, rpcs);

    // fill chain name
    actions = fillChainName(actions, connectedChainName);

    // check hyperliquid chain name
    if (await checkHyperliquidChainName(actions, rawActions)) {
      console.log(
        "Inference applied: retry with hyperliquid action on arbitrum with additional actions since not supported on given chain",
      );
      sendInference(
        "Retry with hyperliquid action on arbitrum with additional actions since not supported on given chain",
        rawActions,
        simulationId,
      );

      await resetVnetStates(checkpoints, rpcs);
      return simulateActions(
        rawActions,
        conditions,
        address,
        connectedChainName,
        simulationId,
        rpcs,
        blockNumber,
        true,
        [...recur, -1],
        baseLiquidity,
      );
    }

    // fill amounts with(out) units
    actions = await fillAmountForUnits(actions);

    // split all chain case
    actions = handleAllChainsCases(actions);
    if (!Array.isArray(actions)) {
      return actions; // This is the error case
    }

    // create vnets if no rpcs are provided
    const chainIdResult = getChainIdsFromActions(actions);
    if (!chainIdResult.success) {
      return chainIdResult;
    }
    const chainIds = chainIdResult.chainIds || [];

    try {
      await Promise.all(
        chainIds
          .filter((chainId) => !rpcs[chainId])
          .map(getVnet(address, blockNumber, rpcs)),
      );
    } catch (err) {
      if (err instanceof Unwind) throw err;
      return {
        success: false,
        message:
          "Failed to simulate due to issue with vnet initialization, please try again.",
      };
    }

    if (typeof rpcs.hyperliquid === "string") {
      rpcs.hyperliquid = JSON.parse(rpcs.hyperliquid);
    }
    if (!rpcs.hyperliquid) {
      await hyperLPos(actions, address, rpcs);
    }

    let zksyncid: number | undefined;
    if (ChainIDs.zksync in rpcs) {
      try {
        const providertest = new RetryProvider(
          rpcs[ChainIDs.zksync] as string,
          ChainIDs.zksync,
        );
        const check = await providertest.send("eth_chainId", []);
        zksyncid = Number.parseInt(check, 16);
      } catch (err) {
        if (err instanceof Unwind) throw err;
        /* empty */
      }
    }

    // fill protocol and pool names
    actions = (await Promise.all(actions.map(fillNames())))
      .filter((result) => result.keep)
      .sort((a, b) => a.index - b.index)
      .map((result) => result.action);

    // perform multiple validation steps
    let valResult = validateActions(actions, rawActions.length);
    actions = await doValidations(
      valResult,
      rawActions,
      printError,
      actions,
      address,
      rpcs,
      checkpoints,
      conditions,
      connectedChainName,
      blockNumber,
      recur,
      simulationId,
    );

    // check consecutive multi-side deposits and fill missing poolName
    checkDeposit(actions);
    // fill poolName & token & amount & range properly, large for loop
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < actions.length; i++) {
      // simaction
      try {
        const action = actions[i];

        if (!action.name) {
          throw new Unwind(Flow.Return, "simaction", {
            success: false,
            message: "Invalid action format",
          });
        }

        if (action.name === "notification") {
          throw new Unwind(Flow.Continue, "simaction");
        }
        if (
          action.name === "claim" &&
          action.args.protocolName?.toLowerCase() === "camelot"
        ) {
          throw new Unwind(Flow.Continue, "simaction");
        }

        const chainName = action.args[getChainKey(action.name)];
        action.args = fillBody(action.name, action.args, address);
        const protocol = (action.args.protocolName || "").toLowerCase();

        const chainId = getChainIdFromName(chainName);
        const prevActionIndexes = getPrevActionIndexes(actions, i);
        if (!chainId) {
          throw new Error(getChainError(chainName));
        }
        const nativeToken = getNativeTokenSymbolForChain(chainId);
        const { rpcUrl, provider } = extractProvider(chainId, rpcs, zksyncid);

        // fill pool properly
        const poolName = action.args.poolName || "";
        await fillPoolName(
          action,
          poolName,
          address,
          provider,
          chainId,
          rpcs,
          protocol,
          actions,
          i,
        );

        const isOnlyOrigin = checkIfOnlyOrigin(actions, i);

        // fill token properly
        let token = action.args[getTokenKey(action.name)] || "";
        if (action.name === "close") {
          token = action.args.outputToken || token;
        }

        // in case swap tokens are array format
        await handleSwap(
          action,
          token,
          isOnlyOrigin,
          actions,
          i,
          rawActions,
          checkpoints,
          rpcs,
          conditions,
          address,
          connectedChainName,
          blockNumber,
          recur,
          baseLiquidity,
          simulationId,
        );

        token = token.trim();

        // in case {[protocolName] rewards} format
        handleRewardsFmt(token, action, actions, i, rawActions);
        // in case "liquidity" or lp required for withdraw action
        await handleLpWithdraw(
          action,
          i,
          protocol,
          token,
          address,
          provider,
          chainId,
          rpcs,
          isOnlyOrigin,
          rawActions,
          chainName,
          checkpoints,
          conditions,
          connectedChainName,
          blockNumber,
          recur,
          printError,
          actions,
          nativeToken,
          baseLiquidity,
          simulationId,
        );
        // in case "all positions"
        await handleAllPos(
          action,
          i,
          protocol,
          token,
          address,
          provider,
          chainId,
          rpcs,
          isOnlyOrigin,
          rawActions,
          chainName,
          checkpoints,
          conditions,
          connectedChainName,
          blockNumber,
          recur,
          printError,
          actions,
        );
        // in case "all" or nothing for first action
        await handle1stAction(
          token,
          i,
          action,
          address,
          provider,
          chainId,
          rpcs,
          protocol,
          isOnlyOrigin,
          rawActions,
          chainName,
          checkpoints,
          conditions,
          connectedChainName,
          blockNumber,
          recur,
          printError,
          actions,
          baseLiquidity,
          simulationId,
        );
        // in case "LP"
        handleLpToken(token, i, actions, protocol, action);
        // in case nothing or "outputToken"
        handleRepay(action, token, prevActionIndexes, actions, i, conditions);
        // in case claim, no need to fill {token} here
        await handleClaimNDeposit(
          action,
          address,
          protocol,
          chainId,
          actions,
          i,
          provider,
          printLog,
          printError,
        );

        // update range properly
        const tokensForActions = await updateRange(
          action,
          protocol,
          address,
          provider,
          chainId,
          rpcs,
          rawActions,
          chainName,
          checkpoints,
          conditions,
          connectedChainName,
          blockNumber,
          recur,
          printError,
          baseLiquidity,
          simulationId,
        );

        // fill amount properly
        let amount = action.args[getAmountKey(action.name)];
        let tokenInfo: TokenInfo | undefined = await getTokenInfoForChain(
          token,
          chainName,
          false,
          {
            account: address,
            provider,
            liquidityThreshold: action.name === "swap" ? baseLiquidity : 0,
          },
        );
        let noBalance = false;
        noBalance = await handleTokenAction(
          tokenInfo,
          action,
          protocol,
          rpcs,
          provider,
          address,
          noBalance,
        );
        tokenInfo = await handleToActionWithBorrow(
          tokenInfo,
          noBalance,
          i,
          action,
          isOnlyOrigin,
          address,
          provider,
          chainId,
          rpcs,
          token,
          protocol,
          rawActions,
          checkpoints,
          conditions,
          connectedChainName,
          blockNumber,
          recur,
          chainName,
          actions,
          baseLiquidity,
          isFirstChainMissing,
          simulationId,
        );

        amount = await loopInit(
          i,
          amount,
          action,
          protocol,
          tokensForActions,
          address,
          provider,
          chainId,
          rpcs,
          isOnlyOrigin,
          rawActions,
          chainName,
          checkpoints,
          conditions,
          connectedChainName,
          blockNumber,
          recur,
          printError,
          actions,
          token,
          poolName,
          rpcUrl,
          tokenInfo,
          nativeToken,
          zksyncid,
          printLog,
          baseLiquidity,
          simulationId,
        );

        handleMissingAmount(i, amount, action, actions);

        await handleNativeToken(
          tokenInfo,
          nativeToken,
          chainId,
          address,
          rpcUrl,
          blockNumber,
          zksyncid,
          action,
          amount,
        );
      } catch (err) {
        if (err instanceof Unwind && err.label === "simaction") {
          switch (err.flow) {
            case Flow.Redo:
              i--;
              if (err.value) actions = err.value;
              continue;
            case Flow.Continue:
              continue;
          }
        }
        throw err;
      }
    }

    // add check for bad swap
    const firstAction = actions[0];
    actions = [...actions].filter(
      (x) =>
        !(
          x.name === "swap" &&
          x.args.inputToken &&
          x.args.outputToken &&
          x.args.inputToken.toLowerCase() === x.args.outputToken.toLowerCase()
        ),
    );
    if (actions.length === 0 && firstAction) {
      return {
        success: false,
        message: `You are trying to swap from ${firstAction.args.inputToken} to ${firstAction.args.outputToken} on ${firstAction.args.chainName}. Please make sure input and output token are different when swapping.`,
      };
    }
    // validate again, check if need inference
    valResult = validateActions(actions, rawActions.length);
    if ((valResult as number[])[0] > -1) {
      const {
        message,
        chainId: chainId_,
        rpc,
      } = await resimulateWithBalance(
        { address, connectedChainName, rpcs },
        rawActions,
        actions,
        valResult as number[],
      );
      if (!message || chainId_) {
        console.log(
          chainId_
            ? "Inference applied: retry with latest chain state, since token balance increased meanwhile"
            : "Inference applied: retry with an additional bridge or token substitution, since no balance to proceed with specified amount",
        );
        sendInference(
          chainId_
            ? "Token balance has been updated. Restarting the simulation to reflect the latest chain state and ensure accurate execution."
            : "Additional bridge or token adjustment applied due to insufficient balance for the next action. Restarting the simulation with these updates.",
          rawActions,
          simulationId,
        );

        if (chainId_ && rpc) {
          rpcs[chainId_] = rpc;
        }

        await resetVnetStates(checkpoints, rpcs, chainId_);
        return simulateActions(
          rawActions,
          conditions,
          address,
          connectedChainName,
          simulationId,
          rpcs,
          blockNumber,
          true,
          [...recur, -1],
          baseLiquidity,
        );
      }
      printError(message);
      throw new Unwind(Flow.Return, "simaction", {
        success: false,
        message,
        index: (valResult as number[])[0],
      });
    }

    // check consecutive multi-side deposits
    checkMultiDeposit(actions, rawActions);

    // label token addresses as necessary
    await Promise.all(actions.map(labelToken(rpcs, address)));

    // check for possible inference of additional middle token
    await inferToken(
      actions,
      rawActions,
      checkpoints,
      rpcs,
      conditions,
      address,
      connectedChainName,
      blockNumber,
      recur,
      baseLiquidity,
      simulationId,
    );

    const tempActions = JSON.parse(JSON.stringify(actions));

    if (
      await updateWithHyperliquidValidation(
        rawActions,
        tempActions,
        simulationId,
        isFirstChainMissing,
      )
    ) {
      await resetVnetStates(checkpoints, rpcs);
      return await simulateActions(
        rawActions,
        conditions,
        address,
        connectedChainName,
        simulationId,
        rpcs,
        blockNumber,
        true,
        [...recur, -1],
        baseLiquidity,
      );
    }

    let simTxs: Transaction[] = [];
    printLog("t", tempActions);
    let prevChainId: number | null = null;
    const indexesToRemove: number[] = [];
    const tokenInfos: Record<string, Partial<TokenInfo>> = {};

    // giant loop through all actions to properly simulate via vnets
    ({ simTxs, prevChainId } = await simViaVnets(
      tempActions,
      actions,
      address,
      rpcs,
      zksyncid,
      prevChainId,
      simTxs,
      rawActions,
      checkpoints,
      conditions,
      connectedChainName,
      blockNumber,
      recur,
      indexesToRemove,
      printError,
      printLog,
      feeConfig,
      tokenInfos,
      retry,
      baseLiquidity,
      isFirstChainMissing,
      simulationId,
    ));

    const result = actions.filter(
      (_: unknown, index: number) => !indexesToRemove.includes(index),
    );
    valResult = validateActions(result, rawActions.length);
    if ((valResult as number[])[0] > -1) {
      const {
        message,
        chainId: chainId_,
        rpc,
      } = await resimulateWithBalance(
        { address, connectedChainName, rpcs },
        rawActions,
        result,
        valResult as number[],
      );
      if (!message || chainId_) {
        console.log(
          chainId_
            ? "Inference applied: retry with latest chain state, since token balance increased meanwhile"
            : "Inference applied: retry with an additional bridge, since no balance to proceed with specified amount at last",
        );
        sendInference(
          chainId_
            ? "Token balance has increased. Restarting the simulation with the latest chain state for accurate processing."
            : "An additional bridge has been added to provide the required balance to proceed with the specified amount. Restarting the simulation with updated actions.",
          rawActions,
          simulationId,
        );

        if (chainId_ && rpc) {
          rpcs[chainId_] = rpc;
        }

        await resetVnetStates(checkpoints, rpcs, chainId_);
        return simulateActions(
          rawActions,
          conditions,
          address,
          connectedChainName,
          simulationId,
          rpcs,
          blockNumber,
          true,
          [...recur, -1],
          baseLiquidity,
        );
      }
      printError(message);
      throw new Unwind(Flow.Return, "simaction", {
        success: false,
        message,
        index: (valResult as number[])[0],
      });
    }
    printLog("simulation success:", JSON.stringify(result, null, 2));

    if (rpcs.hyperliquid) {
      rpcs.hyperliquid = JSON.stringify(rpcs.hyperliquid);
    }

    // void resetVnetStates(checkpoints, rpcs);

    return { success: true, actions: result, rawActions, rpcs };
  } catch (o) {
    if (o instanceof Unwind && o.label === "simaction") {
      switch (o.flow) {
        case Flow.Return: {
          const errorMsg = (o.value as SimResult).message;
          let tokenNotFoundCase = errorMsg?.includes("you specify a");
          if (errorMsg?.includes("you don't have")) {
            tokenNotFoundCase ||= (errorMsg.match(/,/g) || []).length === 1;
          }
          if (
            tokenNotFoundCase &&
            !errorMsg?.includes("hyperliquid spot market") &&
            recur.length < MAX_RECUR &&
            baseLiquidity > 0
          ) {
            const isFirstAction =
              (o.value as SimResult).index === 0 || rawActions.length === 1;
            if (isFirstChainMissing && isFirstAction) {
              const simActions = rawActions.map((x, i) => ({
                ...x,
                origin: i + 1,
              })) as SimResultAction[];
              const action = simActions[0];
              const chain = connectedChainName || action.args.chainName;
              const chainId = getChainIdFromName(chain);
              if (chainId && ["swap", "bridge"].includes(action.name)) {
                if (action.name === "swap") {
                  const provider = new RetryProvider(rpcs[chainId]);
                  const { status, chainName, chains } =
                    await validateTokenForChain(
                      action.args.outputToken || "",
                      chain,
                      false,
                      { liquidityThreshold: baseLiquidity },
                    );
                  if (status === 1) {
                    const tokenInfo = await getTokenInfoForChain(
                      action.args.inputToken,
                      chainName,
                      false,
                      {
                        provider,
                        address,
                        rpcs,
                        liquidityThreshold: baseLiquidity,
                      },
                    );
                    if (isValidAddress(tokenInfo?.address)) {
                      await updateChains(
                        rawActions,
                        action,
                        chainName || "",
                        chain || "",
                      );

                      console.log(
                        `Inference applied: retry on ${chainName} because would otherwise throw an error`,
                      );
                      await resetVnetStates(checkpoints, rpcs);
                      return simulateActions(
                        rawActions,
                        conditions,
                        address,
                        connectedChainName,
                        simulationId,
                        rpcs,
                        blockNumber,
                        true,
                        [...recur, -1],
                        baseLiquidity,
                      );
                    }
                  } else if (chains?.length) {
                    const chainName = await findHighestMCChain(
                      action.args.inputToken || "",
                      chains,
                      { address, rpcs },
                    );
                    if (chainName) {
                      await updateChains(
                        rawActions,
                        action,
                        chainName,
                        chain || "",
                      );

                      console.log(
                        `Inference applied: retry on ${chainName} because would otherwise throw an error`,
                      );
                      await resetVnetStates(checkpoints, rpcs);
                      return simulateActions(
                        rawActions,
                        conditions,
                        address,
                        connectedChainName,
                        simulationId,
                        rpcs,
                        blockNumber,
                        true,
                        [...recur, -1],
                        baseLiquidity,
                      );
                    }
                  }
                } else {
                  const provider = new RetryProvider(rpcs[chainId]);
                  const { status, chainName, chains } =
                    await validateTokenForChain(
                      action.args.token || "",
                      chain,
                      false,
                      { liquidityThreshold: baseLiquidity },
                    );
                  if (status === 1) {
                    const tokenInfo = await getTokenInfoForChain(
                      action.args.token,
                      action.args.destinationChainName,
                      false,
                      { provider, address, rpcs },
                    );
                    if (isValidAddress(tokenInfo?.address)) {
                      rawActions[action.origin - 1].args.destinationChainName =
                        chainName;

                      console.log(
                        `Inference applied: retry on ${chainName} because would otherwise throw an error`,
                      );
                      await resetVnetStates(checkpoints, rpcs);
                      return simulateActions(
                        rawActions,
                        conditions,
                        address,
                        connectedChainName,
                        simulationId,
                        rpcs,
                        blockNumber,
                        true,
                        [...recur, -1],
                        baseLiquidity,
                      );
                    }
                  } else if (chains?.length) {
                    const chainName = await findHighestMCChain(
                      action.args.token || "",
                      chains,
                      { address, rpcs },
                    );
                    if (chainName) {
                      rawActions[action.origin - 1].args.destinationChainName =
                        chainName;

                      console.log(
                        `Inference applied: retry on ${chainName} because would otherwise throw an error`,
                      );
                      await resetVnetStates(checkpoints, rpcs);
                      return simulateActions(
                        rawActions,
                        conditions,
                        address,
                        connectedChainName,
                        simulationId,
                        rpcs,
                        blockNumber,
                        true,
                        [...recur, -1],
                        baseLiquidity,
                      );
                    }
                  }
                }
              }
            }

            console.log(
              "Inference applied: retry with no liquidity threshold because would otherwise throw an error",
            );
            sendInference(
              "Simulation restarted with adjusted liquidity settings to prevent errors during execution. Continuing without a minimum liquidity threshold.",
              rawActions,
              simulationId,
            );

            await resetVnetStates(checkpoints, rpcs);
            return simulateActions(
              rawActions,
              conditions,
              address,
              connectedChainName,
              simulationId,
              rpcs,
              blockNumber,
              true,
              [...recur, -1],
              0,
            );
          }
          if (
            (o.value as SimResult).message?.includes(":") &&
            recur.length < MAX_RECUR
          ) {
            const [i, token_] = ((o.value as SimResult).message || "").split(
              ":",
            );
            if (!isNaNValue(i) && token_) {
              const action = rawActions[+i];
              const protocol = action.args.protocolName;
              const token = action.args.token;
              rawActions[+i].args.token = token_;
              for (let j = +i - 1; j >= 0; j--) {
                if (
                  rawActions[j].args.token &&
                  rawActions[j].args.token?.toLowerCase() ===
                    token?.toLowerCase()
                ) {
                  rawActions[j].args.token = token_;
                }
                if (
                  rawActions[j].args.outputToken &&
                  rawActions[j].args.outputToken?.toLowerCase() ===
                    token?.toLowerCase()
                ) {
                  rawActions[j].args.outputToken = token_;
                  break;
                }
              }

              console.log(
                `Inference applied: retry ${action.name} with ${token_}, since depositing into ${protocol} is not supported with ${token}`,
              );
              sendInference(
                `Depositing into ${protocol} using ${token} isn't supported. We've switched to ${token_} for this action and are restarting the simulation with updated settings.`,
                rawActions,
                simulationId,
              );

              await resetVnetStates(checkpoints, rpcs);
              return simulateActions(
                rawActions,
                conditions,
                address,
                connectedChainName,
                simulationId,
                rpcs,
                blockNumber,
                true,
                [...recur, -1],
                0,
              );
            }
          }
          return o.value as SimResult;
        }
      }
    }
    throw o;
  }
}

function handleMissingAmount(
  i: number,
  amount: string | undefined,
  action: SimAction,
  actions: SimAction[],
) {
  if (i > 0 && !amount && isNaNValue(action.args.outputAmount)) {
    let shouldSetOutputAmount = false;
    const prevActionIndexes = getPrevActionIndexes(actions, i);
    for (let j = 0; j < prevActionIndexes.length; j++) {
      const prevAction = actions[prevActionIndexes[j]];
      const prevToken = getOutputToken(prevAction);
      if (
        prevToken?.toLowerCase() ===
        action.args[getTokenKey(action.name)]?.toLowerCase()
      ) {
        shouldSetOutputAmount = true;
        break;
      }
    }
    action.args[getAmountKey(action.name)] = shouldSetOutputAmount
      ? "outputAmount"
      : "all";
    throw new Unwind(Flow.Continue, "simaction");
  }
}

async function handleNativeToken(
  tokenInfo: TokenInfo | undefined,
  nativeToken: string | undefined,
  chainId: number,
  address: string,
  rpcUrl: string | undefined,
  blockNumber: string | JSONObject | undefined,
  zksyncid: number | undefined,
  action: SimAction,
  amount: string | undefined,
) {
  if (
    tokenInfo?.address === NATIVE_TOKEN ||
    tokenInfo?.address === NATIVE_TOKEN2 ||
    tokenInfo?.symbol?.toLowerCase() === nativeToken?.toLowerCase()
  ) {
    const balance = await getEthBalanceForUser(
      chainId,
      address,
      rpcUrl,
      typeof blockNumber === "object" ? blockNumber[chainId] : blockNumber,
      zksyncid,
    );
    if (balance === 0n) {
      action.gasCheck = true;
    }
    if (!isNaNValue(amount)) {
      const regex = /^(\d*\.\d{1,18})|\d+/;
      let _amount: bigint;
      const amountStr = (action.args.realAmount || amount)?.toString();
      if (amountStr?.match(regex)) {
        _amount = ethers.parseEther(amountStr?.match(regex)?.[0] || "0");
      } else {
        _amount = ethers.parseEther(amountStr || "0");
      }
      if (chainId === 1) {
        action.gasCheck =
          toActions.includes(action.name) &&
          balance - _amount < ethers.WeiPerEther / 50n;
      } else {
        action.gasCheck =
          toActions.includes(action.name) &&
          balance - _amount < ethers.WeiPerEther / 500n;
      }
    }
  }
}

async function handleTokenAction(
  tokenInfo: TokenInfo | undefined,
  action: SimAction,
  protocol: string | undefined,
  rpcs: JSONObject,
  provider: RetryProvider,
  address: string,
  noBalance0: boolean,
) {
  let noBalance = noBalance0;
  if (tokenInfo && toActions.includes(action.name)) {
    try {
      let tokenBalance: bigint | undefined;
      if (
        isValidHyperliquidAddress(tokenInfo.address) ||
        (protocol === "hyperliquid" &&
          (["long", "short", "transfer"].includes(action.name) ||
            (action.name === "swap" && tokenInfo.symbol === "usdc")))
      ) {
        if (getHyperliquidActionSourceType(action) === "spot") {
          tokenBalance = getHyperliquidSpotBalance(rpcs, tokenInfo);
        } else {
          tokenBalance = getHyperliquidBalance(rpcs);
        }
      } else if (tokenInfo.address) {
        const viemClient = await getViemPublicClientFromEthers(provider);
        assert(isHexStr(tokenInfo.address));
        assert(isHexStr(address));
        tokenBalance = await viemClient.readContract({
          address: tokenInfo.address,
          abi: abis.erc20,
          functionName: "balanceOf",
          args: [address],
        });
      }
      if (!tokenBalance) {
        noBalance = true;
      }
    } catch (err) {
      if (err instanceof Unwind) throw err;
      /* empty */
    }
  }
  return noBalance;
}

function handleRewardsFmt(
  token: string,
  action: SimAction,
  actions: SimAction[],
  i: number,
  rawActions: RawAction[],
) {
  if (token.indexOf("rewards") === token.length - 7 && token.length >= 7) {
    if (
      action.name === "withdraw" ||
      action.name === "unlock" ||
      action.name === "unstake"
    ) {
      actions.splice(i, 1);
      throw new Unwind(Flow.Redo, "simaction");
    }
    const protocolName = token.replace("rewards", "").replace(" ", "");
    actions.splice(i, 1, {
      ...action,
      args: { ...action.args, [getTokenKey(action.name)]: "outputToken" },
    });
    for (let j = i; j < actions.length; j++)
      actions[j].origin = actions[j].origin + 1;
    actions.splice(i, action.name === "claim" ? 1 : 0, {
      name: "claim",
      args: { protocolName, chainName: action.args.chainName },
      origin: action.origin,
    });
    rawActions.splice(action.origin - 1, action.name === "claim" ? 1 : 0, {
      name: "claim",
      args: { protocolName, chainName: action.args.chainName },
    });
    throw new Unwind(Flow.Redo, "simaction");
  }
}

async function fillPoolName(
  action: SimAction,
  poolName: string | undefined,
  address: string,
  provider: RetryProvider,
  chainId: ChainId,
  rpcs: JSONObject,
  protocol: string | undefined,
  actions: SimAction[],
  i: number,
) {
  if (fromActions.includes(action.name) && poolName === "all") {
    const tokens = await getTokensForAction(
      address,
      action.name,
      action.args,
      { provider, chainId },
      rpcs,
    );
    let token = action.args[getTokenKey(action.name)] || "";
    if (action.name === "close") {
      token = action.args.outputToken || token;
    }
    const temp = tokens.filter(
      (x) =>
        token === "all" ||
        token === "" ||
        (protocol === "pendle" &&
          extractPendleToken(x.poolName || "") === token.toLowerCase()) ||
        token.toLowerCase() === x.symbol.toLowerCase(),
    );
    actions.splice(i, 1, ...temp.map(fillPool(action, protocol)));
    throw new Unwind(Flow.Redo, "simaction");
  }
}

function basicChecks(
  recur: number[],
  printError: (...errs: unknown[]) => void,
  rawActions: RawAction[],
) {
  if (recur.length > MAX_RECUR) {
    const message =
      "Maximum recursion depth reached. Unable to resolve the simulation.";
    printError(message);
    throw new Unwind(Flow.Return, "simaction", { success: false, message });
  }
  if (!rawActions || rawActions.length === 0) {
    const message = "At least one action is required for simulation.";
    printError(message);
    throw new Unwind(Flow.Return, "simaction", { success: false, message });
  }

  // check multi step bridge zksync or blast, which have constraints
  const bridgeCheckResult = checkBridgeActions(rawActions);
  if (!bridgeCheckResult.success) {
    throw new Unwind(Flow.Return, "simaction", bridgeCheckResult);
  }
}

async function handleClaimNDeposit(
  action: SimAction,
  address: string,
  protocol: string | undefined,
  chainId: ChainId,
  actions: SimAction[],
  i: number,
  provider: RetryProvider,
  printLog: (...logs: unknown[]) => void,
  printError: (...errs: unknown[]) => void,
) {
  if (action.name === "claim") {
    if (action.args.poolName) throw new Unwind(Flow.Continue, "simaction");

    const poolNames = getPoolsForProtocol(address, protocol, chainId);
    if (poolNames.length === 0) {
      actions.splice(i, 1);
      throw new Unwind(Flow.Redo, "simaction");
    }
    actions.splice(
      i,
      1,
      ...poolNames.map((poolName) => ({
        ...action,
        args: { ...action.args, poolName },
      })),
    );
    throw new Unwind(Flow.Redo, "simaction");
  }
  // in case deposit, fill lp token as args["outputToken"]
  if (action.name === "deposit") {
    try {
      const { lp } = await getLPTokenInfo(action.args, chainId, provider);
      action.lp = lp;
      action.args.outputToken = lp?.address;
    } catch (err) {
      if (err instanceof Unwind) throw err;
      printLog("Cannot get LP Token info:", getErrorMessage(err));
      printError(err);
    }
  }
}

function handleLpToken(
  token: string,
  i: number,
  actions: SimAction[],
  protocol: string | undefined,
  action: SimAction,
) {
  if (token.toLowerCase() === "lp") {
    let lp: TokenInfo | undefined | null;
    for (let j = i - 1; j >= 0; j--) {
      if (
        actions[j].name === "deposit" &&
        actions[j].args.protocolName?.toLowerCase() === protocol &&
        actions[j].lp
      ) {
        lp = actions[j].lp;
        break;
      }
    }
    if (!lp) {
      actions.splice(i, 1);
      throw new Unwind(Flow.Redo, "simaction");
    }
    actions.splice(i, 1, {
      ...action,
      args: {
        ...action.args,
        [getTokenKey(action.name)]: lp.symbol,
        token1Address: lp.address,
      },
    });
    throw new Unwind(Flow.Redo, "simaction");
  }
}

function getHyperliquidBalance(rpcs: JSONObject) {
  return sfParseUnits(
    rpcs?.hyperliquid
      ?.find((position: { type: string }) => position.type === "Deposit")
      ?.tokens?.[0]?.amount?.toString() || "0",
    6,
  );
}

function getHyperliquidSpotBalance(rpcs: JSONObject, tokenInfo?: TokenInfo) {
  return sfParseUnits(
    rpcs?.hyperliquid
      ?.find((x: { type: string }) => x.type === "Spot")
      ?.tokens?.find(
        (x: { symbol: string }) =>
          x.symbol?.toUpperCase() === tokenInfo?.symbol?.toUpperCase(),
      )
      ?.amount.toString() || "0",
    tokenInfo?.decimals,
  );
}

function updateWithValidProtocolActions(rawActions: RawAction[]) {
  for (const action of rawActions) {
    const args = action.args;
    const actionName = action.name.toLowerCase();

    // Handle hyperliquid actions.
    // If it's a ction for transferring/bridging to Hyperliquid,
    // update it to deposit instead.
    if (
      (actionName === "transfer" &&
        args.recipient?.toLowerCase() === "hyperliquid") ||
      (actionName === "bridge" &&
        args.destinationChainName?.toLowerCase() === "hyperliquid")
    ) {
      action.name = "deposit";
      action.args = {
        protocolName: "hyperliquid",
        amount: args.amount,
        token: args.token,
        chainName: args.chainName || args.sourceChainName,
      };
    }
    if (isHyperliquidAction(action)) {
      if (["long", "short"].includes(action.name) && !args.inputToken) {
        action.args.inputToken = "usdc";
      }
      if (["deposit", "withdraw"].includes(action.name) && !args.token) {
        action.args.token = "usdc";
      }
    }
  }
}

async function updateWithHyperliquidValidation(
  rawActions: RawAction[],
  tempActions: SimAction[],
  simulationId: string,
  isFirstChainMissing: boolean,
) {
  for (let i = 0; i < tempActions.length; i++) {
    const action = tempActions[i];
    const prevAction = tempActions[i - 1];
    const isPrevOnlyOrigin = checkIfOnlyOrigin(tempActions, i - 1);
    const args = rawActions[action.origin - 1].args;
    const actionName = action.name.toLowerCase();

    if (isHyperliquidAction(action)) {
      if (
        actionName === "deposit" &&
        action.args.token?.toLowerCase() !== "usdc"
      ) {
        rawActions.splice(action.origin - 1, 0, {
          name: "swap",
          args: {
            inputToken: args.token,
            outputToken: "usdc",
            inputAmount: args.amount,
            inputAmountUnits: args.amount_units,
            chainName: args.chainName,
          },
        });

        console.log(
          "Inference applied: retry with an additional swap for hyperliquid",
        );
        sendInference(
          "An additional swap has been applied to access Hyperliquid. Restarting the simulation with updated actions to ensure sufficient liquidity.",
          rawActions,
          simulationId,
        );

        rawActions[action.origin].args.token = "usdc";
        rawActions[action.origin].args.amount = "outputAmount";
        rawActions[action.origin].args.amount_units = undefined;

        return true;
      }
      if (["long", "short"].includes(actionName)) {
        if (action.args.inputToken?.toLowerCase() !== "usdc") {
          rawActions.splice(action.origin - 1, 0, {
            name: "deposit",
            args: {
              token: args.inputToken,
              amount: args.inputAmount,
              amount_units: args.inputAmountUnits,
              protocolName: "hyperliquid",
              chainName: args.chainName,
            },
          });

          rawActions[action.origin].args.inputToken = "usdc";
          rawActions[action.origin].args.inputAmount = "outputAmount";
          rawActions[action.origin].args.inputAmountUnits = undefined;

          console.log(
            "Inference applied: retry with an additional deposit for hyperliquid",
          );
          sendInference(
            "An additional deposit has been applied to access Hyperliquid. Restarting the simulation with the updated actions to ensure adequate funds.",
            rawActions,
            simulationId,
          );
          return true;
        }
        if (
          action.args.inputAmount === "outputAmount" &&
          isPrevOnlyOrigin &&
          prevAction?.name === "swap" &&
          prevAction?.args.protocolName?.toLowerCase() === "hyperliquid" &&
          prevAction?.args.outputToken === "usdc"
        ) {
          rawActions.splice(action.origin - 1, 0, {
            name: "transfer",
            args: {
              token: "usdc",
              amount: "outputAmount",
              recipient: "perp",
              protocolName: "hyperliquid",
              chainName: action.args.chainName,
            },
          });
          console.log(
            "Inference applied: retry with an additional transfer to perp for hyperliquid",
          );
          sendInference(
            "An additional transfer to perp has been applied to access Hyperliquid. Restarting the simulation with the updated actions to ensure adequate funds.",
            rawActions,
            simulationId,
          );
          return true;
        }
      }
    }
    if (actionName === "swap") {
      const chainName = action.args.chainName;
      const chainStr =
        action.args.protocolName?.toLowerCase() === "hyperliquid"
          ? "hyperliquid spot market"
          : chainName;
      const inputTokenInfo = await getTokenInfoForChain(
        action.args.inputToken,
        chainName,
        false,
      );
      if (!inputTokenInfo) {
        throw new Unwind(Flow.Return, "simaction", {
          success: false,
          message: `Token ${action.args.inputToken} not found on ${chainStr}. Ensure you specify a chain and token properly in your next prompt.`,
        });
      }
      const outputTokenInfo = await getTokenInfoForChain(
        action.args.outputToken,
        chainName,
        false,
        {},
        true,
      );
      if (!outputTokenInfo) {
        throw new Unwind(Flow.Return, "simaction", {
          success: false,
          message: `Token ${action.args.outputToken} not found on ${chainStr}. Ensure you specify a chain and token properly in your next prompt.`,
        });
      }
      if (outputTokenInfo.onHyperSpot) {
        if (action.origin === 1 && isFirstChainMissing) {
          await updateChains(rawActions, action, "arbitrum", chainName || "");
          console.log(
            `Inference applied: retry ${action.name} on arbitrum, since ${action.args.outputToken} is on hyperliquid spot market`,
          );
          rawActions[action.origin - 1].args.protocolName = "hyperliquid";
          sendInference(
            `An additional action has been applied to retry ${action.name} on arbitrum due to the output token find failure. Restarting the simulation with updated actions to ensure the output token is available.`,
            rawActions,
            simulationId,
          );
        } else {
          if (action.args.inputToken?.toLowerCase() === "eth") {
            rawActions.splice(action.origin - 1, 0, {
              name: "bridge",
              args: {
                token: "eth",
                amount: action.args.inputAmount,
                amount_units: action.args.inputAmountUnits,
                sourceChainName: action.args.chainName,
                destinationChainName: "arbitrum",
              },
            });
            rawActions[action.origin].args.inputAmount = "outputAmount";
            rawActions[action.origin].args.inputAmountUnits = undefined;
            rawActions[action.origin].args.chainName = "arbitrum";
          } else {
            rawActions.splice(
              action.origin - 1,
              0,
              ...[
                {
                  name: "swap",
                  args: {
                    inputToken: action.args.inputToken,
                    inputAmount: action.args.inputAmount,
                    inputAmountUnits: action.args.inputAmountUnits,
                    outputToken: "eth",
                    chainName: action.args.chainName,
                  },
                },
                {
                  name: "bridge",
                  args: {
                    token: "eth",
                    amount: "outputAmount",
                    sourceChainName: action.args.chainName,
                    destinationChainName: "arbitrum",
                  },
                },
              ],
            );
            rawActions[action.origin].args.inputAmount = "outputAmount";
            rawActions[action.origin].args.inputAmountUnits = undefined;
            rawActions[action.origin].args.chainName = "arbitrum";
          }
        }
        return true;
      }
      const usdcPrice = (await getCoinData("", "usdc", 42161, false)).price;
      const outPrice = (
        await getHyperliquidTokenInfo(42161, args.outputToken || "", true)
      )?.price;
      if (
        action.args.protocolName?.toLowerCase() !== "hyperliquid" &&
        (isValidHyperliquidAddress(inputTokenInfo?.address) ||
          isValidHyperliquidAddress(outputTokenInfo?.address))
      ) {
        rawActions[action.origin - 1].args.protocolName =
          action.args.protocolName = "hyperliquid";
      }
      if (
        isValidHyperliquidAddress(inputTokenInfo?.address) &&
        outputTokenInfo?.symbol?.toLowerCase() !== "usdc"
      ) {
        if (isValidHyperliquidAddress(outputTokenInfo?.address)) {
          rawActions.splice(action.origin, 0, {
            name: "swap",
            args: {
              inputToken: "usdc",
              inputAmount: "outputAmount",
              outputToken: args.outputToken,
              protocolName: "hyperliquid",
              chainName,
            },
          });
          if (
            !rawActions[action.origin - 1].args.inputAmount &&
            rawActions[action.origin - 1].args.outputAmount &&
            outPrice &&
            usdcPrice
          ) {
            rawActions[action.origin - 1].args.outputAmount = (
              (+(rawActions[action.origin - 1].args.outputAmount || "0") *
                outPrice) /
              usdcPrice
            ).toFixed(6);
          }
        } else {
          rawActions.splice(
            action.origin,
            0,
            ...[
              {
                name: "transfer",
                args: {
                  token: "usdc",
                  amount: "outputAmount",
                  recipient: "perp",
                  protocolName: "hyperliquid",
                  chainName,
                },
              },
              {
                name: "withdraw",
                args: {
                  token: "usdc",
                  amount: "outputAmount",
                  protocolName: "hyperliquid",
                  chainName,
                },
              },
              {
                name: "swap",
                args: {
                  inputToken: "usdc",
                  inputAmount: "outputAmount",
                  outputToken: args.outputToken,
                  chainName,
                },
              },
            ],
          );
        }
        rawActions[action.origin - 1].args.outputToken = "usdc";
        rawActions[action.origin - 1].args.protocolName = "hyperliquid";

        console.log(
          "Inference applied: retry with an additional withdraw and swap to sell hyperliquid spot token swap",
        );
        sendInference(
          "An additional withdraw and swap has been applied to access Hyperliquid. Restarting the simulation with the updated actions to ensure adequate funds.",
          rawActions,
          simulationId,
        );

        return true;
      }
      if (
        isValidHyperliquidAddress(outputTokenInfo?.address) &&
        inputTokenInfo?.symbol?.toLowerCase() !== "usdc"
      ) {
        if (isValidHyperliquidAddress(inputTokenInfo?.address)) {
          rawActions.splice(action.origin, 0, {
            name: "swap",
            args: {
              inputToken: "usdc",
              inputAmount: "outputAmount",
              outputToken: args.outputToken,
              protocolName: "hyperliquid",
              chainName,
            },
          });
          if (
            !rawActions[action.origin - 1].args.inputAmount &&
            rawActions[action.origin - 1].args.outputAmount &&
            outPrice &&
            usdcPrice
          ) {
            rawActions[action.origin - 1].args.outputAmount = (
              (+(rawActions[action.origin - 1].args.outputAmount || "0") *
                outPrice) /
              usdcPrice
            ).toFixed(6);
          }
        } else {
          rawActions.splice(
            action.origin,
            0,
            ...[
              {
                name: "deposit",
                args: {
                  token: "usdc",
                  amount: "outputAmount",
                  protocolName: "hyperliquid",
                  chainName,
                },
              },
              {
                name: "transfer",
                args: {
                  token: "usdc",
                  amount: "outputAmount",
                  recipient: "spot",
                  protocolName: "hyperliquid",
                  chainName,
                },
              },
              {
                name: "swap",
                args: {
                  inputToken: "usdc",
                  inputAmount: "outputAmount",
                  outputToken: args.outputToken,
                  protocolName: "hyperliquid",
                  chainName,
                },
              },
            ],
          );
        }
        rawActions[action.origin - 1].args.outputToken = "usdc";
        rawActions[action.origin - 1].args.protocolName = undefined;

        console.log(
          "Inference applied: retry with an additional deposit and swap to buy hyperliquid spot token swap",
        );
        sendInference(
          "An additional deposit and swap has been applied to access Hyperliquid. Restarting the simulation with the updated actions to ensure adequate funds.",
          rawActions,
          simulationId,
        );

        return true;
      }
      if (
        action.args.inputAmount === "outputAmount" &&
        isPrevOnlyOrigin &&
        prevAction?.args.protocolName?.toLowerCase() === "hyperliquid" &&
        prevAction?.name === "deposit"
      ) {
        rawActions.splice(action.origin - 1, 0, {
          name: "transfer",
          args: {
            token: "usdc",
            amount: "outputAmount",
            recipient: "spot",
            protocolName: "hyperliquid",
            chainName: action.args.chainName,
          },
        });
        console.log(
          "Inference applied: retry with an additional transfer to spot for hyperliquid",
        );
        sendInference(
          "An additional transfer to spot has been applied to access Hyperliquid. Restarting the simulation with the updated actions to ensure adequate funds.",
          rawActions,
          simulationId,
        );
        return true;
      }
    }
  }

  return false;
}

async function doValidations(
  valResult: boolean | number[],
  rawActions: RawAction[],
  printError: (...errs: unknown[]) => void,
  actions0: SimAction[],
  address: string,
  rpcs: JSONObject,
  checkpoints: JSONObject,
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  simulationId: string,
) {
  let actions = actions0;
  if ((valResult as number[])[0] > -1) {
    const errorMsg = `${rawActions[(valResult as number[])[0]].args?.poolName} is not recognized. Please specify correct arguments in your next prompt!`;
    printError(errorMsg);
    throw new Unwind(Flow.Return, "simaction", {
      success: false,
      message: errorMsg,
      index: (valResult as number[])[0],
    });
  }

  try {
    // Recognize protocol names and if it's invalid, get associated names
    actions = await validateProtocolNames(address, actions);
  } catch (err) {
    if (err instanceof Unwind) throw err;
    printError(err);
    throw new Unwind(Flow.Return, "simaction", {
      success: false,
      message: getErrorMessage(err),
    });
  }

  try {
    // Validate pool names whether it's associated to the protocol
    await validatePoolNames(address, actions, rpcs);
  } catch (err) {
    if (err instanceof Unwind) throw err;
    let message = getErrorMessage(err);
    if (!isNaNValue(message)) {
      const action = actions[+message];
      const chainName = action.args[getChainKey(action.name)];
      const chainId = getChainIdFromName(chainName);
      const { status, chain, chains } = await getAlternativeChain(
        address,
        action,
        chainId,
        rpcs,
      );
      if (status) {
        await updateChains(rawActions, action, chain || "", chainName || "");

        console.log(
          `Inference applied: retry ${action.name} on ${chain}, since pool validation failed on ${chainName}`,
        );
        sendInference(
          `An additional action has been applied to retry ${action.name} on ${chain} due to a pool validation failure. Restarting the simulation with updated actions to ensure the pool is available.`,
          rawActions,
          simulationId,
        );

        await resetVnetStates(checkpoints, rpcs);
        throw new Unwind(
          Flow.Return,
          "simaction",
          await simulateActions(
            rawActions,
            conditions,
            address,
            connectedChainName,
            simulationId,
            rpcs,
            blockNumber,
            true,
            [...recur, -1],
          ),
        );
      }
      message = getNoPositionError(action.name, chainName || "", chains);
    }
    printError(message);
    throw new Unwind(Flow.Return, "simaction", { success: false, message });
  }

  try {
    // Validate token names whether it's associated to the protocol
    const actionNames = actions.map((action) => action.name.toLowerCase());
    const hasDepositOrLend = actionNames.some(
      (name) => name === "deposit" || name === "lend",
    );
    const hasPendleWithdraw = actions.some(
      (action) =>
        action.name.toLowerCase() === "withdraw" &&
        action.args?.protocolName?.toLowerCase() === "pendle",
    );

    if (hasDepositOrLend || hasPendleWithdraw) {
      actions = await validateToken(address, actions, rpcs);
    }
  } catch (err) {
    if (err instanceof Unwind) throw err;
    printError(err);
    throw new Unwind(Flow.Return, "simaction", {
      success: false,
      message: getErrorMessage(err),
    });
  }

  try {
    // Validate percent reduction whether it's valid
    for (const action of actions) {
      if (action.name.toLowerCase() === "close") {
        const percent = Number.parseFloat(
          action.args.percentReduction?.toString() || "100",
        );
        if (percent <= 0) {
          throw new Unwind(Flow.Return, "simaction", {
            success: false,
            message:
              "Percent reduction for close action cannot be less than 0%.",
          });
        }
        if (percent > 100) {
          throw new Unwind(Flow.Return, "simaction", {
            success: false,
            message:
              "Percent reduction for close action cannot be greater than 100%.",
          });
        }
      }
    }
  } catch (err) {
    if (err instanceof Unwind) throw err;
    throw new Unwind(Flow.Return, "simaction", {
      success: false,
      message: getErrorMessage(err),
    });
  }

  // Replace lp token to actual token for swaps
  try {
    await Promise.all(actions.map(replaceToken()));
  } catch (err) {
    if (err instanceof Unwind) throw err;
    throw new Unwind(Flow.Return, "simaction", {
      success: false,
      message: getErrorMessage(err),
    });
  }

  return actions;
}

async function loopInit(
  i: number,
  amount0: string | undefined,
  action: SimAction,
  protocol: string | undefined,
  tokensForActions: PortfolioToken[] | undefined,
  address: string,
  provider: RetryProvider,
  chainId: ChainId,
  rpcs: JSONObject,
  isOnlyOrigin: boolean,
  rawActions: RawAction[],
  chainName: string | undefined,
  checkpoints: Record<string, string>,
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  printError: (...errs: unknown[]) => void,
  actions: SimAction[],
  token: string,
  poolName: string | undefined,
  rpcUrl: string | undefined,
  tokenInfo: TokenInfo | undefined,
  nativeToken: string | undefined,
  zksyncid: number | undefined,
  printLog: (...logs: unknown[]) => void,
  baseLiquidity: number,
  simulationId: string,
) {
  let amount = amount0;
  if (i === 0) {
    amount ||= "all";
    if (
      amount === "all" ||
      amount === "half" ||
      amount.toString().endsWith("%")
    ) {
      if (action.name === "claim" && protocol === "etherfi") {
        action.args.amount = "1";
        throw new Unwind(Flow.Continue, "simaction");
      }
      if (action.name === "repay" && (amount === "all" || amount === "100%")) {
        action.args.repayAll = true;
      }
      await handleFromAction(
        action,
        tokensForActions,
        address,
        provider,
        chainId,
        rpcs,
        isOnlyOrigin,
        rawActions,
        chainName,
        checkpoints,
        conditions,
        connectedChainName,
        blockNumber,
        recur,
        baseLiquidity,
        protocol,
        printError,
        actions,
        i,
        token,
        amount,
        poolName,
        simulationId,
      );

      if (action.name === "borrow") {
        let borrowableAmount = await getBorrowableAmountForToken(
          chainId,
          protocol,
          address,
          token,
          rpcUrl,
          action.args.poolName?.toLowerCase(),
        );
        if (amount === "half") {
          borrowableAmount /= 2;
        } else if (amount.toString().endsWith("%")) {
          borrowableAmount =
            (borrowableAmount * Number.parseFloat(amount)) / 100;
        }
        if (borrowableAmount > 0) {
          action.args[getAmountKey(action.name)] =
            borrowableAmount.toLocaleString("fullwide", {
              useGrouping: false,
              minimumFractionDigits: tokenInfo?.decimals ?? 0,
              maximumFractionDigits: tokenInfo?.decimals ?? 0,
            });
        }
        throw new Unwind(Flow.Continue, "simaction");
      }
      if (action.name === "swap" && !isNaNValue(action.args.outputAmount)) {
        action.args[getAmountKey(action.name)] = undefined;
        throw new Unwind(Flow.Continue, "simaction");
      }
      action.gasCheck =
        toActions.includes(action.name) &&
        amount === "all" &&
        token.toLowerCase() === nativeToken?.toLowerCase();

      let newAmount = 0n;
      try {
        if (
          tokenInfo?.address === NATIVE_TOKEN ||
          tokenInfo?.address === NATIVE_TOKEN2 ||
          tokenInfo?.symbol?.toLowerCase() === nativeToken?.toLowerCase()
        ) {
          if (!rpcUrl) {
            throw new Unwind(Flow.Return, "simaction", {
              success: false,
              message: "RPC URL is not available",
            });
          }
          const ethBalance = await getEthBalanceForUser(
            chainId,
            address,
            rpcUrl,
            typeof blockNumber === "object"
              ? blockNumber[chainId]
              : blockNumber,
            zksyncid,
          );
          // replace "all", "half", "X%" to actual value
          if (amount.toString().endsWith("%")) {
            const percent = Math.floor(Number.parseFloat(amount) * 100);
            // allow 2 decimals for percentage
            newAmount = (ethBalance * ethers.getBigInt(percent)) / 10000n;
          } else {
            newAmount =
              amount === "half"
                ? (ethBalance *
                    ((await checkUniswapLikeDeposits(actions, i))
                      ? 49n
                      : 50n)) /
                  100n
                : ethBalance;
          }
        } else if (tokenInfo?.address) {
          let tokenBalance = 0n;
          if (
            isValidHyperliquidAddress(tokenInfo.address) ||
            (protocol === "hyperliquid" &&
              tokenInfo.symbol === "usdc" &&
              getHyperliquidActionSourceType(action) === "spot")
          ) {
            tokenBalance = getHyperliquidSpotBalance(rpcs, tokenInfo);
          } else {
            const viemClient = await getViemPublicClientFromEthers(provider);
            assert(isHexStr(tokenInfo.address));
            assert(isHexStr(address));
            tokenBalance =
              protocol === "hyperliquid" &&
              ["long", "short", "transfer"].includes(action.name)
                ? getHyperliquidBalance(rpcs)
                : await withRetry(address, () =>
                    viemClient.readContract({
                      address: tokenInfo.address as `0x${string}`,
                      abi: abis.erc20,
                      functionName: "balanceOf",
                      args: [address],
                    }),
                  );
          }
          // replace "all", "half", "X%" to actual value
          if (amount.toString().endsWith("%")) {
            const percent = Math.floor(Number.parseFloat(amount) * 100);
            // allow 2 decimals for percentage
            newAmount = (tokenBalance * ethers.getBigInt(percent)) / 10000n;
          } else {
            newAmount = amount === "half" ? tokenBalance / 2n : tokenBalance;
          }
        }
        if (
          newAmount === 0n &&
          !isValidHyperliquidAddress(tokenInfo?.address) &&
          (action.name !== "swap" || protocol !== "hyperliquid")
        ) {
          if (!isOnlyOrigin) {
            actions.splice(i, 1);
            throw new Unwind(Flow.Redo, "simaction");
          }
          const {
            message,
            chainId: chainId_,
            rpc,
          } = await resimulateWithBalance(
            { address, connectedChainName, rpcs },
            rawActions,
            actions,
            [0, 0],
          );
          if (!message || chainId_) {
            console.log(
              chainId_
                ? "Inference applied: retry with latest chain state, since token balance increased meanwhile"
                : "Inference applied: retry with an additional bridge, since no balance to fill amount",
            );
            sendInference(
              chainId_
                ? "Token balance has increased. Restarting the simulation to reflect the latest chain state for accurate processing."
                : "Insufficient balance detected. Adding an additional bridge to cover the required amount. Restarting the simulation with these updates.",
              rawActions,
              simulationId,
            );

            if (chainId_ && rpc) {
              rpcs[chainId_] = rpc;
            }

            await resetVnetStates(checkpoints, rpcs, chainId_);
            throw new Unwind(
              Flow.Return,
              "simaction",
              simulateActions(
                rawActions,
                conditions,
                address,
                connectedChainName,
                simulationId,
                rpcs,
                blockNumber,
                true,
                [...recur, -1],
                baseLiquidity,
              ),
            );
          }
          printError(message);
          throw new Unwind(Flow.Return, "simaction", {
            success: false,
            message,
            index: i,
          });
        }
        if (tokenInfo?.decimals) {
          action.args[getAmountKey(action.name)] = ethers.formatUnits(
            newAmount,
            tokenInfo.decimals,
          );
        }
      } catch (err) {
        if (err instanceof Unwind) throw err;
        printLog(
          `Cannot fill amount for ${token} token:`,
          getErrorMessage(err),
        );
        printError(err);
        actions.splice(i, 1);
        throw new Unwind(Flow.Redo, "simaction");
      }
      throw new Unwind(Flow.Continue, "simaction");
    }
  }
  return amount;
}

async function handleFromAction(
  action: SimAction,
  tokensForActions: PortfolioToken[] | undefined,
  address: string,
  provider: RetryProvider,
  chainId: ChainId,
  rpcs: JSONObject,
  isOnlyOrigin: boolean,
  rawActions: RawAction[],
  chainName: string | undefined,
  checkpoints: Record<string, string>,
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  baseLiquidity: number,
  protocol: string | undefined,
  printError: (...errs: unknown[]) => void,
  actions: SimAction[],
  i: number,
  token: string,
  amount: string,
  poolName: string | undefined,
  simulationId: string,
) {
  if (fromActions.includes(action.name)) {
    let tokens =
      tokensForActions ||
      (await getTokensForAction(
        address,
        action.name,
        action.args,
        { provider, chainId },
        rpcs,
      ));
    if (tokens.length === 0) {
      if (isOnlyOrigin) {
        const { status, chain, chains } = await getAlternativeChain(
          address,
          action,
          chainId,
          rpcs,
        );
        if (status) {
          await updateChains(rawActions, action, chain || "", chainName || "");

          console.log(
            `Inference applied: retry ${action.name} on ${chain}, since no position found to fill amount on ${chain}`,
          );
          sendInference(
            `The ${action.name} action is being retried on ${chain} because no position was found to cover the required amount. Restarting the simulation with updated actions.`,
            rawActions,
            simulationId,
          );

          await resetVnetStates(checkpoints, rpcs);
          throw new Unwind(
            Flow.Return,
            "simaction",
            simulateActions(
              rawActions,
              conditions,
              address,
              connectedChainName,
              simulationId,
              rpcs,
              blockNumber,
              true,
              [...recur, -1],
              baseLiquidity,
            ),
          );
        }

        const errorMsg = getNoPositionError(
          action.name,
          chainName,
          chains,
          protocol,
        );
        printError(errorMsg);
        throw new Unwind(Flow.Return, "simaction", {
          success: false,
          message: errorMsg,
          index: i,
        });
      }
      actions.splice(i, 1);
      throw new Unwind(Flow.Redo, "simaction");
    }
    const tokenStr =
      action.name === "close" &&
      protocol === "gmx" &&
      token.toLowerCase().startsWith("w")
        ? token.slice(1).toLowerCase()
        : token.toLowerCase();
    const temp = tokens.filter(
      (x) =>
        token === "all" ||
        token === "" ||
        (protocol === "pendle" &&
          extractPendleToken(x.poolName || "") === tokenStr) ||
        x.symbol.toLowerCase() === tokenStr,
    );

    if (temp.length > 0) {
      tokens = temp;
    } else {
      if (isOnlyOrigin) {
        const { status, chain, chains } = await getAlternativeChain(
          address,
          action,
          chainId,
          rpcs,
        );
        if (status) {
          await updateChains(rawActions, action, chain || "", chainName || "");

          console.log(
            `Inference applied: retry ${action.name} on ${chain}, since no proper position/owned token found to fill amount on ${chainName}`,
          );
          sendInference(
            `The ${action.name} action is being retried on ${chain} because no position was found to cover the required amount. Restarting the simulation with updated actions.`,
            rawActions,
            simulationId,
          );

          await resetVnetStates(checkpoints, rpcs);
          throw new Unwind(
            Flow.Return,
            "simaction",
            simulateActions(
              rawActions,
              conditions,
              address,
              connectedChainName,
              simulationId,
              rpcs,
              blockNumber,
              true,
              [...recur, -1],
              baseLiquidity,
            ),
          );
        }

        const errorMsg = getNoPositionError(
          action.name,
          chainName,
          chains,
          protocol,
          token,
          tokens.map((x) => x.symbol),
        );
        printError(errorMsg);
        throw new Unwind(Flow.Return, "simaction", {
          success: false,
          message: errorMsg,
          index: i,
        });
      }
      actions.splice(i, 1);
      throw new Unwind(Flow.Redo, "simaction");
    }

    let { amount: newAmount } = tokens[0];
    if (amount === "half") {
      newAmount /= 2n;
    } else if (amount.toString().endsWith("%")) {
      const percent = Math.floor(Number.parseFloat(amount) * 100);
      newAmount = (newAmount * ethers.getBigInt(percent)) / 10000n;
    }
    if (newAmount > 0n) {
      action.args[getAmountKey(action.name)] = ethers.formatUnits(
        newAmount,
        tokens[0].decimals,
      );
      if (protocol === "pendle" && action.name === "withdraw" && !poolName) {
        action.args.poolName = tokens[0].poolName;
      }
    }
    throw new Unwind(Flow.Continue, "simaction");
  }
}

async function handleToActionWithBorrow(
  tokenInfo0: TokenInfo | undefined,
  noBalance: boolean,
  i: number,
  action: SimAction,
  isOnlyOrigin: boolean,
  address: string,
  provider: RetryProvider,
  chainId: ChainId,
  rpcs: JSONObject,
  token: string,
  protocol: string | undefined,
  rawActions: RawAction[],
  checkpoints: Record<string, string>,
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  chainName: string | undefined,
  actions: SimAction[],
  baseLiquidity: number,
  isFirstChainMissing: boolean,
  simulationId: string,
) {
  const args = action.args;
  let shouldRetry = false;
  const tokenInfo = tokenInfo0;

  if (
    (!tokenInfo || noBalance) &&
    i === 0 &&
    (toActions.includes(action.name) || action.name === "borrow")
  ) {
    if (isOnlyOrigin && isHyperliquidAction(action)) {
      if (["long", "short"].includes(action.name)) {
        if (tokenInfo?.symbol?.toLowerCase() === "usdc") {
          const balance = getHyperliquidSpotBalance(rpcs, tokenInfo);
          const realAmount = args.realAmount || args.inputAmount || "0";
          const amount = sfParseUnits(
            isNaNValue(realAmount) ? 0 : realAmount,
            6,
          );
          if (balance >= amount && balance > 0) {
            const newAmount = await convertAmount(
              action.args,
              +ethers.formatUnits(amount || balance, 6),
            );
            rawActions.splice(action.origin - 1, 0, {
              name: "transfer",
              args: {
                token: "usdc",
                amount: newAmount
                  ? (Math.floor(+newAmount * 100) / 100).toString()
                  : undefined,
                protocolName: "hyperliquid",
                recipient: "perp",
                chainName: args.chainName,
              },
            });

            console.log(
              "Inference applied: retry with usdc transfer from spot to perp on hyperliquid",
            );
            sendInference(
              "An additional usdc transfer from spot to perp on hyperliquid has been added. Restarting the simulation with updated actions.",
              rawActions,
              simulationId,
            );

            shouldRetry = true;
          }
        }
        if (
          !shouldRetry &&
          (action.origin === 1 ||
            !(
              rawActions[action.origin - 2].name === "deposit" &&
              rawActions[action.origin - 2].args.protocolName?.toLowerCase() ===
                "hyperliquid"
            ))
        ) {
          rawActions.splice(action.origin - 1, 0, {
            name: "deposit",
            args: {
              token: args.inputToken,
              amount: args.inputAmount,
              amount_units: args.inputAmountUnits,
              protocolName: "hyperliquid",
              chainName: args.chainName,
            },
          });

          rawActions[action.origin].args.inputToken = "usdc";
          rawActions[action.origin].args.inputAmount = "outputAmount";
          rawActions[action.origin].args.inputAmountUnits = undefined;

          console.log(
            `Inference applied: retry with an additional ${args.inputToken} deposit to ${action.name} on hyperliquid`,
          );
          sendInference(
            `An additional ${args.inputToken} deposit has been added to enable the ${action.name} action on Hyperliquid. Restarting the simulation with updated actions.`,
            rawActions,
            simulationId,
          );

          shouldRetry = true;
        }
      } else if (action.name === "deposit") {
        const balances = await getTokenBalanceForAllChains(
          address,
          args.token,
          args.amount,
          rpcs,
        );
        if (balances.length > 0) {
          const newChain = balances[0].chainName;
          if (!isFirstChainMissing) {
            rawActions.splice(action.origin - 1, 0, {
              name: "bridge",
              args: {
                token: args.token,
                amount: args.amount,
                amount_units: args.amount_units,
                sourceChainName: newChain,
                destinationChainName: args.chainName,
              },
            });

            console.log(
              `Inference applied: retry with an additional ${args.token} bridge from ${newChain} to ${action.args.chainName} to deposit`,
            );
            sendInference(
              `An additional ${args.token} bridge from ${newChain} to ${action.args.chainName} has been added to enable the deposit. Restarting the simulation with updated actions.`,
              rawActions,
              simulationId,
            );
          } else {
            rawActions[action.origin - 1].args[getChainKey(action.name)] =
              newChain;

            console.log(`Inference applied: retry deposit on ${newChain}`);
            sendInference(
              `The deposit action is being retried on ${newChain} because the token is not available on ${chainName}. Restarting the simulation with updated actions.`,
              rawActions,
              simulationId,
            );
          }

          rawActions[action.origin].args.amount = "outputAmount";
          rawActions[action.origin].args.amount_units = undefined;

          console.log(
            `Inference applied: retry with an additional ${args.token} bridge from ${newChain} to ${action.args.chainName} to deposit`,
          );
          sendInference(
            `An additional ${args.token} bridge from ${newChain} to ${action.args.chainName} has been added to enable the deposit. Restarting the simulation with updated actions.`,
            rawActions,
            simulationId,
          );

          shouldRetry = true;
        } else {
          const tokens = (await getUserOwnedTokens(
            chainId,
            address,
            undefined,
            !isNaNValue(args.amount) ? Number(args.amount) : 0,
          )) as string[];

          if (tokens.length > 0) {
            rawActions.splice(action.origin - 1, 0, {
              name: "swap",
              args: {
                inputToken: tokens[0].toLowerCase(),
                outputToken: args.token,
                outputAmount: args.amount,
                chainName: "arbitrum",
              },
            });

            rawActions[action.origin].args.amount = "outputAmount";
            rawActions[action.origin].args.amount_units = undefined;

            console.log(
              `Inference applied: retry with an additional swap from ${tokens[0]} to ${args.token} to deposit`,
            );
            sendInference(
              `An additional swap from ${tokens[0]} to ${args.token} has been added to enable the deposit. Restarting the simulation with updated actions.`,
              rawActions,
              simulationId,
            );

            shouldRetry = true;
          }
        }
      } else if (
        action.name === "swap" &&
        tokenInfo?.symbol?.toLowerCase() === "usdc"
      ) {
        const balance = getHyperliquidBalance(rpcs);
        let realAmount =
          action.args.realAmount || action.args.inputAmount || "0";
        if (!realAmount && action.args.outputAmount) {
          realAmount = await getRoughAmountInForInference(
            action.args.inputToken || "",
            action.args.chainName || "",
            action.args.outputToken || "",
            action.args.chainName || "",
            action.args.inputAmount || "",
            action.args.outputAmount || "",
          );
        }
        const amount = sfParseUnits(isNaNValue(realAmount) ? 0 : realAmount, 6);
        if (balance >= amount && balance > 0) {
          const newAmount = await convertAmount(
            action.args,
            +ethers.formatUnits(amount || balance, 6),
          );
          rawActions.splice(action.origin - 1, 0, {
            name: "transfer",
            args: {
              token: "usdc",
              amount: newAmount
                ? (Math.floor(+newAmount * 100) / 100).toString()
                : undefined,
              protocolName: "hyperliquid",
              recipient: "spot",
              chainName: args.chainName,
            },
          });

          console.log(
            "Inference applied: retry with usdc transfer from perp to spot on hyperliquid",
          );
          sendInference(
            "An additional usdc transfer from perp to spot on hyperliquid has been added. Restarting the simulation with updated actions.",
            rawActions,
            simulationId,
          );

          shouldRetry = true;
        }
      }
    }
    if (
      isOnlyOrigin &&
      action.name === "repay" &&
      tokenInfo &&
      noBalance &&
      !shouldRetry
    ) {
      const tokens = await getTokensForAction(
        address,
        "repay",
        args,
        { provider, chainId },
        rpcs,
      );
      const temp = tokens.filter(
        (x) =>
          token === "all" ||
          token === "" ||
          protocol === "pendle" ||
          x.symbol.toLowerCase() === tokenInfo?.symbol?.toLowerCase(),
      );
      if (temp.length > 0) {
        const balances = await getTokenBalanceForAllChains(
          address,
          args.token,
          args.amount,
          rpcs,
        );
        if (balances.length === 1) {
          const newChain = balances[0].chainName;
          if (!isFirstChainMissing) {
            rawActions.splice(action.origin - 1, 0, {
              name: "bridge",
              args: {
                token: args.token,
                amount: args.amount,
                sourceChainName: newChain,
                destinationChainName: args.chainName,
              },
            });

            console.log(
              `Inference applied: retry with an additional ${args.token} bridge from ${newChain} to ${action.args.chainName} to repay`,
            );
            sendInference(
              `An additional ${args.token} bridge from ${newChain} to ${action.args.chainName} has been added to enable the repayment. Restarting the simulation with updated actions.`,
              rawActions,
              simulationId,
            );
          } else {
            await updateChains(
              rawActions,
              action,
              newChain || "",
              chainName || "",
              isFirstChainMissing,
            );

            console.log(`Inference applied: retry repay on ${newChain}`);
            sendInference(
              `The repayment action is being retried on ${newChain}. Restarting the simulation with updated actions.`,
              rawActions,
              simulationId,
            );
          }

          shouldRetry = true;
        }
      }
    }

    if (!shouldRetry) {
      const ownedTokenInfo = await getTokenPortfolio(chainId, address, token);
      if (
        !Array.isArray(ownedTokenInfo) &&
        ownedTokenInfo?.address &&
        tokenInfo?.address !== ownedTokenInfo.address
      ) {
        const tokenData = ownedTokenInfo as TokenInfo;
        await saveToken({
          address: tokenData.address || "",
          name: tokenData.name || "",
          symbol: tokenData.symbol || "",
          decimals: tokenData.decimals || 18,
          thumb: tokenData.thumb || "",
          chainId,
        });
        action.args.token1Address = ownedTokenInfo.address;
        clearTokenCache(
          chainName,
          tokenData.symbol,
          address,
          provider,
          action.name === "swap" ? baseLiquidity : 0,
        );
        return ownedTokenInfo;
      }

      const balances = await getTokenBalanceForAllChains(
        address,
        token,
        args[getAmountKey(action.name)],
        rpcs,
      );
      if (balances.length === 1) {
        const newChain = balances[0].chainName;
        if (isFirstChainMissing) {
          rawActions[action.origin - 1].args[getChainKey(action.name)] =
            newChain;

          console.log(
            `Inference applied: retry on ${newChain}, since token not found to proceed on given chain`,
          );
          sendInference(
            `The ${action.name} action is being retried on ${newChain} because the token is not available on ${chainName}. Restarting the simulation with updated actions.`,
            rawActions,
            simulationId,
          );

          shouldRetry = true;
        } else if (
          newChain?.toLowerCase() !== chainName?.toLowerCase() &&
          newChain?.toLowerCase() !==
            action?.args?.destinationChainName?.toLowerCase()
        ) {
          if (isHyperliquidAction(action)) {
            rawActions[action.origin - 1].args[getChainKey(action.name)] =
              newChain;
          } else {
            await updateChains(
              rawActions,
              action,
              newChain || "",
              chainName || "",
              isFirstChainMissing,
            );
          }

          console.log(
            `Inference applied: retry ${action.name} on ${newChain}, since ${token} does not exist on ${chainName}`,
          );
          sendInference(
            `The ${action.name} action is being retried on ${newChain} because ${token} is not available on ${chainName}. Restarting the simulation with updated actions.`,
            rawActions,
            simulationId,
          );
          shouldRetry = true;
        }
      } else if (!tokenInfo) {
        const { status, chainName: chain } = await validateTokenForChain(
          token,
          chainName,
          true,
          { address, rpcs },
        );
        if (
          status > 0 &&
          chain?.toLowerCase() !==
            action?.args?.destinationChainName?.toLowerCase()
        ) {
          if (isOnlyOrigin) {
            await updateChains(
              rawActions,
              action,
              chain || "",
              chainName || "",
              isFirstChainMissing,
            );

            console.log(
              `Inference applied: retry ${action.name} on ${chain}, since ${token} does not exist on ${chainName}`,
            );
            sendInference(
              `The ${action.name} action is being retried on ${chain} because ${token} is not available on ${chainName}. Restarting the simulation with updated actions.`,
              rawActions,
              simulationId,
            );
            shouldRetry = true;
          }
        }
      }
    }
    if (!shouldRetry) {
      const chains = await getTokenOwningChains(address, token);
      if (chains.length === 1) {
        if (!isFirstChainMissing) {
          rawActions.splice(action.origin - 1, 0, {
            name: "bridge",
            args: {
              token: args[getTokenKey(action.name)],
              amount: args[getAmountKey(action.name)],
              sourceChainName: chains[0],
              destinationChainName: args[getChainKey(action.name)],
            },
          });
          console.log(
            `Inference applied: retry with an additional ${args[getTokenKey(action.name)]} bridge from ${chains[0]} to ${action.args[getChainKey(action.name)]}, since user doesn't own token on given chain`,
          );
          sendInference(
            `An additional ${args.token} bridge from ${chains[0]} to ${action.args.chainName} has been added to enable the action since you don't own any ${args.token} on ${chainName}. Restarting the simulation with updated actions.`,
            rawActions,
            simulationId,
          );
        } else {
          await updateChains(
            rawActions,
            action,
            chains[0] || "",
            chainName || "",
            isFirstChainMissing,
          );

          console.log(
            `Inference applied: retry ${action.name} on ${chains[0]}`,
          );
          sendInference(
            `The ${action.name} action is being retried on ${chains[0]}. Restarting the simulation with updated actions.`,
            rawActions,
            simulationId,
          );
        }

        shouldRetry = true;
      }
    }

    if (!tokenInfo && !shouldRetry) {
      const { status, chainName: chain } = await validateTokenForChain(
        token,
        chainName,
        true,
        { address, rpcs },
      );
      if (
        status > 0 &&
        chain?.toLowerCase() !==
          action?.args?.destinationChainName?.toLowerCase()
      ) {
        if (isOnlyOrigin) {
          await updateChains(rawActions, action, chain || "", chainName || "");

          console.log(
            `Inference applied: retry ${action.name} on ${chain}, since ${token} does not exist on ${chainName}`,
          );
          sendInference(
            `The ${action.name} action is being retried on ${chain} because ${token} is not available on ${chainName}. Restarting the simulation with updated actions.`,
            rawActions,
            simulationId,
          );
          shouldRetry = true;
        }
      }
    }

    if (shouldRetry && recur.length < MAX_RECUR) {
      await resetVnetStates(checkpoints, rpcs);
      throw new Unwind(
        Flow.Return,
        "simaction",
        simulateActions(
          rawActions,
          conditions,
          address,
          connectedChainName,
          simulationId,
          rpcs,
          blockNumber,
          true,
          [...recur, -1],
          baseLiquidity,
        ),
      );
    }

    actions.splice(i, 1);
    throw new Unwind(Flow.Redo, "simaction");
  }
  return tokenInfo;
}

async function updateRange(
  action: SimAction,
  protocol: string | undefined,
  address: string,
  provider: RetryProvider,
  chainId: ChainId,
  rpcs: JSONObject,
  rawActions: RawAction[],
  chainName: string | undefined,
  checkpoints: Record<string, string>,
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  printError: (...errs: unknown[]) => void,
  baseLiquidity: number,
  simulationId: string,
) {
  let tokensForActions: PortfolioToken[] | undefined;

  if (
    !["deposit", "withdraw"].includes(action.name) ||
    (protocol &&
      !uniswapLikeProtocols.includes(protocol) &&
      protocol !== "ambient")
  ) {
    action.args.range = undefined;
  } else {
    let range = action.args.range;
    if (range?.endsWith("%")) {
      action.args.range = range.substr(0, range.length - 1);
    }

    tokensForActions = await getTokensForAction(
      address,
      "withdraw",
      action.args,
      { provider, chainId },
      rpcs,
    );
    if (tokensForActions.length === 0 && !range && protocol === "camelot") {
      tokensForActions = await getTokensForAction(
        address,
        "withdraw",
        { ...action.args, range: "1" },
        { provider, chainId },
        rpcs,
      );
      if (tokensForActions.length > 0) {
        action.args.range = range = "1";
      }
    }
    if (range && action.name === "withdraw" && tokensForActions.length === 0) {
      const { status, chain, chains } = await getAlternativeChain(
        address,
        action,
        chainId,
        rpcs,
      );
      if (status) {
        await updateChains(rawActions, action, chain || "", chainName || "");

        console.log(
          `Inference applied: retry ${action.name} from uniswap like ${protocol} on ${chain}, since no position found to fill token on ${chainName}`,
        );
        sendInference(
          `The ${action.name} action from a Uniswap-like protocol (${protocol}) is being retried on ${chain} because no position was found to supply the required token on ${chainName}. Restarting the simulation with updated actions.`,
          rawActions,
          simulationId,
        );

        await resetVnetStates(checkpoints, rpcs);
        throw new Unwind(
          Flow.Return,
          "simaction",
          simulateActions(
            rawActions,
            conditions,
            address,
            connectedChainName,
            simulationId,
            rpcs,
            blockNumber,
            true,
            [...recur, -1],
            baseLiquidity,
          ),
        );
      }

      const errorMsg = getNoPositionError(
        action.name,
        chainName,
        chains,
        protocol,
      );
      printError(errorMsg);
      throw new Unwind(Flow.Return, "simaction", {
        success: false,
        message: errorMsg,
      });
    }

    if (
      !range &&
      action.name === "withdraw" &&
      tokensForActions.length > 0 &&
      (tokensForActions[0].positionIndex || tokensForActions[0].lowerTick)
    ) {
      action.args.range = range = "1";
    }

    if (range && tokensForActions.length > 0) {
      action.args.tokenId = tokensForActions[0].positionIndex;

      if (action.name === "withdraw") {
        if (uniswapLikeProtocols.includes(action.args.protocolName || "")) {
          if (
            action.args.token?.toLowerCase() ===
              tokensForActions[0].symbol.toLowerCase() ||
            (action.args.token?.toLowerCase() === "eth" &&
              tokensForActions[0].symbol.toLowerCase() === "weth")
          ) {
            action.args.liquidity0 = tokensForActions[0].amount.toString();
            action.args.liquidity1 = tokensForActions[1].amount.toString();
          } else {
            action.args.liquidity0 = tokensForActions[1].amount.toString();
            action.args.liquidity1 = tokensForActions[0].amount.toString();
          }
        }
        if (action.args.protocolName === "ambient") {
          action.args.lowerTick = tokensForActions[0].lowerTick;
          action.args.upperTick = tokensForActions[0].upperTick;
        }
      }
    }
  }
  return tokensForActions;
}

function handleRepay(
  action: SimAction,
  token: string,
  prevActionIndexes: number[],
  actions: SimAction[],
  i: number,
  conditions: Call[],
) {
  if (
    ((!fromActions.includes(action.name) || action.name === "repay") &&
      !token) ||
    token === "outputToken"
  ) {
    const tokens: string[] = [];
    const addedTokens: JSONObject = {};
    // check prev action if exists
    if (prevActionIndexes.length > 0) {
      const prevAction = actions[prevActionIndexes[0]];
      if (prevAction.name === "claim") {
        handleClaim(prevActionIndexes, actions, addedTokens, tokens);
      } else if (prevAction.name === "bridge") {
        for (const index of prevActionIndexes) {
          const x = actions[index];
          const newToken = getOutputTokenSymbolForBridge(
            x.args.token || "",
            x.args.sourceChainName || "",
            x.args.destinationChainName || "",
          );
          if (newToken && !addedTokens[newToken.toLowerCase()]) {
            tokens.push(newToken);
            addedTokens[newToken.toLowerCase()] = true;
          }
        }
      } else {
        for (const index of prevActionIndexes) {
          const x = actions[index];
          const newToken = getOutputToken(x);
          if (newToken && !addedTokens[newToken.toLowerCase()]) {
            tokens.push(newToken);
            addedTokens[newToken.toLowerCase()] = true;
          }
        }
      }
    }
    if (tokens.length > 0) {
      actions.splice(
        i,
        1,
        ...tokens.map((token) => ({
          ...action,
          args: { ...action.args, [getTokenKey(action.name)]: token },
        })),
      );
      throw new Unwind(Flow.Redo, "simaction");
    }
    // if no prev action or unable to fill token from prev actions, but still condition exists
    if ((conditions || []).length > 0) {
      let tmp = "";
      for (let k = 0; k < conditions.length; k++) {
        if (conditions[k].name === "condition") {
          const temp = (conditions[k]?.body?.subject || "")
            .replace("price", "")
            .replace("market", "")
            .replace("cap", "")
            .replace("balance", "")
            .replace(" ", "")
            .replace("_", "");
          if (temp.length > 0) {
            tmp = temp;
            break;
          }
        }
      }
      if (!tmp) actions.splice(i, 1);
      else {
        actions.splice(i, 1, {
          ...action,
          args: { ...action.args, [getTokenKey(action.name)]: tmp },
        });
      }
      throw new Unwind(Flow.Redo, "simaction");
    }
  }
}

async function handle1stAction(
  token: string,
  i: number,
  action: SimAction,
  address: string,
  provider: RetryProvider,
  chainId: ChainId,
  rpcs: JSONObject,
  protocol: string | undefined,
  isOnlyOrigin: boolean,
  rawActions: RawAction[],
  chainName: string | undefined,
  checkpoints: Record<string, string>,
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  printError: (...errs: unknown[]) => void,
  actions: SimAction[],
  baseLiquidity: number,
  simulationId: string,
) {
  if ((!token && i === 0) || token === "all") {
    let tokens: string[] = [];
    if (fromActions.includes(action.name)) {
      tokens = (
        await getTokensForAction(
          address,
          action.name,
          action.args,
          { provider, chainId },
          rpcs,
        )
      ).map((tkn) => tkn.symbol);
    } else if (action.name === "deposit") {
      tokens = (await getUserOwnedTokens(chainId, address)) as string[];
      if (protocol !== "pendle") {
        const depositTokens = getTokensForDeposit(action.args, chainId);
        tokens = tokens.filter((token) =>
          depositTokens.includes(token.toLowerCase()),
        );
      }
    } else if (protocol === "ethena") {
      tokens = ["usde"];
    } else {
      if (action.name === "swap" && protocol === "hyperliquid") {
        tokens = (rpcs.hyperliquid || [])
          .filter((x: { type: string }) => x.type === "Spot")
          ?.tokens?.map((x: { symbol: string }) => x.symbol.toLowerCase());
      } else {
        tokens = (await getUserOwnedTokens(chainId, address)) as string[];
      }
    }
    const hasETH =
      tokens.filter(Boolean).filter((x) => x.toLowerCase() === "eth").length >
      0;
    tokens = tokens.filter(checkToken());
    if (action.name === "swap") {
      tokens = tokens.filter(
        (tkn) =>
          tkn && tkn.toLowerCase() !== action.args.outputToken?.toLowerCase(),
      );
    }
    if (tokens.length === 0 && !hasETH) {
      if (isOnlyOrigin) {
        const { status, chain, chains } = await getAlternativeChain(
          address,
          action,
          chainId,
          rpcs,
        );
        if (status) {
          await updateChains(rawActions, action, chain || "", chainName || "");

          const isHyperliquid =
            action.name === "swap" && protocol === "hyperliquid";

          console.log(
            `Inference applied: retry ${action.name} on ${chain}, since no proper token found to fill on ${isHyperliquid ? "Hyperliquid" : chainName}`,
          );
          sendInference(
            `The ${action.name} action is being retried on ${chain} because the required token was not available on ${chainName}. Restarting the simulation with updated actions.`,
            rawActions,
            simulationId,
          );

          await resetVnetStates(checkpoints, rpcs);
          throw new Unwind(
            Flow.Return,
            "simaction",
            simulateActions(
              rawActions,
              conditions,
              address,
              connectedChainName,
              simulationId,
              rpcs,
              blockNumber,
              true,
              [...recur, -1],
              baseLiquidity,
            ),
          );
        }

        const errorMsg = getNoPositionError(action.name, chainName, chains);
        printError(errorMsg);
        throw new Unwind(Flow.Return, "simaction", {
          success: false,
          message: errorMsg,
          index: i,
        });
      }
      actions.splice(i, 1);
      throw new Unwind(Flow.Redo, "simaction");
    }
    if (tokens.length === 0) tokens = ["eth"];
    else if (
      (fromActions.includes(action.name) || action.name === "borrow") &&
      hasETH
    )
      tokens.push("eth");
    const args = { ...action.args };
    if (!args[getAmountKey(action.name)]) {
      if (isNaNValue(args.outputAmount))
        args[getAmountKey(action.name)] = "all";
    }
    actions.splice(
      i,
      1,
      ...tokens.map((token) => ({
        ...action,
        args: {
          ...args,
          [action.name === "close" ? "outputToken" : getTokenKey(action.name)]:
            protocol === "pendle"
              ? extractPendleToken(token.toLowerCase())
              : token.toLowerCase(),
        },
      })),
    );
    throw new Unwind(Flow.Redo, "simaction");
  }
}

async function handleLpWithdraw(
  action: SimAction,
  i: number,
  protocol: string | undefined,
  token: string,
  address: string,
  provider: RetryProvider,
  chainId: ChainId,
  rpcs: JSONObject,
  isOnlyOrigin: boolean,
  rawActions: RawAction[],
  chainName: string | undefined,
  checkpoints: Record<string, string>,
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  printError: (...errs: unknown[]) => void,
  actions: SimAction[],
  nativeToken: string | undefined,
  baseLiquidity: number,
  simulationId: string,
) {
  if (
    action.name === "withdraw" &&
    i === 0 &&
    !action.lp &&
    protocol !== "pendle" &&
    (token.toLowerCase() === "liquidity" || (protocol && LPAddresses[protocol]))
  ) {
    let tokens = await getTokensForAction(
      address,
      "withdraw",
      action.args,
      { provider, chainId },
      rpcs,
    );
    if (tokens.length === 0) {
      if (isOnlyOrigin) {
        const { status, chain, chains } = await getAlternativeChain(
          address,
          action,
          chainId,
          rpcs,
        );
        if (status) {
          await updateChains(rawActions, action, chain || "", chainName || "");

          console.log(
            `Inference applied: retry withdrawing liquidity from ${protocol} on ${chain}, since no position found to fill token on ${chainName}`,
          );
          sendInference(
            `Retrying liquidity withdrawal from ${protocol} on ${chain} because no position was available to provide the required token on ${chainName}. Restarting the simulation with updated actions.`,
            rawActions,
            simulationId,
          );

          await resetVnetStates(checkpoints, rpcs);
          throw new Unwind(
            Flow.Return,
            "simaction",
            simulateActions(
              rawActions,
              conditions,
              address,
              connectedChainName,
              simulationId,
              rpcs,
              blockNumber,
              true,
              [...recur, -1],
              baseLiquidity,
            ),
          );
        }

        const errorMsg = getNoPositionError("withdraw", chainName, chains);
        printError(errorMsg, action);
        throw new Unwind(Flow.Return, "simaction", {
          success: false,
          message: errorMsg,
          index: i,
        });
      }
      actions.splice(i, 1);
      throw new Unwind(Flow.Redo, "simaction");
    }
    const tokenInfo = await getTokenInfoForChain(token, chainName);
    const temp = tokens.filter(
      (x) =>
        token === "all" ||
        token === "liquidity" ||
        token === "" ||
        x.symbol.toLowerCase() === tokenInfo?.symbol?.toLowerCase(),
    );
    if (temp.length > 0) {
      tokens = temp;
    } else {
      if (isOnlyOrigin) {
        let token_: PortfolioToken | undefined;
        if (token.toLowerCase() === nativeToken?.toLowerCase())
          token_ = tokens.find(
            (x) => x.symbol.toLowerCase() === `w${token.toLowerCase()}`,
          );
        else if (token.toLowerCase() === `w${nativeToken?.toLowerCase()}`)
          token_ = tokens.find(
            (x) => x.symbol.toLowerCase() === token.slice(1).toLowerCase(),
          );
        if (token_) {
          rawActions[action.origin - 1].args.token = token_.symbol;
          rawActions.splice(action.origin, 0, {
            name: "swap",
            args: {
              inputToken: token_.symbol,
              outputToken: token,
              inputAmount: "outputAmount",
              chainName,
            },
          });

          console.log(
            `Inference applied: retry with an additional swap from ${token_.symbol} to ${token} according to liquidity position`,
          );
          sendInference(
            `An additional swap from ${token_.symbol} to ${token} has been added based on the available liquidity position. Restarting the simulation with updated actions.`,
            rawActions,
            simulationId,
          );

          await resetVnetStates(checkpoints, rpcs);
          throw new Unwind(
            Flow.Return,
            "simaction",
            simulateActions(
              rawActions,
              conditions,
              address,
              connectedChainName,
              simulationId,
              rpcs,
              blockNumber,
              true,
              [...recur, -1],
              baseLiquidity,
            ),
          );
        }

        const { status, chain, chains } = await getAlternativeChain(
          address,
          action,
          chainId,
          rpcs,
        );
        if (status) {
          await updateChains(rawActions, action, chain || "", chainName || "");

          console.log(
            `Inference applied: retry withdrawing liquidity from ${protocol} on ${chain}, since no proper position found to fill token on ${chainName}`,
          );
          sendInference(
            `Retrying liquidity withdrawal from ${protocol} on ${chain} because no suitable position was found to provide the required token on ${chainName}. Restarting the simulation with updated actions.`,
            rawActions,
            simulationId,
          );

          await resetVnetStates(checkpoints, rpcs);
          throw new Unwind(
            Flow.Return,
            "simaction",
            simulateActions(
              rawActions,
              conditions,
              address,
              connectedChainName,
              simulationId,
              rpcs,
              blockNumber,
              true,
              [...recur, -1],
              baseLiquidity,
            ),
          );
        }

        const errorMsg = getNoPositionError(
          "withdraw",
          chainName,
          chains,
          undefined,
          token,
          tokens.map((x) => x.symbol),
        );
        printError(errorMsg, action);
        throw new Unwind(Flow.Return, "simaction", {
          success: false,
          message: errorMsg,
          index: i,
        });
      }
      actions.splice(i, 1);
      throw new Unwind(Flow.Redo, "simaction");
    }

    actions.splice(
      i,
      1,
      ...(await Promise.all(tokens.map(getActions(action, chainId, provider)))),
    );
    const actions0 = actions.filter((x) => x.lp !== null);
    throw new Unwind(Flow.Redo, "simaction", actions0);
  }
}

async function handleSwap(
  action: SimAction,
  token: string | string[],
  isOnlyOrigin: boolean,
  actions: SimAction[],
  i: number,
  rawActions: RawAction[],
  checkpoints: Record<string, string>,
  rpcs: JSONObject,
  conditions: Call[],
  address: string,
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  baseLiquidity: number,
  simulationId: string,
) {
  if (action.name === "swap" && Array.isArray(token)) {
    const tokens = token;
    let amounts: string | string[] | undefined = action.args.inputAmount;
    if (!amounts) {
      amounts = new Array(tokens.length).fill("all");
    } else if (!Array.isArray(amounts)) {
      amounts = new Array(tokens.length).fill(amounts);
    } else if (tokens.length !== amounts.length) {
      if (isOnlyOrigin) {
        throw new Unwind(Flow.Return, "simaction", {
          success: false,
          message: "Input array length mismatch!",
        });
      }
      actions.splice(i, 1);
      throw new Unwind(Flow.Redo, "simaction");
    }
    actions.splice(
      i,
      1,
      ...tokens.map((token, j) => ({
        ...action,
        args: {
          ...action.args,
          inputToken: token,
          inputAmount: amounts[j],
        },
      })),
    );
    const nextAction = actions[i + tokens.length];
    if (
      nextAction &&
      nextAction.name !== "swap" &&
      (!nextAction.args.amount || nextAction.args.amount === "outputAmount")
    ) {
      const rawAction = rawActions[action.origin - 1];
      rawActions.splice(
        action.origin - 1,
        1,
        ...tokens.map((token, j) => ({
          ...rawAction,
          args: {
            ...rawAction.args,
            inputToken: token,
            inputAmount: amounts[j],
          },
        })),
      );
      const tempAction = rawActions[action.origin + tokens.length - 1];
      rawActions.splice(action.origin + tokens.length - 1, 1);
      for (let j = 0; j < tokens.length; j++) {
        rawActions.splice(
          action.origin + j * 2,
          0,
          JSON.parse(JSON.stringify(tempAction)),
        );
      }

      console.log(
        "Inference applied: following actions need to be duplicated according to array swap",
      );
      sendInference(
        "The following actions have been duplicated to align with the required swap sequence. Restarting the simulation with updated actions.",
        rawActions,
        simulationId,
      );

      await resetVnetStates(checkpoints, rpcs);
      throw new Unwind(
        Flow.Return,
        "simaction",
        simulateActions(
          rawActions,
          conditions,
          address,
          connectedChainName,
          simulationId,
          rpcs,
          blockNumber,
          true,
          [...recur, -1],
          baseLiquidity,
        ),
      );
    }
    throw new Unwind(Flow.Redo, "simaction");
  }
}

async function inferToken(
  actions: SimAction[],
  rawActions: RawAction[],
  checkpoints: Record<string, string>,
  rpcs: JSONObject,
  conditions: Call[],
  address: string,
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  baseLiquidity: number,
  simulationId: string,
) {
  /* eslint-disable no-await-in-loop */
  for (let i = 1; i < actions.length; i++) {
    if (!checkIfOnlyOrigin(actions, i - 1) || !checkIfOnlyOrigin(actions, i))
      continue;

    const prevAction = actions[i - 1];
    const action = actions[i];
    if (prevAction.name === "swap" && action.name === "bridge") {
      const prevOutToken = prevAction.args.outputToken?.toLowerCase();
      const token = action.args.token?.toLowerCase();
      const prevChain = prevAction.args.chainName;
      const chain = action.args.sourceChainName;
      if (
        prevOutToken === token &&
        prevChain === chain &&
        prevOutToken !== "eth" &&
        prevOutToken !== "weth"
      ) {
        // Parallelize the validateTokenForChain calls
        const [{ status: status1 }, { status: status2 }] = await Promise.all([
          validateTokenForChain(prevOutToken || "", prevChain || "", false, {
            liquidityThreshold: baseLiquidity,
          }),
          validateTokenForChain(
            prevOutToken || "",
            action.args.destinationChainName || "",
            false,
            { liquidityThreshold: baseLiquidity },
          ),
        ]);

        if (
          (status1 !== 0 && status2 === 0) ||
          (status1 === 0 && status2 !== 0)
        ) {
          const middleToken = await getMiddleToken(action.args);
          if (middleToken) {
            if (middleToken === prevAction.args.inputToken?.toLowerCase()) {
              const temp = { ...rawActions[action.origin - 1] };
              temp.args.token = middleToken;
              temp.args.amount = await getRoughAmountInForInference(
                middleToken,
                action.args.destinationChainName || "",
                prevAction.args.outputToken || "",
                action.args.destinationChainName || "",
                prevAction.args.inputAmount || "",
                prevAction.args.outputAmount || "",
              );
              temp.args.amount_units = prevAction.args.inputAmountUnits;
              temp.args.sourceChainName = prevChain;
              temp.args.destinationChainName = action.args.destinationChainName;

              rawActions[action.origin - 1] = {
                ...rawActions[prevAction.origin - 1],
              };
              rawActions[action.origin - 1].args.inputToken = middleToken;
              rawActions[action.origin - 1].args.inputAmount = "outputAmount";
              rawActions[action.origin - 1].args.inputAmountUnits = undefined;
              rawActions[action.origin - 1].args.outputAmount = undefined;
              rawActions[action.origin - 1].args.chainName =
                action.args.destinationChainName;
              rawActions[prevAction.origin - 1] = temp;
            } else {
              rawActions[prevAction.origin - 1].args.outputToken = rawActions[
                action.origin - 1
              ].args.token = middleToken;
              rawActions.splice(action.origin, 0, {
                name: "swap",
                args: {
                  inputToken: middleToken,
                  inputAmount: "outputAmount",
                  outputToken: token,
                  chainName: action.args.destinationChainName,
                },
              });
            }

            console.log(
              "Inference applied: retry with an additional swap before execution",
            );
            sendInference(
              "An additional swap has been added prior to execution. Restarting the simulation with updated actions.",
              rawActions,
              simulationId,
            );

            await resetVnetStates(checkpoints, rpcs);
            throw new Unwind(
              Flow.Return,
              "simaction",
              simulateActions(
                rawActions,
                conditions,
                address,
                connectedChainName,
                simulationId,
                rpcs,
                blockNumber,
                true,
                [...recur, -1],
                baseLiquidity,
              ),
            );
          }
        }
      }
    }
  }
}

function checkMultiDeposit(actions: SimAction[], rawActions: RawAction[]) {
  for (let i = 1; i < actions.length; i++) {
    const prevAction = actions[i - 1];
    const action = actions[i];

    if (action.name === "notification") {
      continue;
    }

    if (!prevAction || !action) continue;

    if (
      prevAction.name === "deposit" &&
      action.name === "deposit" &&
      prevAction.args.protocolName === action.args.protocolName &&
      prevAction.args.poolName === action.args.poolName &&
      prevAction.args.chainName === action.args.chainName
    ) {
      const { poolName } = prevAction.args;
      if (!poolName) continue;

      let prevToken = prevAction.args.token?.toLowerCase();
      let token = action.args.token?.toLowerCase();
      if (prevAction.args.protocolName?.toLowerCase() === "pendle") {
        const newPoolName = isMultiSideDeposit(prevToken || "", token || "");
        if (poolName.toLowerCase() === newPoolName) {
          const amt = action.args.realAmount || action.args.amount;
          const newActionBase = {
            ...prevAction,
            args: {
              ...prevAction.args,
              // Only add token2 and amount2 if amt is not "outputAmount"
              token: prevToken,
              token2: token,
              amount2: amt,
            },
          };
          actions.splice(i - 1, 2, newActionBase);
          rawActions.splice(prevAction.origin - 1, 2, newActionBase);
          i -= 2;
        }
      } else if (prevToken !== token) {
        const poolSymbols = splitPool(poolName);
        if (poolSymbols.length < 2) continue;

        if (
          poolSymbols.includes(prevToken || "") ||
          poolSymbols.includes(token || "")
        ) {
          // found 2 consecutive deposit into same pool
          // merge 2 deposits into 1
          if (!poolSymbols.includes(prevToken || "")) {
            prevToken = poolSymbols.find((x) => x !== token);
          } else if (!poolSymbols.includes(token || "")) {
            token = poolSymbols.find((x) => x !== prevToken);
          }
          const amt = action.args.realAmount || action.args.amount;
          const newActionBase = {
            ...prevAction,
            args: {
              ...prevAction.args,
              // Only add token2 and amount2 if amt is not "outputAmount"
              token: prevToken,
              token2: token,
              amount2: amt,
            },
          };
          actions.splice(i - 1, 2, newActionBase);
          rawActions.splice(prevAction.origin - 1, 2, newActionBase);
          i -= 2;
        }
      }
    }
  }
}

function handleClaim(
  prevActionIndexes: number[],
  actions: SimAction[],
  addedTokens: JSONObject,
  tokens: string[],
) {
  for (const index of prevActionIndexes) {
    const x = actions[index];
    if (x.args.poolName === "any") {
      const protocol = x.args.protocolName;
      if (protocol === "jonesdao" && !addedTokens.jones) {
        tokens.push("jones");
        addedTokens.jones = true;
      } else if (protocol === "lodestar" && !addedTokens.weth) {
        tokens.push("weth");
        addedTokens.weth = true;
      } else if (
        protocol === "plutus" &&
        !addedTokens.plsdpx &&
        !addedTokens.plsjones
      ) {
        tokens.push("plsDPX");
        addedTokens.plsdpx = true;
        tokens.push("plsJones");
        addedTokens.plsjones = true;
      }
    } else if (x.args.protocolName === "stargate") {
      if (!addedTokens.stg) {
        tokens.push("stg");
        addedTokens.stg = true;
      }
    } else if (x.args.poolName && !addedTokens[x.args.poolName.toLowerCase()]) {
      tokens.push(x.args.poolName);
      addedTokens[x.args.poolName.toLowerCase()] = true;
    }
  }
}

function checkDeposit(actions: SimAction[]) {
  for (let i = 1; i < actions.length; i++) {
    const prevAction = actions[i - 1];
    const action = actions[i];

    if (!prevAction || !action) continue;

    if (
      prevAction.name === "deposit" &&
      action.name === "deposit" &&
      prevAction.args.protocolName === action.args.protocolName &&
      (!prevAction.args.poolName ||
        prevAction.args.poolName.toLowerCase() === "lp") &&
      (!action.args.poolName || action.args.poolName.toLowerCase() === "lp") &&
      prevAction.args.chainName === action.args.chainName
    ) {
      const prevToken = prevAction.args.token?.toLowerCase();
      const token = action.args.token?.toLowerCase();

      if (prevAction.args.protocolName?.toLowerCase() === "pendle") {
        const newPoolName = isMultiSideDeposit(
          prevAction.args.token || "",
          action.args.token || "",
        );
        if (newPoolName) {
          action.args.poolName = newPoolName;
          prevAction.args.poolName = newPoolName;
          ++i;
        }
      } else if (prevToken !== token) {
        // found 2 consecutive deposit into same protocol without poolname
        // fill poolname
        const poolName = `${prevToken}-${token}`;
        action.args.poolName = poolName;
        prevAction.args.poolName = poolName;
        ++i;
      }
    }
  }
}

async function hyperLPos(
  actions: SimAction[],
  address: string,
  rpcs: JSONObject,
) {
  /* eslint-disable no-await-in-loop */
  for (const action of actions) {
    if (isHyperliquidAction(action)) {
      const positions = await getUserProtocolPositionsFromHyperliquid(address);
      rpcs.hyperliquid = positions?.[42161]?.Hyperliquid?.positions || [];
      break;
    }
  }
}

function verifyActions(actions: SimAction[]) {
  for (let i = 0; i < actions.length; i++) {
    const { name, args } = actions[i];
    if (!name) {
      throw new Unwind(Flow.Return, "simaction", {
        success: false,
        message: "Action name is required for simulation.",
      });
    }
    if (name.toLowerCase() === "bridge" && !args.destinationChainName) {
      throw new Unwind(Flow.Return, "simaction", {
        success: false,
        message: "Bridge destination chain name is required for simulation.",
      });
    }
    if (name.toLowerCase() === "swap" && !args.outputToken) {
      throw new Unwind(Flow.Return, "simaction", {
        success: false,
        message: "Swap output token is required for simulation.",
      });
    }
  }
}

function getChainNativeSymbol(chain: string) {
  const chainId = getChainIdFromName(chain);
  return chainId !== undefined
    ? getNativeTokenSymbolForChain(chainId)
    : undefined;
}

function labelToken(rpcs: JSONObject, address: string) {
  return async (action: SimAction) => {
    if (!action.args.token2) return;

    const chainName = action.args[getChainKey(action.name)];
    const chainId = getChainIdFromName(chainName);
    if (!chainId) {
      throw new Error(getChainError(chainName || ""));
    }
    const rpcUrl = rpcs[chainId] || getRpcUrlForChain(chainId);
    const provider = new RetryProvider(rpcUrl, chainId);
    const tokenInfo = await getTokenInfoForChain(
      action.args.token2,
      chainName,
      false,
      { account: address, provider },
    );
    if (tokenInfo?.isMultiple) action.args.token2Address = tokenInfo.address;
  };
}

function checkToken(): (
  value: string,
  index: number,
  array: string[],
) => unknown {
  return (tkn) => {
    const lowercaseToken = tkn ? tkn.toLowerCase() : undefined;
    return (
      lowercaseToken &&
      lowercaseToken !== "eth" &&
      !lowercaseToken.includes("http") &&
      !lowercaseToken.includes(".com") &&
      !lowercaseToken.includes(".io") &&
      (lowercaseToken.match(/ /g) || []).length < 3
    );
  };
}

function getLPAction(
  action: SimAction,
  chainId: ChainId,
  provider: RetryProvider,
): (
  value: JSONObject,
  index: number,
  array: JSONObject[],
) => Promise<SimAction> {
  return async ({ decimals, ...args }) => {
    const newArg = {
      ...action.args,
      ...args,
      amount: ethers.formatUnits(args.amount, decimals),
    };
    const { lp, token } = await getLPTokenInfo(newArg, chainId, provider);
    if (action.name === "withdraw") newArg.token = token;
    return {
      ...action,
      args: newArg,
      lp:
        action.name === "withdraw" && args.protocolName in LPAddresses
          ? lp
          : undefined,
    };
  };
}

function getActions(
  action: SimAction,
  chainId: ChainId,
  provider: RetryProvider,
): (
  value: PortfolioToken,
  index: number,
  array: PortfolioToken[],
) => Promise<SimAction> {
  return async ({ decimals, symbol, amount, poolName }) => {
    const { lp, token } = await getLPTokenInfo(
      { ...action.args, poolName, token: symbol },
      chainId,
      provider,
    );
    let newAmount = amount;
    if (action.args.amount === "half") newAmount /= 2n;
    else if (action.args.amount?.endsWith("%")) {
      const percent = Math.floor(Number.parseFloat(action.args.amount) * 100);
      newAmount = (newAmount * ethers.getBigInt(percent)) / 10000n;
    } else if (
      !isNaNValue(action.args.amount) &&
      sfParseUnits(action.args.amount || "0", decimals) < newAmount
    )
      newAmount = sfParseUnits(action.args.amount || "0", decimals);
    else newAmount = (newAmount * 999n) / 1000n;

    return {
      ...action,
      args: {
        ...action.args,
        token,
        amount: ethers.formatUnits(newAmount, decimals),
      },
      lp,
    };
  };
}

function fillPool(
  action: SimAction,
  protocol: string | undefined,
): (
  value: PortfolioToken,
  index: number,
  array: PortfolioToken[],
) => SimAction {
  return ({ decimals, symbol, amount, poolName }) => {
    let newAmount = amount;
    if (action.args.amount === "half") newAmount /= 2n;
    else if (action.args.amount?.endsWith("%")) {
      const percent = Math.floor(Number.parseFloat(action.args.amount) * 100);
      newAmount = (newAmount * ethers.getBigInt(percent)) / 10000n;
    } else if (
      !isNaNValue(action.args.amount) &&
      sfParseUnits(action.args.amount || "0", decimals) < newAmount
    )
      newAmount = sfParseUnits(action.args.amount || "0", decimals);
    else newAmount = (newAmount * 999n) / 1000n;

    return {
      ...action,
      args: {
        ...action.args,
        poolName,
        [action.name === "close" ? "outputToken" : getTokenKey(action.name)]:
          protocol === "pendle" && action.args.token
            ? action.args.token
            : symbol,
        [getAmountKey(action.name)]: ethers.formatUnits(newAmount, decimals),
      },
    };
  };
}

function replaceToken() {
  return async (action: SimAction) => {
    if (action.name !== "swap") {
      return;
    }

    const outputToken = action.args.outputToken;
    if (isValidAddress(outputToken)) {
      const chainName = action.args.chainName;
      const chainId = getChainIdFromName(chainName);
      if (!chainId) {
        throw new Error(getChainError(chainName || ""));
      }
      const rpcUrl = getRpcUrlForChain(chainId);
      const provider = new RetryProvider(rpcUrl, chainId);
      try {
        const viemClient = await getViemPublicClientFromEthers(provider);
        assert(isHexStr(outputToken));
        const [token0, token1] = await Promise.all([
          viemClient.readContract({
            address: outputToken,
            abi: abis["uniswap-pair"],
            functionName: "token0",
          }),
          viemClient.readContract({
            address: outputToken,
            abi: abis["uniswap-pair"],
            functionName: "token1",
          }),
        ]);
        const nativeTokenSymbol = getNativeTokenSymbolForChain(chainId);
        const [wrappedNative, usdcToken, usdtToken, daiToken] =
          await Promise.all([
            getTokenInfoForChain(`W${nativeTokenSymbol}`, chainName),
            getTokenInfoForChain("USDC", chainName),
            getTokenInfoForChain("USDT", chainName),
            getTokenInfoForChain("DAI", chainName),
          ]);
        const tokens = [
          wrappedNative?.address?.toLowerCase(),
          usdcToken?.address?.toLowerCase(),
          usdtToken?.address?.toLowerCase(),
          daiToken?.address?.toLowerCase(),
        ].filter((tkn) => !!tkn);
        const token0Idx = tokens.indexOf(token0.toLowerCase());
        const token1Idx = tokens.indexOf(token1.toLowerCase());
        if (
          (token0Idx < 0 && token1Idx < 0) ||
          (token0Idx >= 0 && token1Idx >= 0)
        ) {
          throw new Error(
            "Please specify which token of the pair you would like to swap to.",
          );
        }
        action.args.outputToken = token0Idx < 0 ? token0 : token1;
      } catch (err) {
        if (err instanceof Unwind) throw err;
        /* empty */
      }
    }
  };
}

function fillNames(): (
  value: SimAction,
  index: number,
) => Promise<{
  action: SimAction | null;
  keep: boolean;
  index: number;
}> {
  return async (action, index) => {
    if (action.name !== "deposit" && action.name !== "withdraw") {
      return { action, keep: true, index };
    }

    const { protocolName, poolName, sourceChainName, chainName } = action.args;
    if (poolName && isValidAddress(poolName)) {
      const srcChainName = sourceChainName || chainName;
      const srcChainId = getChainIdFromName(srcChainName);
      if (!srcChainId) {
        return { action: null, keep: false, index };
      }
      const { protocolName: protocolName_, poolName: poolName_ } =
        await getProtocolPoolNameForChain(
          protocolName?.toLowerCase(),
          srcChainId,
          poolName,
        );

      action.args.protocolName = protocolName_ ?? undefined;
      action.args.poolName = poolName_ ?? undefined;

      if (!protocolName_ && !poolName_) {
        return { action: null, keep: false, index };
      }
    }

    return { action, keep: true, index };
  };
}

function saveCheckpoint(
  checkpoints: JSONObject,
  rpcs: JSONObject,
  address: string,
): (value: string, index: number, array: string[]) => Promise<void> {
  return async (chainId) => {
    if (chainId.includes("hyperliquid")) {
      checkpoints[chainId] = JSON.parse(JSON.stringify(rpcs[chainId]));
    } else {
      const result = await withRetry(address, () =>
        new RetryProvider(rpcs[+chainId], +chainId).send("evm_snapshot", []),
      );
      checkpoints[chainId] = result;
    }
  };
}

function getVnet(
  address: string,
  blockNumber: string | JSONObject | undefined,
  rpcs: JSONObject,
): (value: number, index: number, array: number[]) => Promise<void> {
  return async (chainId) => {
    const { rpcUrl } = await withRetry(address, () =>
      createVnet(
        chainId,
        typeof blockNumber === "object" ? blockNumber[chainId] : blockNumber,
      ),
    );
    rpcs[chainId] = rpcUrl;
  };
}

function updateArgs(
  protocols: JSONObject[],
  action: SimAction,
  newArgs: JSONObject[],
) {
  for (const { name, positions } of protocols) {
    for (const {
      poolName,
      name: posName,
      positionIndex,
      lowerTick,
      upperTick,
      supply,
      borrow,
      reward,
    } of positions) {
      const keys = getKeysForAction(action.name);
      if (name === "pendle" && action.name === "withdraw") {
        keys.push("Staked");
      }
      const tokens: PortfolioToken[] = [];
      if (action.name !== "repay") {
        if (supply && supply.length > 0 && keys.includes(posName)) {
          tokens.push(
            ...supply.map((x: PortfolioToken) => ({
              ...x,
              lowerTick,
              upperTick,
            })),
          );
        } else if (action.name === "claim" && reward && reward?.length > 0) {
          tokens.push(...reward);
        }
      } else if (borrow && borrow.length > 0) {
        tokens.push(...borrow);
      }

      for (const { symbol: token, amount, decimals, ...x } of tokens) {
        const data: JSONObject = {
          protocolName: name,
          token,
          amount: ((amount * 99n) / 100n).toString(),
          decimals,
        };
        if (poolName) data.poolName = poolName;
        if (
          action.name === "withdraw" &&
          !action.args.range &&
          (positionIndex || x.lowerTick)
        ) {
          data.range = "1";
          data.tokenId = positionIndex;
        }
        newArgs.push(data);
      }
    }
  }
}

async function simViaVnets(
  tempActions: SimResultAction[],
  actions: SimResultAction[],
  address: string,
  rpcs: JSONObject,
  zksyncid: number | undefined,
  prevChainId0: ChainId | null,
  simTxs0: Transaction[],
  rawActions: RawAction[],
  checkpoints: JSONObject,
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  indexesToRemove: number[],
  printError: (...args: unknown[]) => void,
  printLog: (...args: unknown[]) => void,
  feeConfig: FeeConfig | null,
  tokenInfos: Record<string, Partial<TokenInfo>>,
  retry: boolean,
  baseLiquidity: number,
  isFirstChainMissing: boolean,
  simulationId: string,
) {
  let simTxs = simTxs0;
  let prevChainId = prevChainId0;
  /* eslint-disable no-await-in-loop */
  let usedPoolNames: string[] = [];
  for (let i = 0; i < tempActions.length; i++) {
    const action = tempActions[i];
    if (action.origin !== tempActions[i - 1]?.origin) usedPoolNames = [];

    if (action.name === "notification") {
      continue;
    }

    const protocol = action.args.protocolName?.toLowerCase();
    let poolName = action.args.poolName?.toLowerCase();

    poolName = forkPoolName(
      action,
      protocol,
      poolName,
      tempActions,
      i,
      actions,
    );

    let body = fillBody(action.name, action.args, address);

    const sourceChainName =
      action.args[getChainKey(action.name)]?.toLowerCase();
    const chainId = getChainIdFromName(sourceChainName || "");
    const { rpcUrl, provider } = extractProvider(chainId, rpcs, zksyncid);
    if (!chainId) {
      throw new Error(getChainError(sourceChainName || ""));
    }
    const nativeTokenSymbol = (
      getNativeTokenSymbolForChain(chainId) || ""
    ).toLowerCase();
    if (prevChainId !== chainId) {
      simTxs = [];
    }
    prevChainId = chainId;

    let curToken: string = (
      body.token1Address ||
      body[getTokenKey(action.name)] ||
      ""
    ).toLowerCase();

    try {
      // simvnet
      clearTokenCache(
        sourceChainName,
        body[getTokenKey(action.name)],
        address,
        provider,
        baseLiquidity,
      );
      let tokenInfo = await getTokenInfoForChain(
        curToken,
        sourceChainName,
        false,
        {
          account: address,
          provider,
          liquidityThreshold: action.name === "swap" ? baseLiquidity : 0,
        },
      );
      curToken = await getCurToken(
        tokenInfo,
        action,
        actions,
        i,
        curToken,
        body,
        tempActions,
        sourceChainName,
        provider,
        address,
        rpcs,
        rawActions,
        checkpoints,
        conditions,
        connectedChainName,
        blockNumber,
        recur,
        baseLiquidity,
        isFirstChainMissing,
        simulationId,
      );

      const tempProvider = new RetryProvider(
        chainId === 1
          ? "https://ethereum-rpc.publicnode.com"
          : getRpcUrlForChain(chainId),
        chainId,
      );
      const {
        gasPrice: oldGas,
        maxFeePerGas,
        maxPriorityFeePerGas,
      } = await withRetry(address, () => tempProvider.getFeeData());
      const gasPrice =
        maxFeePerGas === null || maxPriorityFeePerGas === null
          ? oldGas
          : maxFeePerGas + maxPriorityFeePerGas;
      if (gasPrice === null) {
        throw new Error("No gas price found");
      }

      // fill NaN amounts in real-time
      let nativeAmount = 0n;
      let token: string | TokenInfo | undefined = undefined;
      const amountKeys = ["amount", "amount2"];
      ({ nativeAmount, poolName } = await fillNaN(
        amountKeys,
        body,
        curToken,
        action,
        sourceChainName || "",
        protocol || "",
        rpcs,
        address,
        provider,
        chainId,
        indexesToRemove,
        i,
        tempActions,
        rawActions,
        checkpoints,
        conditions,
        connectedChainName,
        blockNumber,
        recur,
        printError,
        poolName || "",
        usedPoolNames,
        actions,
        rpcUrl || "",
        nativeTokenSymbol,
        zksyncid,
        nativeAmount,
        token || "",
        baseLiquidity,
        simulationId,
      ));
      if (poolName) usedPoolNames.push(poolName);

      let chainName: string | undefined = undefined;
      ({ token, chainName } = getTokenNChain(
        action,
        token,
        body,
        chainName,
        sourceChainName,
        protocol,
        poolName,
      ));

      let setAmountToAll = false;
      // Check final amount
      ({ tokenInfo, curToken, setAmountToAll } = await checkFinalAmount(
        action,
        tokenInfo,
        nativeTokenSymbol,
        chainId,
        address,
        rpcUrl,
        blockNumber,
        zksyncid,
        protocol || "",
        rpcs,
        provider,
        sourceChainName || "",
        actions,
        i,
        body,
        curToken,
        printError,
        indexesToRemove,
        tempActions,
        setAmountToAll,
        rawActions,
        checkpoints,
        conditions,
        connectedChainName,
        recur,
        token,
        printLog,
        baseLiquidity,
        simulationId,
      ));

      let gmxPositions: GMXPosition[] = [];
      gmxPositions = await handleGmxClose(
        action,
        protocol,
        body,
        chainId,
        gmxPositions,
        address,
        provider,
      );

      const {
        error,
        txs,
        txNames,
        signData,
        source,
        alternatives,
        mockBalanceChanges,
        checkGas,
        body: newBody,
        amountOut,
      } = await getTransactions(
        { provider, rpcs, chainId, account: address },
        action.name,
        { ...body, isAllAmount: action.args.isAllAmount || setAmountToAll },
        tokenInfo?.decimals || 18,
        gasPrice,
        action.gasCheck,
        nativeAmount,
        getGasForNextActions(tempActions, i, gasPrice),
        feeConfig,
        baseLiquidity,
      );

      // Add this line to update the action with amountOut
      if (action.name === "bridge" && amountOut) {
        action.amountOut = amountOut;
      }

      body = newBody;
      const amountKey = getAmountKey(action.name);
      if (action.gasCheck) {
        if (body.realAmount) {
          actions[i].args.realAmount = body.realAmount;
        } else {
          actions[i].args[amountKey] = body[amountKey];
        }
      }
      action.args[amountKey] = body[amountKey];
      action.gasCheck = checkGas;
      const tokenNotFoundRegEx = /Token (.*?) not found on (.*?)\./;
      const notEnoughGasRegEx =
        /Please onboard at least (\d+(?:\.\d+)?) more and try again\./;
      i = await handleNoTokenOrBridgeRoute(
        error,
        tokenNotFoundRegEx,
        tempActions,
        action,
        i,
        rawActions,
        sourceChainName || "",
        checkpoints,
        rpcs,
        conditions,
        address,
        connectedChainName,
        blockNumber,
        recur,
        actions,
        provider,
        chainName,
        baseLiquidity,
        simulationId,
      );
      const match = error ? notEnoughGasRegEx.exec(error) : undefined;
      if (error?.includes("ot enough gas") && match) {
        const missingAmount = ethers.parseEther(match[1]);
        const { maxBalance, maxBalanceChainName } = await findHighestEthBalance(
          rpcs,
          address,
        );
        // Calculate amount to bridge based on required gas
        const amountToBridge = missingAmount + ethers.parseEther("0.01"); // Add a small buffer
        if (maxBalance > amountToBridge) {
          // Insert new bridge action for ETH
          const newBridgeAction = {
            name: "bridge",
            args: {
              token: "eth",
              amount: ethers.formatEther(amountToBridge),
              sourceChainName: maxBalanceChainName,
              destinationChainName: sourceChainName,
            },
          };

          // Insert the new bridge action up front
          rawActions.splice(tempActions[i].origin - 1, 0, newBridgeAction);

          console.log(
            "Inference applied: retry with an additional native token bridge to top up gas",
          );
          sendInference(
            "An additional bridge of native tokens has been added to ensure sufficient gas for execution. Restarting the simulation with updated actions.",
            rawActions,
            simulationId,
          );

          await resetVnetStates(checkpoints, rpcs);
          throw new Unwind(
            Flow.Return,
            "simaction",
            simulateActions(
              rawActions,
              conditions,
              address,
              connectedChainName,
              simulationId,
              rpcs,
              blockNumber,
              true,
              [...recur, -1],
              baseLiquidity,
            ),
          );
        }
      }
      await onlyOrigin(
        tempActions,
        i,
        error,
        nativeTokenSymbol,
        action,
        rawActions,
        checkpoints,
        rpcs,
        conditions,
        address,
        connectedChainName,
        blockNumber,
        recur,
        chainId,
        rpcUrl,
        zksyncid,
        sourceChainName,
        simulationId,
      );
      if (source) {
        printLog("using", source);
        actions[i].args.provider = source;
        action.args.provider = source;
      }

      if (!txs) {
        printError(error);
        indexesToRemove.push(i);
        if (validateActions(tempActions, i, indexesToRemove)) continue;
        throw new Unwind(Flow.Return, "simaction", {
          success: false,
          message: error || "Invalid action format",
          index: i,
        });
      }
      simTxs.push(...txs);
      const newTxs = txs.length;

      const simulationResults: { transaction: JSONObject }[] = [];

      // Fill balance changes in tokens, protocol positions,
      // gas costs and used contract addresses.
      actions[i].balanceChanges = {};
      actions[i].tokens = {};
      actions[i].gasCosts = {};
      actions[i].txBalanceChanges = [];
      actions[i].txNames = txNames;
      actions[i].txGasUsed = [];

      if (!tokenInfos[sourceChainName || ""]) {
        tokenInfos[sourceChainName || ""] = {};
      }

      actions[i].balanceChanges[chainId] =
        actions[i].balanceChanges[chainId] || {};
      actions[i].tokens[chainId] = actions[i].tokens[chainId] || {};

      if (mockBalanceChanges) {
        for (const change of mockBalanceChanges) {
          const symbol = change.symbol.toLowerCase();
          let prevChange = Number.parseFloat(
            actions[i].balanceChanges[chainId][symbol] || "0",
          );
          prevChange += change.amount;
          actions[i].balanceChanges[chainId][symbol] = prevChange.toString();
          actions[i].tokens[chainId][symbol] = change.address;

          if (prevChange === 0) {
            delete actions[i].balanceChanges[chainId][symbol];
          }

          await increaseBalanceOnChain(
            address,
            change.amount.toString(),
            symbol,
            sourceChainName || "",
            rpcs,
          );
        }
      }

      let beforeBalance: bigint | null | undefined;
      let gasUsed = 0n;
      const contracts: string[] = [];
      let ii = simTxs.length - newTxs;
      let count = 0;
      const ignores: string[] = [];
      ({ ii, simTxs, count, beforeBalance, gasUsed } = await simLoop(
        ii,
        simTxs,
        chainId,
        provider,
        address,
        count,
        txs,
        beforeBalance,
        actions,
        i,
        gasUsed,
        retry,
        body,
        rpcs,
        action,
        token,
        recur,
        protocol,
        source,
        ignores,
        alternatives,
        chainName,
        printError,
        indexesToRemove,
        newTxs,
        rpcUrl,
        printLog,
        checkpoints,
        rawActions,
        conditions,
        connectedChainName,
        blockNumber,
        simulationResults,
        tokenInfos,
        sourceChainName,
        tempActions,
        gasPrice,
        nativeTokenSymbol,
        contracts,
        baseLiquidity,
        simulationId,
      ));

      actions[i].contracts = contracts;

      count = await handleHyperNSwap(
        protocol,
        rpcs,
        action,
        body,
        actions,
        i,
        chainId,
        signData,
        source,
        sourceChainName,
        count,
        baseLiquidity,
      );

      const afterBalance = await withRetry(address, () =>
        provider.getBalance(address),
      );
      const balanceChange =
        beforeBalance !== undefined &&
        beforeBalance !== null &&
        afterBalance > beforeBalance
          ? afterBalance - beforeBalance
          : 0n;

      if (
        beforeBalance !== undefined &&
        beforeBalance !== null &&
        afterBalance !== beforeBalance
      ) {
        actions[i].balanceChanges[chainId][
          NativeTokens[chainId]?.toLowerCase() || ""
        ] = ethers.formatUnits(afterBalance - beforeBalance, 18);
        actions[i].txBalanceChanges[count - 1][
          NativeTokens[chainId]?.toLowerCase() || ""
        ] = ethers.formatUnits(afterBalance - beforeBalance, 18);
      }

      const finalGasUsed =
        ethers.getBigInt(gasUsed) * ethers.getBigInt(gasPrice);

      if (finalGasUsed > 0) {
        actions[i].gasCosts[chainId] = ethers.formatEther(finalGasUsed);
      }

      const required = (finalGasUsed * 3n) / 2n;
      if (
        beforeBalance !== undefined &&
        beforeBalance !== null &&
        beforeBalance < required
      ) {
        indexesToRemove.push(i);
        simTxs = simTxs.slice(0, simTxs.length - txs.length);
        if (validateActions(tempActions, i, indexesToRemove)) break;
        await handleReqBal(
          rpcs,
          address,
          required,
          beforeBalance,
          sourceChainName,
          rawActions,
          tempActions,
          i,
          checkpoints,
          conditions,
          connectedChainName,
          blockNumber,
          recur,
          printError,
          finalGasUsed,
          simulationId,
        );
      }
      if (feeConfig && feeConfig.chainId === chainId) {
        const gasBuffer = gasPrice * 25200n; // 21000 for transfers with 20% buffer for gas spiking
        if (
          afterBalance !== null &&
          afterBalance < feeConfig.value + gasBuffer
        ) {
          indexesToRemove.push(i);
          simTxs = simTxs.slice(0, simTxs.length - txs.length);
          if (validateActions(tempActions, i, indexesToRemove)) break;
          printError(
            "not enough fees",
            ethers.formatEther(afterBalance),
            ethers.formatEther(finalGasUsed + feeConfig.value + gasBuffer),
          );
          throw new Unwind(Flow.Return, "simaction", {
            success: false,
            message: `You don't have enough ${feeConfig.nativeSymbol} in your Slate account to pay for accumulated fees. Please onboard ${ethers.formatEther(feeConfig.value + gasBuffer - afterBalance)} more on ${feeConfig.chainName} and try again!`,
          });
        }
      }

      const { length } = simulationResults;
      let j = 0;
      ({ j, simTxs } = await getSimTxs(
        j,
        length,
        simulationResults,
        indexesToRemove,
        i,
        simTxs,
        txs,
        tempActions,
        printError,
        action,
        chainId,
        provider,
        protocol,
        rawActions,
        checkpoints,
        rpcs,
        conditions,
        address,
        connectedChainName,
        blockNumber,
        recur,
        tokenInfo,
        nativeTokenSymbol,
        baseLiquidity,
        simulationId,
      ));
      if (j < length) continue;

      if (
        protocol === "gmx" &&
        ["withdraw", "close"].includes(action.name) &&
        tokenInfo
      ) {
        await handleGmx(
          body,
          amountKey,
          tokenInfo,
          gmxPositions,
          sourceChainName,
          address,
          chainId,
          actions,
          i,
          provider,
        );
      }

      await haveTokenNChain(
        token,
        chainName,
        printError,
        indexesToRemove,
        i,
        tempActions,
        action,
        body,
        amountKey,
        source,
        signData,
        sourceChainName,
        length,
        simulationResults,
        protocol,
        address,
        balanceChange,
        actions,
        rpcs,
        zksyncid,
        poolName,
        provider,
        baseLiquidity,
      );
    } catch (err) {
      if (err instanceof Unwind && err.label === "simvnet") {
        switch (err.flow) {
          case Flow.Redo:
            i--;
            continue;
          case Flow.Continue:
            continue;
        }
      }
      if (err instanceof Unwind) throw err;
      printLog("Simulate error:");
      printError(err);
      indexesToRemove.push(i);
      if (validateActions(tempActions, i, indexesToRemove)) continue;
      const message = getErrorMessage(err);
      const ret: SimResult = {
        success: false,
        message: err instanceof AxiosError ? message.message : message,
        index: i,
      };
      if (action.name === "withdraw") {
        const rpcUrl = getRpcUrlForChain(chainId);
        const provider = new RetryProvider(rpcUrl, chainId);
        const { lp } = await getLPTokenInfo(action.args, chainId, provider);
        if (lp) {
          ret.lp = lp;
          ret.chainId = chainId;
        }
      }
      throw new Unwind(Flow.Return, "simaction", ret);
    }
  }
  return { simTxs, prevChainId };
}

async function handleGmxClose(
  action: SimAction,
  protocol: string | undefined,
  body: JSONObject,
  chainId: ChainId,
  gmxPositions0: GMXPosition[],
  address: string,
  provider: RetryProvider,
) {
  let gmxPositions = gmxPositions0;
  if (action.name === "close" && protocol === "gmx") {
    const outputToken = (body.outputToken || body.inputToken).toLowerCase();
    let poolData = getPoolData(chainId, `${outputToken}-usdc`);
    if (!poolData) {
      poolData = getPoolData(chainId, `usdc-${outputToken}`);
    }
    try {
      gmxPositions = await getGMXPositions(
        address,
        { chainId, provider },
        poolData,
      );
    } catch (err) {
      if (err instanceof Unwind) throw err;
      /* empty */
    }
  }
  return gmxPositions;
}

function getTokenNChain(
  action: SimAction,
  token0: string | TokenInfo | undefined,
  body: CommonArgs,
  chainName0: string | undefined,
  sourceChainName: string | undefined,
  protocol: string | undefined,
  poolName: string | undefined,
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
    token = body.outputToken || body.token;
    chainName = body[getDstChainKey(action.name)];
    if (action.name === "bridge") {
      token = getOutputTokenSymbolForBridge(
        token || "",
        sourceChainName || "",
        chainName || "",
      );
    } else if (action.name === "claim") {
      if (protocol === "jonesdao") token = "jones";
      else if (protocol === "lodestar") token = "weth";
      else if (protocol === "plutus") token = "plsDPX";
      else if (protocol === "stargate") token = "stg";
      if (!token || token === "any") {
        if (poolName && poolName !== "all" && poolName !== "any")
          token = poolName;
      }
      action.args.token = token;
    }
  } else if (action.name === "deposit" && action.lp) {
    token = action.lp;
    chainName = body.chainName;
  } else if (
    action.args.protocolName?.toLowerCase() === "hyperliquid" &&
    action.name === "close"
  ) {
    token = "usdc";
    chainName = body.chainName;
  }
  return { token, chainName };
}

async function getCurToken(
  tokenInfo: TokenInfo | undefined,
  action: SimAction,
  actions: SimAction[],
  i: number,
  curToken0: string,
  body: CommonArgs,
  tempActions: SimAction[],
  sourceChainName: string | undefined,
  provider: RetryProvider,
  address: string,
  rpcs: JSONObject,
  rawActions: RawAction[],
  checkpoints: Record<string, string>,
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  baseLiquidity: number,
  isFirstChainMissing: boolean,
  simulationId: string,
) {
  let curToken = curToken0;

  // Add check for transfer to token address
  if (
    action.name === "transfer" &&
    action.args.recipient &&
    isValidAddress(action.args.recipient)
  ) {
    try {
      // Try to get token info for the recipient address
      const recipientTokenInfo = await getTokenInfoForChain(
        action.args.recipient,
        sourceChainName || "",
        true,
        { address, rpcs },
      );

      // If recipient is a valid token contract
      if (recipientTokenInfo?.symbol) {
        // Convert transfer to swap
        rawActions[action.origin - 1] = {
          name: "swap",
          args: {
            inputToken: action.args.token,
            inputAmount: action.args.amount,
            inputAmountUnits: action.args.amount_units,
            outputToken: recipientTokenInfo.symbol,
            chainName: action.args.chainName,
          },
        };

        console.log(
          `Inference applied: converting transfer to swap since recipient ${action.args.recipient} is ${recipientTokenInfo.symbol} token`,
        );
        sendInference(
          `Converting transfer to swap since recipient address is the ${recipientTokenInfo.symbol} token contract. Restarting simulation with updated actions.`,
          rawActions,
          simulationId,
        );

        await resetVnetStates(checkpoints, rpcs);
        throw new Unwind(
          Flow.Return,
          "simaction",
          simulateActions(
            rawActions,
            conditions,
            address,
            connectedChainName,
            simulationId,
            rpcs,
            blockNumber,
            true,
            [...recur, -1],
            baseLiquidity,
          ),
        );
      }
    } catch (err) {
      if (err instanceof Unwind) throw err;
      // Ignore other errors - if we can't validate the recipient as a token, treat it as a normal address
    }
  }

  if (
    tokenInfo?.isMultiple &&
    !actions[i].args.token1Address &&
    tokenInfo?.address &&
    (!fromActions.includes(action.name) || action.name === "repay")
  ) {
    const token1Address = tokenInfo.address.toLowerCase();
    actions[i].args.token1Address =
      curToken =
      body.token1Address =
      action.args.token1Address =
        token1Address;
  }
  if (
    !tokenInfo &&
    (toActions.includes(action.name) || action.name === "borrow")
  ) {
    if (
      (action.name === "swap" ||
        action.name === "bridge" ||
        action.name === "transfer") &&
      checkIfOnlyOrigin(tempActions, i)
    ) {
      const { status, chainName } = await validateTokenForChain(
        curToken as string,
        sourceChainName || "",
        true,
        { address, rpcs, liquidityThreshold: baseLiquidity },
      );
      if (status > 0) {
        await updateChains(
          rawActions,
          action,
          chainName || "",
          sourceChainName || "",
          isFirstChainMissing,
        );

        console.log(
          `Inference applied: retry ${action.name} on ${chainName}, since ${curToken} does not exist on ${sourceChainName} through execution`,
        );
        sendInference(
          `The ${action.name} action is being retried on ${chainName} because ${curToken} does not exist on ${sourceChainName}. Restarting the simulation with updated actions.`,
          rawActions,
          simulationId,
        );

        await resetVnetStates(checkpoints, rpcs);
        throw new Unwind(
          Flow.Return,
          "simaction",
          simulateActions(
            rawActions,
            conditions,
            address,
            connectedChainName || "",
            simulationId,
            rpcs,
            blockNumber,
            true,
            [...recur, -1],
            baseLiquidity,
          ),
        );
      }
    }
    throw new Error(
      `Token ${curToken} not found on ${sourceChainName}. Ensure token and chain are specified correctly in your next prompt.`,
    );
  }
  return curToken;
}

async function handleGmx(
  body: JSONObject,
  amountKey: string,
  tokenInfo: TokenInfo,
  gmxPositions: GMXPosition[],
  sourceChainName: string | undefined,
  address: string,
  chainId: ChainId,
  actions: SimResultAction[],
  i: number,
  provider: RetryProvider,
) {
  let amount = body[amountKey];
  let _tokenInfo: TokenInfo | undefined = tokenInfo;
  if (gmxPositions.length > 0) {
    _tokenInfo = await getTokenInfoForChain("usdc", sourceChainName);
    if (_tokenInfo) {
      amount = gmxPositions.reduce(
        (a, b) =>
          a +
          +ethers.formatUnits(b.numbers.collateralAmount, _tokenInfo?.decimals),
        0,
      );
      const price = (
        await getCoinData(address, _tokenInfo.symbol, chainId, false)
      ).price;
      if (price !== undefined && !isNaNValue(price)) {
        amount /= price;
      }

      if (body.percentReduction) {
        const percentReduction = body.percentReduction.toString().toLowerCase();
        const percent =
          percentReduction === "half"
            ? 50
            : Number.parseFloat(percentReduction);
        amount = (amount * percent) / 100;
      }

      amount = amount.toLocaleString("fullwide", {
        useGrouping: false,
        minimumFractionDigits: _tokenInfo.decimals,
        maximumFractionDigits: _tokenInfo.decimals,
      });
    }
  }

  if (_tokenInfo?.symbol) {
    actions[i].balanceChanges[chainId][_tokenInfo.symbol.toLowerCase()] =
      amount;
  }

  if (_tokenInfo?.address) {
    assert(isHexStr(_tokenInfo.address));
    assert(isHexStr(address));
    const currentBalance = await (
      await getViemPublicClientFromEthers(provider)
    ).readContract({
      address: _tokenInfo.address,
      abi: abis.erc20,
      functionName: "balanceOf",
      args: [address],
    });
    const newBalance =
      currentBalance + sfParseUnits(amount, _tokenInfo.decimals);
    await setErc20Balance(provider, _tokenInfo.address, address, newBalance);
  }
}

async function handleReqBal(
  rpcs: JSONObject,
  address: string,
  required: bigint,
  beforeBalance: bigint,
  sourceChainName: string | undefined,
  rawActions: RawAction[],
  tempActions: SimAction[],
  i: number,
  checkpoints: Record<string, string>,
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  printError: (...args: unknown[]) => void,
  finalGasUsed: bigint,
  simulationId: string,
) {
  const { maxBalance, maxBalanceChainName } = await findHighestEthBalance(
    rpcs,
    address,
  );
  // Calculate amount to bridge based on required gas
  const amountToBridge = required - beforeBalance + ethers.parseEther("0.01"); // Add a small buffer
  if (maxBalance > amountToBridge) {
    // Insert new bridge action for ETH
    const newBridgeAction = {
      name: "bridge",
      args: {
        token: "eth",
        amount: ethers.formatEther(amountToBridge),
        sourceChainName: maxBalanceChainName,
        destinationChainName: sourceChainName,
      },
    };

    // Insert the new bridge action up front
    rawActions.splice(tempActions[i].origin - 1, 0, newBridgeAction);

    console.log(
      "Inference applied: retry with an additional native token bridge to top up gas",
    );
    sendInference(
      "An extra bridge of native tokens has been added to cover gas fees. Restarting the simulation with updated actions.",
      rawActions,
      simulationId,
    );

    await resetVnetStates(checkpoints, rpcs);
    throw new Unwind(
      Flow.Return,
      "simaction",
      simulateActions(
        rawActions,
        conditions,
        address,
        connectedChainName || "",
        simulationId,
        rpcs,
        blockNumber,
        true,
        [...recur, -1],
      ),
    );
  }

  printError(
    "not enough gas",
    ethers.formatEther(beforeBalance),
    ethers.formatEther(finalGasUsed),
  );
  throw new Unwind(Flow.Return, "simaction", {
    success: false,
    message: `Not enough gas on ${sourceChainName} in your embedded wallet. Please onboard at least ${ethers.formatEther(required - beforeBalance)} more and try again.`,
  });
}

async function onlyOrigin(
  tempActions: SimAction[],
  i: number,
  error: string | undefined,
  nativeTokenSymbol: string,
  action: SimAction,
  rawActions: RawAction[],
  checkpoints: Record<string, string>,
  rpcs: JSONObject,
  conditions: Call[],
  address: string,
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  chainId: ChainId,
  rpcUrl: string | undefined,
  zksyncid: number | undefined,
  sourceChainName: string | undefined,
  simulationId: string,
) {
  if (checkIfOnlyOrigin(tempActions, i) && error?.startsWith("Insufficient")) {
    const tokenSymbol = error.split(" ")[1].toLowerCase();
    if (tokenSymbol === `w${nativeTokenSymbol}`) {
      const prevOriginCount = tempActions.filter(
        (x) => x.origin === action.origin - 1,
      ).length;
      if (prevOriginCount === 1) {
        const prevAction = tempActions[i - 1];
        if (
          prevAction.name === "swap" &&
          prevAction.args.outputToken?.toLowerCase() === nativeTokenSymbol
        ) {
          rawActions[action.origin - 2].args.outputToken = tokenSymbol;

          console.log(
            "Inference applied: retry using wrapped native token as previous swap's output token instead of native token",
          );
          sendInference(
            "The wrapped native token has been set as the output token for the previous swap to support execution. Restarting the simulation with these updates.",
            rawActions,
            simulationId,
          );

          await resetVnetStates(checkpoints, rpcs);
          throw new Unwind(
            Flow.Return,
            "simaction",
            simulateActions(
              rawActions,
              conditions,
              address,
              connectedChainName || "",
              simulationId,
              rpcs,
              blockNumber,
              true,
              [...recur, -1],
            ),
          );
        }
      } else if (prevOriginCount === 0) {
        const ethBalance = await getEthBalanceForUser(
          chainId,
          address,
          rpcUrl,
          typeof blockNumber === "object" ? blockNumber[chainId] : blockNumber,
          zksyncid,
        );
        const parts =
          /Please onboard (([0-9]*[.])?[0-9]+) more (.*?) and try again/.exec(
            error,
          ) ?? ["?", "?", "?"];
        if (+ethers.formatEther(ethBalance) > +parts[1]) {
          rawActions.splice(action.origin - 1, 0, {
            name: "swap",
            args: {
              inputToken: "eth",
              inputAmount: parts[1],
              outputToken: "weth",
              chainName: sourceChainName,
            },
          });

          console.log(
            "Inference applied: retry with an additional wrapping native token at first, since insufficient weth balance",
          );
          sendInference(
            "An additional step to wrap the native token has been added to cover the insufficient WETH balance. Restarting the simulation with updated actions.",
            rawActions,
            simulationId,
          );

          await resetVnetStates(checkpoints, rpcs);
          throw new Unwind(
            Flow.Return,
            "simaction",
            simulateActions(
              rawActions,
              conditions,
              address,
              connectedChainName || "",
              simulationId,
              rpcs,
              blockNumber,
              true,
              [...recur, -1],
            ),
          );
        }
      }
    }
  }
  if (checkIfOnlyOrigin(tempActions, i) && error?.includes("at least $10")) {
    const tokenInfo = await getTokenInfoForChain(
      action.args.inputToken,
      sourceChainName,
      false,
    );
    if (tokenInfo?.address && tokenInfo.symbol.toLowerCase() === "usdc") {
      const isSpot = action.name === "swap";
      const spotBalance = getHyperliquidSpotBalance(rpcs, tokenInfo);
      const perpBalance = getHyperliquidBalance(rpcs);
      const usdcPrice =
        (await getCoinData(address, "usdc", chainId, false)).price || 1;
      let balance = +ethers.formatUnits(isSpot ? spotBalance : perpBalance, 6);
      const amount =
        rawActions[action.origin - 1].args[getAmountKey(action.name)];
      let amountN = 0;
      if (
        !amount ||
        amount === "all" ||
        amount === "half" ||
        amount.includes("%")
      ) {
        amountN = +ethers.formatUnits(isSpot ? perpBalance : spotBalance, 6);
        if (amount === "half") {
          amountN /= 2;
        } else if (amount?.includes("%")) {
          const percent = Math.floor(Number.parseFloat(amount) * 100);
          amountN = (amountN * percent) / 10000;
        }
      } else {
        amountN = +amount;
        if (amountN * usdcPrice < 10) {
          throw error;
        }
      }
      const required = amountN - balance;
      balance = +ethers.formatUnits(isSpot ? perpBalance : spotBalance, 6);
      if (balance >= required && required > 0) {
        const newAmount = await convertAmount(
          action.args,
          required * usdcPrice,
        );
        rawActions.splice(action.origin - 1, 0, {
          name: "transfer",
          args: {
            token: "usdc",
            amount: newAmount
              ? (Math.floor(+newAmount * 100) / 100).toString()
              : undefined,
            protocolName: "hyperliquid",
            recipient: isSpot ? "spot" : "perp",
            chainName: action.args.chainName,
          },
        });

        console.log(
          "Inference applied: retry swap with usdc transfer from perp to spot on hyperliquid through execution",
        );
        sendInference(
          "An additional usdc transfer from perp to spot on hyperliquid has been added. Restarting the simulation with updated actions.",
          rawActions,
          simulationId,
        );

        await resetVnetStates(checkpoints, rpcs);
        throw new Unwind(
          Flow.Return,
          "simaction",
          simulateActions(
            rawActions,
            conditions,
            address,
            connectedChainName || "",
            simulationId,
            rpcs,
            blockNumber,
            true,
            [...recur, -1],
          ),
        );
      }

      throw error;
    }
  }
}

async function haveTokenNChain(
  token: string | TokenInfo | undefined,
  chainName: string | undefined,
  printError: (...args: unknown[]) => void,
  indexesToRemove: number[],
  i: number,
  tempActions: SimAction[],
  action: SimAction,
  body: CommonArgs,
  amountKey: string,
  source: string | undefined,
  signData: JSONObject | undefined,
  sourceChainName: string | undefined,
  length: number,
  simulationResults: { transaction: JSONObject }[],
  protocol: string | undefined,
  address: string,
  balanceChange: bigint,
  actions: SimResultAction[],
  rpcs: JSONObject,
  zksyncid: number | undefined,
  poolName: string | undefined,
  provider: RetryProvider,
  baseLiquidity: number,
) {
  if (token && chainName) {
    let amount = "";
    let tokenInfo: TokenInfo | undefined;
    if (typeof token === "string") {
      tokenInfo = await getTokenInfoForChain(token, chainName, false, {
        liquidityThreshold: action.name === "swap" ? baseLiquidity : 0,
      });
    } else {
      tokenInfo = await getTokenFromOnChain(token.address || "", chainName);
    }
    if (!tokenInfo || !tokenInfo.address) {
      printError(`${token} not found on ${chainName}`);
      indexesToRemove.push(i);
      if (validateActions(tempActions, i, indexesToRemove)) {
        throw new Unwind(Flow.Continue, "simvnet");
      }
      throw new Unwind(Flow.Return, "simaction", {
        success: false,
        message: `${token} not found on ${chainName}. Ensure token and chain are specified properly in your next prompt.`,
        index: i,
      });
    }

    ({ amount, tokenInfo } = await handleForkAction(
      action,
      amount,
      body,
      amountKey,
      source,
      signData,
      sourceChainName,
      tokenInfo,
      length,
      simulationResults,
      protocol,
      chainName,
      address,
      balanceChange,
      baseLiquidity,
    ));

    // store outputAmount for the action
    action.args.outputAmount = amount;

    // mock balance on destination chain for next simulation
    if (action.name === "bridge") {
      const destChainId = getChainIdFromName(action.args.destinationChainName);

      if (!destChainId) {
        throw new Error(getChainError(chainName));
      }
      // Get destination token info
      const destToken = await getTokenInfoForChain(
        action.args.token,
        action.args.destinationChainName,
        false,
      );

      // Convert the amountOut using destination token decimals
      const outputAmount = action.amountOut
        ? ethers.formatUnits(action.amountOut, destToken?.decimals)
        : amount;

      actions[i].balanceChanges[destChainId] =
        actions[i].balanceChanges[destChainId] || {};
      actions[i].tokens[destChainId] = actions[i].tokens[destChainId] || {};

      actions[i].balanceChanges[destChainId][
        typeof token === "object" ? token.symbol : token
      ] = outputAmount;
      actions[i].tokens[destChainId][
        typeof token === "object" ? token.symbol : token
      ] = destToken?.address;

      action.args.outputAmount = outputAmount;

      const outputToken = getOutputTokenSymbolForBridge(
        action.args.token || "",
        sourceChainName || "",
        action.args.destinationChainName || "",
      );
      action.args.token = outputToken;

      await increaseBalanceOnChain(
        address,
        amount,
        outputToken,
        action.args.destinationChainName || "",
        rpcs,
        zksyncid,
      );
    } else if (action.name === "claim") {
      let outputToken = action.args.outputToken || action.args.token;
      if (protocol === "jonesdao") outputToken = "jones";
      else if (protocol === "lodestar") outputToken = "weth";
      else if (protocol === "plutus") outputToken = "plsDPX";
      else if (protocol === "stargate" && action.name === "claim")
        outputToken = "stg";
      if (!outputToken || outputToken === "any") outputToken = poolName;
      actions[i].args.token = action.args.token = outputToken;
    } else if (action.name === "swap" && source === "cowswap" && signData) {
      const tokenInfo = await getTokenInfoForChain(
        action.args.inputToken,
        chainName,
        false,
        { liquidityThreshold: action.name === "swap" ? baseLiquidity : 0 },
      );
      if (tokenInfo?.address && !isValidHyperliquidAddress(tokenInfo.address)) {
        assert(isHexStr(tokenInfo.address));
        assert(isHexStr(address));
        const currentBalance = await (
          await getViemPublicClientFromEthers(provider)
        ).readContract({
          address: tokenInfo.address,
          abi: abis.erc20,
          functionName: "balanceOf",
          args: [address],
        });
        const newBalance =
          currentBalance - ethers.getBigInt(signData.quote.sellAmount);
        await setErc20Balance(
          provider,
          tokenInfo?.address,
          address,
          newBalance,
        );
        await increaseBalanceOnChain(
          address,
          amount,
          token as string,
          chainName,
          rpcs,
          zksyncid,
        );
      }
    }
  }
}

function forkPoolName(
  action: SimAction,
  protocol: string | undefined,
  poolName0: string | undefined,
  tempActions: SimAction[],
  i: number,
  actions: SimResultAction[],
) {
  let poolName = poolName0;
  if (
    action.name === "lend" &&
    protocol === "juice" &&
    action.args.token === "weth" &&
    !poolName
  ) {
    const hasOtherUSDBLend = !!tempActions
      .filter((_, index) => index !== i)
      .find(
        (x) =>
          x.name === "lend" &&
          x.args.protocolName?.toLowerCase() === "juice" &&
          x.args.poolName?.toLowerCase() === "usdb",
      );
    const hasUSDBBorrowLater = !!tempActions
      .slice(i + 1)
      .find(
        (x) =>
          x.name === "borrow" &&
          x.args.protocolName?.toLowerCase() === "juice" &&
          (x.args.poolName || x.args.token)?.toLowerCase() === "usdb",
      );
    if (!hasOtherUSDBLend && hasUSDBBorrowLater) {
      poolName = action.args.poolName = actions[i].args.poolName = "usdb";
    }
  }
  if (
    ["lend", "deposit"].includes(action.name) &&
    protocol === "juice" &&
    action.args.token?.toLowerCase() === "eth"
  ) {
    action.args.token = "weth";
    actions[i].args.token = "weth";
  }
  return poolName;
}

async function handleForkAction(
  action: SimAction,
  amount0: string,
  body: CommonArgs,
  amountKey: string,
  source: string | undefined,
  signData: JSONObject | undefined,
  sourceChainName: string | undefined,
  tokenInfo0: TokenInfo | undefined,
  length: number,
  simulationResults: { transaction: JSONObject; amountOut?: string }[],
  protocol: string | undefined,
  chainName: string | undefined,
  address: string,
  balanceChange: bigint,
  baseLiquidity: number,
) {
  let amount = amount0;
  let tokenInfo = tokenInfo0;
  if (action.name === "bridge") {
    amount = (body.realAmount || body[amountKey as keyof CommonArgs]) as string;
    if (action.amountOut) {
      // Get destination token info for proper decimal handling
      const destToken = await getTokenInfoForChain(
        action.args.token,
        action.args.destinationChainName,
        false,
      );

      const formattedAmount = ethers.formatUnits(
        action.amountOut,
        destToken?.decimals,
      );
      amount = formattedAmount;
    }
  } else if (action.name === "swap" && source === "cowswap" && signData) {
    const tokenOut = await getTokenInfoForChain(
      action.args.outputToken,
      sourceChainName,
      false,
      { liquidityThreshold: action.name === "swap" ? baseLiquidity : 0 },
    );
    amount = ethers.formatUnits(
      ethers.getBigInt(signData.quote.buyAmount),
      tokenOut?.decimals,
    );
  } else if (
    protocol === "hyperliquid" &&
    (action.name === "swap" ||
      action.name === "transfer" ||
      action.name === "withdraw" ||
      action.name === "close")
  ) {
    amount = (signData?.outputAmount || signData?.amount || 0).toString();
    if (action.name === "withdraw") {
      amount = (+amount - 1).toString();
    }
    if (action.name === "close") {
      amount = Math.abs(
        (+amount * (signData?.price || 0)) /
          (signData?.leverageMultiplier || 1),
      ).toString();
    }
  } else if (
    tokenInfo?.address &&
    tokenInfo?.address.toLowerCase() !== NATIVE_TOKEN &&
    length > 0
  ) {
    const { logs } = simulationResults[length - 1].transaction;
    /* eslint-disable no-await-in-loop */
    for (let k = 0; k < logs.length; k++) {
      const log = logs[k].raw || logs[k];
      if (action.name === "claim" && protocol === "stargate") {
        tokenInfo = await getTokenInfoForChain("stg", chainName);
      }
      if (
        (log.topics[0].startsWith("0xddf252ad") ||
          log.topics[0].startsWith("0xe1fffcc4")) &&
        log.address.toLowerCase() === tokenInfo?.address?.toLowerCase()
      ) {
        const [to] = ethers.AbiCoder.defaultAbiCoder().decode(
          ["address"],
          log.topics.length > 2 ? log.topics[2] : log.topics[1],
        );
        if (to.toLowerCase() === address?.toLowerCase()) {
          const [value] = ethers.AbiCoder.defaultAbiCoder().decode(
            ["uint256"],
            log.data,
          );
          const amt = ethers.formatUnits(value, tokenInfo?.decimals);
          amount = amt.toString();
          break;
        }
      }
    }
  } else {
    amount = ethers.formatEther(balanceChange);
  }
  return { amount, tokenInfo };
}
async function handleHyperNSwap(
  protocol: string | undefined,
  rpcs: JSONObject,
  action: SimAction,
  body: JSONObject,
  actions: SimResultAction[],
  i: number,
  chainId: ChainId,
  signData: JSONObject | undefined,
  source: string | undefined,
  sourceChainName: string | undefined,
  count0: number,
  baseLiquidity: number,
) {
  let count = count0;
  if (protocol === "hyperliquid") {
    const balanceIndex = rpcs?.hyperliquid?.findIndex(
      (position: { type: string }) => position.type === "Deposit",
    );
    const balance =
      balanceIndex >= 0
        ? Number(rpcs.hyperliquid[balanceIndex].tokens[0].amount)
        : 0;

    if (action.name === "deposit") {
      if (balanceIndex >= 0) {
        rpcs.hyperliquid[balanceIndex].tokens[0].amount =
          balance + Number(action.args.amount);
      } else {
        rpcs.hyperliquid.push({
          id: "hyperliquid_balance",
          tokens: [
            {
              name: "USD Coin",
              symbol: "USDC",
              amount: action.args.amount,
            },
          ],
          type: "Deposit",
        });
      }
      actions[i].balanceChanges[998] = {
        usdc: Number(action.args.amount),
      };
    } else if (action.name === "withdraw") {
      if (balanceIndex >= 0) {
        rpcs.hyperliquid[balanceIndex].tokens[0].amount =
          balance - Number(action.args.amount);
        if (rpcs.hyperliquid[balanceIndex].tokens[0].amount < 0) {
          rpcs.hyperliquid[balanceIndex].tokens[0].amount = 0;
        }
      }
      actions[i].balanceChanges[998] = {
        usdc: -Number(action.args.amount),
      };
    } else if (action.name === "swap") {
      let spotIndex = rpcs?.hyperliquid?.findIndex(
        (x: { type: string }) => x.type === "Spot",
      );

      if (spotIndex === -1) {
        rpcs?.hyperliquid.push({
          id: "hyperliquid_spot",
          type: "Spot",
          tokens: [],
        });
        spotIndex = rpcs?.hyperliquid?.length - 1;
      }

      const tokenIn = await getTokenInfoForChain(
        action.args.inputToken,
        sourceChainName,
        false,
      );
      const inIndex = rpcs?.hyperliquid[spotIndex]?.tokens?.findIndex(
        (x: { symbol: string }) =>
          x.symbol?.toUpperCase() === tokenIn?.symbol?.toUpperCase(),
      );

      if (signData && tokenIn && inIndex >= 0) {
        let inAmount = signData.amount;
        if (tokenIn.symbol.toLowerCase() === "usdc") {
          inAmount *= signData.price;
        }
        rpcs.hyperliquid[spotIndex].tokens[inIndex].amount =
          Number(rpcs.hyperliquid[spotIndex].tokens[inIndex].amount) - inAmount;
        // Use Hyperliquid Testnet EVM chainId 998 as the chainId for Hyperliquid
        if (!actions[i].balanceChanges[998]) {
          actions[i].balanceChanges[998] = {};
        }
        actions[i].balanceChanges[998][tokenIn.symbol.toLowerCase()] =
          (-inAmount).toString();
      }

      const tokenOut = await getTokenInfoForChain(
        action.args.outputToken,
        sourceChainName,
        false,
      );
      const outIndex = rpcs?.hyperliquid[spotIndex]?.tokens?.findIndex(
        (x: { symbol: string }) =>
          x.symbol?.toUpperCase() === tokenOut?.symbol?.toUpperCase(),
      );
      const usdcPrice =
        (await getCoinData(body.accountAddress, "usdc", chainId, false))
          .price || 1;
      if (signData && tokenOut) {
        let outPrice = 0;
        if (tokenOut.symbol.toLowerCase() === "usdc") {
          outPrice = usdcPrice;
        } else {
          outPrice =
            (
              await getHyperliquidTokenInfo(
                chainId || 42161,
                tokenOut?.symbol || "",
                true,
              )
            )?.price || 1;
        }
        if (outIndex >= 0) {
          rpcs.hyperliquid[spotIndex].tokens[outIndex].amount =
            Number(rpcs.hyperliquid[spotIndex].tokens[outIndex].amount) +
            signData.outputAmount;
        } else {
          rpcs.hyperliquid[spotIndex].tokens.push({
            name: tokenOut.name,
            symbol: tokenOut.symbol,
            address: tokenOut.address,
            decimals: tokenOut.decimals,
            price: outPrice,
            amount: signData.outputAmount,
            logo: tokenOut.thumb,
          });
        }
        // Use Hyperliquid Testnet EVM chainId 998 as the chainId for Hyperliquid
        if (!actions[i].balanceChanges[998]) {
          actions[i].balanceChanges[998] = {};
        }
        actions[i].balanceChanges[998][tokenOut.symbol.toLowerCase()] =
          signData.outputAmount.toString();
      }
    } else if (action.name === "transfer") {
      const usdcPrice =
        (await getCoinData(body.accountAddress, "usdc", chainId, false))
          .price || 1;
      let spotIndex = rpcs?.hyperliquid?.findIndex(
        (x: { type: string }) => x.type === "Spot",
      );

      if (spotIndex === -1) {
        rpcs?.hyperliquid.push({
          id: "hyperliquid_spot",
          type: "Spot",
          tokens: [],
        });
        spotIndex = rpcs?.hyperliquid?.length - 1;
      }

      if (action.args.recipient === "spot") {
        const usdcIndex = rpcs?.hyperliquid[spotIndex]?.tokens?.findIndex(
          (x: { symbol: string }) => x.symbol === "USDC",
        );
        if (usdcIndex >= 0) {
          rpcs.hyperliquid[spotIndex].tokens[usdcIndex].amount =
            Number(rpcs.hyperliquid[spotIndex].tokens[usdcIndex].amount) +
            Number(action.args.amount);
        } else {
          rpcs.hyperliquid[spotIndex].tokens.push({
            name: "USDC",
            address: (await getHyperliquidTokenInfo(42161, "usdc", true))
              ?.tokenInfo.address,
            symbol: "USDC",
            decimals: 6,
            price: usdcPrice,
            amount: Number(action.args.amount),
            logo: "https://static.debank.com/image/arb_token/logo_url/0xaf88d065e77c8cc2239327c5edb3a432268e5831/fffcd27b9efff5a86ab942084c05924d.png",
          });
        }
        const perpDepositIndex = rpcs?.hyperliquid?.findIndex(
          (position: { type: string }) => position.type === "Deposit",
        );
        if (perpDepositIndex >= 0) {
          rpcs.hyperliquid[perpDepositIndex].tokens[0].amount =
            Number(rpcs.hyperliquid[perpDepositIndex].tokens[0].amount) -
            Number(action.args.amount);
        }
      } else {
        const perpDepositIndex = rpcs?.hyperliquid?.findIndex(
          (position: { type: string }) => position.type === "Deposit",
        );
        if (perpDepositIndex >= 0) {
          rpcs.hyperliquid[perpDepositIndex].tokens[0].amount =
            Number(rpcs.hyperliquid[perpDepositIndex].tokens[0].amount) +
            Number(action.args.amount);
        } else {
          rpcs.hyperliquid.push({
            id: "hyperliquid_balance",
            tokens: [
              {
                name: "USD Coin",
                symbol: "USDC",
                amount: action.args.amount,
              },
            ],
            type: "Deposit",
          });
        }
        const usdcIndex = rpcs?.hyperliquid[spotIndex].tokens?.findIndex(
          (x: { symbol: string }) => x.symbol === "USDC",
        );
        if (usdcIndex >= 0) {
          rpcs.hyperliquid[spotIndex].tokens[usdcIndex].amount =
            Number(rpcs.hyperliquid[spotIndex].tokens[usdcIndex].amount) -
            Number(action.args.amount);
        }
      }
      // Use Hyperliquid Testnet EVM chainId 998 as the chainId for Hyperliquid
      actions[i].balanceChanges[998] = {
        usdc: -Number(action.args.amount),
      };
    } else {
      let amount = Number(action.args.amount || action.args.inputAmount || 0);
      const positionToken =
        !action.args.inputToken ||
        action.args.inputToken.toLowerCase() === "usdc"
          ? action.args?.outputToken?.toUpperCase()
          : action.args?.inputToken?.toUpperCase();
      const positionIndex = rpcs?.hyperliquid?.findIndex(
        (position: { type: string; tokens: DebankTokenInfoR[] }) =>
          position.type === "Perpetuals" &&
          position.tokens[0].symbol?.toUpperCase() === positionToken,
      );
      if (["long", "short"].includes(action.name) && balanceIndex >= 0) {
        rpcs.hyperliquid[balanceIndex].tokens[0].amount = balance - amount;
        if (positionIndex >= 0) {
          const positionAmount = Number(
            rpcs.hyperliquid[positionIndex].tokens[1].amount,
          );
          rpcs.hyperliquid[positionIndex].tokens[1].amount =
            positionAmount + amount;
        } else {
          rpcs.hyperliquid.push({
            id: `hyperliquid_${positionToken}_position`,
            tokens: [
              {
                symbol: positionToken,
              },
              {
                name: "USD Coin",
                symbol: "USDC",
                amount: amount,
              },
            ],
            type: "Perpetuals",
          });
        }

        // Use Hyperliquid Testnet EVM chainId 998 as the chainId for Hyperliquid
        actions[i].balanceChanges[998] = {
          usdc: -amount,
        };
      }
      if (action.name === "close" && positionIndex >= 0) {
        let positionAmount = Number(
          rpcs.hyperliquid[positionIndex].tokens[1].amount,
        );
        amount =
          positionAmount +
          Number(rpcs.hyperliquid[positionIndex].detail?.pnl_usd_value || 0);

        if (amount > 0) {
          if (action.args.percentReduction) {
            const percentReduction = action.args.percentReduction
              .toString()
              .toLowerCase();
            const percent =
              percentReduction === "half"
                ? 50
                : Number.parseFloat(percentReduction);
            amount = (amount * percent) / 100;
            positionAmount -= amount;
          }

          if (balanceIndex >= 0) {
            rpcs.hyperliquid[balanceIndex].tokens[0].amount = balance + amount;
          } else if (amount > 0) {
            rpcs.hyperliquid.push({
              id: "hyperliquid_balance",
              tokens: [
                {
                  name: "USD Coin",
                  symbol: "USDC",
                  amount: amount,
                },
              ],
              type: "Deposit",
            });
          }

          // Use Hyperliquid Testnet EVM chainId 998 as the chainId for Hyperliquid
          actions[i].balanceChanges[998] = {
            usdc: amount,
          };
        } else {
          positionAmount = 0;
        }

        if (positionAmount > 0) {
          rpcs.hyperliquid[positionIndex].tokens[1].amount = positionAmount;
        } else {
          rpcs.hyperliquid.splice(positionIndex, 1);
        }
      }
    }
    actions[i].protocolsUsed = ["Hyperliquid"];
  }
  if (signData && action.name === "swap" && source === "cowswap") {
    const tokenIn = await getTokenInfoForChain(
      action.args.inputToken,
      sourceChainName,
      false,
      { liquidityThreshold: action.name === "swap" ? baseLiquidity : 0 },
    );
    const tokenOut = await getTokenInfoForChain(
      action.args.outputToken,
      sourceChainName,
      false,
      { liquidityThreshold: action.name === "swap" ? baseLiquidity : 0 },
    );
    if (tokenIn && tokenOut) {
      const tokens = [tokenIn, tokenOut];
      const balanceChanges = [
        -Number.parseFloat(
          ethers.formatUnits(
            ethers.getBigInt(signData.quote.sellAmount),
            tokenIn?.decimals,
          ),
        ),
        Number.parseFloat(
          ethers.formatUnits(
            ethers.getBigInt(signData.quote.buyAmount),
            tokenOut?.decimals,
          ),
        ),
      ];
      count++;
      actions[i].txBalanceChanges.push({});

      for (let iii = 0; iii < tokens.length; iii++) {
        const token = tokens[iii];
        const balanceChange = balanceChanges[iii];
        let prevChange = Number.parseFloat(
          actions[i].balanceChanges[chainId][token.symbol] || "0",
        );
        let prevTxChange = Number.parseFloat(
          actions[i].txBalanceChanges[count - 1][token.symbol] || "0",
        );

        prevChange += balanceChange;
        prevTxChange += balanceChange;

        actions[i].balanceChanges[chainId][token.symbol] =
          prevChange.toString();
        actions[i].txBalanceChanges[count - 1][token.symbol] =
          prevTxChange.toString();
        actions[i].tokens[chainId][token.symbol] = token.address;

        if (prevChange <= 0.000000001 && prevChange >= -0.000000001) {
          delete actions[i].balanceChanges[chainId][token.symbol];
        }
        if (prevTxChange <= 0.000000001 && prevTxChange >= -0.000000001) {
          delete actions[i].txBalanceChanges[count - 1][token.symbol];
        }
      }

      actions[i].protocolsUsed = ["Cowswap"];
    }
  }
  return count;
}

async function simLoop(
  ii0: number,
  simTxs0: Transaction[],
  chainId: ChainId,
  provider: RetryProvider,
  address: string,
  count0: number,
  txs: Transaction[],
  beforeBalance0: bigint | null | undefined,
  actions: SimResultAction[],
  i: number,
  gasUsed0: bigint,
  retry: boolean,
  body: JSONObject,
  rpcs: JSONObject,
  action: SimResultAction,
  token: string | TokenInfo | undefined,
  recur: number[],
  protocol: string | undefined,
  source0: string | undefined,
  ignores: string[],
  alternatives: JSONObject[] | undefined,
  chainName: string | undefined,
  printError: (...args: unknown[]) => void,
  indexesToRemove: number[],
  newTxs: number,
  rpcUrl: string | undefined,
  printLog: (...args: unknown[]) => void,
  checkpoints: Record<string, string>,
  rawActions: RawAction[],
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  simulationResults: { transaction: JSONObject }[],
  tokenInfos: Record<string, Partial<TokenInfo>>,
  sourceChainName: string | undefined,
  tempActions: SimResultAction[],
  gasPrice: bigint,
  nativeTokenSymbol: string,
  contracts: string[],
  baseLiquidity: number,
  simulationId: string,
) {
  let ii = ii0;
  let simTxs = simTxs0;
  let count = count0;
  let beforeBalance = beforeBalance0;
  let gasUsed = gasUsed0;
  let source = source0;

  let isGMXSimulating = false;

  /* eslint-disable no-await-in-loop */
  while (ii < simTxs.length) {
    ({ count, beforeBalance } = await getBeforeBalance(
      chainId,
      provider,
      address,
      count,
      ii,
      simTxs,
      txs,
      beforeBalance,
      actions,
      i,
    ));

    const tx = simTxs[ii];
    const { gas, ...txWithoutGas } = tx;
    let attempts = 0;
    let success = false;
    let lastError = "";
    let receipt: TransactionReceipt | null = null;
    let gmxKey: `0x${string}` | undefined;
    let forceContinue = false;

    ({
      lastError,
      ii,
      gasUsed,
      attempts,
      success,
      isGMXSimulating,
      gmxKey,
      simTxs,
      forceContinue,
      receipt,
    } = await simRetry(
      attempts,
      success,
      forceContinue,
      chainId,
      address,
      provider,
      tx,
      retry,
      body,
      rpcs,
      action,
      token as string,
      recur,
      ii,
      protocol,
      source,
      ignores,
      alternatives,
      chainName,
      printError,
      lastError,
      i,
      indexesToRemove,
      simTxs,
      receipt,
      actions,
      newTxs,
      rpcUrl,
      gmxKey,
      isGMXSimulating,
      count,
      printLog,
      txWithoutGas,
      checkpoints,
      rawActions,
      conditions,
      connectedChainName || "",
      blockNumber,
      simulationResults,
      tokenInfos,
      sourceChainName || "",
      gasUsed,
      tempActions,
      baseLiquidity,
      simulationId,
    ));

    if (forceContinue) {
      continue;
    }

    if (!success || !receipt) {
      if (lastError.startsWith("insufficient funds for ")) {
        ({ lastError, ii } = handleInsufficientFunds(
          tx,
          beforeBalance,
          receipt,
          gas,
          action,
          gasPrice,
          lastError,
          nativeTokenSymbol,
          sourceChainName || "",
          simulationResults,
          printError,
          ii,
        ));
      } else if (ignores.length > 3) {
        simulationResults.push({
          transaction: { status: 0, error_message: lastError },
        });
        printError(lastError);
        ii++;
      } else if (!protocol && source) {
        ignores.push(source);
        const alternative = alternatives?.find(
          (data) => !ignores.includes(data.source),
        );

        if (!alternative) {
          let error = "";
          if (action.name === "swap") {
            const inputTokenInfo = await getTokenInfoForChain(
              body.token1Address || body.inputToken,
              body.chainName,
              true,
              {
                liquidityThreshold: action.name === "swap" ? baseLiquidity : 0,
              },
            );
            const outputTokenInfo = await getTokenInfoForChain(
              body.outputToken,
              body.chainName,
              true,
              {
                liquidityThreshold: action.name === "swap" ? baseLiquidity : 0,
              },
            );
            error = getNoSwapRouteError(
              inputTokenInfo?.symbol,
              outputTokenInfo?.symbol,
              chainName,
              body.slippage,
            );
          } else if (action.name === "bridge") {
            const inputTokenInfo = await getTokenInfoForChain(
              body.token1Address || token,
              body.sourceChainName,
              true,
            );
            error = getNoBridgeRouteError(
              inputTokenInfo?.symbol,
              body.sourceChainName,
              body.destinationChainName,
            );
          }
          printError(error);
          indexesToRemove.push(i);
          if (validateActions(tempActions, i, indexesToRemove)) continue;
          const index = recur.findLastIndex((x) => x >= 0);
          if (index >= 0) {
            const origin = recur.splice(index, 1)[0];
            const action1 =
              action.name === "swap" ? action : actions[origin - 1];
            const action2 = action.name === "swap" ? actions[origin] : action;
            const middleToken = await getMiddleToken(action1.args, {
              chain1: action2.args.sourceChainName,
              chain2: action2.args.destinationChainName,
            });
            rawActions[action1.origin - 1] = {
              name: "swap",
              args: {
                ...rawActions[action1.origin - 1].args,
                outputToken: middleToken,
              },
            };
            rawActions[action1.origin] = {
              name: "bridge",
              args: {
                ...rawActions[action1.origin].args,
                token: middleToken,
              },
            };
            rawActions.splice(action1.origin + 1, 0, {
              name: "swap",
              args: {
                inputToken: middleToken,
                inputAmount: "outputAmount",
                outputToken: action1.args.outputToken,
                chainName: action2.args.destinationChainName,
              },
            });

            console.log(
              `Inference reapplied: retry with middle token swap since no route found for ${action.name}`,
            );
            sendInference(
              `Retrying with middle token swap since no route found for ${action.name}`,
              rawActions,
              simulationId,
            );

            await resetVnetStates(checkpoints, rpcs);
            throw new Unwind(
              Flow.Return,
              "simaction",
              simulateActions(
                rawActions,
                conditions,
                address,
                connectedChainName || "",
                simulationId,
                rpcs,
                blockNumber,
                true,
                [...recur, -1],
                baseLiquidity,
              ),
            );
          }
          throw new Unwind(Flow.Return, "simaction", {
            success: false,
            message: error || "Invalid action format",
            index: i,
          });
        }
        if (alternative.source) {
          printLog("using alternative", alternative.source);
          source = alternative.source;
          actions[i].args.provider = alternative.source;
          action.args.provider = alternative.source;
        }

        simTxs = simTxs.slice(0, simTxs.length - newTxs);
        simTxs.push(...alternative.transactions);
        ii = simTxs.length - alternative.transactions.length;
      } else {
        // Push the failure case after all attempts have been exhausted
        simulationResults.push({
          transaction: { status: 0, error_message: lastError },
        });
        printError(lastError);
        ii++;
      }
      continue;
    }

    ii++;

    await simLoopPost(
      gmxKey,
      simTxs,
      ii,
      provider,
      chainId,
      action,
      tx,
      contracts,
      address,
    );
  }
  return { ii, simTxs, count, beforeBalance, gasUsed };
}

async function getBeforeBalance(
  chainId: number,
  provider: RetryProvider,
  address: string,
  count0: number,
  ii: number,
  simTxs: Transaction[],
  txs: Transaction[],
  beforeBalance0: bigint | null | undefined,
  actions: SimResultAction[],
  i: number,
) {
  let count = count0;
  let beforeBalance = beforeBalance0;
  if (chainId === ChainIDs.zksync) {
    await provider.send("hardhat_impersonateAccount", [address]);
  }
  count += 1;
  // prevent infinite loops
  if (count > 10) {
    throw new Error(
      "There was an unexpected error building this transaction sequence, try breaking your prompt up into smaller parts or try again in a few minutes",
    );
  }
  if (ii === simTxs.length - txs.length) {
    beforeBalance = await withRetry(address, () =>
      provider.getBalance(address),
    );
  }

  actions[i].txBalanceChanges.push({});
  return { count, beforeBalance };
}

async function simLoopPost(
  gmxKey: `0x${string}` | undefined,
  simTxs: Transaction[],
  ii: number,
  provider: RetryProvider,
  chainId: ChainId,
  action: SimResultAction,
  tx: Transaction,
  contracts: string[],
  address: string,
) {
  if (gmxKey) {
    simTxs.splice(
      ii,
      0,
      await simulateExecute(provider, chainId, gmxKey, action.name),
    );
  }
  if (
    tx.data !== "0x" && // ETH transfer
    !tx.data.startsWith("0x095ea7b3") && // Approval
    !tx.data.startsWith("0xa9059cbb") // Transfer
  ) {
    contracts.push(tx.to);
  }
  if (chainId === ChainIDs.zksync) {
    await provider.send("hardhat_stopImpersonatingAccount", [address]);
  }
}

function handleInsufficientFunds(
  tx: Transaction,
  beforeBalance: bigint | null | undefined,
  receipt: TransactionReceipt | null,
  gas: string | null | undefined,
  action: SimResultAction,
  gasPrice: bigint,
  lastError0: string,
  nativeTokenSymbol: string,
  sourceChainName: string | undefined,
  simulationResults: { transaction: JSONObject }[],
  printError: (...args: unknown[]) => void,
  ii0: number,
) {
  let lastError = lastError0;
  let ii = ii0;
  const required = +ethers.formatEther(ethers.getBigInt(tx.value || "0"));
  const have = +ethers.formatEther(beforeBalance || 0n);
  let finalGasUsed: number | undefined = undefined;
  const lgas = receipt?.gasUsed || gas;
  if (lgas !== null && lgas !== undefined)
    if (action.name === "swap" || action.name === "bridge") {
      finalGasUsed = +ethers.formatEther(
        (ethers.getBigInt(lgas) * ethers.getBigInt(gasPrice) * 3n) / 2n,
      );
    } else {
      finalGasUsed = +ethers.formatEther(
        ethers.getBigInt(lgas) * ethers.getBigInt(gasPrice),
      );
    }

  const gasRequired = required - have + ((finalGasUsed || 0.01) * 7) / 4;
  const gasTotal =
    gasRequired.toFixed(3) === "0.000" ? "0.001" : gasRequired.toFixed(3);
  lastError = `Please onboard ${gasTotal} more ${nativeTokenSymbol} into your Slate account on ${sourceChainName} and try again.`;
  simulationResults.push({
    transaction: { status: 0, error_message: lastError },
  });
  printError(lastError);
  ii++;
  return { lastError, ii };
}

async function handleNoTokenOrBridgeRoute(
  error: string | undefined,
  tokenNotFoundRegEx: RegExp,
  tempActions: SimResultAction[],
  action: SimResultAction,
  i: number,
  rawActions: RawAction[],
  sourceChainName: string | undefined,
  checkpoints: Record<string, string>,
  rpcs: JSONObject,
  conditions: Call[],
  address: string,
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  actions: SimResultAction[],
  provider: RetryProvider,
  chainName: string | undefined,
  baseLiquidity: number,
  simulationId: string,
) {
  if (
    error &&
    (tokenNotFoundRegEx.test(error) || error.includes("No bridge route found"))
  ) {
    const nextOriginCount = tempActions.filter(
      (x) => x.origin === action.origin + 1,
    ).length;
    const nextAction = tempActions[i + 1];
    if (checkIfOnlyOrigin(tempActions, i)) {
      if (nextOriginCount === 1 && nextAction)
        await handleSwapBridge(
          action,
          nextAction,
          rawActions,
          sourceChainName,
          checkpoints,
          rpcs,
          conditions,
          address,
          connectedChainName,
          blockNumber,
          recur,
          simulationId,
        );
      await handleTokenBridge(
        action,
        actions,
        tempActions,
        i,
        rawActions,
        checkpoints,
        rpcs,
        conditions,
        address,
        connectedChainName,
        blockNumber,
        recur,
        baseLiquidity,
        simulationId,
      );
      if (action.name === "swap" && !error.includes("No bridge route found")) {
        // check whether input token exists on chain
        const { status: status1, chainName: chainName1 } =
          await validateTokenForChain(
            action.args.inputToken || "",
            action.args.chainName || "",
            true,
            { address, rpcs, liquidityThreshold: baseLiquidity },
          );
        const { status: status2, chainName: chainName2 } =
          await validateTokenForChain(
            action.args.outputToken || "",
            action.args.chainName || "",
            false,
            { liquidityThreshold: baseLiquidity },
          );
        let chain1: string | undefined; // chain for input token
        let chain2: string | undefined; // chain for output token
        ({ chain1, chain2 } = await getChain1N2(
          status1,
          status2,
          chain1,
          chain2,
          action,
          chainName1,
          chainName2,
          provider,
          address,
          rpcs,
          baseLiquidity,
        ));

        const isNextBridge =
          nextAction &&
          nextAction.name === "bridge" &&
          action.args.outputToken?.toLowerCase() ===
            nextAction.args.token?.toLowerCase() &&
          nextAction.args.amount?.toLowerCase() === "outputamount";

        if ((chain1 || status1 === 0) && isNextBridge) {
          if (!chain1) {
            chain1 = chainName;
          }
          const tokenInfo = await getTokenInfoForChain(
            action.args.outputToken,
            nextAction.args.destinationChainName,
            false,
            { liquidityThreshold: action.name === "swap" ? baseLiquidity : 0 },
          );
          if (!chain2 && tokenInfo)
            chain2 = nextAction.args.destinationChainName;
          if (chain2 && chain1?.toLowerCase() === chain2.toLowerCase())
            chain2 = undefined;
        }

        if (chain1 && chain2) {
          rawActions[action.origin - 1].args.chainName = chain1;
          await chain1NeChain2(
            chain1,
            chain2,
            action,
            isNextBridge,
            rawActions,
            checkpoints,
            rpcs,
            conditions,
            address,
            connectedChainName,
            blockNumber,
            recur,
            baseLiquidity,
            simulationId,
          );
        }
      }
    }
  }
  return i;
}

async function chain1NeChain2(
  chain1: string,
  chain2: string,
  action: SimResultAction,
  isNextBridge: boolean,
  rawActions: RawAction[],
  checkpoints: Record<string, string>,
  rpcs: JSONObject,
  conditions: Call[],
  address: string,
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  baseLiquidity: number,
  simulationId: string,
) {
  if (chain1.toLowerCase() !== chain2.toLowerCase()) {
    let outputToken = action.args.outputToken;
    const srcNativeTokenSymbol = getChainNativeSymbol(chain1);
    const destNativeTokenSymbol = getChainNativeSymbol(chain2);
    if (
      outputToken?.toLowerCase() === "eth" ||
      outputToken?.toLowerCase() === "weth"
    ) {
      outputToken =
        srcNativeTokenSymbol === "ETH" &&
        destNativeTokenSymbol === "ETH" &&
        action.args?.inputToken?.toLowerCase() !== "eth"
          ? "eth"
          : "weth";
    }

    const middleToken = await getMiddleToken(action.args, {
      chain1,
      chain2,
    });
    if (middleToken) {
      const isOutETH =
        outputToken?.toLowerCase() === "eth" ||
        outputToken?.toLowerCase() === "weth";
      if (!isNextBridge || !isOutETH) {
        if (isOutETH) {
          rawActions[action.origin - 1].args.outputToken = outputToken;
          rawActions.splice(action.origin, 0, {
            name: "bridge",
            args: {
              token: outputToken,
              amount: "outputAmount",
              sourceChainName: chain1,
              destinationChainName: chain2,
            },
          });
        } else if (middleToken === action.args.inputToken) {
          if (!rawActions[action.origin] || !rawActions[action.origin].args) {
            if (!rawActions[action.origin])
              rawActions[action.origin] = {
                name: "bridge",
                args: {},
              };
            rawActions[action.origin].args = {};
          }
          const temp = { ...rawActions[action.origin] };
          temp.args.sourceChainName = chain1;
          temp.args.destinationChainName = chain2;
          temp.args.token = middleToken;
          temp.args.amount = await getRoughAmountInForInference(
            middleToken,
            chain2,
            action.args.outputToken || "",
            chain2,
            action.args.inputAmount || "",
            action.args.outputAmount || "",
          );
          temp.args.amount_units = action.args.inputAmountUnits;
          rawActions[action.origin] = {
            ...rawActions[action.origin - 1],
          };
          rawActions[action.origin].args.inputAmount = "outputAmount";
          rawActions[action.origin].args.outputAmount = undefined;
          rawActions[action.origin].args.chainName = chain2;
          rawActions[action.origin].args.inputAmountUnits = undefined;
          rawActions[action.origin - 1] = temp;
        } else {
          rawActions[action.origin - 1].args.outputToken = middleToken;
          rawActions.splice(
            action.origin,
            isNextBridge ? 1 : 0,
            ...[
              {
                name: "bridge",
                args: {
                  token: middleToken,
                  amount: "outputAmount",
                  sourceChainName: chain1,
                  destinationChainName: chain2,
                },
              },
              {
                name: "swap",
                args: {
                  inputToken: middleToken,
                  inputAmount: "outputAmount",
                  outputToken,
                  chainName: chain2,
                },
              },
            ],
          );
        }

        console.log(
          "Inference applied: retry with an additional bridge to middle token",
        );
        sendInference(
          "An additional bridge to a middle token has been added to facilitate the transaction. Restarting the simulation with updated actions.",
          rawActions,
          simulationId,
        );

        await resetVnetStates(checkpoints, rpcs);
        throw new Unwind(
          Flow.Return,
          "simaction",
          simulateActions(
            rawActions,
            conditions,
            address,
            connectedChainName,
            simulationId,
            rpcs,
            blockNumber,
            true,
            [...recur, -1],
            baseLiquidity,
          ),
        );
      }
    }
  }
}

async function getChain1N2(
  status1: number,
  status2: number,
  chain10: string | undefined,
  chain20: string | undefined,
  action: SimResultAction,
  chainName1: string | undefined,
  chainName2: string | undefined,
  provider: RetryProvider,
  address: string,
  rpcs: JSONObject,
  baseLiquidity: number,
) {
  let chain1 = chain10;
  let chain2 = chain20;
  if (status1 + status2 < 0) {
    // can't fill chain1, chain2
  } else if (status1 + status2 === 0) {
    if (status1 === 0) {
      chain1 = chain2 = action.args.chainName;
    } else if (status1 > 0) {
      chain1 = chainName1;
      const { status, chainName } = await validateTokenForChain(
        action.args.outputToken || "",
        chainName1 || "",
        false,
        { liquidityThreshold: baseLiquidity },
      );
      if (status === 0) chain2 = chainName1;
      else if (status > 0) chain2 = chainName;
    } else {
      chain2 = chainName2;
      const { status, chainName } = await validateTokenForChain(
        action.args.inputToken || "",
        chainName2 || "",
        true,
        { address, rpcs, liquidityThreshold: baseLiquidity },
      );
      if (status === 0) chain1 = chainName2;
      else if (status > 0) chain1 = chainName;
    }
  } else if (status1 + status2 === 1) {
    chain1 = status1 === 0 ? action.args.chainName : chainName1;
    chain2 = status2 === 0 ? action.args.chainName : chainName2;
  } else {
    chain1 = chainName1;
    chain2 = chainName2;
  }
  return { chain1, chain2 };
}

async function handleSwapBridge(
  action: SimResultAction,
  nextAction: SimResultAction,
  rawActions: RawAction[],
  sourceChainName: string | undefined,
  checkpoints: Record<string, string>,
  rpcs: JSONObject,
  conditions: Call[],
  address: string,
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  simulationId: string,
) {
  if (
    action.name === "bridge" &&
    nextAction.name === "swap" &&
    nextAction.args.inputToken?.toLowerCase() ===
      action.args.token?.toLowerCase() &&
    nextAction.args.inputAmount?.toLowerCase() === "outputamount"
  ) {
    let outputToken = nextAction.args.outputToken;
    const srcChainId = getChainIdFromName(action.args.sourceChainName);
    const destChainId = getChainIdFromName(nextAction.args.chainName);

    const srcNativeTokenSymbol =
      srcChainId !== undefined
        ? getNativeTokenSymbolForChain(srcChainId)
        : undefined;
    const destNativeTokenSymbol =
      destChainId !== undefined
        ? getNativeTokenSymbolForChain(destChainId)
        : undefined;
    if (
      outputToken?.toLowerCase() === "eth" ||
      outputToken?.toLowerCase() === "weth"
    ) {
      outputToken =
        srcNativeTokenSymbol === "ETH" && destNativeTokenSymbol === "ETH"
          ? "eth"
          : "weth";
    }
    if (!rawActions[action.origin] || !rawActions[action.origin].args) {
      if (!rawActions[action.origin])
        rawActions[action.origin] = { name: "swap", args: {} };
      rawActions[action.origin].args = {};
    }
    const temp = { ...rawActions[action.origin] };
    temp.args.chainName = action.args.sourceChainName;
    temp.args.inputAmount = action.args.amount;
    temp.args.inputAmountUnits = action.args.amount_units;
    temp.args.outputToken = outputToken;
    rawActions[action.origin] = {
      ...rawActions[action.origin - 1],
    };
    rawActions[action.origin].args.token = outputToken;
    rawActions[action.origin].args.amount = "outputAmount";
    rawActions[action.origin].args.amount_units = undefined;
    rawActions[action.origin - 1] = temp;

    console.log(
      `Inference applied: retry swap first and bridge, since ${action.args.token} does not exist on ${nextAction.args.chainName}, but exists on ${sourceChainName}`,
    );
    sendInference(
      `The simulation will retry with a swap followed by a bridge, as ${action.args.token} is available on ${sourceChainName} but not on ${nextAction.args.chainName}. Restarting with updated actions.`,
      rawActions,
      simulationId,
    );

    await resetVnetStates(checkpoints, rpcs);
    throw new Unwind(
      Flow.Return,
      "simaction",
      simulateActions(
        rawActions,
        conditions,
        address,
        connectedChainName,
        simulationId,
        rpcs,
        blockNumber,
        true,
        [...recur, action.origin],
      ),
    );
  }
}

async function handleTokenBridge(
  action: SimResultAction,
  actions: SimResultAction[],
  tempActions: SimResultAction[],
  i: number,
  rawActions: RawAction[],
  checkpoints: Record<string, string>,
  rpcs: JSONObject,
  conditions: Call[],
  address: string,
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  baseLiquidity: number,
  simulationId: string,
) {
  if (action.name === "bridge") {
    if (action.args.token === "usdc.e") {
      const prevOriginCount = actions.filter(
        (x) => x.origin === action.origin - 1,
      ).length;
      if (prevOriginCount === 1) {
        const prevAction = tempActions[i - 1];
        if (
          prevAction.name === "swap" &&
          prevAction.args.inputToken === "usdc"
        ) {
          const middleToken = await getMiddleToken(action.args);
          if (middleToken) {
            rawActions[action.origin - 2].args.outputToken = rawActions[
              action.origin - 1
            ].args.token = middleToken;
            rawActions.splice(action.origin, 0, {
              name: "swap",
              args: {
                inputToken: middleToken,
                inputAmount: "outputAmount",
                outputToken: "usdc",
                chainName: action.args.destinationChainName,
              },
            });

            console.log(
              `Inference applied: retry using ${middleToken} as previous swap's output token instead of usdc.e`,
            );
            sendInference(
              `The simulation will retry using ${middleToken} as the output token of the previous swap instead of usdc.e. Restarting with updated actions.`,
              rawActions,
              simulationId,
            );

            await resetVnetStates(checkpoints, rpcs);
            throw new Unwind(
              Flow.Return,
              "simaction",
              simulateActions(
                rawActions,
                conditions,
                address,
                connectedChainName,
                simulationId,
                rpcs,
                blockNumber,
                true,
                [...recur, -1],
                baseLiquidity,
              ),
            );
          }
        }
      }
      const chain1 = action.args.sourceChainName;
      const chain2 = action.args.destinationChainName;
      const tokenInfo = await getTokenInfoForChain("usdc.e", chain2, false, {
        liquidityThreshold: baseLiquidity,
      });
      if (!tokenInfo) {
        const tokenInfo1 = await getTokenInfoForChain("usdc", chain1);
        const tokenInfo2 = await getTokenInfoForChain("usdc", chain2);
        if (tokenInfo1 && tokenInfo2) {
          rawActions.splice(
            action.origin - 1,
            1,
            ...[
              {
                name: "swap",
                args: {
                  inputToken: "usdc.e",
                  outputToken: "usdc",
                  inputAmount: action.args.amount,
                  inputAmountUnits: action.args.amount_units,
                  chainName: chain1,
                },
              },
              {
                name: "bridge",
                args: {
                  token: "usdc",
                  amount: "outputAmount",
                  sourceChainName: chain1,
                  destinationChainName: chain2,
                },
              },
            ],
          );

          console.log(
            "Inference applied: retry with an additional swap from usdc.e to usdc",
          );
          sendInference(
            "An additional swap from usdc.e to usdc has been added prior to execution. Restarting the simulation with updated actions.",
            rawActions,
            simulationId,
          );

          await resetVnetStates(checkpoints, rpcs);
          throw new Unwind(
            Flow.Return,
            "simaction",
            simulateActions(
              rawActions,
              conditions,
              address,
              connectedChainName,
              simulationId,
              rpcs,
              blockNumber,
              true,
              [...recur, -1],
              baseLiquidity,
            ),
          );
        }
        if (tokenInfo2) {
          const middleToken = await getMiddleToken(action.args);
          if (middleToken) {
            rawActions.splice(
              action.origin - 1,
              1,
              {
                name: "swap",
                args: {
                  inputToken: "usdc.e",
                  outputToken: middleToken,
                  inputAmount: action.args.amount,
                  inputAmountUnits: action.args.amount_units,
                  chainName: chain1,
                },
              },
              {
                name: "bridge",
                args: {
                  token: middleToken,
                  amount: "outputAmount",
                  sourceChainName: chain1,
                  destinationChainName: chain2,
                },
              },
              {
                name: "swap",
                args: {
                  inputToken: middleToken,
                  outputToken: "usdc",
                  inputAmount: "outputAmount",
                  chainName: chain2,
                },
              },
            );

            console.log(
              `Inference applied: retry with an additional swap to middle token to get usdc on ${chain2} from usdc.e on ${chain1}`,
            );
            sendInference(
              `An additional swap to a middle token has been added to convert USDC.e on ${chain1} to USDC on ${chain2}. Restarting the simulation with updated actions.`,
              rawActions,
              simulationId,
            );

            await resetVnetStates(checkpoints, rpcs);
            throw new Unwind(
              Flow.Return,
              "simaction",
              simulateActions(
                rawActions,
                conditions,
                address,
                connectedChainName,
                simulationId,
                rpcs,
                blockNumber,
                true,
                [...recur, -1],
                baseLiquidity,
              ),
            );
          }
        }
      }
    }
    const chain1 = action.args.sourceChainName;
    const chain2 = action.args.destinationChainName;
    const tokenInfo1 = await getTokenInfoForChain(action.args.token, chain1);
    const tokenInfo2 = await getTokenInfoForChain(action.args.token, chain2);
    if (tokenInfo1 && !tokenInfo2) {
      const { status, chainName, chains } = await validateTokenForChain(
        action.args.token || "",
        chain2 || "",
      );
      let newChain =
        chainName?.toLowerCase() !== chain1?.toLowerCase()
          ? chainName?.toLowerCase()
          : undefined;
      if (status < 0) {
        const filteredChains = (chains || []).filter(
          (x) => getChainIdFromName(x) !== getChainIdFromName(chain1),
        );
        if (filteredChains.length === 1) newChain = filteredChains[0];
      }
      if (newChain) {
        rawActions[action.origin - 1].args.destinationChainName = newChain;
        for (let i = action.origin; i < rawActions.length; i++) {
          if (rawActions[i].name === "bridge") {
            rawActions[i].args.sourceChainName = newChain;
            break;
          }
          rawActions[i].args.chainName = newChain;
        }

        console.log(
          `Inference applied: retry with better inferred chains, since ${action.args.token} does not exist on ${chain2} but exists on ${newChain}`,
        );
        sendInference(
          `The simulation will retry with better inferred chains, since ${action.args.token} does not exist on ${chain2} but exists on ${newChain}. Restarting with updated actions.`,
          rawActions,
          simulationId,
        );

        await resetVnetStates(checkpoints, rpcs);
        throw new Unwind(
          Flow.Return,
          "simaction",
          simulateActions(
            rawActions,
            conditions,
            address,
            connectedChainName,
            simulationId,
            rpcs,
            blockNumber,
            true,
            [...recur, -1],
            baseLiquidity,
          ),
        );
      }
    }
  }
}

async function checkFinalAmount(
  action: SimResultAction,
  tokenInfo0: TokenInfo | undefined,
  nativeTokenSymbol: string,
  chainId: ChainId,
  address: string,
  rpcUrl: string | undefined,
  blockNumber: string | JSONObject | undefined,
  zksyncid: number | undefined,
  protocol: string | undefined,
  rpcs: JSONObject,
  provider: RetryProvider,
  sourceChainName: string | undefined,
  actions: SimResultAction[],
  i: number,
  body: JSONObject,
  curToken0: string,
  printError: (...args: unknown[]) => void,
  indexesToRemove: number[],
  tempActions: SimResultAction[],
  setAmountToAll0: boolean,
  rawActions: RawAction[],
  checkpoints: Record<string, string>,
  conditions: Call[],
  connectedChainName: string,
  recur: number[],
  token: string | TokenInfo | undefined,
  printLog: (...args: unknown[]) => void,
  baseLiquidity: number,
  simulationId: string,
) {
  let tokenInfo = tokenInfo0;
  let curToken = curToken0;
  let setAmountToAll = setAmountToAll0;
  const viemClient = await getViemPublicClientFromEthers(provider);
  if (toActions.includes(action.name) && !action.args.outputAmount) {
    let finalBalance = 0n;
    if (
      tokenInfo?.address === NATIVE_TOKEN ||
      tokenInfo?.address === NATIVE_TOKEN2 ||
      tokenInfo?.symbol?.toLowerCase() === nativeTokenSymbol
    ) {
      finalBalance = await getEthBalanceForUser(
        chainId,
        address,
        rpcUrl,
        typeof blockNumber === "object" ? blockNumber[chainId] : blockNumber,
        zksyncid,
      );
    } else if (
      isValidHyperliquidAddress(tokenInfo?.address) ||
      (protocol === "hyperliquid" &&
        (["long", "short", "transfer"].includes(action.name) ||
          (action.name === "swap" && tokenInfo?.symbol === "usdc")))
    ) {
      if (getHyperliquidActionSourceType(action) === "spot") {
        finalBalance = getHyperliquidSpotBalance(rpcs, tokenInfo);
      } else {
        finalBalance = getHyperliquidBalance(rpcs);
      }
    } else if (tokenInfo?.address) {
      assert(isHexStr(tokenInfo.address));
      assert(isHexStr(address));
      finalBalance = await withRetry(address, () =>
        viemClient.readContract({
          address: tokenInfo?.address as `0x${string}`,
          abi: abis.erc20,
          functionName: "balanceOf",
          args: [address],
        }),
      );
      if (finalBalance === 0n) {
        // clear cache to go through balance check again
        const symbolDown = tokenInfo.symbol.toLowerCase();
        clearTokenCache(
          sourceChainName,
          symbolDown,
          address,
          provider,
          baseLiquidity,
        );
        // find token info again with updated balance
        const newTokenInfo = await getTokenInfoForChain(
          symbolDown,
          sourceChainName,
          false,
          {
            account: address,
            provider,
            liquidityThreshold: action.name === "swap" ? baseLiquidity : 0,
          },
        );
        if (newTokenInfo?.address) {
          assert(isHexStr(newTokenInfo.address));
          assert(isHexStr(address));
          finalBalance = await withRetry(address, () =>
            viemClient.readContract({
              address: newTokenInfo.address as `0x${string}`,
              abi: abis.erc20,
              functionName: "balanceOf",
              args: [address],
            }),
          );
          if (finalBalance > 0n) {
            tokenInfo = newTokenInfo;
            actions[i].args.token1Address =
              body.token1Address =
              action.args.token1Address =
              curToken =
                newTokenInfo.address;
          }
        }
      }
    } else {
      printError("final balance not filled by any means!!", tokenInfo);
    }

    const finalAmount = body.realAmount || body[getAmountKey(action.name)];
    if (!finalAmount) {
      const errorMsg = "Missing an amount. Please specify an amount correctly.";
      printError(errorMsg);
      indexesToRemove.push(i);
      if (validateActions(tempActions, i, indexesToRemove))
        throw new Unwind(Flow.Continue, "simvnet");
      throw new Unwind(Flow.Return, "simaction", {
        success: false,
        message: errorMsg,
      });
    }

    const formatUnitsInput = Number.parseFloat(finalAmount);
    if (isNaNValue(formatUnitsInput)) {
      const errorMsg = `Trying to use a string amount: ${finalAmount}, please specify an amount correctly.`;
      printError(errorMsg);
      indexesToRemove.push(i);
      if (validateActions(tempActions, i, indexesToRemove))
        throw new Unwind(Flow.Continue, "simvnet");
      throw new Unwind(Flow.Return, "simaction", {
        success: false,
        message: errorMsg,
      });
    }

    const decimals = tokenInfo?.decimals || 18;
    const formatUnitsBalance = Number.parseFloat(
      ethers.formatUnits(finalBalance, decimals),
    );
    setAmountToAll =
      formatUnitsInput <= formatUnitsBalance * 1.01 &&
      formatUnitsInput >= formatUnitsBalance * 0.99;
    if (!setAmountToAll && formatUnitsInput > formatUnitsBalance) {
      if (tokenInfo?.symbol?.toLowerCase() === `w${nativeTokenSymbol}`) {
        const nativeBalance = await getEthBalanceForUser(
          chainId,
          address,
          rpcUrl,
          typeof blockNumber === "object" ? blockNumber[chainId] : blockNumber,
          zksyncid,
        );
        const regex = /^(\d*\.\d{1,18})|\d+/;
        let _amount: bigint;
        if (finalAmount.match(regex)) {
          _amount = ethers.parseEther(finalAmount.match(regex)[0]);
        } else {
          _amount = ethers.parseEther(finalAmount);
        }
        if (
          (chainId === 1 &&
            nativeBalance - _amount > ethers.WeiPerEther / 50n) ||
          (chainId !== 1 && nativeBalance - _amount > ethers.WeiPerEther / 500n)
        ) {
          if (checkIfOnlyOrigin(tempActions, i)) {
            if (action.name === "swap") {
              rawActions[action.origin - 1].args.inputToken = nativeTokenSymbol;
            } else {
              rawActions.splice(action.origin - 1, 0, {
                name: "swap",
                args: {
                  inputToken: nativeTokenSymbol,
                  outputToken: tokenInfo.symbol,
                  inputAmount: action.args.amount,
                  inputAmountUnits: action.args.amount_units,
                  chainName: action.args[getChainKey(action.name)],
                },
              });
              rawActions[action.origin - 1].args.amount = "outputAmount";
              rawActions[action.origin - 1].args.amount_units = undefined;
            }

            console.log(
              `Inference applied: retry with an additional wrapping native token swap for following ${action.name}`,
            );
            sendInference(
              `An additional swap to wrap the native token has been addedfor ${action.name}. Restarting the simulation with updated actions.`,
              rawActions,
              simulationId,
            );

            await resetVnetStates(checkpoints, rpcs);
            throw new Unwind(
              Flow.Return,
              "simaction",
              simulateActions(
                rawActions,
                conditions,
                address,
                connectedChainName,
                simulationId,
                rpcs,
                blockNumber,
                true,
                [...recur, -1],
                baseLiquidity,
              ),
            );
          }
        }
      }

      if (
        checkIfOnlyOrigin(tempActions, i) &&
        action.name === "repay" &&
        tokenInfo
      ) {
        const tokens = await getTokensForAction(
          address,
          "repay",
          action.args,
          { provider, chainId },
          rpcs,
        );
        const temp = tokens.filter(
          (x) =>
            token === "all" ||
            token === "" ||
            x.symbol.toLowerCase() === tokenInfo?.symbol?.toLowerCase(),
        );
        if (temp.length > 0) {
          const balances = await getTokenBalanceForAllChains(
            address,
            action.args.token,
            formatUnitsInput.toString(),
            rpcs,
          );
          if (balances.filter((x) => x.chainId !== chainId).length === 1) {
            rawActions.splice(action.origin - 1, 0, {
              name: "bridge",
              args: {
                token: action.args.token,
                amount: (formatUnitsInput * 1.01).toString(), // with a bit more amount for slippage
                sourceChainName: balances[0].chainName,
                destinationChainName: action.args.chainName,
              },
            });

            console.log(
              `Inference applied: retry with an additional ${action.args.token} bridge from ${balances[0].chainName} to ${action.args.chainName} to repay through execution`,
            );
            sendInference(
              `An additional ${action.args.token} bridge from ${balances[0].chainName} to ${action.args.chainName} has been added to enable repayment. Restarting the simulation with updated actions.`,
              rawActions,
              simulationId,
            );

            await resetVnetStates(checkpoints, rpcs);
            throw new Unwind(
              Flow.Return,
              "simaction",
              simulateActions(
                rawActions,
                conditions,
                address,
                connectedChainName,
                simulationId,
                rpcs,
                blockNumber,
                true,
                [...recur, -1],
                baseLiquidity,
              ),
            );
          }
        }
      }

      let chainStr = sourceChainName;
      if (isHyperliquidAction(action)) {
        const required = (formatUnitsInput - formatUnitsBalance) * 1.01;
        let shouldRetry = false;
        const amount = (formatUnitsInput - formatUnitsBalance).toString();

        if (action.name === "deposit") {
          const balances = await getTokenBalanceForAllChains(
            address,
            action.args.token,
            amount,
            rpcs,
          );
          if (balances.length > 0) {
            rawActions.splice(action.origin - 1, 0, {
              name: "bridge",
              args: {
                token: action.args.token,
                amount: amount,
                sourceChainName: balances[0].chainName,
                destinationChainName: action.args.chainName,
              },
            });

            console.log(
              `Inference applied: retry with an additional ${action.args.token} bridge from ${balances[0].chainName} to ${action.args.chainName} to deposit through execution`,
            );
            sendInference(
              `An additional ${action.args.token} bridge from ${balances[0].chainName} to ${action.args.chainName} has been added to enable deposit. Restarting the simulation with updated actions.`,
              rawActions,
              simulationId,
            );

            shouldRetry = true;
          }
        } else if (["long", "short"].includes(action.name)) {
          if (tokenInfo?.symbol?.toLowerCase() === "usdc") {
            const balance = +ethers.formatUnits(
              getHyperliquidSpotBalance(rpcs, tokenInfo),
              6,
            );
            if (balance >= required && required > 0) {
              const newAmount = await convertAmount(action.args, required);
              rawActions.splice(action.origin - 1, 0, {
                name: "transfer",
                args: {
                  token: "usdc",
                  amount: newAmount
                    ? (Math.floor(+newAmount * 100) / 100).toString()
                    : undefined,
                  protocolName: "hyperliquid",
                  recipient: "perp",
                  chainName: action.args.chainName,
                },
              });

              console.log(
                "Inference applied: retry with usdc transfer from spot to perp on hyperliquid through execution",
              );
              sendInference(
                "An additional usdc transfer from spot to perp on hyperliquid has been added. Restarting the simulation with updated actions.",
                rawActions,
                simulationId,
              );

              shouldRetry = true;
            }
          }
          if (
            !shouldRetry &&
            (action.origin === 1 ||
              !(
                rawActions[action.origin - 2].name === "deposit" &&
                rawActions[
                  action.origin - 2
                ].args.protocolName?.toLowerCase() === "hyperliquid"
              ))
          ) {
            rawActions.splice(action.origin - 1, 0, {
              name: "deposit",
              args: {
                token: "usdc",
                amount: amount,
                protocolName: "hyperliquid",
                chainName: sourceChainName,
              },
            });

            console.log(
              "Inference applied: retry with an additional usdc deposit to hyperliquid through execution",
            );
            sendInference(
              "An additional usdc deposit to hyperliquid has been added. Restarting the simulation with updated actions.",
              rawActions,
              simulationId,
            );

            shouldRetry = true;
          }
        } else if (
          action.name === "swap" &&
          tokenInfo?.symbol?.toLowerCase() === "usdc"
        ) {
          const balance = +ethers.formatUnits(getHyperliquidBalance(rpcs), 6);
          if (balance >= required && required > 0) {
            const newAmount = await convertAmount(action.args, required);
            rawActions.splice(action.origin - 1, 0, {
              name: "transfer",
              args: {
                token: "usdc",
                amount: newAmount
                  ? (Math.floor(+newAmount * 100) / 100).toString()
                  : undefined,
                protocolName: "hyperliquid",
                recipient: "spot",
                chainName: action.args.chainName,
              },
            });

            console.log(
              "Inference applied: retry with usdc transfer from perp to spot on hyperliquid through execution",
            );
            sendInference(
              "An additional usdc transfer from perp to spot on hyperliquid has been added. Restarting the simulation with updated actions.",
              rawActions,
              simulationId,
            );

            shouldRetry = true;
          }
        }

        if (shouldRetry && recur.length < MAX_RECUR) {
          await resetVnetStates(checkpoints, rpcs);
          throw new Unwind(
            Flow.Return,
            "simaction",
            simulateActions(
              rawActions,
              conditions,
              address,
              connectedChainName,
              simulationId,
              rpcs,
              blockNumber,
              true,
              [...recur, -1],
              baseLiquidity,
            ),
          );
        }

        chainStr = "hyperliquid";
      }

      printLog(tokenInfo, body, finalBalance);
      let errorMsg = checkPrevActions(
        tempActions,
        i,
        action,
        curToken,
        sourceChainName,
        body[getTokenKey(action.name)]?.toLowerCase(),
      );
      if (errorMsg.startsWith("You have zero balance")) {
        errorMsg = `Not enough ${tokenInfo?.symbol} on ${chainStr}. You have ${formatUnitsBalance} and need ${formatUnitsInput}. Please onboard ${formatUnitsInput - formatUnitsBalance} more ${tokenInfo?.symbol} and try again.`;
      }
      printError(errorMsg);
      indexesToRemove.push(i);
      if (validateActions(tempActions, i, indexesToRemove))
        throw new Unwind(Flow.Continue, "simvnet");
      throw new Unwind(Flow.Return, "simaction", {
        success: false,
        message: errorMsg,
        index: i,
      });
    }
    if (setAmountToAll) {
      const newAmount =
        ethers.formatUnits(finalBalance, decimals) <
        formatUnitsBalance.toString()
          ? ethers.formatUnits(finalBalance, decimals)
          : formatUnitsBalance.toString();
      if (body.realAmount) {
        body.realAmount = newAmount;
        if (formatUnitsInput > formatUnitsBalance && action.name !== "repay") {
          actions[i].args.realAmount = "all";
        }
      } else {
        body[getAmountKey(action.name)] = newAmount;
        if (formatUnitsInput > formatUnitsBalance && action.name !== "repay") {
          actions[i].args[getAmountKey(action.name)] = "all";
        }
      }
      action.gasCheck = tokenInfo?.symbol?.toLowerCase() === nativeTokenSymbol;
    }
  }
  return { tokenInfo, curToken, setAmountToAll };
}

async function getSimTxs(
  j0: number,
  length: number,
  simulationResults: { transaction: JSONObject }[],
  indexesToRemove: number[],
  i: number,
  simTxs0: Transaction[],
  txs: Transaction[],
  tempActions: SimResultAction[],
  printError: (...args: unknown[]) => void,
  action: SimResultAction,
  chainId: ChainId,
  provider: RetryProvider,
  protocol: string | undefined,
  rawActions: RawAction[],
  checkpoints: Record<string, string>,
  rpcs: JSONObject,
  conditions: Call[],
  address: string,
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  tokenInfo: TokenInfo | undefined,
  nativeTokenSymbol: string,
  baseLiquidity: number,
  simulationId: string,
) {
  let simTxs = simTxs0;
  let j = j0;
  /* eslint-disable no-await-in-loop */
  for (; j < length; j++) {
    if (!simulationResults[j].transaction.status) {
      indexesToRemove.push(i);
      simTxs = simTxs.slice(0, simTxs.length - txs.length);
      if (validateActions(tempActions, i, indexesToRemove)) break;
      printError("general simulation", simulationResults[j].transaction);
      const ret: SimResult = {
        success: false,
        message: simulationResults[j].transaction.error_message,
      };
      if (action.name === "withdraw") {
        const { lp } = await getLPTokenInfo(action.args, chainId, provider);
        if (lp) {
          ret.lp = lp;
          ret.chainId = chainId;
        }
      }
      if (
        checkIfOnlyOrigin(tempActions, i) &&
        action.name === "bridge" &&
        action.args.token === "usdc" &&
        protocol === "stargate" &&
        ret.message?.includes("exceeds balance")
      ) {
        const chain1 = action.args.sourceChainName;
        const chain2 = action.args.destinationChainName;
        const tokenInfo1 = await getTokenInfoForChain("usdc.e", chain1);
        const tokenInfo2 = await getTokenInfoForChain("usdc.e", chain2);
        if (!tokenInfo1 || !tokenInfo2) {
          const middleToken = await getMiddleToken(action.args);
          if (middleToken) {
            rawActions.splice(
              action.origin - 1,
              1,
              {
                name: "swap",
                args: {
                  inputToken: "usdc",
                  outputToken: middleToken,
                  inputAmount: action.args.amount,
                  inputAmountUnits: action.args.amount_units,
                  chainName: chain1,
                },
              },
              {
                name: "bridge",
                args: {
                  token: middleToken,
                  amount: "outputAmount",
                  sourceChainName: chain1,
                  destinationChainName: chain2,
                },
              },
              {
                name: "swap",
                args: {
                  inputToken: middleToken,
                  outputToken: "usdc",
                  inputAmount: "outputAmount",
                  chainName: chain2,
                },
              },
            );
          }
        } else {
          rawActions.splice(
            action.origin - 1,
            1,
            {
              name: "swap",
              args: {
                inputToken: "usdc",
                outputToken: "usdc.e",
                inputAmount: action.args.amount,
                inputAmountUnits: action.args.amount_units,
                chainName: action.args.sourceChainName,
              },
            },
            {
              name: "bridge",
              args: {
                token: "usdc.e",
                amount: "outputAmount",
                sourceChainName: action.args.sourceChainName,
                destinationChainName: action.args.destinationChainName,
                protocolName: "stargate",
              },
            },
          );
        }

        console.log("Inference applied: to handle stargate usdc/usdc.e issue");
        sendInference(
          "Adjustments have been made to address compatibility issues with Stargate's USDC and USDC.e tokens. Restarting the simulation with updated actions.",
          rawActions,
          simulationId,
        );

        await resetVnetStates(checkpoints, rpcs);
        throw new Unwind(
          Flow.Return,
          "simaction",
          simulateActions(
            rawActions,
            conditions,
            address,
            connectedChainName,
            simulationId,
            rpcs,
            blockNumber,
            true,
            [...recur, -1],
            baseLiquidity,
          ),
        );
      }
      if (
        checkIfOnlyOrigin(tempActions, i) &&
        ret.message?.includes("exceeds balance") &&
        tokenInfo?.symbol?.toLowerCase() === `w${nativeTokenSymbol}`
      ) {
        const prevOriginCount = tempActions.filter(
          (x) => x.origin === action.origin - 1,
        ).length;
        if (prevOriginCount === 1) {
          const prevAction = tempActions[i - 1];
          if (
            prevAction.name === "swap" &&
            prevAction.args.outputToken?.toLowerCase() === nativeTokenSymbol
          ) {
            rawActions[action.origin - 2].args.outputToken =
              tokenInfo.symbol.toLowerCase();

            console.log(
              "Inference applied: retry using wrapped native token as previous swap's output token instead of native token through execution",
            );
            sendInference(
              "The wrapped native token has been set as the output token for the previous swap, replacing the native token to support execution. Restarting the simulation with updated actions.",
              rawActions,
              simulationId,
            );

            await resetVnetStates(checkpoints, rpcs);
            throw new Unwind(
              Flow.Return,
              "simaction",
              simulateActions(
                rawActions,
                conditions,
                address,
                connectedChainName,
                simulationId,
                rpcs,
                blockNumber,
                true,
                [...recur, -1],
                baseLiquidity,
              ),
            );
          }
        }
      }
      throw new Unwind(Flow.Return, "simaction", ret);
    }
  }
  return { j, simTxs };
}

async function handleWethLogs(
  wethLogs: ethers.Log[],
  address: string,
  tokenInfos: Record<string, Record<string, TokenInfo | undefined>>,
  sourceChainName: string | undefined,
  actions: SimResultAction[],
  i: number,
  chainId: number,
  count: number,
) {
  /* eslint-disable no-await-in-loop */
  for (const log of wethLogs) {
    const addressSuffix = address.toLowerCase().slice(2);

    if (log.topics[1].endsWith(addressSuffix)) {
      const tokenAddress = log.address.toLowerCase();
      let tokenInfo = tokenInfos[sourceChainName || ""][tokenAddress];

      if (!tokenInfo) {
        tokenInfo = await getTokenInfoForChain(tokenAddress, sourceChainName);
        if (!tokenInfo) {
          tokenInfo = await getTokenFromOnChain(tokenAddress, sourceChainName);
        }
        tokenInfos[sourceChainName || ""][tokenAddress] = tokenInfo;
      }

      if (tokenInfo) {
        const transferAmount = Number.parseFloat(
          ethers.formatUnits(log.data, tokenInfo.decimals),
        );

        let prevChange = Number.parseFloat(
          actions[i].balanceChanges[chainId][tokenInfo.symbol.toLowerCase()] ||
            "0",
        );
        let txPrevChange = Number.parseFloat(
          actions[i].txBalanceChanges[count - 1][
            tokenInfo.symbol.toLowerCase()
          ] || "0",
        );

        if (log.topics[0].startsWith("0x7fcf532c")) {
          prevChange -= transferAmount;
          txPrevChange -= transferAmount;
        } else {
          prevChange += transferAmount;
          txPrevChange += transferAmount;
        }

        actions[i].balanceChanges[chainId][tokenInfo.symbol.toLowerCase()] =
          prevChange.toString();
        actions[i].txBalanceChanges[count - 1][tokenInfo.symbol.toLowerCase()] =
          txPrevChange.toString();
        actions[i].tokens[chainId][tokenInfo.symbol.toLowerCase()] =
          tokenAddress;

        if (prevChange === 0) {
          delete actions[i].balanceChanges[chainId][
            tokenInfo.symbol.toLowerCase()
          ];
        }
        if (txPrevChange === 0) {
          delete actions[i].txBalanceChanges[count - 1][
            tokenInfo.symbol.toLowerCase()
          ];
        }
      }
    }
  }
}

async function handleLogs(
  tokenTransferLogs: ethers.Log[],
  address: string,
  tokenInfos: Record<string, Record<string, TokenInfo | undefined>>,
  sourceChainName: string | undefined,
  actions: SimResultAction[],
  i: number,
  chainId: number,
  count: number,
) {
  /* eslint-disable no-await-in-loop */
  for (const log of tokenTransferLogs) {
    const addressSuffix = address.toLowerCase().slice(2);

    if (
      log.topics[1].endsWith(addressSuffix) ||
      log.topics[2].endsWith(addressSuffix)
    ) {
      const tokenAddress = log.address.toLowerCase();
      let tokenInfo = tokenInfos[sourceChainName || ""][tokenAddress];

      if (!tokenInfo) {
        tokenInfo = await getTokenInfoForChain(tokenAddress, sourceChainName);
        if (!tokenInfo) {
          tokenInfo = await getTokenFromOnChain(tokenAddress, sourceChainName);
        }
        tokenInfos[sourceChainName || ""][tokenAddress] = tokenInfo;
      }

      if (tokenInfo) {
        const transferAmount = Number.parseFloat(
          ethers.formatUnits(log.data, tokenInfo.decimals),
        );

        const symbol = tokenInfo.symbol.toLowerCase();
        let prevChange = Number.parseFloat(
          actions[i].balanceChanges[chainId][symbol] || "0",
        );
        let txPrevChange = Number.parseFloat(
          actions[i].txBalanceChanges[count - 1][symbol] || "0",
        );

        if (log.topics[1].endsWith(addressSuffix)) {
          prevChange -= transferAmount;
          txPrevChange -= transferAmount;
        } else {
          prevChange += transferAmount;
          txPrevChange += transferAmount;
        }

        actions[i].balanceChanges[chainId][symbol] = prevChange.toString();
        actions[i].txBalanceChanges[count - 1][symbol] =
          txPrevChange.toString();
        actions[i].tokens[chainId][symbol] = tokenAddress;

        if (prevChange === 0) {
          delete actions[i].balanceChanges[chainId][symbol];
        }
        if (txPrevChange === 0) {
          delete actions[i].txBalanceChanges[count - 1][symbol];
        }
      }
    }
  }
}

async function fillNaN(
  amountKeys: string[],
  body: CommonArgs,
  curToken: string | undefined,
  action: SimResultAction,
  sourceChainName: string | undefined,
  protocol: string | undefined,
  rpcs: JSONObject,
  address: string,
  provider: RetryProvider,
  chainId: ChainId,
  indexesToRemove: number[],
  i: number,
  tempActions: SimResultAction[],
  rawActions: RawAction[],
  checkpoints: Record<string, string>,
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  printError: (...args: unknown[]) => void,
  poolName0: string | undefined,
  poolNames: string[],
  actions: SimResultAction[],
  rpcUrl: string,
  nativeTokenSymbol: string,
  zksyncid: number | undefined,
  nativeAmount0: bigint,
  token: string,
  baseLiquidity: number,
  simulationId: string,
) {
  let nativeAmount = nativeAmount0;
  let poolName = poolName0;
  /* eslint-disable no-await-in-loop */
  for (const amountKey of amountKeys) {
    if (amountKey === "amount2" && !body.token2) {
      continue;
    }

    const token_ =
      amountKey === "amount2"
        ? (body.token2Address || body.token2)?.toLowerCase()
        : curToken?.toLowerCase();
    let tokenSymbol =
      amountKey === "amount2"
        ? body.token2?.toLowerCase()
        : body[getTokenKey(action.name)]?.toLowerCase();
    if (action.name === "close") {
      tokenSymbol = body.outputToken || tokenSymbol || "";
    }
    const tokenInfo = await getTokenInfoForChain(
      token_,
      sourceChainName,
      false,
      { liquidityThreshold: action.name === "swap" ? baseLiquidity : 0 },
    );
    const amount =
      body.inputAmount || body[amountKey as keyof CommonArgs] || "all";
    if (action.name === "swap" && !isNaNValue(action.args.outputAmount)) {
      action.args[getAmountKey(action.name)] = undefined;
    } else if (isNaNValue(amount) && action.name !== "claim")
      // fillnan
      try {
        ({ poolName, nativeAmount } = await fillNaNClaim(
          amount as string,
          protocol,
          action,
          rpcs,
          tokenSymbol,
          address,
          body,
          provider,
          chainId,
          indexesToRemove,
          i,
          tempActions,
          rawActions,
          sourceChainName,
          checkpoints,
          conditions,
          connectedChainName,
          blockNumber,
          recur,
          printError,
          poolName,
          poolNames,
          actions,
          tokenInfo,
          token_ || "",
          rpcUrl,
          nativeTokenSymbol,
          zksyncid,
          nativeAmount,
          amountKey,
          curToken,
          token,
          simulationId,
        ));
      } catch (err) {
        if (
          err instanceof Unwind &&
          err.label === "fillnan" &&
          err.flow === Flow.Continue
        )
          continue;
        throw err;
      }
    else if (
      action.gasCheck &&
      (tokenInfo?.address === NATIVE_TOKEN ||
        tokenInfo?.address === NATIVE_TOKEN2 ||
        tokenInfo?.symbol?.toLowerCase() === nativeTokenSymbol)
    ) {
      const ethBalance = await getEthBalanceForUser(
        chainId,
        address,
        rpcUrl,
        typeof blockNumber === "object" ? blockNumber[chainId] : blockNumber,
        zksyncid,
      );
      nativeAmount += ethBalance;
    }
  }
  return { nativeAmount, poolName };
}

async function fillNaNClaim(
  amount: string,
  protocol: string | undefined,
  action: SimResultAction,
  rpcs: JSONObject,
  tokenSymbol: string | undefined,
  address: string,
  body: CommonArgs,
  provider: RetryProvider,
  chainId: ChainId,
  indexesToRemove: number[],
  i: number,
  tempActions: SimResultAction[],
  rawActions: RawAction[],
  sourceChainName: string | undefined,
  checkpoints: Record<string, string>,
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  printError: (...args: unknown[]) => void,
  poolName0: string | undefined,
  poolNames: string[],
  actions: SimResultAction[],
  tokenInfo: TokenInfo | undefined,
  token_: string,
  rpcUrl: string,
  nativeTokenSymbol: string,
  zksyncid: number | undefined,
  nativeAmount0: bigint,
  amountKey: string,
  curToken: string | undefined,
  token: string,
  simulationId: string,
) {
  let poolName = poolName0;
  let nativeAmount = nativeAmount0;
  let newAmount = 0n;
  if (amount === "all" || amount === "half" || amount.toString().endsWith("%"))
    ({ newAmount, poolName, nativeAmount } = await handleAllHalfPct(
      protocol,
      action,
      rpcs,
      tokenSymbol,
      newAmount,
      address,
      body,
      provider,
      chainId,
      indexesToRemove,
      i,
      tempActions,
      rawActions,
      sourceChainName,
      checkpoints,
      conditions,
      connectedChainName,
      blockNumber,
      recur,
      printError,
      poolName,
      poolNames,
      actions,
      tokenInfo,
      token_,
      rpcUrl,
      amount,
      nativeTokenSymbol,
      zksyncid,
      nativeAmount,
      simulationId,
    ));
  else {
    // sum up same token, same chain output amount from previous actions > prevAmount
    const prevActionIndexes = getPrevActionIndexes(tempActions, i);
    const startIndex =
      prevActionIndexes.length > 0
        ? prevActionIndexes[prevActionIndexes.length - 1]
        : 0;
    newAmount = updateAmount(
      action,
      startIndex,
      tempActions,
      sourceChainName,
      tokenSymbol,
      tokenInfo,
      newAmount,
    );
    if (newAmount === 0n) {
      // if no amount for same token, sum up wrap applied token, same chain output amount from previous actions > prevAmount
      newAmount = updateAmountIfZ(
        startIndex,
        tempActions,
        sourceChainName,
        tokenSymbol,
        tokenInfo,
        newAmount,
      );
    }
  }
  if (newAmount > 0n) {
    const newAmountStr = ethers.formatUnits(newAmount, tokenInfo?.decimals);
    if (body.inputAmount && tokenInfo)
      body.inputAmount = newAmountStr as string;
    if (body[amountKey as keyof CommonArgs] && tokenInfo)
      (body as JSONObject)[amountKey] = newAmountStr;
    const balance = await getEthBalanceForUser(
      chainId,
      address,
      rpcUrl,
      typeof blockNumber === "object" ? blockNumber[chainId] : blockNumber,
      zksyncid,
    );
    if (balance === 0n) {
      action.gasCheck = true;
    }
    if (
      tokenInfo?.address === NATIVE_TOKEN ||
      tokenInfo?.address === NATIVE_TOKEN2 ||
      tokenInfo?.symbol?.toLowerCase() === nativeTokenSymbol
    ) {
      if (chainId === 1) {
        action.gasCheck =
          toActions.includes(action.name) &&
          balance - newAmount < ethers.WeiPerEther / 50n;
      } else {
        action.gasCheck =
          toActions.includes(action.name) &&
          balance - newAmount < ethers.WeiPerEther / 500n;
      }
    }
  } else if (amountKey !== "amount2") {
    const errorMsg = checkPrevActions(
      tempActions,
      i,
      action,
      curToken,
      sourceChainName,
      tokenSymbol,
    );
    printError(errorMsg);
    indexesToRemove.push(i);
    if (validateActions(tempActions, i, indexesToRemove))
      throw new Unwind(Flow.Continue, "fillnan");

    if (
      checkIfOnlyOrigin(tempActions, i) &&
      action.name === "repay" &&
      tokenInfo
    ) {
      const tokens = await getTokensForAction(
        address,
        "repay",
        action.args,
        { provider, chainId },
        rpcs,
      );
      const temp = tokens.filter(
        (x) =>
          token === "all" ||
          token === "" ||
          x.symbol.toLowerCase() === tokenInfo.symbol?.toLowerCase(),
      );
      if (temp.length > 0) {
        const balances = await getTokenBalanceForAllChains(
          address,
          action.args.token,
          action.args.amount,
          rpcs,
        );
        if (balances.length === 1) {
          rawActions.splice(action.origin - 1, 0, {
            name: "bridge",
            args: {
              token: action.args.token,
              amount: action.args.amount,
              sourceChainName: balances[0].chainName,
              destinationChainName: action.args.chainName,
            },
          });

          console.log(
            `Inference applied: retry with an additional ${action.args.token} bridge from ${balances[0].chainName} to ${action.args.chainName} to ${action.name} through execution`,
          );
          sendInference(
            `An additional ${action.args.token} bridge from ${balances[0].chainName} to ${action.args.chainName} has been added to facilitate the ${action.name} action during execution. Restarting the simulation with updated actions.`,
            rawActions,
            simulationId,
          );

          await resetVnetStates(checkpoints, rpcs);
          throw new Unwind(
            Flow.Return,
            "simaction",
            simulateActions(
              rawActions,
              conditions,
              address,
              connectedChainName,
              simulationId,
              rpcs,
              blockNumber,
              true,
              [...recur, -1],
            ),
          );
        }
      }
    }

    if (
      checkIfOnlyOrigin(tempActions, i) &&
      checkIfOnlyOrigin(tempActions, i - 1)
    ) {
      const prevAction = rawActions[action.origin - 2];
      const curAction = rawActions[action.origin - 1];
      const curToken =
        curAction.args[getTokenKey(curAction.name)]?.toLowerCase();
      let prevChain = prevAction.args[getDstChainKey(prevAction.name)];
      if (!prevChain) {
        prevChain = tempActions[i - 1].args[getDstChainKey(prevAction.name)];
      }
      const curChain =
        curAction.args[getChainKey(curAction.name)] || sourceChainName;
      if (
        checkIfOnlyOrigin(tempActions, i) &&
        checkIfOnlyOrigin(tempActions, i - 1)
      ) {
        if (
          isHyperliquidAction(prevAction) &&
          isHyperliquidAction(action) &&
          getHyperliquidActionDestinationType(prevAction) !==
            getHyperliquidActionSourceType(action)
        ) {
          const recipient = getHyperliquidActionSourceType(action);

          rawActions.splice(action.origin - 1, 0, {
            name: "transfer",
            args: {
              token: "usdc",
              amount: "outputAmount",
              recipient: recipient,
              protocolName: "hyperliquid",
              chainName: curChain?.toLowerCase(),
            },
          });

          console.log(
            `Inference applied: retry with an additional transfer to ${recipient} for hyperliquid`,
          );
          sendInference(
            `An additional transfer to ${recipient} has been applied to access Hyperliquid. Restarting the simulation with the updated actions to ensure adequate funds.`,
            rawActions,
            simulationId,
          );
        } else {
          if (prevChain?.toLowerCase() !== curChain?.toLowerCase()) {
            rawActions.splice(action.origin - 1, 0, {
              name: "bridge",
              args: {
                token: curToken,
                amount: "outputAmount",
                sourceChainName: prevChain?.toLowerCase(),
                destinationChainName: curChain?.toLowerCase(),
              },
            });

            console.log(
              `Inference applied: retry with an additional ${curToken} bridge from ${prevChain} to ${curChain} for following action`,
            );
            sendInference(
              `An additional ${curToken} bridge from ${prevChain} to ${curChain} has been added to facilitate the following action. Restarting the simulation with updated actions.`,
              rawActions,
              simulationId,
            );
          } else if (isHyperliquidAction(action)) {
            const recipient = getHyperliquidActionSourceType(action);
            const tokenInfo = await getTokenInfoForChain(
              prevAction.args.outputToken || prevAction.args.token,
              curChain,
              false,
            );
            if (tokenInfo) {
              const actionsToAdd: RawAction[] = [];
              if (tokenInfo.symbol.toLowerCase() !== "usdc") {
                actionsToAdd.push({
                  name: "swap",
                  args: {
                    inputAmount: "outputAmount",
                    inputToken: tokenInfo.symbol,
                    outputToken: "usdc",
                    chainName: curChain?.toLowerCase(),
                  },
                });
              }
              actionsToAdd.push({
                name: "deposit",
                args: {
                  amount: "outputAmount",
                  token: "usdc",
                  chainName: "arbitrum",
                  protocolName: "hyperliquid",
                },
              });
              if (recipient === "spot") {
                actionsToAdd.push({
                  name: "transfer",
                  args: {
                    token: "usdc",
                    amount: "outputAmount",
                    recipient: "spot",
                    protocolName: "hyperliquid",
                    chainName: "arbitrum",
                  },
                });
              }
              rawActions[action.origin - 1].args[getTokenKey(action.name)] =
                "usdc";
              rawActions[action.origin - 1].args[getAmountKey(action.name)] =
                "outputAmount";
              rawActions.splice(action.origin - 1, 0, ...actionsToAdd);

              console.log(
                "Inference applied: retry with an additional swap/deposit/transfer for hyperliquid",
              );
              sendInference(
                "An additional swap/deposit/transfer has been applied to access Hyperliquid. Restarting the simulation with the updated actions to ensure adequate funds.",
                rawActions,
                simulationId,
              );
            } else {
              throw new Unwind(Flow.Return, "simaction", {
                success: false,
                message: errorMsg,
                index: i,
              });
            }
          } else {
            throw new Unwind(Flow.Return, "simaction", {
              success: false,
              message: errorMsg,
              index: i,
            });
          }
        }

        await resetVnetStates(checkpoints, rpcs);
        throw new Unwind(
          Flow.Return,
          "simaction",
          simulateActions(
            rawActions,
            conditions,
            address,
            connectedChainName,
            simulationId,
            rpcs,
            blockNumber,
            true,
            [...recur, -1],
          ),
        );
      }
    }

    throw new Unwind(Flow.Return, "simaction", {
      success: false,
      message: errorMsg,
      index: i,
    });
  }

  return { poolName, nativeAmount };
}

async function handleAllHalfPct(
  protocol: string | undefined,
  action: SimResultAction,
  rpcs: JSONObject,
  tokenSymbol: string | undefined,
  newAmount0: bigint,
  address: string,
  body: CommonArgs,
  provider: RetryProvider,
  chainId: ChainId,
  indexesToRemove: number[],
  i: number,
  tempActions: SimResultAction[],
  rawActions: RawAction[],
  sourceChainName: string | undefined,
  checkpoints: Record<string, string>,
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  printError: (...args: unknown[]) => void,
  poolName0: string | undefined,
  poolNames: string[],
  actions: SimResultAction[],
  tokenInfo: TokenInfo | undefined,
  token_: string,
  rpcUrl: string,
  amount: string,
  nativeTokenSymbol: string,
  zksyncid: number | undefined,
  nativeAmount0: bigint,
  simulationId: string,
) {
  let newAmount = newAmount0;
  let poolName = poolName0;
  let nativeAmount = nativeAmount0;
  if (protocol === "hyperliquid" && action.name !== "deposit") {
    if (getHyperliquidActionSourceType(action) === "spot") {
      if (
        tokenInfo?.symbol === "usdc" ||
        isValidHyperliquidAddress(tokenInfo?.address)
      ) {
        newAmount = getHyperliquidSpotBalance(rpcs, {
          ...tokenInfo,
          symbol: tokenSymbol || tokenInfo?.symbol || "",
        });
      }
    } else {
      const position = rpcs?.hyperliquid?.find(
        (position: { type: string; tokens: DebankTokenInfoR[] }) =>
          action.name === "close"
            ? position.type === "Perpetuals" &&
              position.tokens[0]?.symbol?.toUpperCase() ===
                tokenSymbol?.toUpperCase()
            : position.type === "Deposit",
      );
      if (position) {
        newAmount = sfParseUnits(
          position.tokens[action.name === "close" ? 1 : 0].amount.toString() ||
            "0",
          6,
        );
      }
    }
  } else if (protocol === "etherfi") {
    newAmount = 1n;
  } else if (fromActions.includes(action.name)) {
    let tokens = await getTokensForAction(
      address,
      action.name,
      body,
      { provider, chainId },
      rpcs,
    );
    if (tokens.length === 0) {
      indexesToRemove.push(i);
      if (validateActions(tempActions, i, indexesToRemove))
        throw new Unwind(Flow.Continue, "fillnan");

      const { status, chain, chains } = await getAlternativeChain(
        address,
        action,
        chainId,
        rpcs,
      );
      if (status) {
        await updateChains(
          rawActions,
          action,
          chain || "",
          sourceChainName || "",
        );

        console.log(
          `Inference applied: retry ${action.name} on ${chain}, since no position found to fill amount on ${sourceChainName} through execution`,
        );
        sendInference(
          `Retrying the ${action.name} action on ${chain} as no position was available to cover the required amount on ${sourceChainName} during execution. Restarting the simulation with updated actions.`,
          rawActions,
          simulationId,
        );

        await resetVnetStates(checkpoints, rpcs);
        throw new Unwind(
          Flow.Return,
          "simaction",
          simulateActions(
            rawActions,
            conditions,
            address,
            connectedChainName,
            simulationId,
            rpcs,
            blockNumber,
            true,
            [...recur, -1],
          ),
        );
      }

      const errorMsg = getNoPositionError(action.name, sourceChainName, chains);
      printError(errorMsg);
      throw new Unwind(Flow.Return, "simaction", {
        success: false,
        message: errorMsg,
        index: i,
      });
    }
    const tokenStr =
      action.name === "close" &&
      protocol === "gmx" &&
      tokenSymbol?.toLowerCase().startsWith("w")
        ? tokenSymbol.slice(1).toLowerCase()
        : tokenSymbol?.toLowerCase();
    const temp = tokens.filter(
      (x) =>
        tokenSymbol === "all" ||
        tokenSymbol === "" ||
        (protocol === "pendle" &&
          extractPendleToken(x.poolName || "") === tokenStr) ||
        x.symbol.toLowerCase() === tokenStr,
    );
    if (temp.length === 0) {
      const { status, chain, chains } = await getAlternativeChain(
        address,
        action,
        chainId,
        rpcs,
      );
      if (status) {
        await updateChains(
          rawActions,
          action,
          chain || "",
          sourceChainName || "",
        );

        console.log(
          `Inference applied: retry ${action.name} on ${chain}, since no matching position found to fill amount on ${sourceChainName} through execution`,
        );
        sendInference(
          `Retrying the ${action.name} action on ${chain} as no position was available to cover the required amount on ${sourceChainName} during execution. Restarting the simulation with updated actions.`,
          rawActions,
          simulationId,
        );

        await resetVnetStates(checkpoints, rpcs);
        throw new Unwind(
          Flow.Return,
          "simaction",
          simulateActions(
            rawActions,
            conditions,
            address,
            connectedChainName,
            simulationId,
            rpcs,
            blockNumber,
            true,
            [...recur, -1],
          ),
        );
      }

      const errorMsg = getNoPositionError(
        action.name,
        sourceChainName,
        chains,
        undefined,
        tokenSymbol,
        tokens.map((x) => x.symbol),
      );
      printError(errorMsg);
      indexesToRemove.push(i);
      if (validateActions(tempActions, i, indexesToRemove))
        throw new Unwind(Flow.Continue, "fillnan");
      throw new Unwind(Flow.Return, "simaction", {
        success: false,
        message: errorMsg,
        index: i,
      });
    }
    for (const pool of poolNames) {
      const index = temp.findIndex((x) => x.poolName === pool);
      if (index >= 0) temp.splice(index, 1);
    }
    tokens = temp;
    newAmount = tokens[0]?.amount ?? 0n;
    if (
      newAmount > 0n &&
      protocol === "pendle" &&
      action.name === "withdraw" &&
      !poolName
    ) {
      poolName =
        action.args.poolName =
        actions[i].args.poolName =
        body.poolName =
          tokens[0].poolName;
    }
  } else if (action.name === "borrow" && tokenInfo) {
    const borrowableAmount = await getBorrowableAmountForToken(
      chainId,
      protocol,
      address,
      token_,
      rpcUrl,
      poolName,
    );
    newAmount = sfParseUnits(borrowableAmount, tokenInfo.decimals);
  } else if (action.name !== "swap" || !body.outputAmount) {
    action.gasCheck =
      toActions.includes(action.name) &&
      amount === "all" &&
      tokenSymbol === nativeTokenSymbol;
    try {
      if (!tokenInfo) {
        indexesToRemove.push(i);
        if (validateActions(tempActions, i, indexesToRemove))
          throw new Unwind(Flow.Continue, "fillnan");
      }
      if (
        tokenInfo?.address === NATIVE_TOKEN ||
        tokenInfo?.address === NATIVE_TOKEN2 ||
        tokenInfo?.symbol?.toLowerCase() === nativeTokenSymbol
      ) {
        const ethBalance = await getEthBalanceForUser(
          chainId,
          address,
          rpcUrl,
          typeof blockNumber === "object" ? blockNumber[chainId] : blockNumber,
          zksyncid,
        );
        newAmount = ethBalance;
        nativeAmount = ethBalance;
      } else if (tokenInfo?.address) {
        const viemClient = await getViemPublicClientFromEthers(provider);
        assert(isHexStr(tokenInfo.address));
        assert(isHexStr(address));
        const tokenBalance = await withRetry(address, () =>
          viemClient.readContract({
            address: tokenInfo.address as `0x${string}`,
            abi: abis.erc20,
            functionName: "balanceOf",
            args: [address],
          }),
        );
        newAmount = tokenBalance;
      }
    } catch (err) {
      if (err instanceof Unwind) throw err;
      printError(
        `Cannot fill amount for ${tokenSymbol} token:`,
        getErrorMessage(err),
      );
      indexesToRemove.push(i);
      if (validateActions(tempActions, i, indexesToRemove))
        throw new Unwind(Flow.Continue, "fillnan");
      throw new Unwind(Flow.Return, "simaction", {
        success: false,
        message: getErrorMessage(err) || "Invalid action format",
        index: i,
      });
    }
  }
  if (newAmount === 0n) {
    // sum up same token, same chain output amount from previous actions in sequence > prevAmount
    let prevActionIndexes = getPrevActionIndexes(tempActions, i);
    let j = 0;
    let count = 0;
    ({ j, prevActionIndexes, count, newAmount } = updateActionIndexes(
      j,
      prevActionIndexes,
      tempActions,
      sourceChainName,
      tokenSymbol,
      count,
      tokenInfo,
      newAmount,
      amount,
    ));
    if (newAmount === 0n) {
      // if no amount for same token, sum up wrap applied token, same chain output amount from previous actions in sequence > prevAmount
      prevActionIndexes = getPrevActionIndexes(tempActions, i);
      j = 0;
      count = 0;
      ({ j, prevActionIndexes, count, newAmount } = updateActionIndexesZ(
        j,
        prevActionIndexes,
        tempActions,
        sourceChainName,
        tokenSymbol,
        count,
        tokenInfo,
        newAmount,
        amount,
      ));
    }
  }
  if (amount === "all") {
    /* empty */
  } else if (amount === "half") {
    newAmount =
      (newAmount *
        ((await checkUniswapLikeDeposits(tempActions, i)) ? 49n : 50n)) /
      100n;
  } else {
    const percent = Math.floor(Number.parseFloat(amount) * 100);
    newAmount = (newAmount * ethers.getBigInt(percent)) / 10000n;
  }
  return { newAmount, poolName, nativeAmount };
}

function updateActionIndexesZ(
  j0: number,
  prevActionIndexes0: number[],
  tempActions: SimResultAction[],
  sourceChainName: string | undefined,
  tokenSymbol: string | undefined,
  count0: number,
  tokenInfo: TokenInfo | undefined,
  newAmount0: bigint,
  amount: string,
) {
  let j = j0;
  let prevActionIndexes = prevActionIndexes0;
  let count = count0;
  let newAmount = newAmount0;
  while (j < prevActionIndexes.length) {
    const { name, args } = tempActions[prevActionIndexes[j]];
    const _token = (args.outputToken || args.token || "").toLowerCase();
    const _chainName = args[getDstChainKey(name)];
    if (sourceChainName?.toLowerCase() !== _chainName?.toLowerCase()) {
      break;
    }
    if (
      (`w${tokenSymbol}` === _token || tokenSymbol === `w${_token}`) &&
      !isNaNValue(args.outputAmount)
    ) {
      count++;
      const amountIncrease = sfParseUnits(
        (+(args.outputAmount || "0")).toFixed(tokenInfo?.decimals || 18),
        tokenInfo?.decimals,
      );
      newAmount += (amountIncrease * 999999n) / 1000000n;
      if (amount !== "half") {
        args.outputAmount = undefined;
      } else {
        args.outputAmount = ethers.formatUnits(
          amountIncrease / 2n,
          tokenInfo?.decimals,
        );
      }
    }
    j++;
    if (j === prevActionIndexes.length && count > 0) {
      j = 0;
      count = 0;
      prevActionIndexes = getPrevActionIndexes(
        tempActions,
        prevActionIndexes[0],
      );
    }
  }
  return { j, prevActionIndexes, count, newAmount };
}

function updateActionIndexes(
  j0: number,
  prevActionIndexes0: number[],
  tempActions: SimResultAction[],
  sourceChainName: string | undefined,
  tokenSymbol: string | undefined,
  count0: number,
  tokenInfo: TokenInfo | undefined,
  newAmount0: bigint,
  amount: string,
) {
  let j = j0;
  let prevActionIndexes = prevActionIndexes0;
  let count = count0;
  let newAmount = newAmount0;
  while (j < prevActionIndexes.length) {
    const { name, args } = tempActions[prevActionIndexes[j]];
    const _token = (args.outputToken || args.token || "").toLowerCase();
    const _chainName = args[getDstChainKey(name)];
    if (sourceChainName?.toLowerCase() !== _chainName?.toLowerCase()) {
      break;
    }
    if (tokenSymbol === _token && !isNaNValue(args.outputAmount)) {
      count++;

      const amountIncrease = sfParseUnits(
        (+(args.outputAmount || "0")).toFixed(tokenInfo?.decimals || 18),
        tokenInfo?.decimals,
      );
      newAmount += (amountIncrease * 999999n) / 1000000n;
      if (amount !== "half") {
        args.outputAmount = undefined;
      } else {
        args.outputAmount = ethers.formatUnits(
          amountIncrease / 2n,
          tokenInfo?.decimals,
        );
      }
    }
    j++;
    if (j === prevActionIndexes.length && count > 0) {
      j = 0;
      count = 0;
      prevActionIndexes = getPrevActionIndexes(
        tempActions,
        prevActionIndexes[0],
      );
    }
  }
  return { j, prevActionIndexes, count, newAmount };
}

function updateAmountIfZ(
  startIndex: number,
  tempActions: SimResultAction[],
  sourceChainName: string | undefined,
  tokenSymbol: string | undefined,
  tokenInfo: TokenInfo | undefined,
  newAmount0: bigint,
) {
  let newAmount = newAmount0;
  for (let j = startIndex; j >= 0; j--) {
    const { name, args } = tempActions[j];
    const _token = (args.outputToken || args.token || "").toLowerCase();
    const _chainName = args[getDstChainKey(name)];
    if (sourceChainName?.toLowerCase() !== _chainName?.toLowerCase()) {
      break;
    }
    if (
      (`w${tokenSymbol}` === _token || tokenSymbol === `w${_token}`) &&
      !isNaNValue(args.outputAmount)
    ) {
      const amountIncrease = sfParseUnits(
        args.outputAmount || "0",
        tokenInfo?.decimals,
      );
      newAmount += (amountIncrease * 999999n) / 1000000n;
      args.outputAmount = undefined;
    }
  }
  return newAmount;
}

function getHyperliquidActionSourceType(action: RawAction) {
  if (!isHyperliquidAction(action) || action.name === "deposit") {
    return action.args.sourceChainName || action.args.chainName;
  }
  if (["withdraw", "long", "short", "close"].includes(action.name)) {
    return "perp";
  }
  if (action.name === "transfer" && action.args.recipient === "spot") {
    return "perp";
  }
  return "spot";
}

function getHyperliquidActionDestinationType(action: RawAction) {
  if (!isHyperliquidAction(action) || action.name === "withdraw") {
    return action.args.destinationChainName || action.args.chainName;
  }
  if (["deposit", "long", "short", "close"].includes(action.name)) {
    return "perp";
  }
  if (action.name === "transfer" && action.args.recipient === "perp") {
    return "perp";
  }
  return "spot";
}

function updateAmount(
  action: SimResultAction,
  startIndex: number,
  tempActions: SimResultAction[],
  sourceChainName: string | undefined,
  tokenSymbol: string | undefined,
  tokenInfo: TokenInfo | undefined,
  newAmount0: bigint,
) {
  let newAmount = newAmount0;
  for (let j = startIndex; j >= 0; j--) {
    const { name, args } = tempActions[j];
    const _token = getOutputToken(tempActions[j]).toLowerCase();
    if (isHyperliquidAction(action) && action.name !== "deposit") {
      if (
        args.protocolName?.toLowerCase() !== "hyperliquid" ||
        ["long", "short", "withdraw"].includes(name)
      ) {
        break;
      }
      const key = name === "deposit" ? "amount" : "outputAmount";
      if (
        (action.args.inputToken || action.args.token)?.toLowerCase() ===
          _token &&
        getHyperliquidActionSourceType(action) ===
          getHyperliquidActionDestinationType(tempActions[j]) &&
        !isNaNValue(args[key]) &&
        !args.isOutAmountUsed
      ) {
        newAmount += sfParseUnits(args[key] || "0", tokenInfo?.decimals);
        args.outputAmount = undefined;
        if (name === "deposit") args.isOutAmountUsed = true;
      }
    } else {
      const _chainName = args[getDstChainKey(name)];
      if (
        sourceChainName?.toLowerCase() !== _chainName?.toLowerCase() ||
        (args.protocolName?.toLowerCase() === "hyperliquid" &&
          name !== "withdraw")
      ) {
        break;
      }
      if (tokenSymbol === _token && !isNaNValue(args.outputAmount)) {
        const amountIncrease = sfParseUnits(
          args.outputAmount || "0",
          tokenInfo?.decimals,
        );
        newAmount += (amountIncrease * 999999n) / 1000000n;
        args.outputAmount = undefined;
      }
    }
  }
  return newAmount;
}

async function handleAllPos(
  action: SimResultAction,
  i: number,
  protocol: string | undefined,
  token: string,
  address: string,
  provider: RetryProvider,
  chainId: ChainId,
  rpcs: JSONObject,
  isOnlyOrigin: boolean,
  rawActions: RawAction[],
  chainName: string | undefined,
  checkpoints: Record<string, string>,
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  printError: (...args: unknown[]) => void,
  actions: SimAction[],
) {
  if (protocol === "all" && !nonProtocolNames.includes(action.name)) {
    if (!protocolValidActions.includes(action.name)) {
      actions.splice(i, 1);
      throw new Unwind(Flow.Redo, "simaction");
    }

    const protocols = await getUserPositions(chainId, address);
    let gmxTokensToClose: PortfolioToken[] = [];
    let hyperTokensToClose: PortfolioToken[] = [];
    if (action.name === "close") {
      gmxTokensToClose = await getGMXTokensToClose(address, chainId, provider);
      hyperTokensToClose = await getHyperliquidTokensToClose(address);
    }
    if (
      protocols.length === 0 &&
      gmxTokensToClose.length === 0 &&
      hyperTokensToClose.length === 0
    ) {
      if (isOnlyOrigin) {
        const errorMsg = `No positions to ${action.name}. Ensure that you have positions to ${action.name} in your Slate account.`;
        printError(errorMsg);
        return { success: false, message: errorMsg, index: i };
      }
      actions.splice(i, 1);
      throw new Unwind(Flow.Redo, "simaction");
    }

    const newArgs: JSONObject[] = [];
    if (gmxTokensToClose.length > 0) {
      newArgs.push(
        ...gmxTokensToClose.map(({ symbol, ...x }) => ({
          ...x,
          token: symbol,
          protocolName: "gmx",
        })),
      );
    }
    if (hyperTokensToClose.length > 0) {
      newArgs.push(
        ...hyperTokensToClose.map(({ symbol, ...x }) => ({
          ...x,
          token: symbol,
          protocolName: "hyperliquid",
        })),
      );
    }
    updateArgs(protocols, action, newArgs);
    actions.splice(
      i,
      1,
      ...(await Promise.all(
        newArgs.map(getLPAction(action, chainId, provider)),
      )),
    );
    const actions0 = actions.filter((x: SimAction) => x.lp !== null);
    throw new Unwind(Flow.Redo, "simaction", actions0);
  }
}

async function simRetry(
  attempts0: number,
  success0: boolean,
  forceContinue0: boolean,
  chainId: ChainId,
  address: string,
  provider: RetryProvider,
  tx: Transaction,
  retry: boolean,
  body: CommonArgs,
  rpcs: JSONObject,
  action: SimResultAction,
  token: string,
  recur: number[],
  ii0: number,
  protocol: string | undefined,
  source: string | undefined,
  ignores: string[],
  alternatives: JSONObject[] | undefined,
  chainName: string | undefined,
  printError: (...args: unknown[]) => void,
  lastError0: string,
  i: number,
  indexesToRemove: number[],
  simTxs0: Transaction[],
  receipt0: TransactionReceipt | null,
  actions: SimResultAction[],
  newTxs: number,
  rpcUrl: string | undefined,
  gmxKey0: `0x${string}` | undefined,
  isGMXSimulating0: boolean,
  count: number,
  printLog: (...args: unknown[]) => void,
  txWithoutGas: Transaction,
  checkpoints: Record<string, string>,
  rawActions: RawAction[],
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  simulationResults: JSONObject[],
  tokenInfos: JSONObject,
  sourceChainName: string | undefined,
  gasUsed0: bigint,
  tempActions: SimResultAction[],
  baseLiquidity: number,
  simulationId: string,
) {
  let lastError = lastError0;
  let ii = ii0;
  let gasUsed = gasUsed0;
  let attempts = attempts0;
  let success = success0;
  let isGMXSimulating = isGMXSimulating0;
  let gmxKey = gmxKey0;
  let simTxs = simTxs0;
  let forceContinue = forceContinue0;
  let receipt = receipt0;
  /* eslint-disable no-await-in-loop */
  while (attempts < 2 && !success) {
    if (forceContinue) {
      break;
    }

    try {
      // simretry
      let gath: ethers.FeeData | undefined;
      let gaath = 0n;
      if (chainId === ChainIDs.zksync) {
        const tempProvider = new RetryProvider(
          getRpcUrlForChain(ChainIDs.zksync),
          ChainIDs.zksync,
        );
        gath = await withRetry(address, () => tempProvider.getFeeData());
        ({ gaath, lastError, ii, simTxs, forceContinue } = await handle324(
          gaath,
          address,
          provider,
          txWithoutGas,
          tx,
          chainId,
          gath,
          retry,
          checkpoints,
          rpcs,
          rawActions,
          conditions,
          connectedChainName,
          blockNumber,
          recur,
          baseLiquidity,
          ignores,
          lastError,
          simulationResults,
          printError,
          ii,
          protocol,
          source,
          alternatives,
          action,
          body,
          chainName,
          token,
          indexesToRemove,
          i,
          tempActions,
          actions,
          printLog,
          simTxs,
          newTxs,
          forceContinue,
          simulationId,
        ));
      }
      const hash = await provider.send("eth_sendTransaction", [
        {
          ...txWithoutGas,
          from: ethers.getAddress(address),
          value: convertToHexString(tx.value || "0"),
          maxFeePerGas:
            chainId === ChainIDs.zksync
              ? convertToHexString((gath?.maxFeePerGas || 0n).toString())
              : null,
          gas:
            chainId === ChainIDs.zksync
              ? convertToHexString(((gaath * 6n) / 5n || 0n).toString())
              : null, // "0xffcfffff",
        },
      ]);
      receipt = await withRetry(address, () =>
        provider.waitForTransaction(hash),
      );

      const tokenTransferLogs = receipt?.logs.filter(
        (log) => log.topics[0].startsWith("0xddf252ad") && log.data !== "0x",
      );
      const wethLogs = receipt?.logs.filter(
        (log) =>
          (log.topics[0].startsWith("0xe1fffcc4") && log.data !== "0x") ||
          (log.topics[0].startsWith("0x7fcf532c") && log.data !== "0x"),
      );
      const gmxLogs = receipt?.logs.filter(
        (log) =>
          log.topics[0] ===
          "0x468a25a7ba624ceea6e540ad6f49171b52495b648417ae91bca21676d8a24dc5",
      );
      if (gmxLogs && gmxLogs.length > 0) {
        gmxKey = gmxLogs[0].topics[2] as `0x${string}`;
        isGMXSimulating = true;
      }

      if (tokenTransferLogs) {
        await handleLogs(
          tokenTransferLogs,
          address,
          tokenInfos,
          sourceChainName,
          actions,
          i,
          chainId,
          count,
        );
      }

      try {
        if (wethLogs) {
          await handleWethLogs(
            wethLogs,
            address,
            tokenInfos,
            sourceChainName,
            actions,
            i,
            chainId,
            count,
          );
        }
      } catch (err) {
        if (err instanceof Unwind) throw err;
        printLog("Not an eth wrap/unwrap case");
      }

      if (!receipt?.status) {
        if (
          tx.to === "0xdef1c0ded9bec7f1a1670819833240f027b25eff" ||
          tx.to === "0xdef1abe32c034e558cdd535791643c58a13acc10" ||
          tx.to === "0xdef189deaef76e379df891899eb5a00a94cbc250"
        ) {
          printError("0x failed sim", JSON.stringify(receipt, null, 2));
          lastError =
            "Return amount from 0x swap was not enough. Please try again.";
        } else if (tx.to === "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64") {
          printError("openocean failed sim", JSON.stringify(receipt, null, 2));
          lastError =
            "Return amount from openocean swap was not enough. Please try again.";
        } else if (tx.to === "0x1111111254eeb25477b68fb85ed929f73a960582") {
          printError("1inch failed sim", JSON.stringify(receipt, null, 2));
          lastError =
            "Return amount from 1inch swap was not enough. Please try again.";
        } else {
          if (chainId !== ChainIDs.zksync) {
            const vnetId = getVnetIdFromRpc(rpcUrl);
            lastError = await getRevertReason(address, vnetId, hash, protocol);
          }
          if (!gmxKey && isGMXSimulating) {
            isGMXSimulating = false;
            success = lastError.includes("EndOfOracleSimulation");
            if (success) {
              ii++;
              continue;
            }
          }
          printError("TX", tx, rpcs, JSON.stringify(receipt, null, 2));
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 2 ** attempts * 1000),
        ); // Exponential backoff
      } else {
        if (action.name === "swap" || action.name === "bridge") {
          gasUsed += (receipt.gasUsed * 3n) / 2n;
          actions[i].txGasUsed.push(((receipt.gasUsed * 3n) / 2n).toString());
        } else {
          gasUsed += receipt.gasUsed;
          actions[i].txGasUsed.push(receipt.gasUsed.toString());
        }
        simulationResults.push({ transaction: receipt });
        success = true; // Mark as successful to exit the loop
      }
    } catch (err) {
      if (err instanceof Unwind && err.label === "simretry") {
        switch (err.flow) {
          case Flow.Continue:
            continue;
        }
      }
      if (err instanceof Unwind) throw err;
      lastError = getErrorMessage(err);
      printError("trying again:", lastError);
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempts * 1000)); // Exponential backoff
    }
    attempts++;
  }
  return {
    lastError,
    ii,
    gasUsed,
    attempts,
    success,
    isGMXSimulating,
    gmxKey,
    simTxs,
    forceContinue,
    receipt,
  };
}

async function handle324(
  gaath0: bigint,
  address: string,
  provider: RetryProvider,
  txWithoutGas: Transaction,
  tx: Transaction,
  chainId: ChainId,
  gath: ethers.FeeData | undefined,
  retry: boolean,
  checkpoints: Record<string, string>,
  rpcs: JSONObject,
  rawActions: RawAction[],
  conditions: Call[],
  connectedChainName: string,
  blockNumber: string | JSONObject | undefined,
  recur: number[],
  baseLiquidity: number,
  ignores: string[],
  lastError0: string,
  simulationResults: JSONObject[],
  printError: (...args: unknown[]) => void,
  ii0: number,
  protocol: string | undefined,
  source0: string | undefined,
  alternatives: JSONObject[] | undefined,
  action: SimResultAction,
  body: CommonArgs,
  chainName: string | undefined,
  token: string,
  indexesToRemove: number[],
  i: number,
  tempActions: SimResultAction[],
  actions: SimResultAction[],
  printLog: (...args: unknown[]) => void,
  simTxs0: Transaction[],
  newTxs: number,
  forceContinue0: boolean,
  simulationId: string,
) {
  let gaath = gaath0;
  let lastError = lastError0;
  let ii = ii0;
  let simTxs = simTxs0;
  let forceContinue = forceContinue0;
  let source = source0;
  try {
    gaath = await withRetry(address, () =>
      provider.estimateGas({
        ...txWithoutGas,
        from: ethers.getAddress(address),
        value: convertToHexString(tx.value || "0"),
        maxFeePerGas:
          chainId === ChainIDs.zksync
            ? convertToHexString((gath?.maxFeePerGas || 0n).toString())
            : null,
      }),
    );
  } catch (err) {
    if (err instanceof Unwind) throw err;
    const message = getErrorMessage(err);
    if (message.includes("socket")) {
      if (!retry) {
        throw new Unwind(Flow.Return, "simaction", {
          success: false,
          message,
        });
      }

      console.log("Inference applied: since zksync simulation failed");
      sendInference(
        "The simulation on zkSync encountered an issue. Restarting the simulation with adjustments to address this.",
        rawActions,
        simulationId,
      );

      await resetVnetStates(checkpoints, rpcs);
      throw new Unwind(
        Flow.Return,
        "simaction",
        simulateActions(
          rawActions,
          conditions,
          address,
          connectedChainName,
          simulationId,
          rpcs,
          blockNumber,
          false,
          [...recur, -1],
          baseLiquidity,
        ),
      );
    }
    if (ignores.length > 3) {
      lastError = "Failed to estimate gas";
      simulationResults.push({
        transaction: { status: 0, error_message: lastError },
      });
      printError(lastError);
      ii++;
    } else if (!protocol && source) {
      ignores.push(source);
      const alternative = alternatives?.find(
        (data) => !ignores.includes(data.source),
      );

      if (!alternative) {
        let error = "";
        if (action.name === "swap") {
          const inputTokenInfo = await getTokenInfoForChain(
            body.token1Address || body.inputToken,
            body.chainName,
            true,
            {
              liquidityThreshold: action.name === "swap" ? baseLiquidity : 0,
            },
          );
          const outputTokenInfo = await getTokenInfoForChain(
            body.outputToken,
            body.chainName,
            true,
            {
              liquidityThreshold: action.name === "swap" ? baseLiquidity : 0,
            },
          );
          error = getNoSwapRouteError(
            inputTokenInfo?.symbol,
            outputTokenInfo?.symbol,
            chainName,
            body.slippage,
          );
        } else if (action.name === "bridge") {
          const srcChainId = getChainIdFromName(body.sourceChainName);
          const inputTokenInfo = await getTokenInfoForChain(
            body.token1Address || token,
            body.sourceChainName,
            true,
          );
          error = getNoBridgeRouteError(
            inputTokenInfo?.symbol,
            body.sourceChainName,
            body.destinationChainName,
          );
        }
        printError(error);
        indexesToRemove.push(i);
        if (validateActions(tempActions, i, indexesToRemove))
          throw new Unwind(Flow.Continue, "simretry");
        const index = recur.findLastIndex((x) => x >= 0);
        if (index >= 0) {
          const origin = recur.splice(index, 1)[0];
          const action1 = action.name === "swap" ? action : actions[origin - 1];
          const action2 = action.name === "swap" ? actions[origin] : action;
          const middleToken = await getMiddleToken(action1.args, {
            chain1: action2.args.sourceChainName,
            chain2: action2.args.destinationChainName,
          });
          rawActions[action1.origin - 1] = {
            name: "swap",
            args: {
              ...rawActions[action1.origin - 1].args,
              outputToken: middleToken,
            },
          };
          rawActions[action1.origin] = {
            name: "bridge",
            args: {
              ...rawActions[action1.origin].args,
              token: middleToken,
            },
          };
          rawActions.splice(action1.origin + 1, 0, {
            name: "swap",
            args: {
              inputToken: middleToken,
              inputAmount: "outputAmount",
              outputToken: action1.args.outputToken,
              chainName: action2.args.destinationChainName,
            },
          });

          console.log(
            `Inference reapplied: retry with middle token swap since no route found for ${action.name}`,
          );
          sendInference(
            `Retrying with middle token swap since no route found for ${action.name}`,
            rawActions,
            simulationId,
          );

          await resetVnetStates(checkpoints, rpcs);
          throw new Unwind(
            Flow.Return,
            "simaction",
            simulateActions(
              rawActions,
              conditions,
              address,
              connectedChainName,
              simulationId,
              rpcs,
              blockNumber,
              true,
              [...recur, -1],
              baseLiquidity,
            ),
          );
        }
        throw new Unwind(Flow.Return, "simaction", {
          success: false,
          message: error || "Invalid action format",
        });
      }
      if (alternative.source) {
        printLog("using alternative", alternative.source);
        source = alternative.source;
        actions[i].args.provider = alternative.source;
        action.args.provider = alternative.source;
      }

      simTxs = simTxs.slice(0, simTxs.length - newTxs);
      simTxs.push(...alternative.transactions);
      ii = simTxs.length - alternative.transactions.length;
    } else {
      // Push the failure case after all attempts have been exhausted
      simulationResults.push({
        transaction: { status: 0, error_message: lastError },
      });
      printError(lastError);
      ii++;
    }
    forceContinue = true;
    throw new Unwind(Flow.Continue, "simretry");
  }
  return { gaath, lastError, ii, simTxs, forceContinue };
}

export const checkPrevActions = (
  tempActions: SimAction[],
  i: number,
  action: SimAction,
  curToken: string | undefined,
  sourceChainName: string | undefined,
  tokenSymbol: string | undefined,
) => {
  let errorMsg = `You have zero balance for ${curToken} token on chain ${sourceChainName}`;
  let index = i;
  let initialized = false;
  while (index >= 0) {
    const prevActionIndexes = getPrevActionIndexes(tempActions, index);
    index = prevActionIndexes[0];
    const prevAction = tempActions[index];
    if (
      !prevAction ||
      prevAction.args[getChainKey(prevAction.name)]?.toLowerCase() !==
        action.args[getChainKey(action.name)]?.toLowerCase()
    ) {
      break;
    }
    const outputToken =
      prevAction.args.outputToken ||
      prevAction.args[getTokenKey(prevAction.name)] ||
      "";
    if (
      tokenSymbol !== "outputToken" &&
      outputToken.toLowerCase() !== tokenSymbol?.toLowerCase()
    ) {
      continue;
    }
    const prevActionProtocol = prevAction.args.protocolName || "";
    const suffix = `Try ${prevAction.name} first, then proceed with the rest of the actions.`;
    if (!initialized) {
      errorMsg = `Your ${prevAction.name} doesn't return ${tokenSymbol} for the next ${action.name}. ${suffix}`;
      initialized = true;
    }
    if (prevAction.name !== "swap") {
      if (
        prevAction.name === "borrow" &&
        ["dolomite", "juice"].includes(prevActionProtocol)
      ) {
        errorMsg = `Borrowing from ${prevActionProtocol} stores borrowed funds in their smart contract, not your wallet, so we can't simulate this multi step action. ${suffix}`;
        break;
      }
      if (prevAction.name === "close" && prevActionProtocol === "gmx") {
        errorMsg = `GMX returns funds after a delay, so we can't simulate this multi step action. ${suffix}`;
        break;
      }
    }
  }
  return errorMsg;
};

const getFirstChain = async (
  address: string,
  rawActions: RawAction[],
  rpcs: JSONObject,
) => {
  const { name, args } = rawActions[0];

  if (args.protocolName?.toLowerCase() === "hyperliquid") {
    return args.chainName || "arbitrum";
  }

  const token = args[getTokenKey(name)] || "all";
  const protocol = (args.protocolName || "").toLowerCase();
  if (token === "all" || protocol === "all") {
    if (fromActions.includes(name)) {
      const { chain, chains } = await getAlternativeChain(
        address,
        rawActions[0],
        undefined,
        rpcs,
      );
      return chain || chains?.[0];
    }
    throw new Error(
      "Please specify a chain in case you use all for token or protocol in your action.",
    );
  }
  if (fromActions.includes(name)) {
    const { chain, chains } = await getAlternativeChain(
      address,
      rawActions[0],
      undefined,
      rpcs,
    );
    return chain || chains?.[0];
  }

  const tokens: string[] = [];
  if (Array.isArray(token)) {
    tokens.push(...token);
  } else {
    tokens.push(token);
  }
  for (const token of tokens) {
    const balances = await getTokenBalanceForAllChains(
      address,
      token,
      undefined,
      rpcs,
    );
    if (balances.length === 0) continue;
    balances.sort((a, b) => b.balance - a.balance);
    return balances[0].chainName;
  }
};
