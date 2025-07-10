import type { JSONObject } from "../utils/types.js";
import aave from "./aave/lptoken.js";
import bladeswap from "./bladeswap/lptoken.js";
import compound from "./compound/lptoken.js";
import curve from "./curve/lptoken.js";
import dolomite from "./dolomite/lptoken.js";
import dopex from "./dopex/lptoken.js";
import gmx from "./gmx/lptoken.js";
import hop from "./hop/lptoken.js";
import juice from "./juice/lptoken.js";
import lodestar from "./lodestar/lptoken.js";
import pendle from "./pendle/lptoken.js";
import plutus from "./plutus/lptoken.js";
import rocketpool from "./rocketpool/lptoken.js";
import stargate from "./stargate/lptoken.js";
import synapse from "./synapse/lptoken.js";

export default {
  aave,
  bladeswap,
  compound,
  curve,
  dopex,
  gmx,
  hop,
  juice,
  lodestar,
  pendle,
  plutus,
  rocketpool,
  stargate,
  synapse,
  dolomite,
} as Record<string, JSONObject>;
