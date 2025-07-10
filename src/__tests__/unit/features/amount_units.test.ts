import request from "supertest";
import app from "../../../app.js";
import { simulateTxs } from "../../helper.js";

const backendSecret = process.env.BACKEND_TOKEN_SECRET;

describe("Amount units", () => {
  const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";

  it("amount units as usd", async () => {
    const res = await request(app)
      .post(`/transfer?secret=${backendSecret}`)
      .send({
        accountAddress,
        token: "ETH",
        recipient: "niyant.eth",
        amount: "500",
        amount_units: "usd",
        chainName: "Ethereum",
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("amount units as unstable token", async () => {
    const res = await request(app)
      .post(`/transfer?secret=${backendSecret}`)
      .send({
        accountAddress,
        token: "DAI",
        recipient: "niyant.eth",
        amount: "0.5",
        amount_units: "ETH",
        chainName: "Ethereum",
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("amount units in bridge", async () => {
    const res = await request(app)
      .post(`/bridge?secret=${backendSecret}`)
      .send({
        accountAddress,
        token: "DAI",
        sourceChainName: "Ethereum",
        destinationChainName: "Arbitrum",
        amount: "0.5",
        amount_units: "ETH",
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(2);

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });
});
