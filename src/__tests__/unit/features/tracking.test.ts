import axios from "axios";
import request from "supertest";
import app from "../../../app.js";
import { Tracking } from "../../../db/index.js";
import { fillBody } from "../../../utils/index.js";
import type { Call } from "../../../utils/types.js";

const backendSecret = process.env.BACKEND_TOKEN_SECRET;

describe("User Tracking", () => {
  let messageId: string;
  let calls: Call[];
  const aiRequest = {
    message: "Transfer 100 USDC to niyant.eth",
    user_address: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
  };

  it("Should call AI API with message", async () => {
    const {
      data: { data },
    } = await axios.post(
      "https://ai.spicefi.xyz/v1/process-message",
      JSON.stringify(aiRequest),
      { headers: { "Content-Type": "application/json" } },
    );
    const { calls: _calls, message_id } = data;
    calls = _calls;
    messageId = message_id;

    const tracking = await getTracking();

    expect(tracking).not.toBeUndefined();

    expect(tracking).toHaveProperty("user_address");
    expect(tracking).toHaveProperty("inputted_query");
    expect(tracking).toHaveProperty("generated_api_calls");
    expect(tracking).toHaveProperty("edited_api_calls");
    expect(tracking).toHaveProperty("generated_transactions");
    expect(tracking).toHaveProperty("first_simulation_status");
    expect(tracking).toHaveProperty("second_simulation_status");
    expect(tracking).toHaveProperty("executed_status");

    expect(tracking?.user_address).toEqual(aiRequest.user_address);
    expect(tracking?.inputted_query).toEqual(aiRequest.message);
    expect(tracking?.generated_api_calls).toEqual(calls);
  });

  it("Should simulate calls", async () => {
    const res = await request(app)
      .post(`/simulate?secret=${backendSecret}`)
      .send({
        messageId,
        actions: calls,
        conditions: [],
        accountAddress: aiRequest.user_address,
        connectedChainName: "Ethereum",
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");

    const tracking = await getTracking();
    expect(tracking?.first_simulation_status).toEqual(0);
  });

  it("Should edit actions", async () => {
    calls[0].args.amount = "50";
    calls[0].args.chainName = "ethereum";
    calls[0].args.accountAddress = aiRequest.user_address;
    const res = await request(app)
      .post(`/simulate?secret=${backendSecret}`)
      .send({
        messageId,
        actions: calls,
        conditions: [],
        accountAddress: aiRequest.user_address,
        connectedChainName: "Ethereum",
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");

    const tracking = await getTracking();

    const rawCalls = tracking?.edited_api_calls.map(({ origin, ...x }) => x);
    expect(rawCalls).toEqual(calls);
  });

  it("Should generate transactions", async () => {
    const body = fillBody(calls[0].name, calls[0].args, aiRequest.user_address);
    const res = await request(app)
      .post(`/${calls[0].name}?secret=${backendSecret}`)
      .send(body);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const { transactions } = res.body;
    await request(app)
      .post(`/store-generated-transactions?secret=${backendSecret}`)
      .send({
        messageId,
        transactions,
      });

    const tracking = await getTracking();
    expect(tracking?.generated_transactions).toEqual([transactions]);
  });

  it("Should store executed status", async () => {
    await request(app)
      .post(`/set-executed-status?secret=${backendSecret}`)
      .send({
        messageId,
        status: 0,
      });

    const tracking = await getTracking();
    expect(tracking?.executed_status).toEqual(0);
  });

  async function getTracking() {
    const tracking = await Tracking.findOne({
      where: { id: Number.parseInt(messageId) },
      raw: true,
    });
    return tracking;
  }
});
