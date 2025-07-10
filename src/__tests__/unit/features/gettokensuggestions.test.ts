import request from "supertest";
import app from "../../../app.js";
import type { JSONObject } from "../../../utils/types.js";

jest.setTimeout(60000); // Set global timeout to 60 seconds

describe("Get Token Suggestions", () => {
  it("should return trending and new token suggestions", async () => {
    const res = await request(app).get("/token-suggestions");

    console.log(
      "Trending Tokens:",
      JSON.stringify(res.body.trendingTokens, null, 2),
    );
    console.log("New Tokens:", JSON.stringify(res.body.newTokens, null, 2));

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("status", "success");
    expect(Array.isArray(res.body.trendingTokens)).toBe(true);
    expect(Array.isArray(res.body.newTokens)).toBe(true);
    expect(res.body.trendingTokens.length).toBeGreaterThan(0);
    expect(res.body.newTokens.length).toBeGreaterThan(0);
  });

  it("should have the correct properties for each token", async () => {
    const res = await request(app).get("/token-suggestions");

    const checkTokenProperties = (token: JSONObject) => {
      expect(token).toHaveProperty("name");
      expect(token).toHaveProperty("quote_token_price_usd");
      expect(token).toHaveProperty("address");
      expect(token).toHaveProperty("market_cap_usd");
      expect(token).toHaveProperty("fdv_usd");
      expect(token).toHaveProperty("price_change_percentage");
      expect(token).toHaveProperty("volume_usd");
      expect(token).toHaveProperty("transactions");
      expect(token).toHaveProperty("network");
      expect(token).toHaveProperty("trendingFactor");
    };

    res.body.trendingTokens.forEach(checkTokenProperties);
    res.body.newTokens.forEach(checkTokenProperties);
  });
});
