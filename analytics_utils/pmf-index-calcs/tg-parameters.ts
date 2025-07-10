import { getDistinctIdMapping } from "./utils.js";

interface TelegramRequests {
  distinctId: string;
  requests: number;
}

const userRequestsMap = {
  // as of 1/8/25
  themetaisok: 11,
  zlerp: 1,
  jacq404: 2,
  grimmonacci: 1,
  truly_yobez: 1,
  tg1: 1,
  rbollo: 3,
  kayy0727: 2,
  ericuuuh: 6,
  "0xgrantland": 74,
  "0xn4r": 1,
  hydroboat: 1,
  btcjev: 2,
  papacito: 1,
  "0xcrox": 4,
  "623.eth": 1,
  cryptonomic_1: 1,
  sam0x_: 2,
  hewwo: 1,
  alphakek: 4,
  "mehdi.mhd": 1,
  approve123: 1,
  sergii4852: 2,
  aetonomy: 1,
  GuthixHL: 1,
  "0xomnia": 1,
};

async function getTelegramParameters(): Promise<TelegramRequests[]> {
  const distinctIdMapping = await getDistinctIdMapping();

  return Object.entries(distinctIdMapping)
    .map(([distinctId, profile]) => ({
      distinctId,
      requests:
        userRequestsMap[profile.name as keyof typeof userRequestsMap] || 0,
    }))
    .sort((a, b) => b.requests - a.requests);
}

export { getTelegramParameters };

// Add this code to print the results
// getTelegramParameters().then((results) => {
//   console.log(JSON.stringify(results, null, 2));
// }).catch((error) => {
//   console.error('Error getting Telegram parameters:', error);
// });
