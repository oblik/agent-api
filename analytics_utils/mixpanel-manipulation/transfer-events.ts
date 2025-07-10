import { confirm, input } from "@inquirer/prompts";
import axios from "axios";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { getErrorMessage } from "../../src/utils/index.js";
import type { Event } from "../types.js";

dotenv.config();

const MIXPANEL_PROJECT_ID = process.env.MIXPANEL_PROD_PROJECT_ID;
const MIXPANEL_API_SECRET = process.env.MIXPANEL_AUTHORIZATION_2;

const SOURCE_USER_ID = "3e42204a-3bc3-4460-aff2-6b19733dfd7e";
const TARGET_USER_ID = "c0569b5f-d524-4ba8-ac3b-f2208cf73ab9";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function fetchMixpanelData(
  fromDate: string,
  toDate: string,
  retries = 3,
) {
  const encodedEvent = encodeURIComponent('["Action Executed"]');
  const url = `https://data.mixpanel.com/api/2.0/export?from_date=${fromDate}&to_date=${toDate}&event=${encodedEvent}`;

  console.log("API URL:", url);

  const options = {
    method: "GET",
    headers: {
      Accept: "text/plain",
      Authorization: MIXPANEL_API_SECRET,
    },
  };

  for (let i = 0; i < retries; i++) {
    try {
      await delay(1000);
      console.log(`Sending request to Mixpanel API (Attempt ${i + 1})...`);
      const response = await axios(url, options);
      console.log("Received response from Mixpanel API");
      const data = response.data;

      if (typeof data === "string") {
        const events = data
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line));

        console.log(`Parsed ${events.length} total events`);
        return events;
      }

      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Error fetching Mixpanel data (Attempt ${i + 1}):`, error);
      if (i === retries - 1) throw error;
    }
  }
}

async function replicateEvents(events: Event[]) {
  const replicatedEvents = events.map((event) => ({
    event: event.event,
    properties: {
      time: event.properties.time,
      distinct_id: TARGET_USER_ID,
      $user_id: TARGET_USER_ID,
      $insert_id: uuidv4(),
      messageId: event.properties.messageId,
      Status: event.properties.Status,
      "List of Actions": event.properties["List of Actions"],
      "Fee Paid": event.properties["Fee Paid"],
    },
  }));

  const options = {
    method: "POST",
    url: "https://api.mixpanel.com/import",
    params: { strict: "1", project_id: MIXPANEL_PROJECT_ID },
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: MIXPANEL_API_SECRET,
    },
    data: replicatedEvents,
  };

  try {
    const response = await axios.request(options);
    console.log("Events replicated successfully:", response.data);
  } catch (error) {
    console.error("Error replicating events:", getErrorMessage(error));
  }
}

async function main() {
  try {
    const fromDate = await input({
      message: "Enter the start date (YYYY-MM-DD):",
      default: "2024-01-01",
    });
    const toDate = await input({
      message: "Enter the end date (YYYY-MM-DD):",
      default: "2024-04-01",
    });

    console.log(
      `Fetching 'Action Executed' events from ${fromDate} to ${toDate}...`,
    );
    const allEvents = (await fetchMixpanelData(fromDate, toDate)) || [];
    console.log(`Found ${allEvents.length} total events.`);

    const filteredEvents = allEvents.filter(
      (event) => event.properties.distinct_id === SOURCE_USER_ID,
    );
    console.log(
      `Found ${filteredEvents.length} events for user ${SOURCE_USER_ID}.`,
    );

    if (filteredEvents.length > 0) {
      const proceed = await confirm({
        message: `Do you want to replicate ${filteredEvents.length} events for user ${TARGET_USER_ID}?`,
      });

      if (proceed) {
        console.log("Replicating events...");
        await replicateEvents(filteredEvents);
        console.log("Event replication complete.");
      } else {
        console.log("Event replication cancelled.");
      }
    } else {
      console.log("No events found for the specified user and date range.");
    }
  } catch (error) {
    console.error("Error in main function:", error);
  }
}

main();
