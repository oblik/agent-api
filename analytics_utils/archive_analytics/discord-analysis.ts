import fs from "node:fs";
import readline from "node:readline";
import csv from "csv-parser";
import moment from "moment";
import type { BotStartData } from "../types.js";

const rl = readline.createInterface({
  //@ts-ignore
  input: process.stdin,
  output: process.stdout,
});

let dataObjects: BotStartData[] = [];
let tempData: Record<string, Record<string, number[]>> = {}; // Temporarily holds Mixpanel data
let statBotData: Record<string, { messages: number[]; members: number[] }> = {}; // Temporarily holds StatBot data
let earliestMixpanelDate: moment.Moment | null = null;
let duplicatedObjects: BotStartData[] = [];

function promptForFilePaths() {
  // Reinitialize data structures to ensure clean state
  statBotData = {}; // Clear previous data
  tempData = {}; // Clear if needed
  dataObjects = []; // Clear if needed
  earliestMixpanelDate = null; // Reset if needed

  rl.question("Enter the path to your Mixpanel CSV file: ", (mixpanelPath) => {
    processMixpanelData(mixpanelPath, () => {
      rl.question(
        "Enter the path to your Slater StatBot CSV file: ",
        (statBotPath) => {
          processStatBotData(statBotPath);
        },
      );
    });
  });
}

function processMixpanelData(filePath: string, callback: () => void) {
  fs.createReadStream(filePath)
    //@ts-ignore
    .pipe(csv())
    .on("data", (row) => {
      const currentDate = moment(row.Date, "YYYY-MM-DD");
      if (!earliestMixpanelDate || currentDate.isBefore(earliestMixpanelDate)) {
        earliestMixpanelDate = currentDate;
      }
      const date = moment(row.Date, "YYYY-MM-DD");
      const isTuesdayOrFriday = date.day() === 2 || date.day() === 5;
      const isWednesdayOrSaturday = date.day() === 3 || date.day() === 6;

      if (isTuesdayOrFriday || isWednesdayOrSaturday) {
        const pairDay = moment(date)
          .add(isTuesdayOrFriday ? 1 : -1, "days")
          .format("M/D/YY");
        const timeRange = isTuesdayOrFriday
          ? `${date.format("M/D/YY")}-${pairDay}`
          : `${pairDay}-${date.format("M/D/YY")}`;

        if (!tempData[timeRange]) {
          tempData[timeRange] = {
            "A. Log In [Unique Users]": [],
            "B. Log In [Total Events]": [],
            "C. Has Typed [Unique Users]": [],
            "D. Has Typed [Total Events]": [],
          };
        }

        const eventKey = row.Event.trim();
        const columns: string[] = Object.values(row);
        const eventValue = Number.parseFloat(columns[2]) || 0; // Assuming the value is always in the third column

        if (tempData[timeRange][eventKey] !== undefined) {
          tempData[timeRange][eventKey].push(eventValue);
        }
      }
    })
    .on("end", () => {
      console.log("Mixpanel data processed.");
      callback(); // Proceed to process StatBot data
    });
}

function processStatBotData(filePath: string) {
  fs.createReadStream(filePath)
    //@ts-ignore
    .pipe(csv())
    .on("data", (row) => {
      const timestamp = moment.utc(row.timestamp);
      const dayPair = timestamp.format("M/D/YY");
      if (!statBotData[dayPair]) {
        statBotData[dayPair] = { messages: [], members: [] };
      }
      statBotData[dayPair].messages.push(Number.parseInt(row.message, 10));
      statBotData[dayPair].members.push(Number.parseInt(row.members, 10));
    })
    .on("end", () => {
      console.log("StatBot Slater data processed.");
      mergeDataAndCalculateAverages();
    });
}

function mergeDataAndCalculateAverages() {
  console.log("Starting to merge data and calculate averages...");

  Object.keys(tempData).forEach((timeRange, _) => {
    const [startDateStr, endDateStr] = timeRange.split("-");

    let messageSum = 0;
    let memberSum = 0;
    let dayCount = 0;

    for (
      let m = moment(startDateStr, "M/D/YY");
      m.isSameOrBefore(moment(endDateStr, "M/D/YY"));
      m.add(1, "days")
    ) {
      const dayKey = m.format("M/D/YY");
      if (statBotData[dayKey]) {
        dayCount++;
        messageSum += statBotData[dayKey].messages.reduce(
          (acc, val) => acc + val,
          0,
        );
        memberSum += statBotData[dayKey].members.reduce(
          (acc, val) => acc + val,
          0,
        );
      }
    }

    const discordMsgsAvg = dayCount > 0 ? messageSum / dayCount : 0;
    const discordUsersAvg = dayCount > 0 ? memberSum / dayCount : 0;

    const events = tempData[timeRange];
    dataObjects.push({
      startDate: startDateStr,
      endDate: endDateStr,
      userLogIns: average(events["A. Log In [Unique Users]"]),
      totalLogIns: average(events["B. Log In [Total Events]"]),
      userHasTypes: average(events["C. Has Typed [Unique Users]"]),
      totalHasTypes: average(events["D. Has Typed [Total Events]"]),
      discordMsgs: discordMsgsAvg,
      discordUsers: discordUsersAvg,
    });
  });

  if (dataObjects.length > 1) {
    const earliestDate = moment(earliestMixpanelDate, "YYYY-MM-DD");
    console.log(
      `Earliest Mixpanel Date: ${earliestDate.format("YYYY-MM-DD")} (${earliestDate.format("dddd")})`,
    );

    if (earliestDate.day() === 3 || earliestDate.day() === 6) {
      console.log(
        "Removing the first object from dataObjects based on the day of the week criteria (Wednesday or Saturday).",
      );
      dataObjects.shift(); // Removes the first object from the array
    }
  }

  console.log(
    "\nSlater Discord, Login, Has Typed Average (within time range) Data: \n",
    dataObjects,
  );

  // Step 1: Duplicate dataObjects and modify the duplicate
  duplicatedObjects = JSON.parse(JSON.stringify(dataObjects)).map(
    (obj: BotStartData) => {
      // Keep only the properties you need, effectively removing the others
      return {
        startDate: obj.startDate,
        endDate: obj.endDate,
        discordMsgs: obj.discordMsgs,
        discordUsers: obj.discordUsers,
      };
    },
  );

  // Step 3: Prompt user for the non-user StatBot CSV file path
  rl.question(
    "Enter the path to your non-user StatBot CSV file: ",
    (nonUserStatBotPath) => {
      processNonUserStatBotData(nonUserStatBotPath, () => {
        console.log(
          "\nModified Slater Discord Data (Non-User): \n",
          duplicatedObjects,
        );
        rl.close(); // Ensure this is the last call to rl to avoid closing it prematurely
      });
    },
  );
}

function processNonUserStatBotData(filePath: string, callback: () => void) {
  const tempNonUserStatBotData: Record<
    string,
    { messages: number[]; members: number[] }
  > = {};

  fs.createReadStream(filePath)
    //@ts-ignore
    .pipe(csv())
    .on("data", (row) => {
      const timestamp = moment.utc(row.timestamp).format("M/D/YY");
      if (!tempNonUserStatBotData[timestamp]) {
        tempNonUserStatBotData[timestamp] = { messages: [], members: [] };
      }
      tempNonUserStatBotData[timestamp].messages.push(
        Number.parseInt(row.message, 10) || 0,
      );
      tempNonUserStatBotData[timestamp].members.push(
        Number.parseInt(row.members, 10) || 0,
      );
    })
    .on("end", () => {
      // Iterate over duplicatedObjects to update discordMsgs and discordUsers
      duplicatedObjects.forEach((obj, _) => {
        let messageSum = 0;
        let memberSum = 0;
        let dayCount = 0;

        for (
          let m = moment(obj.startDate, "M/D/YY");
          m.isSameOrBefore(moment(obj.endDate, "M/D/YY"));
          m.add(1, "days")
        ) {
          const dayKey = m.format("M/D/YY");
          if (tempNonUserStatBotData[dayKey]) {
            const dayData = tempNonUserStatBotData[dayKey];
            messageSum += dayData.messages.reduce((acc, val) => acc + val, 0);
            memberSum += dayData.members.reduce((acc, val) => acc + val, 0);
            dayCount += 1;
          }
        }

        if (dayCount > 0) {
          obj.discordMsgs = messageSum / dayCount;
          obj.discordUsers = memberSum / dayCount;
        } else {
          console.log(
            `No data to update for range ${obj.startDate} to ${obj.endDate}`,
          );
        }
      });

      callback(); // Signal completion
    });
}

function average(arr: number[]) {
  return arr.length ? arr.reduce((acc, val) => acc + val, 0) / arr.length : 0;
}

promptForFilePaths();
