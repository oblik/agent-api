import { initModels } from "../../../db/index.js";
import { isNaNValue } from "../../../utils/index.js";
import { getGMXMarket } from "../../../utils/protocols/gmx.js";

describe("getGMXMarket", () => {
  beforeEach(async () => {
    await initModels();
  });

  it("get btc arb market data", async () => {
    const data = await getGMXMarket(undefined, 42161, "btc");
    console.log(data);
    expect(
      !isNaNValue(data.funding) || !isNaNValue(data.interest),
    ).toBeTruthy();
  });
});
