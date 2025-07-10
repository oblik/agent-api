import axios, { AxiosError } from "axios";
import dotenv from "dotenv";
import inquirer from "inquirer";
import { QueryTypes } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import {
  Analytics,
  type Tracking,
  initModels,
  sequelize,
} from "../src/db/index.js";
import { getErrorMessage } from "../src/utils/index.js";
import actionExecuteAdjustment from "./actionExecuteAdjustment.js";
import populateEmbedded from "./populateEmbedded.js";
import type { Event, NewEvent } from "./types.js";

dotenv.config();

const prodProjectId = process.env.MIXPANEL_PROD_PROJECT_ID;
const authorizationMixpanel = process.env.MIXPANEL_AUTHORIZATION_2;

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
  clientside = true,
): Promise<Event[]> {
  const encodedEvent = encodeURIComponent(`["${event}"]`);
  let url: string;
  if (clientside) {
    const whereClause = encodeURIComponent(
      'properties["Button Name"] == "Submit"',
    );
    url = `https://data.mixpanel.com/api/2.0/export?from_date=${fromDate}&to_date=${toDate}&event=${encodedEvent}&where=${whereClause}`;
  } else {
    url = `https://data.mixpanel.com/api/2.0/export?from_date=${fromDate}&to_date=${toDate}&event=${encodedEvent}`;
  }
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
async function getEvents(lastXDays: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lastXDays);
  const fromDate = startDate.toISOString().split("T")[0];
  const toDate = new Date().toISOString().split("T")[0];

  const submitEvents = await fetchMixpanelData(
    "Button Clicked",
    fromDate,
    toDate,
    true,
  );
  const serverSubmitEvents = await fetchMixpanelData(
    "Server Submit Test",
    fromDate,
    toDate,
    false,
  );

  console.log("Submit events:", submitEvents.length);
  console.log("Server submit events:", serverSubmitEvents.length);
  const allEvents = [...submitEvents, ...serverSubmitEvents].sort(
    (a, b) => a.properties.time - b.properties.time,
  );
  console.log("All submits:", allEvents.length);
  const unmatchedSubmits: Event[] = [];
  for (const event of allEvents) {
    if (
      event.event === "Button Clicked" &&
      !serverSubmitEvents.some(
        (e) =>
          e.properties.time === event.properties.time &&
          e.properties.Prompt === event.properties.Prompt,
      )
    ) {
      unmatchedSubmits.push(event);
    }
  }
  console.log("Unmatched submits:", unmatchedSubmits.length);

  return unmatchedSubmits;
}

/**
 * Adds relevant properties to the Submit events by matching them with database records.
 * @param {Array} submitEvents - An array of unmatched Submit events.
 * @returns {Promise<Object>} - A promise that resolves to an object containing arrays of events with conditions, no DB match, and no condition.
 */
async function addProperties(submitEvents: Event[]) {
  const submitsWithConditions: NewEvent[] = [];
  const noDbMatch: NewEvent[] = [];
  const noCondition: NewEvent[] = [];
  const researchPrompts: NewEvent[] = [];

  for (const submit of submitEvents) {
    const userId = submit.properties.distinct_id;

    if (
      !userId.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )
    ) {
      noDbMatch.push({
        submit,
        report: "User ID does not match UUID format",
      });
      continue;
    }

    // Fetch user from the database
    const analytics_user = await Analytics.findOne({
      where: { user_id: userId },
      attributes: ["embeddedAddresses"],
    });

    if (!analytics_user) {
      noDbMatch.push({
        submit,
        report: "No matching user found in the database",
      });
      continue;
    }

    if (!analytics_user.embeddedAddresses) {
      noDbMatch.push({
        submit,
        report: "User has no embedded addresses",
      });
      continue;
    }

    const address = analytics_user.embeddedAddresses[0];

    if (!address) {
      noDbMatch.push({
        submit,
        report: "No address found in embedded addresses",
      });
      continue;
    }

    const trackingEntry = await sequelize.query<Tracking>(
      `
            SELECT *
            FROM public.tracking
            WHERE LOWER("user_address") = LOWER(:user_address)
              AND TRIM("inputted_query") = TRIM(:inputted_query)
            `,
      {
        replacements: {
          user_address: address,
          inputted_query: submit.properties.Prompt,
        },
        type: QueryTypes.SELECT,
      },
    );
    // console.log(trackingEntry)
    // console.log(address)
    // console.log(submit.properties.Prompt)
    // console.log("done")

    // if trackingEntry is empty
    if (trackingEntry.length > 0) {
      // console log the entire tracking entry
      console.log();
      console.log(trackingEntry);
      const generatedApiCalls =
        trackingEntry[trackingEntry.length - 1].generated_api_calls;
      const editedApiCalls =
        trackingEntry[trackingEntry.length - 1].edited_api_calls || [];

      const hasCondition =
        generatedApiCalls &&
        generatedApiCalls.length > 0 &&
        generatedApiCalls.some(
          (call) => call.name === "time" || call.name === "condition",
        );
      const isResearch =
        !generatedApiCalls ||
        generatedApiCalls.length === 0 ||
        generatedApiCalls.some((call) => call.name === "notification") ||
        editedApiCalls.some((call) => call.name === "notification");

      if (isResearch) {
        researchPrompts.push({ submit, userAddress: address });
      } else if (hasCondition) {
        submitsWithConditions.push({ submit, userAddress: address });
      } else {
        noCondition.push({ submit, userAddress: address });
      }
    } else {
      noDbMatch.push({
        submit,
        report: `No matching tracking entry found for ${address} and ${submit.properties.Prompt}`,
      });
    }
  }

  return { submitsWithConditions, noDbMatch, noCondition, researchPrompts };
}

/**
 * Creates new Mixpanel events for the matched Submit events that have conditions.
 * @param {Array} events - An array of objects containing Submit events and their corresponding tracking entries.
 * @param {string} projectId - The Mixpanel project ID.
 * @returns {Promise<Array>} - A promise that resolves to an array of unmatched Submit events.
 */
async function createNewEvents(events: NewEvent[], projectId: string) {
  const unmatchedEvents: object[] = [];

  for (const eventObj of events) {
    const { submit } = eventObj;
    const isResearch = eventObj.isResearch || false;
    const hasCondition = eventObj.hasCondition || false;
    const newUUID = uuidv4();
    const event = {
      properties: {
        time: Number.parseInt(`${submit.properties.time}`, 10),
        distinct_id: `${submit.properties.distinct_id}`,
        $user_id: `${submit.properties.distinct_id}`,
        Prompt: submit.properties.Prompt,
        $insert_id: `${newUUID}`,
        hasCondition,
        isResearch,
      },
      event: "Server Submit Test",
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
      const { proceed } = await inquirer.prompt({
        type: "confirm",
        name: "proceed",
        message: `Do you want to submit this event?\n${JSON.stringify(event, null, 2)}`,
      });

      if (proceed) {
        console.log("Submitting event:", event);
        const response = await axios.request(options);
        console.log("Response from Mixpanel:", response.data);
      } else {
        unmatchedEvents.push(submit);
      }
    } catch (error) {
      unmatchedEvents.push(submit);
      if (error instanceof AxiosError) {
        if (error.response?.data.failed_records) {
          console.error(
            "Failed records:",
            JSON.stringify(error.response.data.failed_records, null, 2),
          );
        }
      }
      console.error("Error submitting event:", error);
    }
  }

  return unmatchedEvents;
}

async function reviewPrompts(
  submitsWithConditions_: NewEvent[],
  noCondition_: NewEvent[],
  researchPrompts_: NewEvent[],
  noDbMatch_: NewEvent[],
) {
  let review = true;
  let submitsWithConditions = submitsWithConditions_;
  let noCondition = noCondition_;
  let researchPrompts = researchPrompts_;
  let noDbMatch = noDbMatch_;
  while (review) {
    const combinedPrompts = [
      ...submitsWithConditions.map((p) => ({
        ...p,
        type: "submitsWithConditions",
      })),
      ...noCondition.map((p) => ({ ...p, type: "noCondition" })),
      ...researchPrompts.map((p) => ({ ...p, type: "researchPrompts" })),
      ...noDbMatch.map((p) => ({ ...p, type: "noDbMatch" })),
    ];
    console.log("Combined prompts:", combinedPrompts.length);
    console.log(noCondition);
    console.log("break");
    console.log(researchPrompts);
    console.log("break2");

    let lastChange = null; // Track the last change made

    for (let i = 0; i < combinedPrompts.length; i++) {
      // console.log(i, combinedPrompts[i]);
      const prompt = combinedPrompts[i];
      const answer = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: `Review prompt: ${prompt.submit.properties.Prompt} (Current type: ${prompt.type})`,
          choices: [
            {
              name: "Move to submitsWithConditions",
              value: "submitsWithConditions",
            },
            { name: "Move to noCondition", value: "noCondition" },
            { name: "Move to researchPrompts", value: "researchPrompts" },
            { name: "Remove (move to noDbMatch)", value: "noDbMatch" },
            { name: "Undo last change", value: "undo" },
          ],
        },
      ]);

      if (answer.action === "undo") {
        if (lastChange && i > 0) {
          // Restore the previous state
          const { prompt: lastPrompt, fromType, toType } = lastChange;

          // Remove from current category
          switch (toType) {
            case "submitsWithConditions":
              submitsWithConditions = submitsWithConditions.filter(
                (p) =>
                  p.submit.properties.Prompt !==
                  lastPrompt.submit.properties.Prompt,
              );
              break;
            case "noCondition":
              noCondition = noCondition.filter(
                (p) =>
                  p.submit.properties.Prompt !==
                  lastPrompt.submit.properties.Prompt,
              );
              break;
            case "researchPrompts":
              researchPrompts = researchPrompts.filter(
                (p) =>
                  p.submit.properties.Prompt !==
                  lastPrompt.submit.properties.Prompt,
              );
              break;
            case "noDbMatch":
              noDbMatch = noDbMatch.filter(
                (p) =>
                  p.submit.properties.Prompt !==
                  lastPrompt.submit.properties.Prompt,
              );
              break;
          }

          // Add back to original category
          lastPrompt.type = fromType;
          switch (fromType) {
            case "submitsWithConditions":
              submitsWithConditions.push(lastPrompt);
              break;
            case "noCondition":
              noCondition.push(lastPrompt);
              break;
            case "researchPrompts":
              researchPrompts.push(lastPrompt);
              break;
            case "noDbMatch":
              noDbMatch.push(lastPrompt);
              break;
          }

          console.log(`Undid move from ${fromType} to ${toType}`);
          lastChange = null;
          i -= 2; // Go back two steps (one for the undo action, one for the previous prompt)
          continue;
        }
        console.log(lastChange, i, "No previous change to undo");
        i--; // Stay on current prompt
        continue;
      }

      // Store the change before making it
      lastChange = {
        prompt: { ...prompt },
        fromType: prompt.type,
        toType: answer.action,
      };

      if (prompt.type !== answer.action) {
        // Log the change
        console.log(`Moving prompt from ${prompt.type} to ${answer.action}`);

        // Remove the prompt from its current category
        switch (prompt.type) {
          case "submitsWithConditions":
            submitsWithConditions = submitsWithConditions.filter(
              (p) =>
                p.submit.properties.Prompt !== prompt.submit.properties.Prompt,
            );
            break;
          case "noCondition":
            noCondition = noCondition.filter(
              (p) =>
                p.submit.properties.Prompt !== prompt.submit.properties.Prompt,
            );
            break;
          case "researchPrompts":
            researchPrompts = researchPrompts.filter(
              (p) =>
                p.submit.properties.Prompt !== prompt.submit.properties.Prompt,
            );
            break;
          case "noDbMatch":
            noDbMatch = noDbMatch.filter(
              (p) =>
                p.submit.properties.Prompt !== prompt.submit.properties.Prompt,
            );
            break;
          default:
            console.log("Unknown type:", prompt.type);
            break;
        }

        // Update prompt type and add it to the new category
        prompt.type = answer.action;
        switch (answer.action) {
          case "submitsWithConditions":
            submitsWithConditions.push(prompt);
            break;
          case "noCondition":
            noCondition.push(prompt);
            break;
          case "researchPrompts":
            researchPrompts.push(prompt);
            break;
          case "noDbMatch":
            noDbMatch.push(prompt);
            break;
          default:
            console.log("Unknown action:", answer.action);
            break;
        }
      }
    }

    const proceed = await inquirer.prompt([
      {
        type: "confirm",
        name: "proceed",
        message:
          "Do you want to proceed with the current categorization? (Select No to review again)",
      },
    ]);

    review = !proceed.proceed;
  }
  console.log(noCondition);
  console.log("break3");
  console.log(researchPrompts);

  return { submitsWithConditions, noDbMatch, noCondition, researchPrompts };
}

/**
 * Main function to orchestrate the fetching, processing, and creation of Mixpanel events.
 */
async function main() {
  const lastXDays = 14; // Define the number of days to look back
  await initModels();
  await actionExecuteAdjustment(lastXDays);
  console.log("Populating embedded addresses...");
  await populateEmbedded(lastXDays);
  try {
    console.log("Fetching and processing Mixpanel events...");
    // Step 1: Fetch and identify the relevant Submit events from Mixpanel
    const submitEvents = await getEvents(lastXDays);

    console.log("Adding properties to the fetched events...");
    // Step 2: Enrich the fetched events with additional properties by querying the database
    const { submitsWithConditions, noDbMatch, noCondition, researchPrompts } =
      await addProperties(submitEvents);

    console.log("Reviewing the prompt categorization...");
    // Step 3: Review the prompt categorization
    const reviewedPrompts = await reviewPrompts(
      submitsWithConditions,
      noCondition,
      researchPrompts,
      noDbMatch,
    );

    console.log("Creating new events...");
    // Step 4: Prepare all events for submission
    const allEvents = [
      ...reviewedPrompts.submitsWithConditions.map((event) => ({
        ...event,
        hasCondition: true,
        isResearch: false,
      })),
      ...reviewedPrompts.noCondition.map((event) => ({
        ...event,
        hasCondition: false,
        isResearch: false,
      })),
      ...reviewedPrompts.researchPrompts.map((event) => ({
        ...event,
        hasCondition: false,
        isResearch: true,
      })),
    ];

    console.log("Submitting new events...");
    // Step 5: Send new events to Mixpanel for the events that have conditions
    if (!prodProjectId) {
      console.log("TERRIBLE ERROR");
      return;
    }
    const unmatchedEvents = await createNewEvents(allEvents, prodProjectId);

    console.log("Process complete.");
    // Log the results
    console.log("Unmatched events:", unmatchedEvents);
    console.log("No DB match events:", reviewedPrompts.noDbMatch);
  } catch (error) {
    console.error("Error in main function:", error);
  }
}

// Execute the main function
main();
