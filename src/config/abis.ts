import type { InterfaceAbi } from "ethers";
import aaveWrapperAbi from "./aave/abis/aave-wrapper.abi.js";
import aaveAbi from "./aave/abis/aave.abi.js";
import aaveDebtTokenAbi from "./aave/abis/debt-token.abi.js";
import aaveProviderAbi from "./aave/abis/provider.abi.js";
import acrossSpokePoolAbi from "./across/abis/spokePool.abi.js";
import acrossSpokePoolVerifierAbi from "./across/abis/spokePoolVerifier.abi.js";
import aerodromeV3FactoryAbi from "./aerodrome/abis/factory-v3.abi.js";
import aerodromeFactoryAbi from "./aerodrome/abis/factory.abi.js";
import aerodromeV3PoolAbi from "./aerodrome/abis/pool-v3.abi.js";
import aerodromePoolAbi from "./aerodrome/abis/pool.abi.js";
import aerodromePositionManagerAbi from "./aerodrome/abis/positionManager.abi.js";
import aerodromeRewardsAbi from "./aerodrome/abis/rewards.abi.js";
import aerodromeRouterAbi from "./aerodrome/abis/router.abi.js";
import aerodromeVeAbi from "./aerodrome/abis/ve.abi.js";
import ambientAbi from "./ambient/abis/ambient.abi.js";
import ambientQueryAbi from "./ambient/abis/query.abi.js";
import bladeswapPoolAbi from "./bladeswap/abis/pool.abi.js";
import bladeswapStablePoolAbi from "./bladeswap/abis/stablepool.abi.js";
import bladeswapVaultAbi from "./bladeswap/abis/vault.abi.js";
import bladeswapVolatilePoolAbi from "./bladeswap/abis/volatilepool.abi.js";
import camelotAbi from "./camelot/abis/camelot.abi.js";
import camelotDividendsV2Abi from "./camelot/abis/dividendsV2.abi.js";
import camelotV3FactoryAbi from "./camelot/abis/factory-v3.abi.js";
import camelotFactoryAbi from "./camelot/abis/factory.abi.js";
import camelotPairAbi from "./camelot/abis/pair.abi.js";
import camelotV3PoolAbi from "./camelot/abis/pool.abi.js";
import camelotPositionManagerAbi from "./camelot/abis/positionManager.abi.js";
import erc20Abi from "./common/abis/erc20.abi.js";
import wethAbi from "./common/abis/weth.abi.js";
import compoundBulkerAbi from "./compound/abis/bulker.abi.js";
import compoundBulker1Abi from "./compound/abis/bulker1.abi.js";
import compoundCometAbi from "./compound/abis/comet.abi.js";
import compoundCometExtAbi from "./compound/abis/ext.abi.js";
import compoundRewardsAbi from "./compound/abis/rewards.abi.js";
import cowswapEthFlowAbi from "./cowswap/abis/ethFlow.abi.js";
import curve3poolAbi from "./curve/abis/3pool.abi.js";
import curveFraxusdcAbi from "./curve/abis/fraxusdc.abi.js";
import curveFraxusdpAbi from "./curve/abis/fraxusdp.abi.js";
import curveStethAbi from "./curve/abis/steth.abi.js";
import curveTricrypto2Abi from "./curve/abis/tricrypto2.abi.js";
import dolomiteBorrowAbi from "./dolomite/abis/borrow.abi.js";
import dolomiteDepositAbi from "./dolomite/abis/deposit.abi.js";
import dolomiteFactoryAbi from "./dolomite/abis/factory.abi.js";
import dolomiteMarginAbi from "./dolomite/abis/margin.abi.js";
import dolomiteVaultAbi from "./dolomite/abis/vault.abi.js";
import dopexSsovAbi from "./dopex/abis/ssov.abi.js";
import eigenlayerBaseAbi from "./eigenlayer/abis/base.abi.js";
import eigenlayerAbi from "./eigenlayer/abis/strategy.abi.js";
import ethenaMinterAbi from "./ethena/abis/minter.abi.js";
import ethenaStakerAbi from "./ethena/abis/staker.abi.js";
import etherfiAbi from "./etherfi/abis/etherfi.abi.js";
import etherfiNFTAbi from "./etherfi/abis/nft.abi.js";
import gmxDataStoreAbi from "./gmx/abis/data-store.abi.js";
import gmxExchangeRouterAbi from "./gmx/abis/exchange-router.abi.js";
import gmxOrderHandlerAbi from "./gmx/abis/order-handler.abi.js";
import gmxPositionRouterAbi from "./gmx/abis/position-router.abi.js";
import gmxReaderAbi from "./gmx/abis/reader.abi.js";
import gmxRewardRouterAbi from "./gmx/abis/reward-router.abi.js";
import gmxRewardTrackerAbi from "./gmx/abis/reward-tracker.abi.js";
import gmxRouterAbi from "./gmx/abis/router.abi.js";
import gmxVesterAbi from "./gmx/abis/vester.abi.js";
import hashflowRouterAbi from "./hashflow/abis/router.abi.js";
import hopBaseBridgeAbi from "./hop/abis/base-bridge.abi.js";
import hopAbi from "./hop/abis/hop.abi.js";
import hopL1BridgeAbi from "./hop/abis/l1bridge.abi.js";
import hopL2BridgeAbi from "./hop/abis/l2bridge.abi.js";
import hopSaddleSwapAbi from "./hop/abis/saddleswap.abi.js";
import hyperliquidBirdgeAbi from "./hyperliquid/abis/bridge.abi.js";
import jonesdaoAbi from "./jonesdao/abis/jonesdao.abi.js";
import juiceAccountAbi from "./juice/abis/account.abi.js";
import juiceManagerAbi from "./juice/abis/manager.abi.js";
import juicePoolAbi from "./juice/abis/pool.abi.js";
import juiceStrategyAbi from "./juice/abis/strategy.abi.js";
import kelpdaoConfigAbi from "./kelpdao/abis/config.abi.js";
import kelpdaoAbi from "./kelpdao/abis/pool.abi.js";
import kwentaMarginAbi from "./kwenta/abis/margin.abi.js";
import kwentaStakingAbi from "./kwenta/abis/staking.abi.js";
import leetswapRouterAbi from "./leetswap/abis/router.abi.js";
import lidoAbi from "./lido/abis/lido.abi.js";
import lodestarOracleAbi from "./lodestar/abis/oracle.abi.js";
import lodestarStakingAbi from "./lodestar/abis/staking.abi.js";
import lodestarUnitrollerAbi from "./lodestar/abis/unitroller.abi.js";
import lodestarV1LERC20Abi from "./lodestar/abis/v1lerc20.abi.js";
import lodestarV1LETHAbi from "./lodestar/abis/v1leth.abi.js";
import lodestarVotingAbi from "./lodestar/abis/voting.abi.js";
import pendleMarketAbi from "./pendle/abis/market.abi.js";
import pendleRouterAbi from "./pendle/abis/router.abi.js";
import pendleVeAbi from "./pendle/abis/ve.abi.js";
import pendleVotingAbi from "./pendle/abis/voting.abi.js";
import plutusChefAbi from "./plutus/abis/chef.abi.js";
import plutusMasterchefAbi from "./plutus/abis/masterchef.abi.js";
import plutusRouterAbi from "./plutus/abis/router.abi.js";
import renzoL2ManagerAbi from "./renzo/abis/l2manager.abi.js";
import renzoManagerAbi from "./renzo/abis/manager.abi.js";
import rEthAbi from "./rocketpool/abis/reth.abi.js";
import rocketpoolAbi from "./rocketpool/abis/rocketpool.abi.js";
import rodeoFarmAbi from "./rodeo/abis/farm.abi.js";
import rodeoPoolAbi from "./rodeo/abis/pool.abi.js";
import stargateFactoryAbi from "./stargate/abis/factory.abi.js";
import stargateLPAbi from "./stargate/abis/lp.abi.js";
import stargateMessagingAbi from "./stargate/abis/messaging.abi.js";
import stargatePoolAbi from "./stargate/abis/pool.abi.js";
import stargatePoolV2Abi from "./stargate/abis/poolv2.abi.js";
import stargateRouterEthAbi from "./stargate/abis/router-eth.abi.js";
import stargateRouterAbi from "./stargate/abis/router.abi.js";
import stargateStakingTimeAbi from "./stargate/abis/staking-time.abi.js";
import stargateStakingAbi from "./stargate/abis/staking.abi.js";
import swellAbi from "./swell/abis/token.abi.js";
import synapsePoolAbi from "./synapse/abis/pool.abi.js";
import thenaVeAbi from "./thena/abis/ve.abi.js";
import thenaVotingAbi from "./thena/abis/voting.abi.js";
import thrusterV3FactoryAbi from "./thruster/abis/factory-v3.abi.js";
import thrusterFactoryAbi from "./thruster/abis/factory.abi.js";
import thrusterPairAbi from "./thruster/abis/pair.abi.js";
import thrusterV3PoolAbi from "./thruster/abis/pool.abi.js";
import thrusterPositionManagerAbi from "./thruster/abis/positionManager.abi.js";
import thrusterAbi from "./thruster/abis/thruster.abi.js";
import uniswapV3FactoryAbi from "./uniswap/abis/factory-v3.abi.js";
import uniswapFactoryAbi from "./uniswap/abis/factory.abi.js";
import uniswapPairAbi from "./uniswap/abis/pair.abi.js";
import uniswapV3PoolAbi from "./uniswap/abis/pool.abi.js";
import uniswapPositionManagerAbi from "./uniswap/abis/positionManager.abi.js";
import uniswapQuoterV3Abi from "./uniswap/abis/quoter-v3.abi.js";
import uniswapRouterV3Abi from "./uniswap/abis/router-v3.abi.js";
import uniswapAbi from "./uniswap/abis/uniswap.abi.js";
import velodromeV3FactoryAbi from "./velodrome/abis/factory-v3.abi.js";
import velodromeFactoryAbi from "./velodrome/abis/factory.abi.js";
import velodromeV3PoolAbi from "./velodrome/abis/pool-v3.abi.js";
import velodromePoolAbi from "./velodrome/abis/pool.abi.js";
import velodromePositionManagerAbi from "./velodrome/abis/positionManager.abi.js";
import velodromeRewardsAbi from "./velodrome/abis/rewards.abi.js";
import velodromeRouterAbi from "./velodrome/abis/router.abi.js";
import velodromeVeAbi from "./velodrome/abis/ve.abi.js";

export const abis = {
  aave: aaveAbi,
  "aave-debt-token": aaveDebtTokenAbi,
  "aave-provider": aaveProviderAbi,
  "aave-wrapper": aaveWrapperAbi,
  "across-spoke-pool": acrossSpokePoolAbi,
  "across-spoke-pool-verifier": acrossSpokePoolVerifierAbi,
  aerodrome: aerodromeRouterAbi,
  "aerodrome-router": aerodromeRouterAbi,
  "aerodrome-factory": aerodromeFactoryAbi,
  "aerodrome-pool": aerodromePoolAbi,
  "aerodrome-rewards": aerodromeRewardsAbi,
  "aerodrome-ve": aerodromeVeAbi,
  "aerodrome-position-manager": aerodromePositionManagerAbi,
  "aerodrome-factory-v3": aerodromeV3FactoryAbi,
  "aerodrome-pool-v3": aerodromeV3PoolAbi,
  ambient: ambientAbi,
  "ambient-query": ambientQueryAbi,
  "bladeswap-vault": bladeswapVaultAbi,
  "bladeswap-volatilepool": bladeswapVolatilePoolAbi,
  "bladeswap-stablepool": bladeswapStablePoolAbi,
  "bladeswap-pool": bladeswapPoolAbi,
  camelot: camelotAbi,
  "camelot-dividendsV2": camelotDividendsV2Abi,
  "camelot-factory": camelotFactoryAbi,
  "camelot-pair": camelotPairAbi,
  "camelot-position-manager": camelotPositionManagerAbi,
  "camelot-factory-v3": camelotV3FactoryAbi,
  "camelot-pool-v3": camelotV3PoolAbi,
  "compound-rewards": compoundRewardsAbi,
  "compound-comet": compoundCometAbi,
  "compound-ext": compoundCometExtAbi,
  "compound-bulker": compoundBulkerAbi,
  "compound-bulker-usdc": compoundBulker1Abi,
  "cowswap-ethFlow": cowswapEthFlowAbi,
  "curve-3pool": curve3poolAbi,
  "curve-fraxusdc": curveFraxusdcAbi,
  "curve-fraxusdp": curveFraxusdpAbi,
  "curve-steth": curveStethAbi,
  "curve-tricrypto2": curveTricrypto2Abi,
  "dolomite-margin": dolomiteMarginAbi,
  "dolomite-borrow": dolomiteBorrowAbi,
  "dolomite-deposit": dolomiteDepositAbi,
  "dolomite-vault": dolomiteVaultAbi,
  "dolomite-factory": dolomiteFactoryAbi,
  "dopex-ssov": dopexSsovAbi,
  eigenlayer: eigenlayerAbi,
  "eigenlayer-base": eigenlayerBaseAbi,
  "gmx-exchange-router": gmxExchangeRouterAbi,
  "gmx-reader": gmxReaderAbi,
  "gmx-data-store": gmxDataStoreAbi,
  "gmx-order-handler": gmxOrderHandlerAbi,
  "gmx-position-router": gmxPositionRouterAbi,
  "gmx-reward-router": gmxRewardRouterAbi,
  "gmx-reward-tracker": gmxRewardTrackerAbi,
  "gmx-router": gmxRouterAbi,
  "gmx-vester": gmxVesterAbi,
  "hashflow-router": hashflowRouterAbi,
  hop: hopAbi,
  "hop-base-bridge": hopBaseBridgeAbi,
  "hop-l1bridge": hopL1BridgeAbi,
  "hop-l2bridge": hopL2BridgeAbi,
  "hop-saddleswap": hopSaddleSwapAbi,
  "hyperliquid-bridge": hyperliquidBirdgeAbi,
  etherfi: etherfiAbi,
  "etherfi-nft": etherfiNFTAbi,
  "ethena-minter": ethenaMinterAbi,
  "ethena-staker": ethenaStakerAbi,
  jonesdao: jonesdaoAbi,
  "juice-pool": juicePoolAbi,
  "juice-strategy": juiceStrategyAbi,
  "juice-manager": juiceManagerAbi,
  "juice-account": juiceAccountAbi,
  kelpdao: kelpdaoAbi,
  "kelpdao-config": kelpdaoConfigAbi,
  "kwenta-margin": kwentaMarginAbi,
  "kwenta-staking": kwentaStakingAbi,
  "leetswap-router": leetswapRouterAbi,
  lido: lidoAbi,
  "lodestar-oracle": lodestarOracleAbi,
  "lodestar-staking": lodestarStakingAbi,
  "lodestar-unitroller": lodestarUnitrollerAbi,
  "lodestar-v1leth": lodestarV1LETHAbi,
  "lodestar-v1lerc20": lodestarV1LERC20Abi,
  "lodestar-voting": lodestarVotingAbi,
  "pendle-market": pendleMarketAbi,
  "pendle-router": pendleRouterAbi,
  "pendle-ve": pendleVeAbi,
  "pendle-voting": pendleVotingAbi,
  "plutus-chef": plutusChefAbi,
  "plutus-masterchef": plutusMasterchefAbi,
  "plutus-router": plutusRouterAbi,
  rocketpool: rocketpoolAbi,
  "rocketpool-reth": rEthAbi,
  "rodeo-farm": rodeoFarmAbi,
  "rodeo-pool": rodeoPoolAbi,
  "renzo-manager": renzoManagerAbi,
  "renzo-l2manager": renzoL2ManagerAbi,
  "stargate-factory": stargateFactoryAbi,
  "stargate-lp": stargateLPAbi,
  "stargate-pool": stargatePoolAbi,
  "stargate-poolv2": stargatePoolV2Abi,
  "stargate-router": stargateRouterAbi,
  "stargate-router-eth": stargateRouterEthAbi,
  "stargate-messaging": stargateMessagingAbi,
  "stargate-staking": stargateStakingAbi,
  "stargate-staking-time": stargateStakingTimeAbi,
  swell: swellAbi,
  "synapse-staking": synapsePoolAbi,
  "thena-ve": thenaVeAbi,
  "thena-voting": thenaVotingAbi,
  thruster: thrusterAbi,
  "thruster-factory": thrusterFactoryAbi,
  "thruster-pair": thrusterPairAbi,
  "thruster-position-manager": thrusterPositionManagerAbi,
  "thruster-factory-v3": thrusterV3FactoryAbi,
  "thruster-pool-v3": thrusterV3PoolAbi,
  uniswap: uniswapAbi,
  "uniswap-factory": uniswapFactoryAbi,
  "uniswap-pair": uniswapPairAbi,
  "uniswap-position-manager": uniswapPositionManagerAbi,
  "uniswap-factory-v3": uniswapV3FactoryAbi,
  "uniswap-pool-v3": uniswapV3PoolAbi,
  "uniswap-quoter-v3": uniswapQuoterV3Abi,
  "uniswap-router-v3": uniswapRouterV3Abi,
  velodrome: velodromeRouterAbi,
  "velodrome-router": velodromeRouterAbi,
  "velodrome-factory": velodromeFactoryAbi,
  "velodrome-pool": velodromePoolAbi,
  "velodrome-rewards": velodromeRewardsAbi,
  "velodrome-ve": velodromeVeAbi,
  "velodrome-position-manager": velodromePositionManagerAbi,
  "velodrome-factory-v3": velodromeV3FactoryAbi,
  "velodrome-pool-v3": velodromeV3PoolAbi,
  erc20: erc20Abi,
  weth: wethAbi,
} as const satisfies Record<string, InterfaceAbi>;
