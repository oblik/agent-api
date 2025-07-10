import request from "supertest";
import app from "../../../app.js";

const backendSecret = process.env.BACKEND_TOKEN_SECRET;

describe("Survey Status", () => {
  it("Retrieves survey status for a given account address", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const res = await request(app).get(
      `/survey-status?accountAddress=${accountAddress}`,
    );

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("survey");
    expect(typeof res.body.survey).toEqual("boolean");
  });

  it("Retrieves survey status for another account address", async () => {
    const accountAddress = "0xb2932ceb7bd1e9a52e726830a6f515c872c2fd77";
    const res = await request(app).get(
      `/survey-status?accountAddress=${accountAddress}`,
    );

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("survey");
    expect(typeof res.body.survey).toEqual("boolean");
  });

  it("Survey Status - Missing Account Address Parameter", async () => {
    const res = await request(app).get("/survey-status");

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual("Account address is required");
  });

  it("Survey Status - Invalid Account Address Format", async () => {
    const invalidAccountAddress = "invalidAddress";
    const res = await request(app).get(
      `/survey-status?accountAddress=${invalidAccountAddress}`,
    );

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual("User not found");
  });

  it("Survey Status - Nonexistent Account Address", async () => {
    const nonexistentAccountAddress =
      "0x9876543210987654321098765432109876543210";
    const res = await request(app).get(
      `/survey-status?accountAddress=${nonexistentAccountAddress}`,
    );

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual("User not found");
  });

  it("Survey Status - Invalid HTTP Method (POST)", async () => {
    const res = await request(app).post(
      `/survey-status?secret=${backendSecret}`,
    );

    expect(res.statusCode).toEqual(404);
  });
});
