import axios from "axios";
import { abis } from "../config/abis.js";
import { Tokens, initModels } from "../db/index.js";
import { getViemPublicClientFromEthers } from "../utils/ethers2viem.js";
import {
  getChainIdFromName,
  getChainNameFromCGC,
  getErrorMessage,
  getRpcUrlForChain,
  isValidAddress,
  sleep,
} from "../utils/index.js";
import { RetryProvider } from "../utils/retryProvider.js";
import type { JSONObject } from "../utils/types.js";

// fetch new tokens

const CGC_API_ENDPOINT = "https://pro-api.coingecko.com/api/v3/coins";
const CMC_API_ENDPOINT = "https://pro-api.coinmarketcap.com";
const { CGC_API_KEY } = process.env;
const { CMC_API_KEY } = process.env;

const fetchTokens = async () => {
  await initModels();
  // Get synced tokens from database
  const syncedTokens = await Tokens.findAll({ raw: true });

  let tokens = [];

  // Get list of tokens from coingecko
  try {
    const cgcResponse = await axios.get(
      `${CGC_API_ENDPOINT}/list?include_platform=true`,
      { headers: { "x-cg-pro-api-key": CGC_API_KEY } },
    );
    tokens = cgcResponse?.data;
  } catch (err) {
    console.log(getErrorMessage(err));
  }

  const newTokens: JSONObject[] = [];
  const { length } = tokens;
  console.log(length);
  /* eslint-disable no-await-in-loop */
  for (let i = 0; i < length; i++) {
    const { id, platforms } = tokens[i];

    // Get tokens that are already on database
    const matchTokens = syncedTokens.filter(
      (token) => token.coingeckoId === id,
    );

    // Get missed platforms to be get from coingecko
    const missedPlatforms = Object.keys(platforms).filter((platform) => {
      const chainName = getChainNameFromCGC(platform);
      if (!chainName) {
        return false;
      }

      const chainId = getChainIdFromName(chainName);
      if (!chainId) {
        return false;
      }

      return !matchTokens.find((token) => token.chainId === chainId);
    });

    // If no platfirms are missed, skip
    if (missedPlatforms.length === 0) {
      continue;
    }

    try {
      const {
        data: {
          detail_platforms,
          name,
          symbol,
          image: { thumb },
          market_data,
        },
      } = await axios.get(`${CGC_API_ENDPOINT}/${id}`, {
        headers: { "x-cg-pro-api-key": CGC_API_KEY },
      });

      let cmcTokens: JSONObject[] | undefined;
      try {
        const cmcResponse = await axios.get(
          `${CMC_API_ENDPOINT}/v2/cryptocurrency/info?CMC_PRO_API_KEY=${CMC_API_KEY}&symbol=${symbol}`,
        );
        if (cmcResponse?.data?.data) {
          cmcTokens = cmcResponse?.data?.data[symbol.toUpperCase()];
        }
      } catch (err) {
        console.log(getErrorMessage(err));
      }

      const tokensToSave = missedPlatforms
        .map((cgcChainName) => {
          const chainName = getChainNameFromCGC(cgcChainName);
          if (!chainName) {
            return null;
          }

          const chainId = getChainIdFromName(chainName);

          if (!chainId) {
            return null;
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
                      detail_platforms[
                        cgcChainName
                      ]?.contract_address?.toLowerCase() &&
                    getChainIdFromName(
                      contract?.platform?.name?.toLowerCase(),
                    ) === chainId
                  );
                },
              );
              return foundContract !== undefined;
            });
          }

          return {
            name,
            symbol,
            chainId,
            address: detail_platforms[cgcChainName].contract_address,
            decimals: detail_platforms[cgcChainName].decimal_place,
            thumb,
            coingeckoId: id,
            coinmarketcapId: cmcToken?.slug,
            price: market_data.current_price.usd,
          };
        })
        .filter((info) => !!info);

      newTokens.push(...tokensToSave);

      console.log(`Processed ${i}th token`, tokensToSave);

      await sleep(15);
    } catch (err) {
      console.log(getErrorMessage(err));
      break;
    }
  }
  await fetchCMCTokens(newTokens, syncedTokens);

  console.log("Done. Saving...");
  // Push tokens to the database
  if (newTokens.length > 0) {
    await Tokens.bulkCreate(newTokens as Tokens[]);
  }
};

const fetchCMCTokens = async (
  newTokens: JSONObject[],
  syncedTokens: Tokens[],
) => {
  const tokens: JSONObject[] = [];
  let start = 1;
  const limit = 5000;
  let res = [];

  // Get list of tokens from coinmarketcap
  /* eslint-disable no-await-in-loop */
  do {
    try {
      start = tokens.length + 1;
      const cmcResponse = await axios.get(
        `${CMC_API_ENDPOINT}/v1/cryptocurrency/map?CMC_PRO_API_KEY=${CMC_API_KEY}&start=${start}&limit=${limit}`,
      );
      res = cmcResponse?.data?.data;
      tokens.push(...res);
    } catch (err) {
      console.log(getErrorMessage(err));
    }
  } while (res.length >= limit);

  const { length } = tokens;
  console.log(length);

  /* eslint-disable no-await-in-loop */
  for (let i = 0; i < length; i++) {
    const { id, name, slug, symbol, platform } = tokens[i];
    if (!platform) {
      continue;
    }

    const chainId = getChainIdFromName(
      platform.slug === "optimism-ethereum" ? "optimism" : platform.slug,
    );
    if (!chainId) {
      continue;
    }

    // Get tokens that are already on database
    const matchTokens = syncedTokens.filter(
      (token) => token.coinmarketcapId === slug,
    );

    if (matchTokens.find((token) => token.chainId === chainId)) {
      continue;
    }

    try {
      let thumb: string | undefined;

      try {
        const cmcResponse = await axios.get(
          `${CMC_API_ENDPOINT}/v2/cryptocurrency/info?CMC_PRO_API_KEY=${CMC_API_KEY}&id=${id}`,
        );
        if (cmcResponse?.data?.data) {
          thumb = cmcResponse?.data?.data[id].logo;
        }
      } catch (err) {
        console.log(getErrorMessage(err));
      }

      let decimals: number | null | undefined;

      const rpcUrl = getRpcUrlForChain(chainId);
      const provider = new RetryProvider(rpcUrl, chainId);
      if (isValidAddress(platform.token_address)) {
        try {
          decimals = Number(
            await (await getViemPublicClientFromEthers(provider)).readContract({
              address: platform.token_address,
              abi: abis.erc20,
              functionName: "decimals",
            }),
          );
        } catch {
          decimals = null;
        }
      }

      const tokensToSave = [
        {
          name,
          symbol: symbol.toLowerCase(),
          chainId,
          address: platform.token_address.toLowerCase(),
          decimals,
          thumb,
          coinmarketcapId: slug,
        },
      ];

      newTokens.push(...tokensToSave);
      console.log(`Processed ${i}th token`);
      await sleep(15);
    } catch (err) {
      console.log(getErrorMessage(err));
      break;
    }
  }
};

await fetchTokens();
