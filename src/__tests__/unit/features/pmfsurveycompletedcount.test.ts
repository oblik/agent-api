import request from "supertest";
import app from "../../../app.js";

describe("Survey Completed Count", () => {
  it("should return the survey completed count for a given account address", async () => {
    const accountAddress = "0xb2932ceb7bd1e9a52e726830a6f515c872c2fd77";
    const res = await request(app).get(
      `/survey-completed-count?accountAddress=${accountAddress}`,
    );

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("survey_completed");
    expect(typeof res.body.survey_completed).toBe("number");
  });

  it("should return an error for an invalid account address", async () => {
    const invalidAccountAddress = "invalid_address";
    const res = await request(app).get(
      `/survey-completed-count?accountAddress=${invalidAccountAddress}`,
    );

    expect(res.statusCode).not.toEqual(200);
    expect(res.body).toHaveProperty("status", "error");
    expect(res.body).toHaveProperty("message");
  });
});
