// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck: temporarily disabled
import { ethers } from "ethers";
// import { client, query } from "../../config/dolomite/graphql.js";
import LPAddresses from "../../config/lptokens.js";
import { NATIVE_TOKEN, NATIVE_TOKEN2 } from "../../constants.js";
import { getUnsupportedActionError } from "../error.js";
import {
  getABIForProtocol,
  getApproveData,
  getFunctionData,
  getProtocolAddressForChain,
} from "../index.js";
// import { sfConsoleError } from "../log.js";
import type {
  ContractCallParam,
  JSONArray,
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
  const { provider, token, amount, chainId, tokenInfo } = actionData;

  let approveTxs: Transaction[] = [];
  let address: string | null = "";
  let abi: ethers.InterfaceAbi = [];
  let funcName = action;
  const approveInfo = {
    spender: "",
    tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];

  const isolateData = LPAddresses.dolomite[chainId.toString()];
  const isList = Object.keys(isolateData);
  const symbol = (token || tokenInfo?.symbol || "").toLowerCase();
  const isEth =
    tokenInfo.address === NATIVE_TOKEN || tokenInfo.address === NATIVE_TOKEN2;
  const marginAddr = getProtocolAddressForChain("dolomite", chainId, "margin");
  if (!marginAddr) {
    throw new Error("Could not find margin contract for Dolomite");
  }
  const marginABI = getABIForProtocol("dolomite", "margin");
  const margin = new ethers.Contract(marginAddr, marginABI, provider);
  let depositTxs: Transaction[] = [];

  switch (action) {
    case "deposit": {
      depositTxs = await getDepositTransactions(accountAddress, actionData);
      return {
        transactions: depositTxs,
        funcNames: [...Array(depositTxs.length - 1).fill("Approve"), "Deposit"],
      };
    }
    case "withdraw": {
      if (!symbol) {
        throw new Error("Missing token for this Dolomite action.");
      }
      if (isList.includes(symbol)) {
        const factoryAddr = isolateData[symbol].address;
        const factoryABI = getABIForProtocol("dolomite", "factory");
        const vaultABI = getABIForProtocol("dolomite", "vault");
        if (!factoryAddr || !factoryABI || !vaultABI) {
          throw new Error(
            `Withdrawing from protocol dolomite is not supported with token ${symbol}.`,
          );
        }
        const contract = new ethers.Contract(factoryAddr, factoryABI, provider);
        const vaultAddr = await contract.getVaultByAccount(accountAddress);
        if (vaultAddr === ethers.ZeroAddress) {
          throw new Error("There is no position to withdraw.");
        }
        funcName = "withdrawFromVaultForDolomiteMargin";
        address = vaultAddr;
        abi = vaultABI;
        params.push(0);
        params.push(amount);
      } else {
        address = getProtocolAddressForChain("dolomite", chainId, "deposit");
        abi = getABIForProtocol("dolomite", "deposit");

        if (isEth) {
          funcName = "withdrawETHFromDefaultAccount";
          params.push(amount);
          params.push(1); // balanceCheckFlag
        } else {
          funcName = "withdrawWeiFromDefaultAccount";

          let marketId = 0;
          try {
            marketId = await margin.getMarketIdByTokenAddress(
              tokenInfo.address,
            );
          } catch {
            throw new Error(
              `Withdrawing from protocol dolomite is not supported with token ${symbol}.`,
            );
          }
          params.push(marketId);
          params.push(amount);
          params.push(1); // balanceCheckFlag
        }
      }
      break;
    }
    case "lend": {
      address = getProtocolAddressForChain("dolomite", chainId, "borrow");
      abi = getABIForProtocol("dolomite", "borrow");

      const markets = await margin.getAccountMarketsWithBalances([
        accountAddress,
        0,
      ]);
      if (markets?.length === 0)
        depositTxs = await getDepositTransactions(accountAddress, actionData);

      let marketId = 0;
      if (!isEth) {
        try {
          marketId = await margin.getMarketIdByTokenAddress(tokenInfo.address);
        } catch {
          throw new Error(
            `Lending to protocol dolomite is not supported with token ${symbol}.`,
          );
        }
      }
      const borrowAccountNumber = await getUserBorrowPositions(accountAddress);
      if (!borrowAccountNumber) {
        funcName = "openBorrowPosition";
        params.push(0); // default account
        params.push(101); // collateral account
        params.push(marketId);
        params.push(amount);
        params.push(1); // balanceCheckFlag
      } else {
        funcName = "transferBetweenAccounts";
        params.push(0); // default account
        params.push(borrowAccountNumber); // collateral account
        params.push(marketId);
        params.push(amount);
        params.push(1); // balanceCheckFlag
      }
      break;
    }
    case "borrow": {
      address = getProtocolAddressForChain("dolomite", chainId, "borrow");
      abi = getABIForProtocol("dolomite", "borrow");

      let marketId = 0;
      if (!isEth) {
        try {
          marketId = await margin.getMarketIdByTokenAddress(tokenInfo.address);
        } catch {
          throw new Error(
            `Borrowing from protocol dolomite is not supported with token ${symbol}.`,
          );
        }
      }
      const borrowAccountNumber = await getUserBorrowPositions(accountAddress);
      funcName = "transferBetweenAccounts";
      params.push(borrowAccountNumber || 101); // collateral account
      params.push(0); // borrowing account
      params.push(marketId);
      params.push(amount);
      params.push(2); // balanceCheckFlag
      break;
    }
    case "repay": {
      address = getProtocolAddressForChain("dolomite", chainId, "borrow");
      abi = getABIForProtocol("dolomite", "borrow");

      let marketId = 0;
      if (!isEth) {
        try {
          marketId = await margin.getMarketIdByTokenAddress(tokenInfo.address);
        } catch {
          throw new Error(
            `Repaying to protocol dolomite is not supported with token ${symbol}.`,
          );
        }
      }
      const borrowAccountNumber = await getUserBorrowPositions(
        accountAddress,
        tokenInfo.address ?? "dolomite token address?",
      );
      if (!borrowAccountNumber) {
        if (!provider._getConnection().url.includes("tenderly"))
          throw new Error("You don't have any debt to repay right now.");
      }
      funcName = "transferBetweenAccounts";
      params.push(0); // default account
      params.push(borrowAccountNumber || 101); // collateral account
      params.push(marketId);
      params.push(amount);
      params.push(1); // balanceCheckFlag
      break;
    }
    case "stake": {
      const factoryAddr = getProtocolAddressForChain(
        "dolomite",
        chainId,
        `${symbol}factory`,
      );
      const factoryABI = getABIForProtocol("dolomite", "factory");
      const vaultABI = getABIForProtocol("dolomite", "vault");
      if (!factoryAddr || !factoryABI || !vaultABI) {
        throw new Error(
          `Staking to protocol dolomite is not supported with token ${symbol}. Available tokens to stake are GLP and GMX.`,
        );
      }
      const contract = new ethers.Contract(factoryAddr, factoryABI, provider);
      let vaultAddr = await contract.getVaultByAccount(accountAddress);
      if (vaultAddr === ethers.ZeroAddress) {
        funcName = "createVaultAndDepositIntoDolomiteMargin";
        address = factoryAddr;
        abi = factoryABI;
        params.push(0);
        params.push(amount);
        vaultAddr = await contract.calculateVaultByAccount(accountAddress);
      } else {
        funcName = "depositIntoVaultForDolomiteMargin";
        address = vaultAddr;
        abi = vaultABI;
        params.push(0);
        params.push(amount);
      }
      approveInfo.spender = vaultAddr;
      break;
    }
    case "unstake": {
      abi = getABIForProtocol("dolomite", "vault");
      const factoryAddr = getProtocolAddressForChain(
        "dolomite",
        chainId,
        `${symbol}factory`,
      );
      const factoryABI = getABIForProtocol("dolomite", "factory");
      if (!factoryAddr || !factoryABI || !abi) {
        throw new Error(
          `Unstaking from protocol dolomite is not supported with token ${symbol}. Available tokens to unstake are GLP and GMX.`,
        );
      }
      const contract = new ethers.Contract(factoryAddr, factoryABI, provider);
      address = await contract.getVaultByAccount(accountAddress);
      if (address === ethers.ZeroAddress) {
        throw new Error("There is no position to unstake.");
      }
      if (symbol === "gmx" || symbol === "glp") {
        funcName = "unstakeGmx";
      } else if (symbol === "plvglp") {
        funcName = "unstakePlvGlp";
      }
      params.push(amount);
      break;
    }
    case "claim": {
      abi = getABIForProtocol("dolomite", "vault");
      const factoryABI = getABIForProtocol("dolomite", "factory");
      const factoryAddr = getProtocolAddressForChain(
        "dolomite",
        chainId,
        `${symbol}factory`,
      );
      if (!factoryABI || !abi || !factoryAddr) {
        throw new Error(
          `Claiming from Dolomite is not supported with token ${symbol}. Available tokens to claim are GLP and GMX.`,
        );
      }
      const contract = new ethers.Contract(factoryAddr, factoryABI, provider);
      address = await contract.getVaultByAccount(accountAddress);
      if (address === ethers.ZeroAddress) {
        throw new Error("There is no position to claim from Dolomite.");
      }
      if (symbol === "gmx" || symbol === "glp") {
        funcName = "handleRewards";
        params.push(1); // should claim GMX
        params.push(0); // stake GMX
        params.push(1); // should claim esGMX
        params.push(0); // stake esGMX
        params.push(1); // should stake Multiplier points
        params.push(1); // should claim esGMX
        params.push(0); // stake esGMX
      } else {
        throw new Error("Token not supported");
      } /* else if (symbol === "jusdc") {
        funcName = "harvestRewards";
      } else if (symbol === "plvglp") {
        funcName = "harvest";
      } */
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          [
            "deposit",
            "withdraw",
            "lend",
            "borrow",
            "repay",
            "stake",
            "unstake",
            "claim",
          ],
          "Dolomite",
        ),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo.symbol, "dolomite", chainId),
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

  const data = await getFunctionData(address, abi, funcName, params, "0");
  return {
    transactions: [...depositTxs, ...approveTxs, data],
    funcNames: [
      ...(depositTxs.length > 0
        ? [Array(depositTxs.length - 1).fill("Approve"), "Deposit"]
        : []),
      ...Array(approveTxs.length).fill("Approve"),
      action,
    ],
  };
};

const getDepositTransactions = async (accountAddress, actionData) => {
  const { provider, token, amount, chainId, tokenInfo } = actionData;

  let approveTxs: Transaction[] = [];
  let address: string | null = "";
  let abi: JSONArray = [];
  let funcName: string;
  let value = 0;
  const approveInfo = {
    spender: "",
    tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];
  const isolateData = LPAddresses.dolomite[chainId.toString()];
  const isList = Object.keys(isolateData);
  const symbol = (token || tokenInfo?.symbol || "").toLowerCase();
  const isEth =
    tokenInfo.address === NATIVE_TOKEN || tokenInfo.address === NATIVE_TOKEN2;
  const marginAddr = getProtocolAddressForChain("dolomite", chainId, "margin");
  if (!marginAddr) {
    throw new Error("Could not find margin contract for Dolomite");
  }
  const marginABI = getABIForProtocol("dolomite", "margin");
  const margin = new ethers.Contract(marginAddr, marginABI, provider);

  if (isList.includes(symbol)) {
    const factoryAddr = isolateData[symbol].address;
    const factoryABI = getABIForProtocol("dolomite", "factory");
    const vaultABI = getABIForProtocol("dolomite", "vault");
    if (!factoryAddr || !factoryABI || !vaultABI) {
      throw new Error(
        `Depositing into protocol dolomite is not supported with token ${symbol}.`,
      );
    }
    const contract = new ethers.Contract(factoryAddr, factoryABI, provider);
    let vaultAddr = await contract.getVaultByAccount(accountAddress);
    if (vaultAddr === ethers.ZeroAddress) {
      funcName = "createVaultAndDepositIntoDolomiteMargin";
      address = factoryAddr;
      abi = factoryABI;
      params.push(0);
      params.push(amount);
      vaultAddr = await contract.calculateVaultByAccount(accountAddress);
    } else {
      funcName = "depositIntoVaultForDolomiteMargin";
      address = vaultAddr;
      abi = vaultABI;
      params.push(0);
      params.push(amount);
    }
    approveInfo.spender = vaultAddr;
  } else {
    address = getProtocolAddressForChain("dolomite", chainId, "deposit");
    if (!address) {
      throw new Error("Could not find address for Dolomite deposit");
    }
    abi = getABIForProtocol("dolomite", "deposit");

    if (isEth) {
      funcName = "depositETHIntoDefaultAccount";
      value = amount;
    } else {
      funcName = "depositWeiIntoDefaultAccount";

      let marketId = 0;
      try {
        marketId = await margin.getMarketIdByTokenAddress(tokenInfo.address);
      } catch {
        throw new Error(
          `Depositing into protocol dolomite is not supported with token ${symbol}.`,
        );
      }
      params.push(marketId);
      params.push(amount);
      approveInfo.spender = marginAddr;
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage("deposit", tokenInfo.symbol, "dolomite", chainId),
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
  return [...approveTxs, data];
};

const getUserBorrowPositions = async (address_, token?: string) => {
  console.log(address_, token);
  return [];
  // const address = address_.toLowerCase();
  // try {
  //   let positions = (
  //     await client.query({
  //       query,
  //       variables: { address },
  //       fetchPolicy: "cache-first",
  //     })
  //   ).data.borrowPositions;
  //   if (token) {
  //     positions = positions.filter((x) =>
  //       x.borrowTokens.map((y) => y.id).includes(token.toLowerCase()),
  //     );
  //   }
  //   if (positions.length > 0) return positions[0].id.split("-")[1];
  // } catch (err) {
  //   sfConsoleError("Graphql Query Error:", err);
  // }
};
