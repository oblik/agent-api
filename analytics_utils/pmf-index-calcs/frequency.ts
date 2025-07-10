/**
 * This module handles event frequency analysis for user actions.
 * It fetches event data from Mixpanel and analyzes user activity patterns to understand user engagement.
 * The analysis focuses on finding periods of highest activity for each user by looking at unique active days
 * within 30-day windows.
 * Note: this script does not currently fetch embedded addresses from the database.
 */

import https from "node:https";
import dotenv from "dotenv";
import moment from "moment-timezone";
import type { Event } from "../types.js";

dotenv.config();

/**
 * Fetches distinct_id to username mapping from Mixpanel API.
 * Makes an authenticated request to Mixpanel's engage API to get user profiles.
 *
 * @returns Promise resolving to Record mapping distinct_ids to usernames
 * @throws Error if API request fails or response parsing fails
 */
const getDistinctIdMapping = async (): Promise<Record<string, string>> => {
  const project_id = process.env.MIXPANEL_PROD_PROJECT_ID;
  const service_account_username =
    process.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME;
  const service_account_secret = process.env.MIXPANEL_SERVICE_ACCOUNT_SECRET;

  const options = {
    hostname: "mixpanel.com",
    path: `/api/2.0/engage?project_id=${project_id}`,
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
        if (res.statusCode !== 200) {
          reject(new Error("API request failed"));
          return;
        }

        try {
          const response = JSON.parse(data);
          const mapping: Record<string, string> = {};

          if (!response.results) {
            resolve(mapping);
            return;
          }

          response.results.forEach((profile: any) => {
            if (profile.$distinct_id && profile.$properties.$name) {
              mapping[profile.$distinct_id] = profile.$properties.$name;
            }
          });

          resolve(mapping);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
};

/**
 * Fetches events from Mixpanel API for a given date range.
 * This function makes authenticated requests to Mixpanel's export API to retrieve
 * event data. It specifically looks for "Action Executed" events with "Success" status.
 *
 * @param fromDate - Start date in YYYY-MM-DD format to begin fetching events from
 * @param toDate - End date in YYYY-MM-DD format to stop fetching events at
 * @returns Promise resolving to array of Event objects containing filtered successful actions
 * @throws Error if API request fails or response parsing fails
 */
const getEvents = async (fromDate: string, toDate: string) => {
  const actionExecutedEvent = encodeURIComponent('["Action Executed"]');
  const project_id = process.env.MIXPANEL_PROD_PROJECT_ID;
  const service_account_username =
    process.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME;
  const service_account_secret = process.env.MIXPANEL_SERVICE_ACCOUNT_SECRET;

  const formattedFromDate = moment.utc(fromDate).format("YYYY-MM-DD");
  const formattedToDate = moment.utc(toDate).format("YYYY-MM-DD");

  /**
   * Helper function to fetch event data from Mixpanel API.
   * Makes an HTTPS request to Mixpanel's export API with proper authentication
   * and handles response parsing and error cases.
   *
   * @param event - URL-encoded event name to fetch from Mixpanel
   * @returns Promise resolving to array of parsed Event objects
   * @throws Error if API request fails or response cannot be parsed
   */
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

  // Filter events to only include successful actions
  const events = [
    ...actionExecutedEvents.filter(
      (event) => event.properties.Status === "Success",
    ),
  ];

  return events;
};

/**
 * Finds the maximum number of unique days a user had events within any 30-day period.
 * This function analyzes a user's event history to find their most active 30-day windows,
 * counting unique days with activity in each window. It helps identify periods of
 * highest user engagement.
 *
 * @param events - Array of Event objects to analyze
 * @param distinctId - User's distinct ID to filter events for
 * @returns Object containing:
 *          - maxUniqueDays: highest number of unique active days in any 30-day period
 *          - maxTimeRanges: array of [start, end] date ranges achieving the maximum
 */
const findMaxUniqueEventDays = (events: Event[], distinctId: string) => {
  // Filter events for specific user and sort chronologically
  const userEvents = events.filter(
    (event) => event.properties.distinct_id === distinctId,
  );

  userEvents.sort((a, b) => a.properties.time - b.properties.time);

  let maxUniqueDays = 0;
  let maxTimeRanges: string[][] = [];

  // Analyze each possible 30-day window starting from each event
  for (let i = 0; i < userEvents.length; i++) {
    const startTime = userEvents[i].properties.time;
    const endTime = startTime + 30 * 24 * 60 * 60; // 30 days in seconds

    // Get unique days with events in this window
    const eventDates = userEvents
      .filter(
        (event) =>
          event.properties.time >= startTime &&
          event.properties.time <= endTime,
      )
      .map((event) =>
        new Date(event.properties.time * 1000).toISOString().slice(0, 10),
      );

    const uniqueDays = new Set(eventDates).size;

    // Update maximum if this window has more unique days
    if (uniqueDays > maxUniqueDays) {
      maxUniqueDays = uniqueDays;
      maxTimeRanges = [
        [
          new Date(startTime * 1000).toISOString(),
          new Date(endTime * 1000).toISOString(),
        ],
      ];
    } else if (uniqueDays === maxUniqueDays) {
      maxTimeRanges.push([
        new Date(startTime * 1000).toISOString(),
        new Date(endTime * 1000).toISOString(),
      ]);
    }
  }

  return {
    maxUniqueDays,
    maxTimeRanges,
  };
};

/**
 * Main function to analyze events and return user frequency statistics
 *
 * @returns Array of objects containing user frequency statistics
 */
export async function getFrequencyByUser() {
  const fromDate = "2023-06-10";
  const today = new Date();
  const events = await getEvents(fromDate, today.toISOString());
  const distinctIdToUsername = await getDistinctIdMapping();

  const results: {
    distinctId: string;
    maxUniqueDays: number;
    startDate: Date | null;
    endDate: Date | null;
  }[] = [];

  // Calculate statistics for each user
  for (const distinctId in distinctIdToUsername) {
    const { maxUniqueDays, maxTimeRanges } = findMaxUniqueEventDays(
      events,
      distinctId,
    );

    // Take the first time range if multiple exist
    const timeRange = maxTimeRanges[0] || [null, null];

    results.push({
      distinctId,
      maxUniqueDays,
      startDate: timeRange[0] ? new Date(timeRange[0]) : null,
      endDate: timeRange[1] ? new Date(timeRange[1]) : null,
    });
  }

  // Sort results by maxUniqueDays in descending order
  return results.sort((a, b) => b.maxUniqueDays - a.maxUniqueDays);
}

// Call and print the results
// getFrequencyByUser().then(results => {
//   console.log('getFrequencyByUser results:', JSON.stringify(results, null, 2));
// }).catch(console.error);
