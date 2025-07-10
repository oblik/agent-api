import axios from "axios";
import dotenv from "dotenv";
import { Analytics } from "../src/db/index.js";

dotenv.config();
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
) {
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

    if (!data.trim()) {
      // If data is empty or just whitespace, return an empty array
      return [];
    }

    return data
      .trim()
      .split("\n")
      .map((line: string) => JSON.parse(line));
  } catch (error) {
    console.error("Error fetching Mixpanel data:", error);
    throw error;
  }
}

/**
 * Main function to orchestrate the fetching of Mixpanel events and population of DB records.
 * @param {number} lastXDays - The number of days to look back for events.
 */
export default async function populateEmbedded(lastXDays: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lastXDays);
  const fromDate = startDate.toISOString().split("T")[0];
  const toDate = new Date().toISOString().split("T")[0];

  const logInEvents = await fetchMixpanelData("Log In", fromDate, toDate);

  for (const event of logInEvents) {
    const distinctId = event.properties.distinct_id;
    const embeddedAddress = event.properties["Embedded Address"];

    if (
      !distinctId.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )
    ) {
      continue;
    }

    const user = await Analytics.findOne({ where: { user_id: distinctId } });

    if (user) {
      const lowercaseAddress = embeddedAddress.toLowerCase();
      // Initialize embeddedAddresses if it's null or not an array
      if (!Array.isArray(user.embeddedAddresses)) {
        user.embeddedAddresses = [];
      }

      // make sure the embedded address is not already in the array
      if (user.embeddedAddresses.includes(lowercaseAddress)) {
        continue;
      }

      // Add external address to user
      user.set("embeddedAddresses", [
        ...user.embeddedAddresses,
        lowercaseAddress,
      ]);
      await user.save();
    } else {
      console.log(`User with distinct ID ${distinctId} not found`);
    }
  }
}
