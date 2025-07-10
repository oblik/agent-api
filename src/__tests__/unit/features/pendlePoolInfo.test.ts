import {
  fetchPendleApyData,
  processPendleApyData,
} from "../../../utils/protocols/pendle.js";

describe("fetchPendleApyData", () => {
  it("should fetch and process data", async () => {
    const data = await fetchPendleApyData();
    const processedData = processPendleApyData(data);
    console.log(processedData);
    expect(Object.keys(processedData).length).toBeGreaterThan(2);
  });
});
