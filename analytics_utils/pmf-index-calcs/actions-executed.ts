/**
 * This module analyzes user actions executed on the platform by querying Mixpanel data.
 * It calculates metrics like maximum actions executed in a 30-day window for each user.
 */

import https from "node:https";
import dotenv from "dotenv";
import moment from "moment-timezone";
import type { Event, Statistics } from "../types.js";
import { getDistinctIdMapping } from "./utils.js";

dotenv.config();

/**
 * Fetches event data from Mixpanel API for a given date range
 * @param fromDate - Start date in YYYY-MM-DD format
 * @param toDate - End date in YYYY-MM-DD format
 * @returns Array of Event objects containing action execution data
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
   * Helper function to fetch event data for a specific event type
   * @param event - The event type to fetch
   * @returns Promise resolving to array of Event objects
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

  const actionExecutedEvents = await getEventData(actionExecutedEvent);

  // Filter for successful actions only
  return actionExecutedEvents.filter(
    (event) => event.properties.Status === "Success",
  );
};

/**
 * Finds the maximum number of actions executed by a user in any 30-day window
 * @param events - Array of all events
 * @param distinctId - User's distinct ID
 * @returns Object containing max actions executed and the time ranges where it occurred
 */
const findMaxActionsExecuted = (events: Event[], distinctId: string) => {
  const userEvents = events.filter(
    (event) => event.properties.distinct_id === distinctId,
  );

  userEvents.sort((a, b) => a.properties.time - b.properties.time);

  let maxActionsExecuted = 0;
  let maxTimeRanges: string[][] = [];

  for (let i = 0; i < userEvents.length; i++) {
    const startTime = userEvents[i].properties.time;
    const endTime = startTime + 30 * 24 * 60 * 60; // 30 days in seconds

    const actionsExecuted = userEvents.filter(
      (event) =>
        event.properties.time >= startTime && event.properties.time <= endTime,
    ).length;

    if (actionsExecuted > maxActionsExecuted) {
      maxActionsExecuted = actionsExecuted;
      maxTimeRanges = [
        [
          new Date(startTime * 1000).toISOString(),
          new Date(endTime * 1000).toISOString(),
        ],
      ];
    } else if (actionsExecuted === maxActionsExecuted) {
      maxTimeRanges.push([
        new Date(startTime * 1000).toISOString(),
        new Date(endTime * 1000).toISOString(),
      ]);
    }
  }

  return { maxActionsExecuted, maxTimeRanges };
};

/**
 * Main analysis function that processes all user events and calculates statistics
 * @returns Array of Statistics objects containing metrics for each user
 */
export const analyzeEvents = async () => {
  const fromDate = "2023-06-10";
  const today = new Date();
  const events = await getEvents(fromDate, today.toISOString());

  const distinctIdMapping = await getDistinctIdMapping();
  const userStatistics: Statistics[] = [];

  for (const distinctId of Object.keys(distinctIdMapping)) {
    const { maxActionsExecuted, maxTimeRanges } = findMaxActionsExecuted(
      events,
      distinctId,
    );

    userStatistics.push({
      distinctId,
      maxActionsExecuted,
      maxTimeRanges,
    });
  }

  // Sort by max actions executed in descending order
  userStatistics.sort(
    (a, b) => (b.maxActionsExecuted ?? 0) - (a.maxActionsExecuted ?? 0),
  );

  return userStatistics;
};
