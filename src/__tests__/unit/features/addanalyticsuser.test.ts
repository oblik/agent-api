import httpStatus from "http-status";
import request from "supertest";
import app from "../../../app.js";
import { Analytics } from "../../../db/index.js";

const backendSecret = process.env.BACKEND_TOKEN_SECRET;

describe("Add Analytics User", () => {
  // Before running the tests, ensure that the models are initialized
  // Test 1: Adding a user without providing a Discord ID
  it("should return an error when discord_id is not provided", async () => {
    const res = await request(app)
      .post(`/analytics-user-add?secret=${backendSecret}`)
      .send({});

    expect(res.statusCode).toEqual(httpStatus.BAD_REQUEST);
    expect(res.body).toHaveProperty("status", "error");
    expect(res.body).toHaveProperty(
      "message",
      'Bad request WHERE parameter "discord_id" has invalid "undefined" value',
    );
  });

  // Test 2: Creating a new user and then cleaning up
  it("should create a new user, verify in the database, return an error when trying to create the user again", async () => {
    const uniqueDiscordId = "shirtless_test";

    // Step 1: Create a new user
    const res = await request(app)
      .post(`/analytics-user-add?secret=${backendSecret}`)
      .send({ discord_id: uniqueDiscordId });

    expect(res.statusCode).toEqual(httpStatus.CREATED);
    expect(res.body).toHaveProperty("status", "success");

    // Step 2: Verify the user has been added in the database
    const user = await Analytics.findOne({
      where: { discord_id: uniqueDiscordId },
    });
    expect(user).not.toBeNull();
    expect(user?.discord_id).toEqual(uniqueDiscordId);

    // Step 3: Try to create the same user again
    const res2 = await request(app)
      .post(`/analytics-user-add?secret=${backendSecret}`)
      .send({ discord_id: uniqueDiscordId });

    expect(res2.statusCode).toEqual(httpStatus.CONFLICT);
    expect(res2.body).toHaveProperty("message", "User already exists");

    // Step 4: Cleanup - Delete the newly created user
    if (user) {
      await Analytics.destroy({ where: { discord_id: uniqueDiscordId } });
    }
  });
});
