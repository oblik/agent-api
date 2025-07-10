import https from "node:https";
import dotenv from "dotenv";
import moment from "moment-timezone";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../src/db/index.js";
import { isNaNValue } from "../../src/utils/index.js";
import type { Event } from "../types.js";

dotenv.config();
const cohort3DistinctIDs: Record<string, string[]> = {
  "423d9d47-63b0-4238-9685-5da658e66821": [
    "0x2f73288629af429f435e0ce105473d25badc4bc3",
    "0x165ac03531e10df8e1c4d75c4e69f8a829b8221e",
    "0x68a3ad44ced5d556c4fd7e1825b03af1e70edd3b",
    "0x77b9a8f946e5c2d1487a0f12c262a9dbf29bd399",
  ],
  "af5bc1f1-2eb4-4521-9e28-c151ca08e5a1": [
    "0x5addfb98c8d7c35435c3b97e88462b5b0bfaa507",
    "0x46f2ca932bbf4f49313fcd6ccbdfbafc282ba249",
    "0x26ee053134eac5dd53d57528f882d0755cff57ad",
    "0x0b99363648efea66689d58a553bb015957083c57",
    "0xfb63ea001bfc6544420e5e2d5c1080b366d55a64",
    "0x6038038413b7522d004c68a008ea3665b6e3fa4b",
  ],
  "c3234865-e9cb-4a1f-bad7-524f3245389a": [
    "0xb33ee37fefb55b3af4bb43715b3036a91d8104d3",
  ],
  "4ea21461-54fa-412f-9cbe-6940fe4e30c2": [
    "0x1db8ab0290852bb53de852444fb73c07b00970e2",
    "0x49aef3924a006cb6eaeaf2c2dc627fe1026f86df",
  ],
  "fbc009a7-e9c6-4f53-a78e-eec0f6f784c1": [
    "0x8d506b4972cb65ab764a95c54e486e31198a0d12",
    "0x686cabe21c7a9cbd2e59184608d39e25eb0e4eb6",
    "0x72f0a77db71d8363a14a5e390b98ed14f5def0ba",
    "0xbd18f7d198abd89576fc2bc165b87f3eae0aa97d",
  ],
  "b6b01ecc-6538-4d14-ba9f-7ad9c9d35355": [
    "0xcb66d3da693fa55672a8012ce0e334ce2a8dd30d",
    "0x2e8f1671a40652065d10d8c253ec5e9992b1c6bf",
    "0xeb683293576c20b20ebd90a405fbe778360d4d55",
    "0x505e71695e9bc45943c58adec1650577bca68fd9",
  ],
  "e36cea20-8300-4817-880a-019dc2e40581": [
    "0x124a2239841a19952b97e04a5105e1da45ca0283",
    "0x4877809ac00cfdc0b81eaed6f715189983a41b7e",
    "0x5d15b8c7a685bcfad059dbb930881cda4b83c3ac",
    "0xef93c8cb3318d782c70bd674e3d21636064f8dde",
  ],
  "701edb44-e937-48f5-b784-99df0198029d": [
    "0x11153a5ba20bdceeef62564156a63492cb9b2f13",
  ],
  "779f0143-5710-45d7-a71b-0e3d6a4f9e03": [
    "0x1c62c89cf3f57eae7d61f1490c985ee82452752c",
    "0x6d3f7946d8ee4f7fe5bdc9c87bdcefc29846a790",
    "0x40495a781095932e2fc8dcca69f5e358711fdd41",
  ],
};

const cohort5DistinctIDs = {
  "770342fd-00a7-47f2-8d3f-63189f5815ff": [
    "0xa2ddab885adeea075397acbde71dc55ed710e2a8",
    "0x14e405d9ff39d33f60dc1af8cb44cbd9e115bbc4",
    "0x24a299102e0a052ba481a489d337728a1b064540",
    "0xd96583d8b4334c08a752f8fcc9e8c4d92ed090ea",
    "0xa9b8968557c81763652c1fa951dab74b635105e8",
  ],
  "6ef41ff4-ab39-4609-aa84-515459e52fe7": [
    "0xe35078385bfdb35655a257ea5ca2ccc727412325",
  ],
  "da5769cc-1769-495a-9210-6977add3e5eb": [
    "0xb0e47186d3b72860fd1d1ff6de64af56d7013451",
    "0xb8d1047861979e496ead3c37dd0370d122b095d2",
    "0x7328b4b78c919def3beb4338ae3b2d7769e831c7",
  ],
  "6f757ed9-f92c-446c-b52e-e1b9032589b1": [
    "0x16a55d6c1d1991dfe63af7a0b8f19749791c9f52",
    "0x16a55d6c1d1991dfe63af7a0b8f19749791c9f52",
    "0xfabaf526f7ddd970bcc214f41bc00b90f40bffab",
  ],
  "40f38df1-f9e2-4723-9305-ccbe7148348a": [
    "0x2e9e49fe30f74ea823d02525cc445932142b60d5",
    "0xac57df25f08e67122c2d191546fdf1e027c0127d",
    "0x363fee8d6cc96d8ae846c8b85bff329b8abde26c",
    "0xb97315dd3e85c6d491131b1665978628a715682b",
    "0x2e9e49fe30f74ea823d02525cc445932142b60d5",
  ],
  "326ffb21-fe5d-400a-b7de-3e3695d732e4": [
    "0xc9a4ddbc437d2dd5ea8a69b1d803122818a39a0a",
    "0x6adcf08deaaf5913079707f923279ef4c6d5225e",
    "0x9f5b8f8fcc32712d32644add0b23978d56af3e2d",
    "0x2115f525c610bcf932e3de74fca15c4834900b1c",
  ],
  "88a6b3cd-4e99-4a24-8cd5-00ff49d6c34a": [
    "0xd0e82dbd5a0fa63e571e62f4021caaab31b52a95",
    "0xa91a4aa9cd09a10e35aba1cae6d410bd2945e79c",
    "0xa2917120c698fb5f2a03e3fd3524bda85a3eaef6",
    "0xd95dc82da062969c1a89fe9788151333944f04fa",
  ],
  "0dc5f81a-f40d-4719-96a0-fc70d0ee206d": [
    "0x97d448ceb404a1bf23021a689a4c3b5de6ce5baa",
    "0xdc4f5b2bef394b1fcf7e50b4290ed1505840f51e",
    "0xfdb7f6cd26cdb2d9b9553db3e148411e87055fce",
    "0xf95f532a50fbc339b5fb204730a778f13d814d54",
    "0x44861be88b31f08ad0f5734d4890ea010113cc61",
  ],
  "3a19ba81-6e7a-4a9d-93dc-461dd8436e35": [
    "0x513aedace44cc9a0724ca276a8ceeee950903576",
  ],
  "9dd5af22-469f-45c4-8e33-9a872ed5e0de": [
    "0xb9318b1731c98a5cd0bc7ce830c9a6bd10f72e8c",
    "0xc9e871a3bc1320e49e5e22731574c3b3026abfe9",
    "0xd0f9f4623a28cb58c6b9a4c522ec7957cd53640d",
  ],
  "accc3289-7516-4c1a-9eca-a51d87b5ebac": [
    "0x8636d4bae80f6b5141aa57abfd672b274bc0f0f6",
    "0xf7f1f47ec265f64cc5f569ff87da572a5ab51fa6",
    "0xdf8a9f065bea0214ddce88a0d6afaf6a42a2f279",
  ],
  "95f3fbe4-6e22-4529-b614-2842438239cc": [
    "0xfc96a1e192f1337efb4dae223906e85416d135d1",
    "0x80b70c055f4595544f325f3671cb98bd97ed65f3",
    "0x4991933554fbc17d85880eba460d3be7e892dcc6",
  ],
  "f6c6c75a-b373-4213-a03b-d77572504586": [
    "0x3aef500f0e728e0a85efb461974412d7e72f5c77",
    "0x2f04ed87b5ac8b703565469311341b0b44e315d7",
    "0x61e60af04805d7ddfb0cfde0a96a3b1c15f3748f",
    "0xa9c3eb1b8250daddf039a010b67a089d8384f648",
  ],
  "3cb28945-238e-4e12-84db-46a929478932": [
    "0x23c17b2fe71220daa0a248b51dc0e66a3952193c",
    "0x6291bc1f82df8e46d70df1320b0837689c0bcffe",
    "0x454e8ac180602f524f3369f3b843c56ee1e7012e",
  ],
};

const getEvents = async (fromDate: string, toDate: string) => {
  const actionExecutedEvent = encodeURIComponent('["Action Executed"]');
  const project_id = process.env.MIXPANEL_PROD_PROJECT_ID;
  const service_account_username =
    process.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME;
  const service_account_secret = process.env.MIXPANEL_SERVICE_ACCOUNT_SECRET;

  const formattedFromDate = moment.utc(fromDate).format("YYYY-MM-DD");
  const formattedToDate = moment.utc(toDate).format("YYYY-MM-DD");

  const getEventData = async (event: string): Promise<Event[]> => {
    const options = {
      hostname: "data.mixpanel.com",
      path: `/api/2.0/export?from_date=${formattedFromDate}&to_date=${formattedToDate}&event=${event}&project_id=${project_id}`,
      method: "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${service_account_username}:${service_account_secret}`,
        ).toString("base64")}`,
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          // console.log(
          //   "API response received with status code:",
          //   res.statusCode,
          // );

          if (res.statusCode !== 200) {
            console.error("API request failed with status:", res.statusCode);
            console.error("Error message:", data.trim());
            reject(new Error("API request failed"));
            return;
          }

          if (!data || data.trim() === "") {
            console.warn("Empty response received from Mixpanel API");
            resolve([]);
            return;
          }

          try {
            const eventsData = data.trim().split("\n");
            const events = eventsData.map((eventData) => JSON.parse(eventData));
            resolve(events);
          } catch (error) {
            console.error("Error parsing response:", error);
            console.error("Response data:", data);
            reject(error);
          }
        });
      });

      req.on("error", (error) => {
        console.error("Error making API request:", error);
        reject(error);
      });

      req.end();
    });
  };

  const actionExecutedEvents: Event[] = await getEventData(actionExecutedEvent);

  const events = [
    ...actionExecutedEvents.filter(
      (event) => event.properties.Status === "Success",
    ),
  ];

  return events;
};

const getEarliestActionExecutedEvent = (
  events: Event[],
  distinctId: string,
) => {
  const userEvents = events.filter(
    (event) =>
      event.properties.distinct_id === distinctId &&
      event.properties.Status === "Success",
  );

  if (userEvents.length === 0) {
    return null;
  }

  return userEvents.reduce((earliest, current) =>
    new Date(current.properties.time) < new Date(earliest.properties.time)
      ? current
      : earliest,
  );
};

const countEventsBetweenDates = (
  events: Event[],
  distinctId: string,
  startDate: Date,
  endDate: Date,
) => {
  return events.filter(
    (event) =>
      event.properties.distinct_id === distinctId &&
      event.properties.Status === "Success" &&
      new Date(event.properties.time * 1000) >= startDate &&
      new Date(event.properties.time * 1000) <= endDate,
  ).length;
};

const countTransactionsBetweenDates = async (
  addresses: string[],
  startDate: Date,
  endDate: Date,
) => {
  const startTimestamp = Math.floor(startDate.getTime() / 1000);
  const endTimestamp = Math.floor(endDate.getTime() / 1000);

  // console.log("Start Timestamp:", startTimestamp);
  // console.log("End Timestamp:", endTimestamp);

  let count = 0;

  for (const address of addresses) {
    const transactions = await sequelize.query<{ count: number }>(
      `
      SELECT COUNT(*) AS count
      FROM accounttransaction
      WHERE ("fromAddress" = :address OR "toAddress" = :address)
        AND "timeStamp" BETWEEN :startTimestamp AND :endTimestamp
    `,
      {
        replacements: {
          address,
          startTimestamp,
          endTimestamp,
        },
        type: QueryTypes.SELECT,
      },
    );
    // console.log("Matching transactions:", transactions);

    count += transactions[0].count;
  }

  return count;
};

const analyzeUserEvents = async (cohortDistinctIDs: {
  [key: string]: string[];
}): Promise<{
  [key: string]: {
    eventCount: number;
    transactionCount: number;
  };
}> => {
  const today = new Date();
  const fromDate = "2024-02-01";
  const events = await getEvents(fromDate, today.toISOString());

  const userCounts: {
    [key: string]: {
      eventCount: number;
      transactionCount: number;
    };
  } = {};

  for (const distinctId in cohortDistinctIDs) {
    const earliestEvent = getEarliestActionExecutedEvent(events, distinctId);

    if (earliestEvent) {
      const startDate = new Date(earliestEvent.properties.time * 1000);
      const endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000); // ADD 14 DAYS
      const count = countEventsBetweenDates(
        events,
        distinctId,
        startDate,
        endDate,
      );
      const transactionCount = await countTransactionsBetweenDates(
        cohortDistinctIDs[distinctId],
        startDate,
        endDate,
      );

      userCounts[distinctId] = {
        eventCount: count,
        transactionCount,
      };

      console.log(
        `${distinctId}: ${count} events / ${transactionCount} transactions / ${(count / (count + transactionCount)).toFixed(4)} loyalty`,
      );
    } else {
      console.log(`${distinctId}: No successful action executed events`);
    }
  }

  return userCounts;
};

const analyzeCohorts = async () => {
  const cohort3Counts = await analyzeUserEvents(cohort3DistinctIDs);
  const cohort5Counts = await analyzeUserEvents(cohort5DistinctIDs);

  const cohort3EventTotal = Object.values(cohort3Counts).reduce(
    (sum, { eventCount }) => sum + eventCount,
    0,
  );
  const cohort3TransactionTotal = Object.values(cohort3Counts).reduce(
    (sum, { transactionCount }) => sum + transactionCount,
    0,
  );

  const cohort5EventTotal = Object.values(cohort5Counts).reduce(
    (sum, { eventCount }) => sum + eventCount,
    0,
  );
  const cohort5TransactionTotal = Object.values(cohort5Counts).reduce(
    (sum, { transactionCount }) => sum + transactionCount,
    0,
  );
  const cohort3LoyaltyValues = Object.values(cohort3Counts)
    .map(
      ({ eventCount, transactionCount }) =>
        eventCount / (eventCount + transactionCount),
    )
    .filter((loyalty) => !isNaNValue(loyalty));
  const cohort3MeanLoyalty =
    cohort3LoyaltyValues.reduce((sum, loyalty) => sum + loyalty, 0) /
    cohort3LoyaltyValues.length;
  const cohort3MedianLoyalty = getMedian(cohort3LoyaltyValues);
  const cohort5LoyaltyValues = Object.values(cohort5Counts)
    .map(
      ({ eventCount, transactionCount }) =>
        eventCount / (eventCount + transactionCount),
    )
    .filter((loyalty) => !isNaNValue(loyalty));
  const cohort5MeanLoyalty =
    cohort5LoyaltyValues.reduce((sum, loyalty) => sum + loyalty, 0) /
    cohort5LoyaltyValues.length;
  const cohort5MedianLoyalty = getMedian(cohort5LoyaltyValues);

  const cohort3Loyalty =
    cohort3EventTotal / (cohort3EventTotal + cohort3TransactionTotal);
  const cohort5Loyalty =
    cohort5EventTotal / (cohort5EventTotal + cohort5TransactionTotal);

  console.log(`\nCohort 3 event total: ${cohort3EventTotal}`);
  console.log(`Cohort 3 transaction total: ${cohort3TransactionTotal}`);
  console.log(`Cohort 3 aggregate loyalty: ${cohort3Loyalty.toFixed(4)}`);
  console.log(`Cohort 3 mean loyalty: ${cohort3MeanLoyalty.toFixed(4)}`);
  console.log(`Cohort 3 median loyalty: ${cohort3MedianLoyalty.toFixed(4)}`);

  console.log(`\nCohort 5 event total: ${cohort5EventTotal}`);
  console.log(`Cohort 5 transaction total: ${cohort5TransactionTotal}`);
  console.log(`Cohort 5 aggregate loyalty: ${cohort5Loyalty.toFixed(4)}`);
  console.log(`Cohort 5 mean loyalty: ${cohort5MeanLoyalty.toFixed(4)}`);
  console.log(`Cohort 5 median loyalty: ${cohort5MedianLoyalty.toFixed(4)}`);
};

const getMedian = (values: number[]) => {
  const sorted = values.sort((a, b) => a - b);
  const length = sorted.length;
  const mid = Math.floor(length / 2);

  if (length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

analyzeCohorts();
