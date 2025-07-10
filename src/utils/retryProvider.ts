import { ethers } from "ethers";
import { getRpcUrlForChain } from "./index.js";
import { assert } from "./types.js";

export class RetryProvider extends ethers.JsonRpcProvider {
  constructor(
    url0?: string | ethers.FetchRequest,
    network?: ethers.Networkish,
    options?: ethers.JsonRpcApiProviderOptions,
  ) {
    let url = url0;
    if (!url && typeof network === "number") url = getRpcUrlForChain(network);
    assert(!!url);
    super(url, network, options);
    this.on("error", (error) => {
      console.log(`retryprovider error: ${error}`);
    }).catch((error) => console.log(`retryprovider on: ${error}`));
    if (network !== 101) {
      this._start();
    }
  }

  async send(method: string, params: Array<unknown> | Record<string, unknown>) {
    const maxRetries = 5;
    for (let i = 1; i < maxRetries; i++) {
      /* eslint-disable no-await-in-loop */
      try {
        return await super.send(method, params);
      } catch (error: unknown) {
        if (
          ethers.isError(error, "SERVER_ERROR") ||
          ethers.isError(error, "NETWORK_ERROR")
        ) {
          console.log(
            `RetryProvider: attempt ${i + 1} for method ${method} on ${error}`,
          );
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** i));
        } else {
          throw error;
        }
      }
    }

    return super.send(method, params);
  }
}
