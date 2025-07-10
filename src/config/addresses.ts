import type { JSONObject } from "../utils/types.js";
import zerox from "./0x/address.js";
import oneinch from "./1inch/address.js";
import aave from "./aave/address.js";
import across from "./across/address.js";
import aerodrome from "./aerodrome/address.js";
import ambient from "./ambient/address.js";
import axelar from "./axelar/address.js";
import bladeswap from "./bladeswap/address.js";
import bungee from "./bungee/address.js";
import camelot from "./camelot/address.js";
import compound from "./compound/address.js";
import cowswap from "./cowswap/address.js";
import curve from "./curve/address.js";
import dolomite from "./dolomite/address.js";
import dopex from "./dopex/address.js";
import eigenlayer from "./eigenlayer/address.js";
import ethena from "./ethena/address.js";
import etherfi from "./etherfi/address.js";
import gmx from "./gmx/address.js";
import hashflow from "./hashflow/address.js";
import hop from "./hop/address.js";
import hyperliquid from "./hyperliquid/address.js";
import jonesdao from "./jonesdao/address.js";
import juice from "./juice/address.js";
import kelpdao from "./kelpdao/address.js";
import kwenta from "./kwenta/address.js";
import kyberswap from "./kyberswap/address.js";
import leetswap from "./leetswap/address.js";
import lido from "./lido/address.js";
import lifi from "./lifi/address.js";
import lodestar from "./lodestar/address.js";
import odos from "./odos/address.js";
import openocean from "./openocean/address.js";
import pancakeswap from "./pancakeswap/address.js";
import paraswap from "./paraswap/address.js";
import pendle from "./pendle/address.js";
import plutus from "./plutus/address.js";
import renzo from "./renzo/address.js";
import rocketpool from "./rocketpool/address.js";
import rodeo from "./rodeo/address.js";
import stargate from "./stargate/address.js";
import sushiswap from "./sushiswap/address.js";
import swell from "./swell/address.js";
import synapse from "./synapse/address.js";
import syncswap from "./syncswap/address.js";
import thena from "./thena/address.js";
import thruster from "./thruster/address.js";
import traderjoe from "./traderjoe/address.js";
import uniswap from "./uniswap/address.js";
import velodrome from "./velodrome/address.js";

export default {
  "0x": zerox,
  "1inch": oneinch,
  aave,
  across,
  aerodrome,
  ambient,
  axelar,
  bladeswap,
  bungee,
  camelot,
  compound,
  cowswap,
  curve,
  dolomite,
  dopex,
  eigenlayer,
  gmx,
  hashflow,
  hop,
  hyperliquid,
  ethena,
  etherfi,
  jonesdao,
  juice,
  jumper: lifi,
  kelpdao,
  kyberswap,
  kwenta,
  leetswap,
  lido,
  lifi,
  lodestar,
  odos,
  openocean,
  pancakeswap,
  paraswap,
  pendle,
  plutus,
  renzo,
  rocketpool,
  rodeo,
  squid: axelar,
  socket: bungee,
  stargate,
  sushiswap,
  synapse,
  syncswap,
  swell,
  traderjoe,
  thena,
  thruster,
  uniswap,
  velodrome,
} as Record<string, JSONObject>;
