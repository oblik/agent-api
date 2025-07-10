import { Router } from "express";
import httpStatus from "http-status";

import walletController from "../controllers/wallet.controller.js";

const routes: Router = Router();

// Auth endpoints
routes.post("/auth", walletController.auth_evm);

routes.post("/auth/sol", walletController.auth_sol);

// User endpoint
routes.post("/user", walletController.updateUser);

// Get user settings endpoint
routes.post("/settings", walletController.getSettings);

// Update user settings endpoint
routes.post("/update-settings", walletController.updateSettings);

// Condition endpoint
routes.post("/add-condition", walletController.addCondition);

// Update condition endpoint
routes.post("/update-condition", walletController.updateCondition);

// Cancel endpoint
routes.post("/cancel", walletController.cancel);

// Cancel dev conditions endpoint
routes.post("/cancel-dev-conditions", walletController.cancelDevConditions);

// Get condition txs endpoint
routes.post("/condition", walletController.getConditions);

// Get ready condition txs endpoint
routes.post("/execute-condition", walletController.getReadyConditions);

// Get current values of condition args
routes.post(
  "/condition-current-values",
  walletController.getConditionCurrentValues,
);

// Create history endpoint
routes.post("/add-history", walletController.addHistory);

// Get histories endpoint
routes.post("/history", walletController.getHistories);

// Onboard endpoint
routes.post("/check-action", walletController.checkAction);

// Swap endpoint
routes.post("/swap", walletController.swap);

// Bridge endpoint
routes.post("/bridge", walletController.bridge);

// Deposit endpoint
routes.post("/deposit", (req, res) =>
  walletController.action(req, res, "deposit"),
);

// Withdraw endpoint
routes.post("/withdraw", (req, res) =>
  walletController.action(req, res, "withdraw"),
);

// Claim endpoint
routes.post("/claim", (req, res) => walletController.action(req, res, "claim"));

// Borrow endpoint
routes.post("/borrow", (req, res) =>
  walletController.action(req, res, "borrow"),
);

// Lend endpoint
routes.post("/lend", (req, res) => walletController.action(req, res, "lend"));

// Repay endpoint
routes.post("/repay", (req, res) => walletController.action(req, res, "repay"));

// Stake endpoint
routes.post("/stake", (req, res) => walletController.action(req, res, "stake"));

// Unstake endpoint
routes.post("/unstake", (req, res) =>
  walletController.action(req, res, "unstake"),
);

// Long endpoint
routes.post("/long", (req, res) => walletController.action(req, res, "long"));

// Short endpoint
routes.post("/short", (req, res) => walletController.action(req, res, "short"));

// Close endpoint
routes.post("/close", (req, res) => walletController.action(req, res, "close"));

// Lock endpoint
routes.post("/lock", (req, res) => walletController.action(req, res, "lock"));

// Unlock endpoint
routes.post("/unlock", (req, res) =>
  walletController.action(req, res, "unlock"),
);

// Vote endpoint
routes.post("/vote", (req, res) => walletController.action(req, res, "vote"));

// Transfer endpoint
routes.post("/transfer", walletController.transfer);

// Get protocol info
routes.post("/protocol-info", walletController.getProtocolInfo);

// Get pool info
routes.post("/pool-info", walletController.getPoolInfo);

// Get market info
routes.post("/market-info", walletController.getMarketInfo);

// Get token info
routes.post("/token-info", walletController.getTokenInfo);

// Get token price
routes.post("/token-price", walletController.getTokenPrice);

// Get token logo
routes.post("/token-logo", walletController.getTokenLogo);

// Simulate endpoint
routes.post("/simulate", walletController.simulate);

// Verified Entities endpoint
routes.get("/verified-entities", walletController.verifiedEntities);

// Protocol Tokens endpoint
routes.get("/protocol-tokens", walletController.getProtocolTokens);

// Get user's token balances
routes.post("/token-balances", walletController.getUserTokenBalances);

routes.post("/token-balances/sol", walletController.getUserTokenBalancesSol);

// Get user's protocol position
routes.post("/protocol-positions", walletController.getUserProtocolPositions);

// Get user's PMF survey info
routes.get("/survey-info", walletController.getSurveyInfo);

// Increments user's survey_completed integer value
routes.post("/survey-completed", walletController.surveyCompleted);

// Store generated transactions to tracking table
routes.post(
  "/store-generated-transactions",
  walletController.storeGeneratedTxs,
);

// Set executed status to tracking table
routes.post("/set-executed-status", walletController.setExecutedStatus);

// Submit frontend errors
routes.post("/submit-errors", walletController.processErrors);

// Fee endpoint
routes.post("/fee", walletController.fee);

// Accrued Fee endpoint
routes.post("/accrued-fees", walletController.accruedFees);

// status check route
routes.get("/status", (_req, res) => {
  res.status(httpStatus.OK).json({ status: "success" });
});

// Get user_id
routes.get("/get-analytics-user-id", walletController.analyticsUserId);

// Add user to analytics_user table
routes.post("/analytics-user-add", walletController.addAnalyticsUser);

// Update user in the analytics_user table
routes.post("/analytics-user-update", walletController.updateAnalyticsUser);

// Get user's operation history (conditions & actions)
routes.get("/user-op-hist", walletController.getUserOpHist);

// Get new history entries for Activity Bot on Discord
routes.post("/new-history-entries", walletController.getNewHistoryEntries);

// Get new submitted conditional and new successfully executed prompts for Activity Bot on Discord
routes.post("/new-prompts", walletController.getNewPrompts);

// Get user level for extended prompting guide
routes.get("/user-level", walletController.getUserLevel);

// Get churned users
routes.post("/churned-users", walletController.getChurnedUsers);

// Get token suggestions
routes.get("/token-suggestions", walletController.getTokenSuggestions);

// Get historical token prices
routes.post("/token-history", walletController.getTokenHistory);

// Get pendle pool info
routes.post("/pendle-pool-info", walletController.pendlePoolInfo);

// Get TVL tracking data
routes.post("/tvl-tracking", walletController.getTvlTracking);

// Solana RPC Abtraction
routes.get("/rpc/sol/get-block-info", walletController.getSolanaBlockInfo);

routes.get(
  "/rpc/sol/signature-status",
  walletController.getSolanaSignatureStatus,
);

routes.post("/rpc/sol/send-tx", walletController.sendSolanaTx);

routes.post("/rpc/sol/send-raw-tx", walletController.sendSolanaRawTx);

routes.post("/rpc/sol/confirm-tx", walletController.confirmSolanaTx);

routes.get("/rpc/sol/get-account-info", walletController.getSolanaAccountInfo);

export default routes;
