// Mock the Histories module at the top of the file
import { Histories } from "../../../db/index.js";
import { getOwedFee } from "../../../utils/index.js";

jest.mock("../../../db/index.js", () => ({
  __esModule: true, // This is important for mocking ES6 modules
  default: jest.fn(), // Mock default export if there's any
  Histories: {
    findAll: jest.fn(),
  },
}));

describe("getOwedFee", () => {
  it("calculates the owed fee correctly from user histories", async () => {
    // Set up the mock data
    const mockUserHistories = [
      { totalfees: 100, paidfees: 0 },
      { totalfees: 200, paidfees: 100 },
    ];

    // Mock the implementation of findAll to return the mock data
    (Histories.findAll as jest.Mock).mockResolvedValue(mockUserHistories);

    // Call the function with a test user
    const result = await getOwedFee("testuser");

    // Assertions
    expect(result).toEqual({ success: true, fee: 200, message: "" });
    expect(Histories.findAll).toHaveBeenCalledWith({
      where: { useraddress: "testuser" },
      raw: true,
    });
  });

  it("returns an error object on failure", async () => {
    // Mock the implementation of findAll to throw an error
    (Histories.findAll as jest.Mock).mockRejectedValue(
      new Error("Database error"),
    );

    const result = await getOwedFee("testuser");

    // Assertions
    expect(result).toEqual({
      success: false,
      fee: -1,
      message: new Error("Database error"),
    });
  });
});
