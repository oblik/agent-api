import request from "supertest";
import app from "../../../app.js";

describe("Get User Operational History", () => {
  it("should return the conditions and actions count for a given account address", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const res = await request(app).get(
      `/user-op-hist?accountAddress=${accountAddress}`,
    );

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status", "success");
    expect(res.body.data).toHaveProperty("conditions");
    expect(res.body.data).toHaveProperty("actions");
    expect(typeof res.body.data.conditions).toBe("number");
    expect(typeof res.body.data.actions).toBe("number");
  });

  it("should return an error if the user cannot be found", async () => {
    const accountAddress = "0x9876543210987654321098765432109876543210";
    const res = await request(app).get(
      `/user-op-hist?accountAddress=${accountAddress}`,
    );

    expect(res.statusCode).toEqual(404);
    expect(res.body).toHaveProperty("status", "error");
    expect(res.body).toHaveProperty("message", "User not found");
  });
});
