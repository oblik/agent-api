import fs from "node:fs";
import axios from "axios";
import dotenv from "dotenv";
import { Op } from "sequelize";
import { Tracking, initModels } from "../src/db/index.js";

dotenv.config();

const authorizationMixpanel = process.env.MIXPANEL_AUTHORIZATION_2;

interface SubmitEvent {
  event: string;
  properties: {
    time: number;
    distinct_id: string;
    messageId: number;
    message: string;
  };
}

interface ExecutedEvent {
  event: string;
  properties: {
    time: number;
    distinct_id: string;
    messageId: number;
    message: string;
    Status: string;
  };
}

interface MatchedEvent {
  userId: string;
  prompt: string;
  messageId: number;
  posthog: string;
  time: number;
  blocker: string;
}

const distinctIdToUsername: Record<string, string> = {
  "423d9d47-63b0-4238-9685-5da658e66821": "busty_jd",
  "af5bc1f1-2eb4-4521-9e28-c151ca08e5a1": "0xkp",
  "c3234865-e9cb-4a1f-bad7-524f3245389a": "manito3369",
  "38fc46ba-0110-48df-b8e8-1703e465ed50": "saltypickle24",
  "701edb44-e937-48f5-b784-99df0198029d": "jshugs",
  "deb69860-77d8-4ffc-b1bd-1d100626f4a6": "mrlaidbacc_",
  "fa1cd359-7811-44dd-a9ec-4e69f3fd32d9": "_bagg",
  "95369e11-f9f6-4b6a-943b-01e943f53e33": "grimmonacci",
  "17ba76d4-ef0c-4e8f-873e-070efd81fb0c": "outperforming",
  "e36cea20-8300-4817-880a-019dc2e40581": "hwxfrank",
  "17b83ccd-7b21-444b-b089-f8d22a7a2b1a": "0x009",
  "82bf3ba0-cc82-454b-843b-e3d592628eae": "0xivan",
  "15447066-0704-4011-8c57-569dc6ddf59e": "shix0n",
  "d1368cba-34d3-41d7-90b8-362171a580cf": "dippuccino",
  "1df7f051-e953-4248-80cd-2ea627dc45a0": "akig",
  "c711fa0b-dfae-4e22-bfff-af0827a1bb96": "gemhunter8679",
  "fbc009a7-e9c6-4f53-a78e-eec0f6f784c1": "astha22",
  "4eec327f-2e13-42b7-9f2e-48acc95a0fae": "cryon.eth",
  "f58617b4-24b5-44b2-a2c1-e730a3e7f76c": "r3lentless",
  "55e2f84a-33ca-4715-844e-1bdbd6065759": "ndscrypt",
  "cfa468d2-3e07-4d33-8dde-7821cb760a8d": "mehdi.mhd",
  "4ea21461-54fa-412f-9cbe-6940fe4e30c2": "pussy5layer666",
  "fed5b4e2-caaa-4aeb-8f0c-84e5bea148d3": "lezzybruv",
  "5bed384e-b3af-4b3c-9598-7ad1cbd8f60e": "d_knght",
  "68d8164a-b2fd-4579-8e6e-7f48d130f859": "verquer",
  "b6b01ecc-6538-4d14-ba9f-7ad9c9d35355": "manuelmindx",
  "52fadf7a-9e82-4d88-97ec-f27521770bff": "jerame20",
  "4536baec-dccd-4eb5-a779-2ab19c88fab6": "Meynad#4251",
  "8e8b73fe-4361-46ee-b96c-bb1c6b9c942b": "gconcept",
  "371aad77-7a48-4f24-a52f-f4486b82ba8e": "_xhades_",
  "779f0143-5710-45d7-a71b-0e3d6a4f9e03": "witcheer",
  "a9cec308-0696-4d2a-abb7-4b50cf359be4": "daochemist",
  "276394ac-6099-4f61-9952-6e17c33ec917": "Tobyyy#6658",
  "7dd29df3-90d1-4abc-b122-b6f0ca3730b7": "noral",
  "22f7f493-7249-4887-bf45-be25a4c08bab": "chadnik",
  "c8d1cf9d-eda9-4145-8fb0-0fafcafae395": "thebigskuu",
  "5e1ffe8b-ee74-4d72-b645-5c98e78ae96f": ".meaningoflife",
  "4ffcd856-d407-446c-accb-4aef467779c9": "0xmedivh",
  "aa00949a-6c81-4861-94a0-b0bd9fc7b848": "pasaift",
  "3e42204a-3bc3-4460-aff2-6b19733dfd7e": "zk0t",
  "79ec8b10-a781-4f08-8ce8-d0ccc3d86ae2": "vic9000",
  "accc3289-7516-4c1a-9eca-a51d87b5ebac": "hydroboat",
  "da5769cc-1769-495a-9210-6977add3e5eb": "veggiechicken",
  "3cb28945-238e-4e12-84db-46a929478932": "0xn4r",
  "9dd5af22-469f-45c4-8e33-9a872ed5e0de": "voiced_007",
  "f6c6c75a-b373-4213-a03b-d77572504586": "philipp668",
  "95f3fbe4-6e22-4529-b614-2842438239cc": "gokubutwithnohair",
  "0dc5f81a-f40d-4719-96a0-fc70d0ee206d": "kayy0727",
  "40f38df1-f9e2-4723-9305-ccbe7148348a": "thade",
  "88a6b3cd-4e99-4a24-8cd5-00ff49d6c34a": "lazer420",
  "6f757ed9-f92c-446c-b52e-e1b9032589b1": "coolthecool",
  "3a19ba81-6e7a-4a9d-93dc-461dd8436e35": "darkfingah",
  "326ffb21-fe5d-400a-b7de-3e3695d732e4": "degenoccultist",
  "770342fd-00a7-47f2-8d3f-63189f5815ff": "bill_researcher",
  "6ef41ff4-ab39-4609-aa84-515459e52fe7": "yedamax",
  "81c128ee-1800-4dfa-bbc0-ba3a4a26bb27": "_rebenga",
  "3a2bfa84-6b06-4526-a685-3d6d18d5724f": "trembl3",
  "1d3e5575-f94e-412d-b5f9-072f0d0c5e5e": "tyro90",
  "81c7feaf-2cf5-401f-a1d6-90ae11016d69": "sngwinner",
  "bd5f93ba-4df1-40cc-91df-712aed7f974b": "dr.bouma",
  "047d3cab-87bb-4744-b900-fecb129406f1": "0xsik",
  "62a45beb-fa8a-4ae9-800b-21e00d13977a": "frans6cur",
  "ced11682-1ad1-4ba1-a0d6-8a0b7518caaf": "jacq404",
  "2e4fdc35-5d54-4a3b-817b-cbc8f45fd602": "btcjev",
  "376e7843-1d15-4175-89c6-52230a8923fa": "turnssy",
  "d6d95a14-b12f-4209-96a6-c73cabbdc5e8": "alu23",
  "b6101b58-8a40-4737-b6af-3b7c87c4517c": "0xjulio",
  "fd6e126d-739d-4cf1-a64a-0b8702a2cff6": "natgan",
  "f71a372d-145c-4e17-95e9-3c50f527eabd": "mjul23",
  "50a11759-444c-4586-80d5-2f2610dfcec2": "cryptato",
  "6b95ec89-563c-4555-9a2e-f42346100495": "kalius",
  "d3df51f8-0f71-470b-87e5-ff7e77a6c56e": "panos7564",
  "a92a48b1-4b9c-459e-878d-98d56d197d34": "pableoo",
  "0c02e201-b8ea-4150-98d7-c37d7f2a6959": "0xotf",
  "e17890ba-21f1-49fd-8de4-2b6562aa3fd8": "jus_izzy",
  "98870565-d26b-430b-bdc6-6a3e40d0c307": "yanniksood",
  "1ab9a99f-d4b4-456f-9601-296a5edb55bd": "0xcryptus",
  "8b0ec35e-ce59-40c5-a6c1-d88a94ac6e6d": "tanthaip",
  "8a947572-5f15-4f9c-bf88-38b1063863ec": "hhjacks",
  "26e539b1-9a11-472d-bf19-a233a208c90e": "ericuuuh",
  "731b5960-8d9f-4076-a047-5f199b11a9b2": "altcoinclimber",
  "466c8164-ef08-41bd-bec2-2c434e9697de": "0xgrantland",
  "b480ca93-6ee5-45a0-a55c-d0d5b69431b9": "nat_again",
  "786222be-be1d-42a0-9749-c0c564ecd33f": "ticklebutt",
  "e27997a1-3f70-4d68-8187-4a60e48318ac": "0xmummy",
  "0be098f5-7751-4e7d-9ec2-ca86f006884e": "elwhy02",
  "c764b45c-3f55-462e-950f-a1b77ce64b22": "truly_yobez",
  "3dcfc887-bfdc-4b48-a61a-62a198f42ab9": "jeffjeffjeff420",
  "abd77719-b82e-490f-86f1-7ac1eb4eb57c": "themetaisok",
  "6b4161e0-59f3-44a1-8e6b-e331374218f6": "jia0420",
  "7ccaad25-ae44-4dfe-ace0-db48768d8e0c": "roadsailing",
  "888a9f23-5b6e-4d34-9620-bb0fcdebab87": "hewwo",
  "d8776299-2d08-47fb-bf35-aa37e5a7b8d8": "ilovejesus7",
  "18714109-c073-4b0c-a71c-914a0dc07081": "rbollo",
  "20500dbb-8886-4386-b57f-f62dc8db9dcc": "papacito",
  "c7a5a3c6-3aba-46e4-b0c7-4d4a50790e03": "tg1",
  "04b2c88f-5944-4df7-a535-0dd6f7b8ee23": "zlerp",
};

async function getPosthogLinks(
  messageIds: number[],
): Promise<Record<number, string>> {
  try {
    await initModels();

    const validMessageIds = messageIds.filter(
      (id) => id && !Number.isNaN(id) && id > 0,
    );

    const trackingResults = await Tracking.findAll({
      where: {
        id: {
          [Op.in]: validMessageIds,
        },
      },
      attributes: ["id", "posthog"],
    });

    return trackingResults.reduce((acc: Record<number, string>, row) => {
      acc[row.get("id")] = row.get("posthog") || "";
      return acc;
    }, {});
  } catch (error) {
    console.error("Error fetching PostHog links:", error);
    return {};
  }
}

async function fetchMixpanelData(
  event: string,
  fromDate: string,
  toDate: string,
): Promise<SubmitEvent[] | ExecutedEvent[]> {
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

    if (typeof data === "string") {
      return data
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    }

    return Array.isArray(data) ? data : [data];
  } catch (error) {
    console.error(`Error fetching ${event} data:`, error);
    throw error;
  }
}

function validateEventMatches(
  submitEvent: SubmitEvent,
  matchingExecutedEvents: ExecutedEvent[],
): ExecutedEvent | null {
  const submitTime = submitEvent.properties.time;

  const withinTimeWindow = matchingExecutedEvents.filter((event) => {
    return event.properties.messageId === submitEvent.properties.messageId;
  });

  if (withinTimeWindow.length > 0) {
    return withinTimeWindow.reduce((closest, current) => {
      const closestDiff = Math.abs(closest.properties.time - submitTime);
      const currentDiff = Math.abs(current.properties.time - submitTime);
      return currentDiff < closestDiff ? current : closest;
    });
  }

  return null;
}

async function main() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 14);

  const fromDate = startDate.toISOString().split("T")[0];
  const toDate = endDate.toISOString().split("T")[0];

  try {
    console.log("Fetching Action Submitted events...");
    const submitEvents = (await fetchMixpanelData(
      "Action Submitted",
      fromDate,
      toDate,
    )) as SubmitEvent[];

    console.log("Fetching Action Executed events...");
    const executedEvents = (await fetchMixpanelData(
      "Action Executed",
      fromDate,
      toDate,
    )) as ExecutedEvent[];

    // Create messageId-to-events map for executed events
    const executedEventMap = new Map<number, ExecutedEvent[]>();
    for (const event of executedEvents) {
      const messageId = event.properties.messageId;
      if (!executedEventMap.has(messageId)) {
        executedEventMap.set(messageId, []);
      }
      executedEventMap.get(messageId)?.push(event);
    }

    const messageIds = submitEvents.map((event) => event.properties.messageId);
    console.log("Fetching PostHog links from database...");
    const posthogLinks = await getPosthogLinks(messageIds);

    // Process and match events
    const matchedEvents: MatchedEvent[] = [];
    const processedExecutedEvents = new Set<number>();

    for (const submitEvent of submitEvents) {
      const messageId = submitEvent.properties.messageId;
      const matchingExecutedEvents = executedEventMap.get(messageId) || [];

      let matchedExecutedEvent: ExecutedEvent | null = null;

      if (matchingExecutedEvents.length > 0) {
        matchedExecutedEvent = validateEventMatches(
          submitEvent,
          matchingExecutedEvents,
        );

        if (matchedExecutedEvent) {
          const executedTime = matchedExecutedEvent.properties.time;
          if (processedExecutedEvents.has(executedTime)) {
            const duplicateSubmits = submitEvents.filter((submit) => {
              const matchingExecuted =
                executedEventMap.get(submit.properties.messageId) || [];
              return matchingExecuted.some(
                (exec) => exec.properties.time === executedTime,
              );
            });

            console.log("Duplicate matching submit events:", duplicateSubmits);
            console.log("Action executed event:", matchedExecutedEvent);

            throw new Error(
              `Action Executed event at time ${executedTime} matches multiple Submit events`,
            );
          }
          processedExecutedEvents.add(executedTime);
        }
      }

      matchedEvents.push({
        userId: submitEvent.properties.distinct_id,
        prompt: submitEvent.properties.message,
        messageId: submitEvent.properties.messageId,
        posthog: posthogLinks[messageId] || "",
        time: submitEvent.properties.time,
        blocker: matchedExecutedEvent
          ? matchedExecutedEvent.properties.Status.toLowerCase() === "failed"
            ? "failed"
            : "success"
          : "none",
      });
    }

    matchedEvents.sort((a, b) => b.time - a.time);

    // Generate CSV
    const csvHeader = "User ID\tPrompt\tID\tPosthog\tTime\tBlocker\n";
    const csvRows = matchedEvents
      .map(
        (event) =>
          `${distinctIdToUsername[event.userId] || event.userId}\t"${
            event.prompt
          }"\t${event.messageId}\t${event.posthog}\t${event.time}\t${
            event.blocker
          }`,
      )
      .join("\n");

    fs.writeFileSync("event_matches.csv", csvHeader + csvRows);
    console.log("CSV file generated successfully: event_matches.csv");

    // Calculate overall percentages
    const total = matchedEvents.length;
    const statusCounts = matchedEvents.reduce(
      (acc, event) => {
        acc[event.blocker] = (acc[event.blocker] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    console.log("\nOverall Summary:");
    const orderOfStatus = ["success", "none", "failed"];
    for (const status of orderOfStatus) {
      const count = statusCounts[status] || 0;
      const percentage = ((count / total) * 100).toFixed(1);
      console.log(`${status}: ${count} (${percentage}%)`);
    }

    // Calculate per-user percentages
    const userStats = matchedEvents.reduce(
      (acc, event) => {
        if (!acc[event.userId]) {
          acc[event.userId] = {
            total: 0,
            success: 0,
            failed: 0,
            none: 0,
          };
        }
        acc[event.userId].total += 1;
        acc[event.userId][
          event.blocker as keyof (typeof acc)[typeof event.userId]
        ] += 1;
        return acc;
      },
      {} as Record<
        string,
        {
          total: number;
          success: number;
          failed: number;
          none: number;
        }
      >,
    );

    console.log("\nPer-User Summary:");
    for (const userId in userStats) {
      console.log(`\nUser ${distinctIdToUsername[userId] || userId}:`);
      const stats = userStats[userId];
      for (const status of orderOfStatus) {
        const count = stats[status as keyof typeof stats];
        const percentage = ((count / stats.total) * 100).toFixed(1);
        console.log(`${status}: ${count} (${percentage}%)`);
      }
    }

    // Log summary
    console.log("\nSummary:");
    console.log(`Total Submit Events: ${submitEvents.length}`);
    console.log(`Total Action Executed Events: ${executedEvents.length}`);
    console.log(`Processed Matches: ${matchedEvents.length}`);
  } catch (error) {
    console.error("Error processing events:", error);
    process.exit(1);
  }
}

main();
