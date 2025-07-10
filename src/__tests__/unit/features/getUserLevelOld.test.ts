import request from "supertest";
import app from "../../../app.js";

describe("Get User Level Old", () => {
  const validAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";

  it("Should return the correct user level for a valid address", async () => {
    const res = await request(app).get(
      `/user-level?accountAddress=${validAddress}`,
    );
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("level");
    expect(Number.isInteger(res.body.level)).toBeTruthy();
    expect(res.body.level).toBeGreaterThanOrEqual(1);
    expect(res.body.level).toBeLessThanOrEqual(11);
  });

  it("Should return an error for missing accountAddress", async () => {
    const res = await request(app).get("/user-level");
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it("Should return an error for an invalid accountAddress", async () => {
    const invalidAddress = "0x8c4B5c1F9Bd3B6f3E8F2a8C1d4B3F2a1E0F9c8D7";
    const res = await request(app).get(
      `/user-level?accountAddress=${invalidAddress}`,
    );
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("level");
    expect(Number.isInteger(res.body.level)).toBeTruthy();
    expect(res.body.level).toBe(1);
  });
});
