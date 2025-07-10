import type { JSONObject } from "../utils/types.js";
import aerodrome from "./aerodrome/pool.js";
import ambient from "./ambient/pool.js";
import bladeswap from "./bladeswap/pool.js";
import camelot from "./camelot/pool.js";
import compound from "./compound/pool.js";
import curve from "./curve/pool.js";
import dopex from "./dopex/pool.js";
import gmx from "./gmx/pool.js";
import hop from "./hop/pool.js";
import juice from "./juice/pool.js";
import lodestar from "./lodestar/pool.js";
import pendle from "./pendle/pool.js";
import rodeo from "./rodeo/pool.js";
import stargate from "./stargate/pool.js";
import synapse from "./synapse/pool.js";
import thruster from "./thruster/pool.js";
import uniswap from "./uniswap/pool.js";
import velodrome from "./velodrome/pool.js";

export default {
  aerodrome,
  ambient,
  bladeswap,
  camelot,
  compound,
  curve,
  dopex,
  gmx,
  hop,
  juice,
  lodestar,
  pendle,
  rodeo,
  stargate,
  synapse,
  thruster,
  uniswap,
  velodrome,
} as Record<string, JSONObject>;
