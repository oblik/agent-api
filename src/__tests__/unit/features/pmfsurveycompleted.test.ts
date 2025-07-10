import request from "supertest";
import app from "../../../app.js";

const endpoint = `/survey-completed?secret=${process.env.BACKEND_TOKEN_SECRET}`;

describe("Survey Completion", () => {
  const accountAddress = "0xb2932ceb7bd1e9a52e726830a6f515c872c2fd77";

  it("should increment survey_completed value", async () => {
    // Post to survey-completed endpoint
    const postRes = await request(app).post(endpoint).send({ accountAddress });
    expect(postRes.statusCode).toEqual(200);
    expect(postRes.body).toHaveProperty("status");
    expect(postRes.body.status).toEqual("success");
  });
});
