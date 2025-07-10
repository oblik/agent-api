import request from "supertest";
import app from "../../../app.js";

describe("Get New Prompts", () => {
  let lastTimestamp = 0;

  it("Should return an array of N prompts for a given timestamp", async () => {
    const timestamp = 1702561561;
    const res = await request(app).get(`/new-prompts?timestamp=${timestamp}`);

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
    expect(
      res.body.every(
        (entry: { prompt: string; timestamp: number }) =>
          typeof entry.prompt === "string" &&
          typeof entry.timestamp === "number",
      ),
    ).toBeTruthy();

    // Print out the array for debugging
    console.log(res.body);

    // Store the timestamp of the last object if the array is not empty
    if (res.body.length > 0) {
      lastTimestamp = res.body[res.body.length - 1].timestamp;
    }
  });

  it("Should return an empty array for the latest timestamp", async () => {
    // Use the stored timestamp value from the first test
    const res = await request(app).get(
      `/new-prompts?timestamp=${lastTimestamp}`,
    );

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
    expect(res.body).toHaveLength(0);
  });

  it("Should return an empty array for a future timestamp", async () => {
    const futureTimestamp = 1803870271;
    const res = await request(app).get(
      `/new-prompts?timestamp=${futureTimestamp}`,
    );

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
    expect(res.body).toHaveLength(0);
  });

  it("Should return an error for missing timestamp", async () => {
    const res = await request(app).get("/new-prompts");

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });
});
