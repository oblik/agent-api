import { getUserOwnedTokenBalancesFromDeBank } from "../../../utils/index.js";

describe("getUserOwnedTokenBalancesFromDeBank", () => {
  it("get usdc mnvr data", async () => {
    const data = await getUserOwnedTokenBalancesFromDeBank(
      "0xba018d9d99714616babfa208d2faa921fa0c2d28",
    );
    console.log(JSON.stringify(data, null, 2));
  });
});
