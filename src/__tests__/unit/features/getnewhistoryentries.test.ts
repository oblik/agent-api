import request from "supertest";
import app from "../../../app.js";

describe("Get New History Entries", () => {
  let lastTimestamp = 0;

  it("Should return an array of N entries for timestamp 1702487590225", async () => {
    const timestamp = 1702487590225;
    const res = await request(app).get(
      `/new-history-entries?timestamp=${timestamp}`,
    );

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
    expect(Number.isInteger(res.body.length)).toBeTruthy();

    // Print out the array
    console.log(res.body);

    for (const entry of res.body) {
      expect(entry).toHaveProperty("actions");
      expect(typeof entry.actions).toBe("number");

      expect(entry).toHaveProperty("timestamp");
      expect(typeof entry.timestamp).toBe("string");
    }

    // Store the timestamp of the last object if the array is not empty
    if (res.body.length > 0) {
      lastTimestamp = res.body[res.body.length - 1].timestamp;
    }
  });

  it("Should return an empty array for the latest timestamp", async () => {
    // Use the stored timestamp value from the first test
    const res = await request(app).get(
      `/new-history-entries?timestamp=${lastTimestamp}`,
    );

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
    expect(res.body).toHaveLength(0);
  });

  it("Should return an empty array for future timestamp 1802489312850", async () => {
    const timestamp = 1802489312850;
    const res = await request(app).get(
      `/new-history-entries?timestamp=${timestamp}`,
    );

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
    expect(res.body).toHaveLength(0);
  });

  it("Should return an error for missing timestamp", async () => {
    const res = await request(app).get("/new-history-entries");

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });
});
