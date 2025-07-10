import { execSync } from "node:child_process";
import fs from "node:fs";

// Function to extract test names from the Jest file
function extractTestNames(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf8");
  const matches = content.match(/it\(['"](.*?)['"]/g);
  if (!matches) return [];

  return matches
    .map((match) => match.match(/['"](.*?)['"]/)?.[1])
    .filter((name): name is string => name !== undefined);
}

// Function to shuffle an array using Fisher-Yates algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Function to run random samples
function runRandomSamples(filePath: string, sampleSize: number) {
  const allTests = extractTestNames(filePath);

  // Shuffle all tests and take the first n tests
  const shuffledTests = shuffleArray(allTests);
  const selectedTests = shuffledTests.slice(0, sampleSize);

  const testNamePattern = selectedTests
    .map((name: string) => name.replace(/[[\]]/g, "\\$&"))
    .join("|");
  const command = `yarnpkg build; yarnpkg test ${filePath} -t "${testNamePattern}"`;

  console.log(`Running ${selectedTests.length} random tests:`);
  console.log(selectedTests.join("\n"));
  console.log("\nCommand:", command);

  execSync(command, { stdio: "inherit" });
}

// Usage
const filePath = "build/src/__tests__/integration/index.test.js";
const sampleSize = Number.parseInt(process.argv[2], 10);

if (Number.isNaN(sampleSize) || sampleSize <= 0) {
  console.error("Please provide a valid positive integer for the sample size.");
  process.exit(1);
}

runRandomSamples(filePath, sampleSize);
