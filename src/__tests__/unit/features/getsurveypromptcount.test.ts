import request from "supertest";
import app from "../../../app.js";

describe("Get Survey Prompt Count", () => {
  it("should return the survey prompt count for a given account address", async () => {
    const accountAddress = "0xb2932ceb7bd1e9a52e726830a6f515c872c2fd77";
    const res = await request(app).get(
      `/survey-prompt-count?accountAddress=${accountAddress}`,
    );

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("surveyPromptCount");
    expect(typeof res.body.surveyPromptCount).toBe("number");
  });
});
