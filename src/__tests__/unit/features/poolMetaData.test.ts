import { getPoolMetadata } from "../../../utils/index.js";

describe("Pendle protocol pool metadata", () => {
  const mockChainName = "ethereum";
  const mockProtocolName = "pendle";

  it("should return different types of metadata for LP and non-LP Pendle pools", async () => {
    const mockLPPoolName = "steth-25dec2025-lp";
    const mockNonLPPoolName = "pt-steth-25dec2025";
    const resultLP = await getPoolMetadata(
      mockChainName,
      mockProtocolName,
      mockLPPoolName,
      "",
    );
    const resultNonLP = await getPoolMetadata(
      mockChainName,
      mockProtocolName,
      mockNonLPPoolName,
      "",
    );
    const resultImplied = await getPoolMetadata(
      mockChainName,
      mockProtocolName,
      mockNonLPPoolName,
      "",
      {},
      "implied",
    );
    const resultUnderlying = await getPoolMetadata(
      mockChainName,
      mockProtocolName,
      mockNonLPPoolName,
      "",
      {},
      "underlying",
    );

    expect(resultLP).toBeDefined();
    expect(resultNonLP).toBeDefined();
    expect(resultImplied).toBeDefined();
    expect(resultUnderlying).toBeDefined();

    if (resultLP && resultNonLP && resultImplied && resultUnderlying) {
      expect(resultLP).toEqual({
        chain: mockChainName,
        project: mockProtocolName,
        symbol: mockLPPoolName,
        apy: expect.any(Number),
      });
      expect(resultNonLP).toEqual({
        chain: mockChainName,
        project: mockProtocolName,
        symbol: mockNonLPPoolName,
        apy: expect.any(Number),
      });
      expect(resultImplied).toEqual({
        chain: mockChainName,
        project: mockProtocolName,
        symbol: mockNonLPPoolName,
        apy: expect.any(Number),
      });
      expect(resultUnderlying).toEqual({
        chain: mockChainName,
        project: mockProtocolName,
        symbol: mockNonLPPoolName,
        apy: expect.any(Number),
      });

      expect(resultLP.apy).toBeGreaterThan(0);
      expect(resultNonLP.apy).toBeGreaterThan(0);
      expect(resultImplied.apy).toBeGreaterThan(0);
      expect(resultUnderlying.apy).toBeGreaterThan(0);
      expect(resultLP.apy).not.toEqual(resultNonLP.apy);
      expect(resultLP.apy).not.toEqual(resultImplied.apy);
      expect(resultLP.apy).not.toEqual(resultUnderlying.apy);
      expect(resultNonLP.apy).not.toEqual(resultUnderlying.apy);
      expect(resultUnderlying.apy).not.toEqual(resultImplied.apy);
      expect(
        Math.abs((resultImplied?.apy ?? 0) - (resultNonLP?.apy ?? 0)),
      ).toBeLessThanOrEqual(1);
    } else {
      throw new Error("Expected all results to be defined");
    }
  });
});
