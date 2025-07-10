// Mock the Histories module at the top of the file
import { Histories } from "../../../db/index.js";
import { updateOwedFee } from "../../../utils/index.js";

jest.mock("../../../db/index.js", () => ({
  __esModule: true, // This is important for mocking ES6 modules
  default: jest.fn(), // Mock default export if there's any
  Histories: {
    findAll: jest.fn(),
  },
}));

const mockUserHistories = [
  {
    id: 67,
    useraddress: "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd",
    conditions: [],
    actions: [
      {
        id: "m1c0",
        args: {
          token: "eth",
          amount: "0.0005",
          chainName: "Ethereum",
          recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
          sourceChainName: "Ethereum",
        },
        name: "transfer",
        txHashes: [
          "0x950ed0aa7d6ab8aee03df3c12c695e82781234eeda85220d6e6c04d9ade3fbf9",
        ],
      },
    ],
    query: {
      id: "m1",
      calls: [
        {
          id: "m1c0",
          args: {
            token: "eth",
            amount: "0.0005",
            recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
          },
          name: "transfer",
          txHashes: [
            "0x950ed0aa7d6ab8aee03df3c12c695e82781234eeda85220d6e6c04d9ade3fbf9",
          ],
        },
      ],
      actions: [
        {
          id: "m1c0",
          args: {
            token: "eth",
            amount: "0.0005",
            chainName: "Ethereum",
            recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
            sourceChainName: "Ethereum",
          },
          name: "transfer",
          txHashes: [
            "0x950ed0aa7d6ab8aee03df3c12c695e82781234eeda85220d6e6c04d9ade3fbf9",
          ],
        },
      ],
      message:
        "transfer 0.0005 eth to 0xB6A5A72F5D811B6a6d9Ea653C919b6eAc6B1D3b2",
      messageId: 734,
      simstatus: 0,
      conditions: [],
      description:
        "The transfer of 0.0005 ETH tokens to 0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2 has been initiated.",
    },
    timestamp: "1700016783093",
    totalfees: null,
    paidfees: null,
    createdAt: "2023-11-15T02:53:03.093Z",
    updatedAt: "2023-11-15T02:53:03.093Z",
  },
  {
    id: 68,
    useraddress: "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd",
    conditions: [],
    actions: [
      {
        id: "m2c0",
        args: {
          token: "eth",
          amount: "0.0005",
          chainName: "Ethereum",
          recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
          sourceChainName: "Ethereum",
        },
        name: "transfer",
        txHashes: [
          "0x5a74240d9ef69c33e4ed638dad69771998b885193480293f7727a79802ab76b1",
        ],
      },
    ],
    query: {
      id: "m2",
      calls: [
        {
          id: "m2c0",
          args: {
            token: "eth",
            amount: "0.0005",
            recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
          },
          name: "transfer",
          txHashes: [
            "0x5a74240d9ef69c33e4ed638dad69771998b885193480293f7727a79802ab76b1",
          ],
        },
      ],
      actions: [
        {
          id: "m2c0",
          args: {
            token: "eth",
            amount: "0.0005",
            chainName: "Ethereum",
            recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
            sourceChainName: "Ethereum",
          },
          name: "transfer",
          txHashes: [
            "0x5a74240d9ef69c33e4ed638dad69771998b885193480293f7727a79802ab76b1",
          ],
        },
      ],
      message:
        "transfer 0.0005 eth to 0xB6A5A72F5D811B6a6d9Ea653C919b6eAc6B1D3b2",
      messageId: 735,
      simstatus: 0,
      conditions: [],
      description:
        "The transfer of 0.0005 ETH tokens to 0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2 has been initiated.",
    },
    timestamp: "1700016892550",
    totalfees: null,
    paidfees: null,
    createdAt: "2023-11-15T02:54:52.551Z",
    updatedAt: "2023-11-15T02:54:52.551Z",
  },
  {
    id: 69,
    useraddress: "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd",
    conditions: [],
    actions: [
      {
        id: "m3c0",
        args: {
          token: "eth",
          amount: "0.0005",
          chainName: "Ethereum",
          recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
          sourceChainName: "Ethereum",
        },
        name: "transfer",
        txHashes: [
          "0xfe8b3a1de9ef41f645fdf28289ba241e01b86be10558c7ad988c195f9e99438d",
        ],
      },
    ],
    query: {
      id: "m3",
      calls: [
        {
          id: "m3c0",
          args: {
            token: "eth",
            amount: "0.0005",
            recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
          },
          name: "transfer",
          txHashes: [
            "0xfe8b3a1de9ef41f645fdf28289ba241e01b86be10558c7ad988c195f9e99438d",
          ],
        },
      ],
      actions: [
        {
          id: "m3c0",
          args: {
            token: "eth",
            amount: "0.0005",
            chainName: "Ethereum",
            recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
            sourceChainName: "Ethereum",
          },
          name: "transfer",
          txHashes: [
            "0xfe8b3a1de9ef41f645fdf28289ba241e01b86be10558c7ad988c195f9e99438d",
          ],
        },
      ],
      message:
        "transfer 0.0005 eth to 0xB6A5A72F5D811B6a6d9Ea653C919b6eAc6B1D3b2",
      messageId: 736,
      simstatus: 0,
      conditions: [],
      description:
        "The transfer of 0.0005 ETH tokens to 0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2 has been initiated.",
    },
    timestamp: "1700016963319",
    totalfees: null,
    paidfees: null,
    createdAt: "2023-11-15T02:56:03.319Z",
    updatedAt: "2023-11-15T02:56:03.319Z",
  },
];

const mockUserHistories2 = [
  {
    id: 67,
    useraddress: "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd",
    conditions: [],
    actions: [
      {
        id: "m1c0",
        args: {
          token: "eth",
          amount: "0.0005",
          chainName: "Ethereum",
          recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
          sourceChainName: "Ethereum",
        },
        name: "transfer",
        txHashes: [
          "0x950ed0aa7d6ab8aee03df3c12c695e82781234eeda85220d6e6c04d9ade3fbf9",
        ],
      },
    ],
    query: {
      id: "m1",
      calls: [
        {
          id: "m1c0",
          args: {
            token: "eth",
            amount: "0.0005",
            recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
          },
          name: "transfer",
          txHashes: [
            "0x950ed0aa7d6ab8aee03df3c12c695e82781234eeda85220d6e6c04d9ade3fbf9",
          ],
        },
      ],
      actions: [
        {
          id: "m1c0",
          args: {
            token: "eth",
            amount: "0.0005",
            chainName: "Ethereum",
            recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
            sourceChainName: "Ethereum",
          },
          name: "transfer",
          txHashes: [
            "0x950ed0aa7d6ab8aee03df3c12c695e82781234eeda85220d6e6c04d9ade3fbf9",
          ],
        },
      ],
      message:
        "transfer 0.0005 eth to 0xB6A5A72F5D811B6a6d9Ea653C919b6eAc6B1D3b2",
      messageId: 734,
      simstatus: 0,
      conditions: [],
      description:
        "The transfer of 0.0005 ETH tokens to 0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2 has been initiated.",
    },
    timestamp: "1700016783093",
    totalfees: 100,
    paidfees: 0,
    createdAt: "2023-11-15T02:53:03.093Z",
    updatedAt: "2023-11-15T02:53:03.093Z",
  },
  {
    id: 68,
    useraddress: "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd",
    conditions: [],
    actions: [
      {
        id: "m2c0",
        args: {
          token: "eth",
          amount: "0.0005",
          chainName: "Ethereum",
          recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
          sourceChainName: "Ethereum",
        },
        name: "transfer",
        txHashes: [
          "0x5a74240d9ef69c33e4ed638dad69771998b885193480293f7727a79802ab76b1",
        ],
      },
      {
        id: "m2c1",
        args: {
          token: "eth",
          amount: "0.0005",
          chainName: "Ethereum",
          recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
          sourceChainName: "Ethereum",
        },
        name: "fee",
      },
    ],
    query: {
      id: "m2",
      calls: [
        {
          id: "m2c0",
          args: {
            token: "eth",
            amount: "0.0005",
            recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
          },
          name: "transfer",
          txHashes: [
            "0x5a74240d9ef69c33e4ed638dad69771998b885193480293f7727a79802ab76b1",
          ],
        },
      ],
      actions: [
        {
          id: "m2c0",
          args: {
            token: "eth",
            amount: "0.0005",
            chainName: "Ethereum",
            recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
            sourceChainName: "Ethereum",
          },
          name: "transfer",
          txHashes: [
            "0x5a74240d9ef69c33e4ed638dad69771998b885193480293f7727a79802ab76b1",
          ],
        },
      ],
      message:
        "transfer 0.0005 eth to 0xB6A5A72F5D811B6a6d9Ea653C919b6eAc6B1D3b2",
      messageId: 735,
      simstatus: 0,
      conditions: [],
      description:
        "The transfer of 0.0005 ETH tokens to 0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2 has been initiated.",
    },
    timestamp: "1700016892550",
    totalfees: null,
    paidfees: null,
    createdAt: "2023-11-15T02:54:52.551Z",
    updatedAt: "2023-11-15T02:54:52.551Z",
  },
  {
    id: 69,
    useraddress: "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd",
    conditions: [],
    actions: [
      {
        id: "m3c0",
        args: {
          token: "eth",
          amount: "0.0005",
          chainName: "Ethereum",
          recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
          sourceChainName: "Ethereum",
        },
        name: "transfer",
        txHashes: [
          "0xfe8b3a1de9ef41f645fdf28289ba241e01b86be10558c7ad988c195f9e99438d",
        ],
      },
    ],
    query: {
      id: "m3",
      calls: [
        {
          id: "m3c0",
          args: {
            token: "eth",
            amount: "0.0005",
            recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
          },
          name: "transfer",
          txHashes: [
            "0xfe8b3a1de9ef41f645fdf28289ba241e01b86be10558c7ad988c195f9e99438d",
          ],
        },
      ],
      actions: [
        {
          id: "m3c0",
          args: {
            token: "eth",
            amount: "0.0005",
            chainName: "Ethereum",
            recipient: "0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2",
            sourceChainName: "Ethereum",
          },
          name: "transfer",
          txHashes: [
            "0xfe8b3a1de9ef41f645fdf28289ba241e01b86be10558c7ad988c195f9e99438d",
          ],
        },
      ],
      message:
        "transfer 0.0005 eth to 0xB6A5A72F5D811B6a6d9Ea653C919b6eAc6B1D3b2",
      messageId: 736,
      simstatus: 0,
      conditions: [],
      description:
        "The transfer of 0.0005 ETH tokens to 0xb6a5a72f5d811b6a6d9ea653c919b6eac6b1d3b2 has been initiated.",
    },
    timestamp: "1700016963319",
    totalfees: null,
    paidfees: null,
    createdAt: "2023-11-15T02:56:03.319Z",
    updatedAt: "2023-11-15T02:56:03.319Z",
  },
];

describe("updateOwedFee", () => {
  it("correctly updates owed fees for a user", async () => {
    const accountAddress = "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd";
    (Histories.findAll as jest.Mock).mockResolvedValue(mockUserHistories);

    const result = await updateOwedFee(accountAddress, true);

    // Assertions
    expect(Histories.findAll).toHaveBeenCalledWith({
      where: { useraddress: accountAddress.toLowerCase() },
      raw: true,
    });
    expect(result).toEqual({
      success: true,
      message: { totalFeesChanges: 90, paidFeesChanges: 0 },
    });
  });
  it("handles the case with no histories found", async () => {
    (Histories.findAll as jest.Mock).mockResolvedValue([]);
    const accountAddress = "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd";

    const result = await updateOwedFee(accountAddress, true);

    expect(Histories.findAll).toHaveBeenCalledWith({
      where: { useraddress: accountAddress.toLowerCase() },
      raw: true,
    });
    expect(result).toEqual({
      success: true,
      message: { totalFeesChanges: 0, paidFeesChanges: 0 },
    });
  });
  it("handles the case with a historical fee payment", async () => {
    (Histories.findAll as jest.Mock).mockResolvedValue(mockUserHistories2);
    const accountAddress = "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd";

    const result = await updateOwedFee(accountAddress, true);

    expect(Histories.findAll).toHaveBeenCalledWith({
      where: { useraddress: accountAddress.toLowerCase() },
      raw: true,
    });
    expect(result).toEqual({
      success: true,
      message: { totalFeesChanges: 60, paidFeesChanges: 100 },
    });
  });
});
