import path from "node:path";

export const usePrintLog =
  (userAddress: unknown) =>
  (...logs: unknown[]) => {
    console.log(`${userAddress}:`, ...logs);
  };

export const usePrintError =
  (userAddress: unknown) =>
  (...errs: unknown[]) => {
    console.error(`${userAddress}:`, ...errs);
  };

export const sfConsoleError = (...args: unknown[]) => {
  const stack = new Error().stack;
  const caller = stack?.split("\n")[2];
  const match = caller?.match(/\((.*):\d+:\d+\)/);

  if (match) {
    const filePath = match[1];
    const fileName = path.basename(filePath);
    const lineNumber = caller?.match(/:(\d+):/)?.[1];

    console.error(`[${fileName}:${lineNumber}]`, ...args);
  } else {
    console.error(...args);
  }
};
