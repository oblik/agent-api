import request from "supertest";
import app from "../../../app.js";

const endpoint = `/check-action?secret=${process.env.BACKEND_TOKEN_SECRET}`;

describe("Test Fees", () => {
  it("should get lp token info properly", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({
        action: {
          name: "withdraw",
          args: {
            chainName: "ethereum",
          },
        },
        accountAddress: "0x3Bd57A7b5e27F03Eed88F38e994504CB71f4F5DB",
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("actions");
    const { actions } = res.body;
    expect(
      actions.filter((x: { lp: unknown }) => x.lp !== undefined).length,
    ).toBeGreaterThan(0);
  });
});
