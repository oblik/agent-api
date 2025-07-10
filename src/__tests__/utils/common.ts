import request from "supertest";
import app from "../../app.js";

export const backendSecret = process.env.BACKEND_TOKEN_SECRET;
export const DEFAULT_TEST_ADDRESS =
  "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

export async function processMessage(
  message: string,
  connected_chain: string,
  user_address = DEFAULT_TEST_ADDRESS,
) {
  const body = { message, user_address, connected_chain };
  const res = await request(app)
    .post(`/process-message?secret=${backendSecret}`)
    .send(body);
  const { groups, calls } = res.body.data;
  return groups.length ? groups : calls;
}
