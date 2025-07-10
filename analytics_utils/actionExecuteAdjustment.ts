import axios, { AxiosError } from "axios";
import dotenv from "dotenv";
import { QueryTypes } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { type Tracking, sequelize } from "../src/db/index.js";
import { getErrorMessage } from "../src/utils/index.js";
import type { Event } from "./types.js";

dotenv.config();

const prodProjectId = process.env.MIXPANEL_PROD_PROJECT_ID;
const authorizationMixpanel = process.env.MIXPANEL_AUTHORIZATION_2;

// TODO: DB Matching
// TODO: Add properties

/**
 * Fetches event data from Mixpanel using the Export API.
 * @param {string} event - The name of the event to fetch.
 * @param {string} fromDate - The start date for the query in yyyy-mm-dd format.
 * @param {string} toDate - The end date for the query in yyyy-mm-dd format.
 * @returns {Promise<Array>} - A promise that resolves to an array of event objects.
 */
async function fetchMixpanelData(
  event: string,
  fromDate: string,
  toDate: string,
): Promise<Event[]> {
  const encodedEvent = encodeURIComponent(`["${event}"]`);
  const url = `https://data.mixpanel.com/api/2.0/export?from_date=${fromDate}&to_date=${toDate}&event=${encodedEvent}`;

  const options = {
    method: "GET",
    headers: {
      Accept: "text/plain",
      Authorization: authorizationMixpanel,
    },
  };

  try {
    const response = await axios(url, options);
    const data = response.data;

    // If data is a string, process it as a newline-separated JSON objects
    if (typeof data === "string") {
      const events = data
        .split("\n")
        .map((line) => {
          if (!line.trim()) return null; // Skip empty lines
          try {
            return JSON.parse(line);
          } catch (err) {
            console.error("Error parsing line:", line, err);
            return null;
          }
        })
        .filter((event) => event !== null);

      return events;
    }

    // If data is a single object, wrap it in an array and return
    if (typeof data === "object" && !Array.isArray(data)) {
      return [data];
    }

    // If data is already an array (object), return it directly
    if (Array.isArray(data)) {
      return data;
    }

    // If data is neither an array nor a string, return an empty array
    return [];
  } catch (error) {
    console.error("Error fetching Mixpanel data:", error);
    throw error;
  }
}

/**
 * Identifies Submit events that need to be duplicated with additional properties.
 * @param {number} lastXDays - The number of days to look back for events.
 * @returns {Promise<Array>} - A promise that resolves to an array of unmatched Submit events.
 */
async function getEvents(lastXDays: number): Promise<Event[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lastXDays);
  const fromDate = startDate.toISOString().split("T")[0];
  const toDate = new Date().toISOString().split("T")[0];

  const actionExecutedEvents = await fetchMixpanelData(
    "Action Executed",
    fromDate,
    toDate,
  );
  const serverActionExecutedEvents = await fetchMixpanelData(
    "Server Action Executed Test",
    fromDate,
    toDate,
  );
  console.log("Action Executed:", actionExecutedEvents.length);

  console.log("Server Action Executed:", serverActionExecutedEvents.length);
  const allEvents = [
    ...actionExecutedEvents,
    ...serverActionExecutedEvents,
  ].sort((a, b) => a.properties.time - b.properties.time);
  console.log("All actions executed:", allEvents.length);
  const unmatchedExecutions: Event[] = [];
  for (const event of allEvents) {
    if (
      event.event === "Action Executed" &&
      !serverActionExecutedEvents.some(
        (e) =>
          e.properties.time === event.properties.time &&
          e.properties.messageId === event.properties.messageId,
      )
    ) {
      unmatchedExecutions.push(event);
    }
  }
  console.log("Unmatched Executions:", unmatchedExecutions.length);

  return unmatchedExecutions;
}

/**
 * Creates new Mixpanel events for the matched Submit events that have conditions.
 * @param {Array} events - An array of objects containing Submit events and their corresponding tracking entries.
 * @param {string} projectId - The Mixpanel project ID.
 * @returns {Promise<Array>} - A promise that resolves to an array of unmatched Submit events.
 */
async function createNewEvents(
  events: Event[],
  projectId: string,
): Promise<Event[]> {
  const unmatchedEvents: Event[] = [];

  for (const eventObj of events) {
    const execution = eventObj;
    const hasCondition = eventObj.hasCondition || false;
    const newUUID = uuidv4();
    const event = {
      properties: {
        time: Number.parseInt(`${execution.properties.time}`, 10),
        distinct_id: `${execution.properties.distinct_id}`,
        $user_id: `${execution.properties.distinct_id}`,
        $insert_id: `${newUUID}`,
        messageId: execution.properties.messageId,
        message: execution.properties.message,
        hasCondition,
        "Fee Paid": execution.properties["Fee Paid"],
        "List of Actions": execution.properties["List of Actions"],
        "Number of Actions": execution.properties["Number of Actions"],
        Status: execution.properties.Status,
      },
      event: "Server Action Executed Test",
    };

    const options = {
      method: "POST",
      url: "https://api.mixpanel.com/import",
      params: { strict: "1", project_id: projectId },
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: authorizationMixpanel,
      },
      data: [event],
    };

    try {
      const response = await axios.request(options);
      console.log("Response from Mixpanel:", response.data);
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.data?.failed_records) {
          console.error(
            "Failed records:",
            JSON.stringify(error.response.data.failed_records, null, 2),
          );
        }
      }
      console.error("Error submitting event:", getErrorMessage(error));
    }
  }

  return unmatchedEvents;
}

/**
 * Adds relevant properties to the Action Execution events by matching them with database records.
 * @param {Array} executionEvents - An array of unmatched Action Execution events.
 * @returns {Promise<Object>} - A promise that resolves to an object containing arrays of events with conditions, no DB match, and no condition.
 */
async function addProperties(executionEvents: Event[]) {
  const executionsWithConditions: Event[] = [];
  const noDbMatch: object[] = [];
  const noCondition: Event[] = [];

  for (const execution of executionEvents) {
    const messageId = execution.properties.messageId;
    const trackingEntry = await sequelize.query<Tracking>(
      `
            SELECT *
            FROM public.tracking
            WHERE "id" = :messageId
            `,
      {
        replacements: {
          messageId,
        },
        type: QueryTypes.SELECT,
      },
    );

    // if trackingEntry is empty
    if (trackingEntry.length > 0) {
      const generatedApiCalls = trackingEntry[0].generated_api_calls;
      const hasCondition =
        generatedApiCalls.length > 0 &&
        generatedApiCalls.some(
          (call) => call.name === "time" || call.name === "condition",
        );

      if (hasCondition) {
        executionsWithConditions.push(execution);
      } else {
        noCondition.push(execution);
      }
    } else {
      noDbMatch.push({
        execution,
        report: `No matching tracking entry found for ${messageId}`,
      });
    }
  }

  return { executionsWithConditions, noDbMatch, noCondition };
}

export default async function actionExecuteAdjustment(lastXDays: number) {
  console.log("Fetching and processing Mixpanel for action execute events...");
  // Step 1: Fetch all events from Mixpanel
  const executionEvents = await getEvents(lastXDays);

  console.log("Adding properties to the fetched events...");
  // Step 2: Enrich the fetched events with additional properties by querying the database
  const { executionsWithConditions, noDbMatch, noCondition } =
    await addProperties(executionEvents);

  console.log("Creating new events...");
  // Step 3: Prepare all events for submission
  const allEvents = [
    ...executionsWithConditions.map((event) => ({
      ...event,
      hasCondition: true,
    })),
    ...noCondition.map((event) => ({ ...event, hasCondition: false })),
  ];

  console.log("Submitting new events...");
  // Step 4: Send new events to Mixpanel for the events that have conditions
  const unmatchedEvents = await createNewEvents(allEvents, prodProjectId || "");

  console.log("Process complete.");
  // Log the results
  console.log("Unmatched events:", unmatchedEvents);
  console.log("No DB match events:", noDbMatch);
}
