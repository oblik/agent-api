import https from "node:https";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../src/db/index.js";

/**
 * Fetches distinct_id to username mapping from Mixpanel API for users in Customers cohort
 */
export const getDistinctIdMapping = async (): Promise<
  Record<string, { user_id: string; name: string }>
> => {
  const cohort_id = 4563908; // Customers cohort ID
  const project_id = process.env.MIXPANEL_PROD_PROJECT_ID;
  const service_account_username =
    process.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME;
  const service_account_secret = process.env.MIXPANEL_SERVICE_ACCOUNT_SECRET;

  // Format the cohort filter as JSON
  const cohortFilter = encodeURIComponent(JSON.stringify({ id: cohort_id }));

  const options = {
    hostname: "mixpanel.com",
    path: `/api/2.0/engage?project_id=${project_id}&filter_by_cohort=${cohortFilter}`,
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${service_account_username}:${service_account_secret}`,
      ).toString("base64")}`,
      Accept: "application/json",
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          const mapping: Record<string, { user_id: string; name: string }> = {};

          if (response.results) {
            response.results.forEach((profile: any) => {
              if (profile.$distinct_id) {
                mapping[profile.$distinct_id] = {
                  user_id: profile.$distinct_id,
                  name: profile.$properties?.$name || profile.$distinct_id,
                };
              }
            });
          }

          resolve(mapping);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
};

/**
 * Gets embedded addresses for given user_ids from analytics_users table
 */
export const getEmbeddedAddresses = async (userIds: string[]) => {
  const userResults = await sequelize.query<{
    user_id: string;
    embeddedAddresses: string[];
  }>(
    `
      SELECT DISTINCT user_id, "embeddedAddresses"
      FROM analytics_users 
      WHERE user_id = ANY($1)
      `,
    {
      bind: [userIds],
      type: QueryTypes.SELECT,
    },
  );

  const addressMap = new Map<string, string[]>();
  userResults.forEach((row) => {
    if (row.embeddedAddresses) {
      addressMap.set(row.user_id, row.embeddedAddresses);
    }
  });

  return addressMap;
};

/**
 * Gets discord IDs for given user_ids from analytics_users table
 */
export const getDiscordIds = async (userIds: string[]) => {
  const userResults = await sequelize.query<{
    user_id: string;
    discord_id: string;
  }>(
    `
      SELECT DISTINCT user_id, discord_id
      FROM analytics_users 
      WHERE user_id = ANY($1)
      AND discord_id IS NOT NULL
      `,
    {
      bind: [userIds],
      type: QueryTypes.SELECT,
    },
  );

  const discordMap = new Map<string, string>();
  userResults.forEach((row) => {
    if (row.discord_id) {
      discordMap.set(row.user_id, row.discord_id);
    }
  });

  return discordMap;
};
