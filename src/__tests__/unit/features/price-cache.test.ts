// import {
//   getCoinData,
//   getHistoricalPrice,
//   sleep,
// } from "../../../utils/index.js";

// describe("Price Cache", () => {
//   it("should return same price within 1 minute, different price after 1 minute", async () => {
//     const ethPrice = (await getCoinData(undefined, "ETH", 1)).price;

//     await sleep(10);
//     let ethPriceNew = (await getCoinData(undefined, "ETH", 1)).price;

//     expect(ethPrice).toEqual(ethPriceNew);

//     await sleep(55);
//     ethPriceNew = (await getCoinData(undefined, "ETH", 1)).price;

//     expect(ethPrice).not.toEqual(ethPriceNew);
//   });

//   it("should return same price for historical price", async () => {
//     const ethPrice = await getHistoricalPrice("ETH", 1704400000);

//     await sleep(10);
//     const ethPriceNew = await getHistoricalPrice("ETH", 1704400000);

//     expect(ethPrice).toEqual(ethPriceNew);
//   });
// });
