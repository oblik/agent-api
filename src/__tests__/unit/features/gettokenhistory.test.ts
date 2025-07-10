import dotenv from "dotenv";
import request from "supertest";
import app from "../../../app.js";

dotenv.config();

describe("Get Token History", () => {
  const validChainId = "1";
  const validTokenName = "ETH";
  const validAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";

  // Increase timeout for API call
  jest.setTimeout(30000);

  it("Should return token history for a valid request", async () => {
    const res = await request(app)
      .post(`/token-history?secret=${process.env.BACKEND_TOKEN_SECRET}`)
      .query({ chainId: validChainId, tokenName: validTokenName })
      .send({ accountAddress: validAddress });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBeTruthy();
    expect(res.body.data.length).toBeGreaterThan(0);

    for (const item of res.body.data) {
      expect(item).toHaveProperty("timestamp");
      expect(item).toHaveProperty("price");
      expect(typeof item.timestamp).toBe("number");
      expect(typeof item.price).toBe("number");
    }

    console.log(
      "First 5 items of token history response:",
      res.body.data.slice(0, 5),
    );
  });

  it("Should return memoized results for repeated requests", async () => {
    const firstResponse = await request(app)
      .post(`/token-history?secret=${process.env.BACKEND_TOKEN_SECRET}`)
      .query({ chainId: validChainId, tokenName: validTokenName })
      .send({ accountAddress: validAddress });

    const startTime = Date.now();
    const secondResponse = await request(app)
      .post(`/token-history?secret=${process.env.BACKEND_TOKEN_SECRET}`)
      .query({ chainId: validChainId, tokenName: validTokenName })
      .send({ accountAddress: validAddress });
    const endTime = Date.now();

    expect(secondResponse.statusCode).toEqual(200);
    expect(secondResponse.body).toEqual(firstResponse.body);

    // The second request should be significantly faster due to memoization
    expect(endTime - startTime).toBeLessThan(100); // Adjust this threshold as needed
  });

  it("Should return an error for missing chainId", async () => {
    const res = await request(app)
      .post(`/token-history?secret=${process.env.BACKEND_TOKEN_SECRET}`)
      .query({ tokenName: validTokenName })
      .send({ accountAddress: validAddress });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toContain("Chain ID and token name are required");
  });

  it("Should return an error for missing tokenName", async () => {
    const res = await request(app)
      .post(`/token-history?secret=${process.env.BACKEND_TOKEN_SECRET}`)
      .query({ chainId: validChainId })
      .send({ accountAddress: validAddress });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toContain("Chain ID and token name are required");
  });

  it("Should return an error for an invalid chainId", async () => {
    const invalidChainId = "999";
    const res = await request(app)
      .post(`/token-history?secret=${process.env.BACKEND_TOKEN_SECRET}`)
      .query({ chainId: invalidChainId, tokenName: validTokenName })
      .send({ accountAddress: validAddress });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toContain("Failed to fetch token history");
  });

  it("Should return an error for a non-existent token", async () => {
    const nonExistentToken = "NONEXISTENT";
    const res = await request(app)
      .post(`/token-history?secret=${process.env.BACKEND_TOKEN_SECRET}`)
      .query({ chainId: validChainId, tokenName: nonExistentToken })
      .send({ accountAddress: validAddress });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toContain("Failed to fetch token history");
  });
});
