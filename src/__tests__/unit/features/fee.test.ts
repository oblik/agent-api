import request from "supertest";
import app from "../../../app.js";

const endpoint = `/fee?secret=${process.env.BACKEND_TOKEN_SECRET}`;

describe("Test Fees", () => {
  it("should get fees 1", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xf62c0ecbfcd066dd92022918402740b5d48973ab",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body).toHaveProperty("chainName");
  });

  it("should get fees", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body).toHaveProperty("chainName");
  });

  it("Missing Account Address", async () => {
    const res = await request(app).post(endpoint).send({});
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("Error getting fee transaction.");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual("Invalid account address provided.");
  });

  it("Incorrect address", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0x12345",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("Error getting fee transaction.");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual("Invalid account address provided.");
  });

  it("No fee wallet & arbitrum chain", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xbB3d4097E9F1279f07E981EAFF384Eb6566fbE2d",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body).toHaveProperty("chainName");
  });
});
