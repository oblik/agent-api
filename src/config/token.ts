import type { JSONObject } from "../utils/types.js";
import aave from "./aave/token.js";
import aerodrome from "./aerodrome/token.js";
import ambient from "./ambient/token.js";
import bladeswap from "./bladeswap/token.js";
import camelot from "./camelot/token.js";
import compound from "./compound/token.js";
import curve from "./curve/token.js";
import dolomite from "./dolomite/token.js";
import eigenlayer from "./eigenlayer/token.js";
import ethena from "./ethena/token.js";
import etherfi from "./etherfi/token.js";
import gmx from "./gmx/token.js";
import hop from "./hop/token.js";
import juice from "./juice/token.js";
import lodestar from "./lodestar/token.js";
import pendle from "./pendle/token.js";
import plutus from "./plutus/token.js";
import rocketpool from "./rocketpool/token.js";
import stargate from "./stargate/token.js";
import synapse from "./synapse/token.js";
import thruster from "./thruster/token.js";
import uniswap from "./uniswap/token.js";
import velodrome from "./velodrome/token.js";

export default {
  aave,
  aerodrome,
  ambient,
  bladeswap,
  camelot,
  compound,
  curve,
  dolomite,
  etherfi,
  gmx,
  hop,
  juice,
  pendle,
  plutus,
  rocketpool,
  stargate,
  synapse,
  eigenlayer,
  lodestar,
  thruster,
  uniswap,
  velodrome,
  ethena,
} as Record<string, JSONObject>;
