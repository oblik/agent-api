import axios from "axios";
import dotenv from "dotenv";
import { withRetry } from "../src/utils/index.js";

dotenv.config();

const DEBANK_API = "https://pro-openapi.debank.com/v1";
const PAGE_SIZE = 20;

const embeddedAddresses = [
  "0x024cdb696a719f37b324a852085a68786d269212",
  "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d",
  "0x6DfbFA4AB2890Dec904a29DA24A0B2c07eBb646b",
  "0xa23095B6C20cd2ad4c523B29DB64CD2bc2E06D7c",
  "0x1F1ee2505493EF4aEDea80FBFd12cb2E4E5248b5",
  "0x73f49321F63a2e8aF0AF25BB2a21A329882A4281",
  "0xD36DAe16cB4e04011362dd0264C9430807B24227",
  "0xcB63b47aCFf4Edc6ea1A83095956A8236FFd8260",
  "0xeB683293576c20B20ebD90a405FBe778360D4d55",
  "0xf0840B643eAB3308633330c6bC5854D0167C63e2",
  "0xCE43D9418E23f213a226fc271837Aa7821E63f44",
  "0xce8F6F360c8bb844fD053868E00B699B5b2C9ee4",
  "0x75Fe63f977a1E8b38364Cd5b9f53d53f3F63a47f",
  "0x1D8B23388aD7993A063376af045c97Cd2E061462",
  "0xf4B157126E43e3D0a2E63E0773d30E12b2A66af5",
  "0x090bA43EcC815890ADf49b46104b45C1F657F797",
  "0xfc86850Cca5be10db978f39C6c51b5670BF56B81",
  "0x72129D701c262A50FF6D1DD384B2bD8079b2b572",
  "0x35d2085239e04e9B0BD5082F28044170ac6fbdad",
  "0xF62C0ecBFcD066dD92022918402740B5D48973ab",
  "0x0155F5D9630FF76ae836fB3e3A89315ffB0B0dC0",
  "0xD611aA078C127e16C8dF8F0d2631B59D1e3C8Fa4",
  "0x5ec6CE228C0DD6026113860FE5DCB1f1E7f664Cf",
  "0x9e9E61e4466483FD525095E13618Dbe235c375FF",
  "0xA4a2F21517073dA2557fCabBca9356A7a82B6A68",
  "0xE1A702577f49D8BBb5A8853da07dCFD34b1082f0",
  "0xd528af2E2047666F7dc99Ed588c0526b987A82Cc",
  "0xCC4926027504Af72646b06eA43D35990aea0f2C7",
  "0xdf6AbB568CeFa2A18d822E040981D6d4DF9956cc",
  "0xDdA55D2564fF205750dEFB21f4bc3E37c5e6a643",
  "0x17BEDfb7f8750538562c7fCd0C714b7fFdEAec83",
  "0xac6Ae21323D8afb99305478802927fE1C3939e10",
  "0xf5528b8b998CAFC28725c8b2D0B47b305ef3872B",
  "0x10e4E150cC93c105B1A91C1D89F1d5DCf4423881",
  "0x8b48e4b407aF5D6da673348A9eA5153fce2F73a4",
  "0x5458d40e2E8913f7AF6Ffed5B6E89f93e0505acB",
  "0x7843b322a9002620730ec1d7807325875efad333",
  "0x9170DA9A5EbC352C31AD8F27586cdcE288392110",
  "0x70F534da4eCb8B5DA335894864477B5a2E4FDF10",
  "0x50e030361e76C1bAfBB9577Eeb1bD9Bc2EFCF91C",
  "0x03c2c38da985ebFe3f83930c942dEE29480Ef824",
  "0x4991933554fBc17D85880eba460d3Be7E892DCC6",
  "0xA5CBF6e7b302b0D34186a6328e5406D2B8c1063b",
  "0x1eA96dF4469166FdB40b6233Da049d40372e3c57",
  "0x959227b5732704a2C17C903bCCEc467C9C89cd36",
  "0xEED612894dfCc7DAbae20B7124b66FE39791eB3f",
  "0x8f38bE15c2fFbc9a155fA4562d6Db5978Bb8f057",
  "0xD7E3DC09d1f7aBD44160b42513f44aB8F4055EDA",
  "0x279b02Bee5674b4Ae21cfF2443F5eB324dbF932C",
  "0xe6767a0c53556B9580AC3b59FAC8180Aa0Cb4E85",
  "0xa4AFac88c4714E23ffE5D6016ae5271f826c9e11",
  "0x03f5bf9c577813b967137390bc7276d18e2dd360",
  "0x0969fCf4d4c8ee3962fFa5Fa340D826c11F0640F",
  "0xa04F7F13a3F0E46cAB79De7fcEb20338fc7c0C42",
  "0x51e54A1e35783102123fD08a71deC31ef3001a6A",
  "0x95F308fDE5D2a3960937d1d7D2f0be174d587b93",
];

async function fetchHistory(
  accountAddress: string,
  startTime: string | null = null,
): Promise<{ is_scam: boolean; time_at: string }[]> {
  const queryParams = new URLSearchParams({
    id: accountAddress,
    page_count: `${PAGE_SIZE}`,
  });

  if (startTime) {
    queryParams.append("start_time", startTime);
  }

  const { data } = await withRetry("", () =>
    axios.get(`${DEBANK_API}/user/all_history_list?${queryParams}`, {
      headers: { AccessKey: process.env.DEBANK_ACCESS_KEY },
    }),
  );

  return data.history_list;
}

export async function main() {
  let cumtotal = 0;
  for (const accountAddress of embeddedAddresses) {
    let total = 0;
    let startTime = null;
    let allHistoryFetched = false;

    while (!allHistoryFetched) {
      const historyList = await fetchHistory(accountAddress, startTime);

      if (historyList.length === 0) {
        allHistoryFetched = true;
      } else {
        total += historyList.filter((entry) => entry.is_scam !== true).length;

        // Get the start_time for the next request
        startTime = historyList[historyList.length - 1].time_at;

        // If we received fewer than PAGE_SIZE entries, we've reached the end
        if (historyList.length < PAGE_SIZE) {
          allHistoryFetched = true;
        }
      }
    }
    console.log(`Total non-scam entries: ${accountAddress} ${total}`);
    cumtotal += total;
  }
  console.log(`Cumulative total non-scam entries: ${cumtotal}`);
}

main();
