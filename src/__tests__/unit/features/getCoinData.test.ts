import { initModels } from "../../../db/index.js";
import { getCoinData, isNaNValue } from "../../../utils/index.js";

describe("getCoinData", () => {
  beforeEach(async () => {
    await initModels();
  });

  const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";

  it("get eth data", async () => {
    const data = await getCoinData(
      accountAddress,
      "0x0000000000000000000000000000000000000000",
      1,
      false,
    );
    expect(
      !isNaNValue(data.price) ||
        !isNaNValue(data.market_cap) ||
        !isNaNValue(data.fdv),
    ).toBeTruthy();
  });

  it("get bnb data", async () => {
    const data = await getCoinData(
      accountAddress,
      "0x0000000000000000000000000000000000000000",
      56,
      false,
    );
    expect(
      !isNaNValue(data.price) ||
        !isNaNValue(data.market_cap) ||
        !isNaNValue(data.fdv),
    ).toBeTruthy();
  });
  it("get matic data", async () => {
    const data = await getCoinData(
      accountAddress,
      "0x0000000000000000000000000000000000000000",
      137,
      false,
    );
    expect(
      !isNaNValue(data.price) ||
        !isNaNValue(data.market_cap) ||
        !isNaNValue(data.fdv),
    ).toBeTruthy();
  });
  it("get 9mm coin data", async () => {
    const data = await getCoinData(accountAddress, "9mm", 8453, false);
    expect(
      !isNaNValue(data.price) ||
        !isNaNValue(data.market_cap) ||
        !isNaNValue(data.fdv),
    ).toBeTruthy();
  });

  it("get floppa coin data", async () => {
    const data = await getCoinData(accountAddress, "floppa", 8453, false);
    expect(
      !isNaNValue(data.price) ||
        !isNaNValue(data.market_cap) ||
        !isNaNValue(data.fdv),
    ).toBeTruthy();
  });

  it("get torq coin data", async () => {
    const data = await getCoinData(accountAddress, "torq", 42161, false);
    expect(
      !isNaNValue(data.price) ||
        !isNaNValue(data.market_cap) ||
        !isNaNValue(data.fdv),
    ).toBeTruthy();
  });

  it("get 0x776aaef8d8760129a0398cf8674ee28cefc0eab9 coin data", async () => {
    const data = await getCoinData(
      accountAddress,
      "0x776aaef8d8760129a0398cf8674ee28cefc0eab9",
      8453,
      false,
    );
    expect(
      !isNaNValue(data.price) ||
        !isNaNValue(data.market_cap) ||
        !isNaNValue(data.fdv),
    ).toBeTruthy();
  });

  it("get 0xb56c29413af8778977093b9b4947efeea7136c36 coin data", async () => {
    const data = await getCoinData(
      accountAddress,
      "0xb56c29413af8778977093b9b4947efeea7136c36",
      42161,
      false,
    );
    expect(
      !isNaNValue(data.price) ||
        !isNaNValue(data.market_cap) ||
        !isNaNValue(data.fdv),
    ).toBeTruthy();
  });

  it("get dmt coin data", async () => {
    const data = await getCoinData(accountAddress, "dmt", 42161, false);
    expect(
      !isNaNValue(data.price) ||
        !isNaNValue(data.market_cap) ||
        !isNaNValue(data.fdv),
    ).toBeTruthy();
  });

  it("get abasusdc base coin data", async () => {
    const data = await getCoinData(accountAddress, "abasusdc", 8453, false);
    expect(
      !isNaNValue(data.price) ||
        !isNaNValue(data.market_cap) ||
        !isNaNValue(data.fdv),
    ).toBeTruthy();
  });

  it("get cwethv3 base coin data", async () => {
    const data = await getCoinData(accountAddress, "cwethv3", 8453, false);
    expect(
      !isNaNValue(data.price) ||
        !isNaNValue(data.market_cap) ||
        !isNaNValue(data.fdv),
    ).toBeTruthy();
  });

  it.skip("get jltweth blast coin data", async () => {
    const data = await getCoinData(accountAddress, "jltweth", 81457, false);
    expect(
      !isNaNValue(data.price) ||
        !isNaNValue(data.market_cap) ||
        !isNaNValue(data.fdv),
    ).toBeTruthy();
  });

  it("get cto base coin data", async () => {
    const data = await getCoinData(accountAddress, "cto", 8453, false);
    expect(
      !isNaNValue(data.price) ||
        !isNaNValue(data.market_cap) ||
        !isNaNValue(data.fdv),
    ).toBeTruthy();
  });

  it("get BCAT base coin data", async () => {
    const data = await getCoinData(accountAddress, "BCAT", 8453, false);
    expect(
      !isNaNValue(data.price) ||
        !isNaNValue(data.market_cap) ||
        !isNaNValue(data.fdv),
    ).toBeTruthy();
  });

  it("get sato eth coin data", async () => {
    const data = await getCoinData(undefined, "sato", 1, true);
    expect(
      !isNaNValue(data.price) ||
        !isNaNValue(data.market_cap) ||
        !isNaNValue(data.fdv),
    ).toBeTruthy();
  });
});
