import https from "node:https";
import dotenv from "dotenv";
import moment from "moment-timezone";
import type { CohortCount, Event } from "../types.js";

dotenv.config();

// Cohort 5 distinct IDs
const cohort5DistinctIDs: Record<string, string> = {
  "770342fd-00a7-47f2-8d3f-63189f5815ff": "bill_researcher",
  "6ef41ff4-ab39-4609-aa84-515459e52fe7": "yedamax",
  "da5769cc-1769-495a-9210-6977add3e5eb": "veggiechicken",
  "6f757ed9-f92c-446c-b52e-e1b9032589b1": "coolthecool",
  "40f38df1-f9e2-4723-9305-ccbe7148348a": "thade",
  "326ffb21-fe5d-400a-b7de-3e3695d732e4": "degenoccultist",
  "88a6b3cd-4e99-4a24-8cd5-00ff49d6c34a": "lazer420",
  "0dc5f81a-f40d-4719-96a0-fc70d0ee206d": "kayy0727",
  "3a19ba81-6e7a-4a9d-93dc-461dd8436e35": "darkfingah",
  "9dd5af22-469f-45c4-8e33-9a872ed5e0de": "voiced_007",
  "accc3289-7516-4c1a-9eca-a51d87b5ebac": "hydroboat",
  "95f3fbe4-6e22-4529-b614-2842438239cc": "gokubutwithnohair",
  "f6c6c75a-b373-4213-a03b-d77572504586": "philipp668",
  "3cb28945-238e-4e12-84db-46a929478932": "0xn4r",
};

// Cohort 6 distinct IDs
const cohort6DistinctIDs: Record<string, string> = {
  "bd5f93ba-4df1-40cc-91df-712aed7f974b": "dr.bouma",
  "047d3cab-87bb-4744-b900-fecb129406f1": "0xsik",
  "62a45beb-fa8a-4ae9-800b-21e00d13977a": "frans6cur",
  "ced11682-1ad1-4ba1-a0d6-8a0b7518caaf": "jacq404",
  "2e4fdc35-5d54-4a3b-817b-cbc8f45fd602": "btcjev",
};

const getEvents = async (
  fromDate: string,
  toDate: string,
): Promise<Event[]> => {
  const actionExecutedEvent = encodeURIComponent('["Action Executed"]');
  const project_id = process.env.MIXPANEL_PROD_PROJECT_ID;
  const service_account_username =
    process.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME;
  const service_account_secret = process.env.MIXPANEL_SERVICE_ACCOUNT_SECRET;

  const formattedFromDate = moment
    .tz(fromDate, "America/New_York")
    .format("YYYY-MM-DD");
  const formattedToDate = moment
    .tz(toDate, "America/New_York")
    .format("YYYY-MM-DD");

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
): Event | null => {
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

const analyzeUserEvents = async (
  cohortDistinctIDs: Record<string, string>,
): Promise<{ [key: string]: CohortCount }> => {
  const today = moment.tz("America/New_York").toDate();
  const fromDate = "2024-02-01";
  const events = await getEvents(fromDate, today.toISOString());

  // console.log("Events retrieved from Mixpanel API:", events);

  const userCounts: Record<string, CohortCount> = {};

  for (const distinctId in cohortDistinctIDs) {
    console.log(`Processing events for distinct ID: ${distinctId}`);

    const earliestEvent = getEarliestActionExecutedEvent(events, distinctId);

    if (earliestEvent) {
      const startDate = new Date(earliestEvent.properties.time * 1000);
      const endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000); // ADD 14 DAYS

      // console.log(`Earliest event for distinct ID ${distinctId}:`, earliestEvent);
      // console.log(`Start date for distinct ID ${distinctId}:`, startDate);
      // console.log(`End date for distinct ID ${distinctId}:`, endDate);

      const filteredEvents = events.filter(
        (event) =>
          event.properties.distinct_id === distinctId &&
          event.properties.Status === "Success" &&
          new Date(event.properties.time * 1000) >= startDate &&
          new Date(event.properties.time * 1000) <= endDate,
      );

      // console.log(`Filtered events for distinct ID ${distinctId}:`, filteredEvents);

      const uniqueDates: Set<string> = new Set();
      filteredEvents.forEach((event, _) => {
        const eventDate = new Date(event.properties.time * 1000)
          .toISOString()
          .split("T")[0];
        uniqueDates.add(eventDate);
      });

      console.log(`Unique dates for distinct ID ${distinctId}:`, uniqueDates);

      const totalSessions = uniqueDates.size;
      let retainedSessions = 0;

      if (totalSessions > 0) {
        const sortedDates = Array.from(uniqueDates).sort();
        const earliestDate = new Date(sortedDates[0]);
        const fourteenDaysAgo = new Date(
          today.getTime() - 14 * 24 * 60 * 60 * 1000,
        );

        if (earliestDate >= fourteenDaysAgo) {
          console.log(
            `Excluding user ${cohortDistinctIDs[distinctId]} from cohort calculations (earliest date is less than 14 days from today)`,
          );
          continue;
        }

        for (let i = 0; i < sortedDates.length - 1; i++) {
          const currentDate = Number(new Date(sortedDates[i]));
          const nextDate = Number(new Date(sortedDates[i + 1]));
          const timeDiff = Math.abs(nextDate - currentDate);
          const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
          if (daysDiff >= 1) {
            retainedSessions++;
          }
        }
      }

      userCounts[cohortDistinctIDs[distinctId]] = {
        retainedSessions,
        totalSessions,
      };
    } else {
      console.log(
        `No successful action executed events for distinct ID: ${distinctId}`,
      );
    }
  }

  return userCounts;
};

const analyzeCohorts = async () => {
  const cohort5Counts = await analyzeUserEvents(cohort5DistinctIDs);
  const cohort6Counts = await analyzeUserEvents(cohort6DistinctIDs);

  console.log("\nCOHORT 5");
  let cohort5RetainedTotal = 0;
  let cohort5TotalSessionsTotal = 0;
  const cohort5RetentionValues: number[] = [];
  for (const user in cohort5Counts) {
    const { retainedSessions, totalSessions } = cohort5Counts[user];
    console.log(`${user}: ${retainedSessions} / ${totalSessions}`);
    cohort5RetainedTotal += retainedSessions;
    cohort5TotalSessionsTotal += totalSessions;
    if (totalSessions > 0) {
      cohort5RetentionValues.push(retainedSessions / totalSessions);
    }
  }
  const cohort5Retention = cohort5RetainedTotal / cohort5TotalSessionsTotal;
  console.log(
    `aggregate: ${cohort5RetainedTotal} / ${cohort5TotalSessionsTotal} = ${cohort5Retention}`,
  );

  const cohort5MeanRetention =
    cohort5RetentionValues.reduce((sum, value) => sum + value, 0) /
    cohort5RetentionValues.length;
  const cohort5MedianRetention = getMedian(cohort5RetentionValues);
  console.log(`mean: ${cohort5MeanRetention}`);
  console.log(`median: ${cohort5MedianRetention}`);

  console.log("\nCOHORT 6");
  let cohort6RetainedTotal = 0;
  let cohort6TotalSessionsTotal = 0;
  const cohort6RetentionValues: number[] = [];
  for (const user in cohort6Counts) {
    const { retainedSessions, totalSessions } = cohort6Counts[user];
    console.log(`${user}: ${retainedSessions} / ${totalSessions}`);
    cohort6RetainedTotal += retainedSessions;
    cohort6TotalSessionsTotal += totalSessions;
    if (totalSessions > 0) {
      cohort6RetentionValues.push(retainedSessions / totalSessions);
    }
  }
  const cohort6Retention = cohort6RetainedTotal / cohort6TotalSessionsTotal;
  console.log(
    `aggregate: ${cohort6RetainedTotal} / ${cohort6TotalSessionsTotal} = ${cohort6Retention.toFixed(4)}`,
  );

  const cohort6MeanRetention =
    cohort6RetentionValues.reduce((sum, value) => sum + value, 0) /
    cohort6RetentionValues.length;
  const cohort6MedianRetention = getMedian(cohort6RetentionValues);
  console.log(`mean: ${cohort6MeanRetention.toFixed(4)}`);
  console.log(`median: ${cohort6MedianRetention.toFixed(4)}`);
};

const getMedian = (values: number[]): number => {
  const sortedValues = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 !== 0
    ? sortedValues[mid]
    : (sortedValues[mid - 1] + sortedValues[mid]) / 2;
};

analyzeCohorts();
