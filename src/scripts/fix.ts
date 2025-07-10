import axios from "axios";
import { Tokens, initModels } from "../db/index.js";
import { getChainIdFromName, getErrorMessage, sleep } from "../utils/index.js";
import type { JSONObject } from "../utils/types.js";

// update coinmarketcapId

const CMC_API_ENDPOINT =
  "https://pro-api.coinmarketcap.com/v2/cryptocurrency/info";
const { CMC_API_KEY } = process.env;

const fixTokens = async () => {
  await initModels();
  // Get synced tokens from database
  const tokens = await Tokens.findAll({ order: [["id", "ASC"]] });
  const { length } = tokens;
  /* eslint-disable no-await-in-loop */
  for (let i = 0; i < length; i++) {
    const token = tokens[i];
    // @ts-expect-error: Ignoring type error for updatedAt
    const { symbol, chainId, address, coinmarketcapId, updatedAt } =
      token.dataValues;
    let cmcTokens: JSONObject[] | undefined;
    // if fixing incorrect, dont continue (comment this out). if filling missing, continue
    if (coinmarketcapId) {
      continue;
    }
    if (!updatedAt) {
      continue;
    }
    const unixUpdatedAt = Math.floor(updatedAt?.getTime() / 1000);
    const unixTimestampInSeconds = Math.floor(Date.now() / 1000);
    // if something is populated by coingecko, give it 8 days to be populated by coinmarketcap, otherwise ignore it (probably never supported)
    if (unixUpdatedAt < unixTimestampInSeconds - 86400 * 8) {
      continue;
    }
    console.log("fixing", symbol, chainId, address);
    try {
      const cmcResponse = await axios.get(
        `${CMC_API_ENDPOINT}?CMC_PRO_API_KEY=${CMC_API_KEY}&symbol=${symbol}`,
      );
      cmcTokens = cmcResponse?.data?.data?.[symbol.toUpperCase()];
    } catch (err) {
      console.log(getErrorMessage(err));
    }

    let cmcToken: JSONObject | undefined;
    if (cmcTokens) {
      cmcToken = cmcTokens.find((token) => {
        const foundContract = token.contract_address.find(
          (contract: {
            contract_address: string;
            platform: { name: string };
          }) => {
            return (
              contract?.contract_address?.toLowerCase() ===
                address?.toLowerCase() &&
              getChainIdFromName(contract?.platform?.name?.toLowerCase()) ===
                chainId
            );
          },
        );
        return foundContract !== undefined;
      });
    }
    if (cmcToken && cmcToken?.slug !== coinmarketcapId) {
      console.log("Updating", coinmarketcapId, "to", cmcToken.slug);
      token.set("coinmarketcapId", cmcToken.slug);
      await token.save();
    }
    await sleep(3);
  }
};

await fixTokens();
