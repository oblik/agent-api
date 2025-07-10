import { error } from "node:console";
import fs from "node:fs";
import readline from "node:readline";
import csv from "csv-parser";
import moment from "moment-timezone";
import type { BucketError } from "./types.js";

const rl = readline.createInterface({
  //@ts-ignore
  input: process.stdin,
  output: process.stdout,
});

const categories: Record<string, string[]> = {
  "Prompt Scope": [
    "Missing Entity Response",
    "Missing Protocol Action Combo Response",
    "Missing Protocol Chain Combo Response",
    "Missing Protocol Chain Pool Combo Response",
  ],
  "Insufficient Embedded Wallet Funds": [
    "Not enough gas",
    "insufficient funds",
    "Not enough",
    "No tokens",
    "on your embedded wallet",
  ],
  Syntax: [
    "Token symbol or chain name",
    "Can't bridge between the same chain",
    "Invalid recipient provided",
    "Amount is invalid",
  ],
  Product: [],
};

function jaccardSimilarity(str1: string, str2: string) {
  const set1 = new Set(str1.split(" "));
  const set2 = new Set(str2.split(" "));
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

function categorizeMessage(message: string) {
  for (const category in categories) {
    if (categories[category].some((term) => message.includes(term))) {
      return category;
    }
  }
  return "Product"; // Default category if no matches are found
}

function promptForKeyPhrase(errorsArray: BucketError[]) {
  rl.question(
    "\nLook up error objects with key phrase (Ctrl+C to exit): ",
    (inputPhrase) => {
      const searchTerm = inputPhrase.toLowerCase();
      const matchingErrors = errorsArray.filter((errorObj) => {
        return Object.values(errorObj).some((value) =>
          String(value).toLowerCase().includes(searchTerm),
        );
      });

      if (matchingErrors.length > 0) {
        console.log("\nMatching error objects:\n");
        matchingErrors.forEach((error, index) => {
          console.log(`${index + 1}:`, error);
        });
      } else {
        console.log("\nNo matching error objects found.");
      }

      // After displaying results, re-prompt for a new key phrase
      promptForKeyPhrase(errorsArray);
    },
  );
}

rl.question("Please enter the path to your CSV file: ", (path) => {
  const errorsArray: BucketError[] = [];
  const errorsNeedingPrompts: number[] = []; // Queue to track errors needing prompts

  fs.createReadStream(path)
    //@ts-ignore
    .pipe(csv())
    .on("data", (row) => {
      if (
        row["Event Name"] === "Notification" &&
        row["Notification Type"] === "Error"
      ) {
        const cleanedMessage = row.Message.replace(
          /You have \d+(\.\d+)? and need \d+(\.\d+)?\./g,
          "",
        ).trim();
        const category = categorizeMessage(cleanedMessage);
        const timeStamp = moment.unix(row.Time).tz("America/New_York").format(); // Convert Unix time to datetime EST

        const errorObj = {
          userID: row["User ID"],
          timeStamp: timeStamp,
          error: cleanedMessage,
          bucket: category,
          prompt: "", // Initially empty, to be updated when a prompt is found
        };

        errorsArray.push(errorObj);
        errorsNeedingPrompts.push(errorsArray.length - 1); // Add index of this error to the queue
      } else if (row.Prompt && row.Prompt.trim() !== "") {
        // Iterate over all errors needing prompts and assign the current prompt to them
        errorsNeedingPrompts.forEach((errorIndex, _) => {
          if (errorsArray[errorIndex].prompt === "") {
            // Check if the error has no prompt yet
            errorsArray[errorIndex].prompt = row.Prompt;
          }
        });
        errorsNeedingPrompts.length = 0; // Clear the queue as all waiting errors have been assigned the current prompt
      }
    })
    .on("end", () => {
      console.log("CSV file successfully processed\n");
      console.log("TOTALS\n");

      // Count errors per bucket and print
      const bucketCounts = errorsArray.reduce(
        (acc, error) => {
          acc[error.bucket] = (acc[error.bucket] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      Object.entries(bucketCounts).forEach(([bucket, count], _) => {
        console.log(`${bucket} : ${count}`);
      });

      // For each bucket, find unique errors and count occurrences
      const errorsWithPromptsByBucket: {
        [key: string]: { [key: string]: { count: number; prompts: string[] } };
      } = errorsArray.reduce(
        (acc, error) => {
          if (!acc[error.bucket]) acc[error.bucket] = {};
          if (!acc[error.bucket][error.error])
            acc[error.bucket][error.error] = { count: 0, prompts: [] }; // Use an array for prompts
          acc[error.bucket][error.error].count += 1;
          acc[error.bucket][error.error].prompts.push(error.prompt); // Push every prompt, allowing duplicates
          return acc;
        },
        {} as Record<
          string,
          Record<string, { count: number; prompts: string[] }>
        >,
      );

      // Print the unique errors, their counts, and all associated prompts (including duplicates)
      Object.entries(errorsWithPromptsByBucket).forEach(
        ([bucket, errors], _) => {
          console.log(`\n${bucket}:`);
          Object.entries(errors).forEach(([error, { count, prompts }], _) => {
            console.log(`${count}: ${error}`);
            // Print all associated prompts for each unique error, including duplicates
            prompts.forEach((prompt, _) => {
              console.log(`"${prompt}"`); // Print each prompt
              // Print each timestamp for the prompt
              errorsArray.forEach((errorObj, _) => {
                if (errorObj.error === error && errorObj.prompt === prompt) {
                  console.log(errorObj.timeStamp);
                }
              });
            });
          });
        },
      );

      // Duplicate the errorsArray for manipulation
      const uniqueErrorsArray = [...errorsArray];

      // Identify and remove non-unique errors
      for (let i = 0; i < uniqueErrorsArray.length; i++) {
        const currentError = uniqueErrorsArray[i];
        for (let j = i + 1; j < uniqueErrorsArray.length; j++) {
          const comparisonError = uniqueErrorsArray[j];

          // Proceed if errors are in the same bucket
          if (currentError.bucket === comparisonError.bucket) {
            const jaccardScore = jaccardSimilarity(
              currentError.prompt,
              comparisonError.prompt,
            );

            // Check conditions for uniqueness
            if (
              jaccardScore >= 0.6 &&
              currentError.error === comparisonError.error &&
              currentError.userID === comparisonError.userID
            ) {
              // Remove the duplicate error
              uniqueErrorsArray.splice(j, 1);
              j--; // Adjust index after removal
            }
          }
        }
      }

      console.log("\nUNIQUES\n");

      // Count unique errors per bucket and print, similar to the "Totals" report
      const uniqueBucketCounts = uniqueErrorsArray.reduce(
        (acc, error) => {
          acc[error.bucket] = (acc[error.bucket] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      Object.entries(uniqueBucketCounts).forEach(([bucket, count], _) => {
        console.log(`${count}: ${bucket}`);
      });

      // Aggregate unique errors by bucket, similar to the earlier detailed report
      const errorsWithPromptsByUniqueBucket: {
        [key: string]: { [key: string]: { count: number; prompts: string[] } };
      } = uniqueErrorsArray.reduce(
        (acc, error) => {
          if (!acc[error.bucket]) acc[error.bucket] = {};
          if (!acc[error.bucket][error.error])
            acc[error.bucket][error.error] = { count: 0, prompts: [] };
          acc[error.bucket][error.error].count += 1;
          if (
            error.prompt &&
            !acc[error.bucket][error.error].prompts.includes(error.prompt)
          ) {
            acc[error.bucket][error.error].prompts.push(error.prompt);
          }
          return acc;
        },
        {} as Record<
          string,
          Record<string, { count: number; prompts: string[] }>
        >,
      );

      // Print the unique errors, their counts, and all associated prompts
      Object.entries(errorsWithPromptsByUniqueBucket).forEach(
        ([bucket, errors], _) => {
          console.log(`\n${bucket}:`);
          Object.entries(errors).forEach(([error, { count, prompts }], _) => {
            console.log(`${count}: ${error}`);
            prompts.forEach((prompt, _) => {
              console.log(`"${prompt}"`);
              // Print each timestamp for the prompt
              errorsArray.forEach((errorObj, _) => {
                if (errorObj.error === error && errorObj.prompt === prompt) {
                  console.log(errorObj.timeStamp);
                }
              });
            });
          });
        },
      );

      promptForKeyPhrase(errorsArray);
    })
    .on("error", (error) => {
      console.error("Error reading CSV file:", error);
      rl.close();
    });
});
