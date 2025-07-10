import httpStatus from "http-status";
import request from "supertest";
import app from "../../../app.js";
import { Analytics } from "../../../db/index.js";

const endpoint = `/analytics-user-update?secret=${process.env.BACKEND_TOKEN_SECRET}`;

describe("Update Analytics User", () => {
  // Before running the tests, ensure that the models are initialized
  const uniqueDiscordId = "shirtless_test_3";
  const testAddress = "0x23456aA";
  const uniqueDiscordId2 = "shirtless_test_4";
  const testAddress2 = "0x34567aA";

  // Test 1: Attempting to update a user with a non-existent user_id
  it("should return an error when user_id is not found", async () => {
    const nonExistentUserId = "71e5460a-7910-4c00-9258-5c083f7e378b";
    const externalAddress = "0x00000000219ab540356cbb839cbe05303d7705fa";

    const res = await request(app)
      .post(endpoint)
      .send({ userId: nonExistentUserId, externalAddress });

    expect(res.statusCode).toEqual(httpStatus.NOT_FOUND);
    expect(res.body).toHaveProperty("status", "error");
    expect(res.body).toHaveProperty("message", "Cannot find user_id");
  });

  // Test 2: Attempting to add an external address that already exists for the same user
  it("should return an error when adding an existing external address for the same user", async () => {
    // Step 1: Create new user
    await Analytics.create({
      discord_id: uniqueDiscordId,
      externalAddresses: [testAddress.toLowerCase()],
    });

    const user = await Analytics.findOne({
      where: { discord_id: uniqueDiscordId },
    });
    const existingUserId = user?.user_id;

    const res = await request(app)
      .post(endpoint)
      .send({ userId: existingUserId, externalAddress: testAddress });

    expect(res.statusCode).toEqual(httpStatus.OK);
    expect(res.body).toHaveProperty("status", "error");
    expect(res.body).toHaveProperty(
      "message",
      "External wallet already exists for this user",
    );

    // Step 2: Cleanup - Delete the newly created user
    await Analytics.destroy({ where: { discord_id: uniqueDiscordId } });
  });

  // Test 3: Attempting to add an external address that belongs to another user
  it("should return an error when adding an external address belonging to another user", async () => {
    // Step 1: Create 2 new users
    await Analytics.create({
      discord_id: uniqueDiscordId,
      externalAddresses: [testAddress.toLowerCase()],
    });
    await Analytics.create({
      discord_id: uniqueDiscordId2,
      externalAddresses: [testAddress2.toLowerCase()],
    });

    const user1 = await Analytics.findOne({
      where: { discord_id: uniqueDiscordId },
    });
    const existingUserId = user1?.user_id;

    const res = await request(app)
      .post(endpoint)
      .send({ userId: existingUserId, externalAddress: testAddress2 });

    expect(res.statusCode).toEqual(httpStatus.CONFLICT);
    expect(res.body).toHaveProperty("status", "error");
    expect(res.body).toHaveProperty(
      "message",
      "Critical error - this external address already exists for another user. Please reconcile.",
    );

    // Step 2: Cleanup - Delete the newly created user
    await Analytics.destroy({ where: { discord_id: uniqueDiscordId } });
    await Analytics.destroy({ where: { discord_id: uniqueDiscordId2 } });
  });

  // Test 4: Successfully add an external address, check if it's there, and delete it
  it("should add, verify, and delete an external address for an existing user", async () => {
    await Analytics.create({
      discord_id: uniqueDiscordId,
      externalAddresses: [testAddress.toLowerCase()],
    });
    const userByDiscord = await Analytics.findOne({
      where: { discord_id: uniqueDiscordId },
    });
    const existingUserId = userByDiscord?.user_id;
    const newExternalAddress = "0x00000000219ab540356cbb839cbe05303d7705fa";

    // Step 1: Add the new external address
    const addRes = await request(app)
      .post(endpoint)
      .send({ userId: existingUserId, externalAddress: newExternalAddress });

    expect(addRes.statusCode).toEqual(httpStatus.OK);
    expect(addRes.body).toHaveProperty("status", "success");

    // Step 2: Verify that the external address is added in the database
    const userById = await Analytics.findOne({
      where: { user_id: existingUserId },
    });
    expect(userById).not.toBeNull();
    expect(userById?.externalAddresses).toContain(
      newExternalAddress.toLowerCase(),
    );

    // Step 3: Cleanup - Remove the newly added external address
    const updatedExternalAddresses = userById?.externalAddresses?.filter(
      (addr) => addr !== newExternalAddress.toLowerCase(),
    );
    await Analytics.update(
      { externalAddresses: updatedExternalAddresses },
      { where: { user_id: existingUserId } },
    );

    // Step 4: Verify the cleanup
    const updatedUser = await Analytics.findOne({
      where: { user_id: existingUserId },
    });
    expect(updatedUser?.externalAddresses).not.toContain(newExternalAddress);
    expect(updatedUser?.externalAddresses).not.toContain(
      newExternalAddress.toLowerCase(),
    );

    // Step 5: Cleanup - Delete the newly created user
    await Analytics.destroy({ where: { discord_id: uniqueDiscordId } });
  });

  // Test 5: Attempting to update with a bad request (invalid userId)
  it("should return a bad request error for an invalid userId", async () => {
    const invalidUserId = "001";
    const externalAddress = "new_external_address";

    const res = await request(app)
      .post(endpoint)
      .send({ userId: invalidUserId, externalAddress });

    expect(res.statusCode).toEqual(httpStatus.BAD_REQUEST);
    expect(res.body).toHaveProperty("status", "error");
    expect(res.body).toHaveProperty(
      "message",
      `Bad request invalid input syntax for type uuid: "${invalidUserId}"`,
    );
  });
});
