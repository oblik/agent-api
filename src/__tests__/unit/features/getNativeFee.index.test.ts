import { getNativeFee } from "../../../utils/index.js";

describe("getNativeFee", () => {
  it("calculates the fee correctly for a valid token and chain", async () => {
    const account = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const usdFee = 20;
    const testPrice = 10;

    const result = await getNativeFee(account, usdFee, {}, testPrice);
    console.log(result);

    expect(result).toEqual({
      success: true,
      fee: "2.000000000000000000",
      chainName: "optimism",
    });
  });
});
