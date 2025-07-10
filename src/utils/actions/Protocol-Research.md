1. Lido
   - deposit / StakingRouter -> done
   - withdraw -> not supported
2. GMX
   - deposit / Vester -> done
   - withdraw / Vester -> done
   - stake / RewardTracker -> done [discuss - fee? staked? bonus?]
   - unstake / RewardTracker -> done
   - long / PositionRouter -> done
   - short / PositionRouter -> done
   - close / PositionRouter -> done
3. Rocket Pool
   - deposit / Deposit -> done
   - withdraw / Deposit -> done
4. Pendle
   - deposit / PendleMarketV2 -> done
   - withdraw / PendleMarketV2 -> done
   - lock / VotingEscrowPendleMainChain -> done
   - unlock / VotingEscrowPendleMainChain -> done
   - vote / PendleVotingControllerUpg -> done
5. JonesDAO
   - deposit / MillinerV2 -> done
   - withdraw / MillinerV2 -> done
   - claim (+) / MillinerV2 -> done
6. Lodestar
   - lend / Unitroller -> done
   - borrow / Unitroller -> done
   - repay / Unitroller -> done
   - stake / Staking Rewards Proxy -> done
   - unstake / Staking Rewards Proxy -> done
   - claim / Staking Rewards Proxy -> done
   - harvest / Staking Rewards Proxy -> done
   - vote (+) / Voting Power Proxy -> done
7. Dolomite _fully skipped because dolomite workflow is unoriginal_
   - deposit
   - withdraw
   - lend
   - borrow
   - repay
   - stake
   - unstake
   - claim
   - harvest
8. Plutus
   - deposit / plvGLP, plsSPA, plsJONES farm + MasterChef -> done
   - withdraw / plvGLP, plsSPA, plsJONES farm + MasterChef -> done
   - stake / Epoch Time 1/3/6 Month Staking -> done
   - unstake / Epoch Time 1/3/6 Month Staking -> done
   - lock / Vester -> done
   - unlock / Vester -> done
9. Rodeo
   - deposit / PositionManager -> done
   - withdraw / PositionManager -> done
   - lend / Pool (USDC) -> done
   - borrow / Pool (USDC) -> done
   - repay / Pool (USDC) -> done
10. Kwenta
    - deposit / StakingRewards V2 Proxy -> done
    - withdraw / StakingRewards V2 Proxy -> done
    - long / Smart Margin Account Factory -> _can't find how to build execute function parameters_
    - short / Smart Margin Account Factory -> _can't find how to build execute function parameters_
    - close / Smart Margin Account Factory -> _can't find how to build execute function parameters_
11. Stargate
    - deposit / Router -> done
    - withdraw / Router -> done
    - stake / Staking -> done
    - unstake / Staking -> done
    - claim / Staking -> done
    - harvest / Staking -> done
    - vote
12. Thena (agreed to skip this)
    - deposit / GaugeFactory (created by factory contract) -> _can't find each pool contract address created by factory_
    - withdraw / GaugeFactory (created by factory contract) -> _can't find each pool contract address created by factory_
    - stake / PairFactory (created by factory contract) -> _can't find each pool contract address created by factory_
    - unstake / PairFactory (created by factory contract) -> _can't find each pool contract address created by factory_
    - lock / veThena -> done
    - unlock / veThena -> done
    - claim / GaugeFactory (created by factory contract) -> _can't find each pool contract address created by factory_
    - harvest / PairFactory (created by factory contract) -> _can't find each pool contract address created by factory_
    - vote / VoterV3 -> done
13. Balancer
    - swap -> _can't be done due to lack of parameters from ai response_
    - deposit / _can't find contract_
    - withdraw / _can't find contract_
    - stake / _can't find contract_
    - unstake / _can't find contract_
    - claim / _can't find contract_
    - harvest / _can't find contract_
