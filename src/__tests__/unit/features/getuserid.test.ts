import request from "supertest";
import app from "../../../app.js";
import { Analytics } from "../../../db/index.js";

describe("Analytics User ID", () => {
  // Before running the tests, ensure that the models are initialized

  const uniqueDiscordId = "shirtless_test_2";
  const testAddress = "0x12345aA";

  // Test 1: Successful retrieval of user ID for a given external address
  it("should successfully retrieve user ID for a given external address", async () => {
    // Step 1: Create new user
    await Analytics.create({
      discord_id: uniqueDiscordId,
      externalAddresses: [testAddress.toLowerCase()],
    });

    const res = await request(app).get(
      `/get-analytics-user-id?externalAddress=${testAddress}`,
    );
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status", "success");
    expect(res.body).toHaveProperty("user_id");

    // Step 2: Cleanup - Delete the newly created user
    await Analytics.destroy({ where: { discord_id: uniqueDiscordId } });
  });

  // Test 2: Error for an external address not in the database
  it("should return an error for an external address not in the database", async () => {
    const address = "0x00000000219ab540356cbb839cbe05303d7705fa";
    const res = await request(app).get(
      `/get-analytics-user-id?externalAddress=${address}`,
    );
    expect(res.statusCode).toEqual(404);
    expect(res.body).toHaveProperty("status", "error");
    expect(res.body).toHaveProperty("message", "User does not exist");
  });

  // Test 3: Successful retrieval of user ID for a given Discord ID
  it("should successfully retrieve user ID for a given Discord ID", async () => {
    // Step 1: Create new user
    await Analytics.create({
      discord_id: uniqueDiscordId,
      externalAddresses: [testAddress.toLowerCase()],
    });

    const res = await request(app).get(
      `/get-analytics-user-id?discord_id=${uniqueDiscordId}`,
    );
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status", "success");
    expect(res.body).toHaveProperty("user_id");

    // Step 2: Cleanup - Delete the newly created user
    await Analytics.destroy({ where: { discord_id: uniqueDiscordId } });
  });

  // Test 4: Error for a Discord ID not in the database
  it("should return an error for a Discord ID not in the database", async () => {
    const res = await request(app).get(
      `/get-analytics-user-id?discord_id=${uniqueDiscordId}`,
    );
    expect(res.statusCode).toEqual(404);
    expect(res.body).toHaveProperty("status", "error");
    expect(res.body).toHaveProperty("message", "User does not exist");
  });

  // Test 5: Successful retrieval of user ID for a given embedded address
  it("should successfully retrieve user ID for a given embedded address", async () => {
    // Step 1: Create new user
    await Analytics.create({
      discord_id: uniqueDiscordId,
      embeddedAddresses: [testAddress.toLowerCase()],
    });

    const res = await request(app).get(
      `/get-analytics-user-id?embeddedAddress=${testAddress}`,
    );
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status", "success");
    expect(res.body).toHaveProperty("user_id");

    // Step 2: Cleanup - Delete the newly created user
    await Analytics.destroy({ where: { discord_id: uniqueDiscordId } });
  });

  // Test 6: Error for an embedded address not in the database
  it("should return an error for an embedded address not in the database", async () => {
    const address = "0x00000000219ab540356cbb839cbe05303d7705fa";
    const res = await request(app).get(
      `/get-analytics-user-id?embeddedAddress=${address}`,
    );
    expect(res.statusCode).toEqual(404);
    expect(res.body).toHaveProperty("status", "error");
    expect(res.body).toHaveProperty("message", "User does not exist");
  });

  // Test 7: Bad request error for no identifier provided
  it("should return a bad request error for no identifier provided", async () => {
    const res = await request(app).get("/get-analytics-user-id");
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status", "error");
    expect(res.body).toHaveProperty("message", "No identifier provided");
  });
});
