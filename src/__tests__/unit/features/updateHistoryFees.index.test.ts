import { Histories } from "../../../db/index.js";
import { updateHistoryFees } from "../../../utils/index.js";

jest.mock("../../../db/index.js", () => ({
  __esModule: true, // This is important for mocking ES6 modules
  default: jest.fn(), // Mock default export if there's any
  Histories: {
    findOne: jest.fn(),
  },
}));

describe("updateHistoryFees", () => {
  it("updates fees successfully when history record exists", async () => {
    const mockHistory = {
      set: jest.fn(),
      save: jest.fn(),
    };
    (Histories.findOne as jest.Mock).mockResolvedValue(mockHistory);

    const result = await updateHistoryFees("address", 1, 100, 200);

    expect(Histories.findOne).toHaveBeenCalledWith({
      where: {
        id: 1,
        useraddress: "address".toLowerCase(),
      },
    });
    expect(mockHistory.set).toHaveBeenCalledTimes(2);
    expect(mockHistory.save).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("returns an error when history record does not exist", async () => {
    (Histories.findOne as jest.Mock).mockResolvedValue(null);

    const result = await updateHistoryFees("address", 1, 100, 200);

    expect(result).toEqual({
      success: false,
      message: "History does not exist",
    });
  });
});
