import request from "supertest";
import app from "../../../app.js"; // Adjust the path as per your file structure

describe("Get Operations After Last Survey", () => {
  it("should return the count of operations after last survey for a given account address", async () => {
    const accountAddress = "0xb2932ceb7bd1e9a52e726830a6f515c872c2fd77";
    const res = await request(app).get(
      `/operations-after-last-survey?accountAddress=${accountAddress}`,
    );

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("operationsAfterLastSurvey");
    expect(typeof res.body.operationsAfterLastSurvey).toBe("number");
  });
});
