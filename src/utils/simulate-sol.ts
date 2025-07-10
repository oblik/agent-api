import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import axios from "axios";
import { ethers } from "ethers";
import { Tokens } from "../db/token.model.js";
import {
  getErrorMessage,
  getRpcUrlForChain,
  getTokenInfoForChain,
  sfParseUnits,
} from "./index.js";
import type {
  Call,
  HeliusTokenAccount,
  RawAction,
  TokenInfo,
} from "./types.js";

// Simulate given actions with conditions.
// rpc: Forked rpc url. If it's specified, it simulates on the rpc.
// blockNumber: Block number to simulate. It can be object or number.
//              If it's a number, it applies to all actions.
//              If it's an object, block number applies to specific chains.
export async function simulateSolanaActions(
  address: string,
  action: RawAction,
) {
  const inputToken = await getTokenInfoForChain(
    action.args.inputToken,
    "solana",
  );
  const outputToken = await getTokenInfoForChain(
    action.args.outputToken,
    "solana",
  );
  if (!inputToken) {
    return {
      success: false,
      message: `Token ${action.args.inputToken} not found`,
    };
  }
  if (!outputToken) {
    return {
      success: false,
      message: `Token ${action.args.outputToken} not found`,
    };
  }

  let inputAmount: bigint;
  let update = false;
  const { inputAmount: inputAmountStr } = action.args;
  if (
    !inputAmountStr ||
    inputAmountStr === "all" ||
    inputAmountStr === "half" ||
    inputAmountStr?.endsWith?.("%")
  ) {
    update = true;
    const accounts = await getTokenAccounts(address, [
      inputToken.address || "",
    ]);
    const inputBalance = ethers.getBigInt(
      accounts.find((x) => x.mint === inputToken.address)?.amount || "0",
    );
    if (!inputAmountStr || inputAmountStr === "all") {
      inputAmount = inputBalance;
    } else if (inputAmountStr === "half") {
      inputAmount = inputBalance / 2n;
    } else {
      // Handle percentage case
      const percentage = Number.parseInt(inputAmountStr.slice(0, -1) || "0");
      inputAmount = (inputBalance * BigInt(percentage)) / 100n;
    }
  } else {
    inputAmount = sfParseUnits(inputAmountStr || "0", inputToken.decimals);
  }

  const tokens = [inputToken.address || "", outputToken.address || ""];
  const accounts = (await getTokenAccounts(address, tokens)).filter(
    (x) => x.mint === inputToken.address || x.mint === outputToken.address,
  );
  const inputBalance = ethers.getBigInt(
    accounts.find((x) => x.mint === inputToken.address)?.amount || "0",
  );
  if (inputAmount > inputBalance) {
    const required = inputAmount - inputBalance;
    return {
      success: false,
      message: `Insufficient input token balance. Have ${ethers.formatUnits(inputBalance, inputToken.decimals)} and need ${ethers.formatUnits(required, inputToken.decimals)} more.`,
    };
  }

  const { status, tx, message } = await getJupiterSwapTx(
    address,
    inputToken,
    outputToken,
    inputAmount,
  );
  if (status === "error" || !tx) return { success: false, message };

  await doValidation(address, accounts, tokens);

  const result = await simulateTx(accounts, tx);
  if (!result.success) {
    return { success: false, message: result.message };
  }

  const balanceChanges: Record<string, string> = {};
  if (result.balanceChanges) {
    Object.entries(result.balanceChanges).forEach(([mint, amount], _) => {
      if (mint === inputToken.address) {
        // Force negative for input token (tokens going out)
        const formattedAmount = ethers.formatUnits(amount, inputToken.decimals);
        balanceChanges[inputToken.symbol.toLowerCase()] = formattedAmount;
      } else if (mint === outputToken.address) {
        // Force positive for output token (tokens coming in)
        const formattedAmount = ethers.formatUnits(
          amount,
          outputToken.decimals,
        );
        balanceChanges[outputToken.symbol.toLowerCase()] = formattedAmount;
      }
    });
  }

  if (update) {
    action.args.inputAmount = ethers.formatUnits(
      inputAmount,
      inputToken.decimals,
    );
  }
  action.args.chainName = "solana";
  action.args.accountAddress = address;

  // Convert action to Call format
  const call: Call = {
    name: action.name,
    args: action.args,
    body: action.args, // body is same as args in this case
    chainName: "solana",
    balanceChanges: {
      "101": balanceChanges, // 101 is the chainId for Solana
    },
    tokens: {
      "101": {
        [inputToken.symbol.toLowerCase()]: inputToken.address,
        [outputToken.symbol.toLowerCase()]: outputToken.address,
      },
    },
    gasCosts: {
      "101": ethers.formatUnits(result.gasUsed || 0, 9), // Convert compute units to SOL
    },
  };
  return { success: true, rawActions: [action], actions: [call] };
}

export const getSolanaTokenInfo = async (symbol?: string) => {
  if (!symbol) return undefined;

  const token = await Tokens.findOne({
    where: { symbol: symbol.toLowerCase(), chainId: 101 },
  });
  if (!token) return undefined;
  return token as TokenInfo;
};

export const getTokenAccounts = async (
  address: string,
  tokens: string[],
): Promise<HeliusTokenAccount[]> => {
  const accounts: HeliusTokenAccount[] = [];

  // Special handling for SOL token
  const solToken = tokens.find(
    (token) => token === "So11111111111111111111111111111111111111112",
  );
  if (solToken) {
    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
          "https://api.mainnet-beta.solana.com",
      );
      const balance = await connection.getBalance(new PublicKey(address));

      // Create SOL token account matching the HeliusTokenAccount type
      const solAccount: HeliusTokenAccount = {
        address: address,
        mint: "So11111111111111111111111111111111111111112",
        amount: balance.toString(),
      };

      accounts.push(solAccount);
    } catch (err) {
      console.error("Error getting SOL balance:", err);
    }
  }

  let page = 1;
  while (true) {
    try {
      const { data } = await axios.post(
        `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
        {
          jsonrpc: "2.0",
          id: `slate-${Date.now()}`,
          method: "getTokenAccounts",
          params: { page, owner: address },
        },
      );
      page++;

      const newAccounts = data.result.token_accounts || [];
      tokens.forEach((token, _) => {
        const heliusToken = newAccounts.find(
          (x: HeliusTokenAccount) => token === x.mint,
        );
        if (!accounts.some((x) => x.mint === token) && heliusToken)
          accounts.push(heliusToken);
      });

      if (newAccounts.length < 1000 || accounts.length >= tokens.length) break;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      break;
    }
  }
  return accounts;
};

export const getJupiterSwapTx = async (
  address: string,
  inputToken: TokenInfo,
  outputToken: TokenInfo,
  inputAmount: bigint,
) => {
  try {
    // Validate input amount
    const accounts = await getTokenAccounts(address, [
      inputToken.address || "",
      outputToken.address || "",
    ]);
    const inputBalance = ethers.getBigInt(
      accounts.find((x) => x.mint === inputToken.address)?.amount || "0",
    );

    if (inputAmount > inputBalance) {
      const required = inputAmount - inputBalance;
      return {
        status: "error",
        message: `Insufficient input token balance. Have ${ethers.formatUnits(inputBalance, inputToken.decimals)} and need ${ethers.formatUnits(required, inputToken.decimals)} more.`,
      };
    }

    const queryParams = {
      inputMint: inputToken.address,
      outputMint: outputToken.address,
      amount: inputAmount.toString(),
      slippageBps: 100, // 1%
    };

    const url = `https://quote-api.jup.ag/v6/quote?${new URLSearchParams(
      Object.entries(queryParams).map(([key, value]) => [key, String(value)]),
    ).toString()}`;

    const { data: quoteResponse } = await axios.get(url);

    // Serialize the quote into a swap transaction that can be submitted on chain
    const { data: swapResponse } = await axios.post(
      "https://quote-api.jup.ag/v6/swap",
      {
        quoteResponse,
        userPublicKey: address,
        wrapAndUnwrapSOL: true,
        dynamicComputeUnitLimit: true,
        dynamicSlippage: {
          maxBps: 500,
        },
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 10000000,
            global: false,
            priorityLevel: "veryHigh",
          },
        },
        restrictIntermediateTokens: true,
      },
      { headers: { "Content-Type": "application/json" } },
    );

    const { swapTransaction } = swapResponse;
    const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // Ensure signatures are properly formatted
    if (transaction.signatures.length > 0) {
      transaction.signatures = transaction.signatures.map((sig) =>
        Buffer.isBuffer(sig) ? sig : Buffer.alloc(64),
      );
    }

    return { status: "success", tx: transaction };
  } catch (err) {
    return { status: "error", message: getErrorMessage(err) };
  }
};

const simulateTx = async (
  accounts: HeliusTokenAccount[],
  tx: VersionedTransaction,
) => {
  const connection = new Connection(
    getRpcUrlForChain(101) || "https://api.mainnet-beta.solana.com",
  );
  if (!connection) return { success: false, message: "RPC not found" };

  const SOL_MINT = "So11111111111111111111111111111111111111112";
  const beforeBalances: Record<string, bigint> = {};
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    beforeBalances[account.mint] = ethers.getBigInt(account.amount);
  }

  try {
    const { blockhash } = await connection.getLatestBlockhash("finalized");
    if ("message" in tx) {
      tx.message.recentBlockhash = blockhash;
    }

    const simulation = await connection.simulateTransaction(tx, {
      commitment: "processed",
      accounts: {
        addresses: accounts.map((x) => x.address),
        encoding: "base64",
      },
      sigVerify: false,
    });

    if (simulation.value.err) {
      console.error("Simulation error details:", {
        error: simulation.value.err,
        logs: simulation.value.logs,
        unitsConsumed: simulation.value.unitsConsumed,
        accounts: simulation.value.accounts?.length,
      });
      return {
        success: false,
        message: JSON.stringify(simulation.value.err),
        logs: simulation.value.logs,
      };
    }

    const afterBalances: Record<string, bigint> = {};

    // Get the token account data post-sim
    for (let i = 0; i < (simulation.value.accounts?.length || 0); i++) {
      const account = simulation.value.accounts?.[i];
      if (account?.owner === "11111111111111111111111111111111") {
        // If the account is SOL
        afterBalances[SOL_MINT] = ethers.getBigInt(account.lamports || "0");
      } else if (account?.data) {
        // If the account is an SPL token

        // Decode base64 token account data
        if (Array.isArray(account.data) && account.data[1] === "base64") {
          const decodedData = Uint8Array.from(
            Buffer.from(account.data[0], "base64"),
          );
          if (decodedData.length >= 72) {
            // Ensure we have enough bytes (32 + 32 + 8)
            // First 32 bytes are the mint address
            const mintAddress = new PublicKey(
              decodedData.subarray(0, 32),
            ).toBase58();

            // Next 32 bytes are the owner's public key
            const ownerAddress = new PublicKey(
              decodedData.subarray(32, 64),
            ).toBase58();

            // Next 8 bytes represent the amount (as a little-endian 64-bit unsigned integer)
            const amountBytes = decodedData.subarray(64, 72);
            const amount = new DataView(
              amountBytes.buffer,
              amountBytes.byteOffset,
              amountBytes.byteLength,
            ).getBigUint64(0, true);

            afterBalances[mintAddress] = amount;
          } else {
            console.log("Token account data too short:", decodedData.length);
          }
        }
      }
    }

    const balanceChanges: Record<string, bigint> = {};
    for (const [addr, balance] of Object.entries(afterBalances)) {
      balanceChanges[addr] = balance - (beforeBalances[addr] || 0n);
    }

    return {
      success: true,
      balanceChanges,
      gasUsed: simulation.value.unitsConsumed,
    };
  } catch (err) {
    console.error("Simulate error", err);
    console.error("Full error details:", JSON.stringify(err, null, 2));
    return { success: false, message: getErrorMessage(err) };
  }
};

const doValidation = async (
  address: string,
  accounts: HeliusTokenAccount[],
  tokens: string[],
) => {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const account = accounts.find((x) => x.mint === token);
    if (account) continue;

    const tokenAccount = await computeTokenAccount(address, token);
    accounts.push({ address: tokenAccount, mint: token, amount: "0" });
  }
};

const computeTokenAccount = (address: string, token: string) => {
  const walletPublicKey = new PublicKey(address);
  const tokenMintPublicKey = new PublicKey(token);

  const [publicKey] = PublicKey.findProgramAddressSync(
    [
      walletPublicKey.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      tokenMintPublicKey.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  return publicKey.toBase58();
};
