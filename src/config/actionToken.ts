import type { ChainId, JSONObject } from "../utils/types.ts";
import aave from "./aave/actionToken.js";
import aerodrome from "./aerodrome/actionToken.js";
import ambient from "./ambient/actionToken.js";
import camelot from "./camelot/actionToken.js";
import compound from "./compound/actionToken.js";
import curve from "./curve/actionToken.js";
import dolomite from "./dolomite/actionToken.js";
import eigenlayer from "./eigenlayer/actionToken.js";
import ethena from "./ethena/actionToken.js";
import etherfi from "./etherfi/actionToken.js";
import gmx from "./gmx/actionToken.js";
import hop from "./hop/actionToken.js";
import juice from "./juice/actionToken.js";
import kelpdao from "./kelpdao/actionToken.js";
import kwenta from "./kwenta/actionToken.js";
import lido from "./lido/actionToken.js";
import lodestar from "./lodestar/actionToken.js";
import pendle from "./pendle/actionToken.js";
import plutus from "./plutus/actionToken.js";
import renzo from "./renzo/actionToken.js";
import rocketpool from "./rocketpool/actionToken.js";
import stargate from "./stargate/actionToken.js";
import swell from "./swell/actionToken.js";
import synapse from "./synapse/actionToken.js";
import thena from "./thena/actionToken.js";
import thruster from "./thruster/actionToken.js";
import uniswap from "./uniswap/actionToken.js";
import velodrome from "./velodrome/actionToken.js";

export default {
  aave,
  aerodrome,
  ambient,
  camelot,
  compound,
  curve,
  dolomite,
  eigenlayer,
  ethena,
  etherfi,
  gmx,
  hop,
  juice,
  kelpdao,
  kwenta,
  lido,
  lodestar,
  pendle,
  plutus,
  renzo,
  rocketpool,
  stargate,
  swell,
  synapse,
  thena,
  thruster,
  uniswap,
  velodrome,
} as Record<string, JSONObject>;
