import request from "supertest";
import app from "../../../app.js";
import { getChainError } from "../../../utils/error.js";
import { simulateTxs } from "../../helper.js";

const endpoint = `/transfer?secret=${process.env.BACKEND_TOKEN_SECRET}`;
jest.retryTimes(3);
describe("Transfer", () => {
  describe("Success", () => {
    it("When transfer native asset", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
        recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
        chainName: "Optimism",
        token: "ETH",
        amount: "10",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual("success");
      expect(res.body.transactions).toHaveLength(1);

      const success = await simulateTxs(
        42161,
        res.body.transactions,
        "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
        112494125,
      );
      expect(success).toEqual(true);
    });

    it("When transfer non-native asset", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
        recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
        chainName: "Optimism",
        token: "USDT",
        amount: "10",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual("success");
      expect(res.body.transactions).toHaveLength(1);

      const success = await simulateTxs(
        42161,
        res.body.transactions,
        "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
        112494125,
      );
      expect(success).toEqual(true);
    });

    it.skip("When transfer native asset on zkSync", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
        recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
        chainName: "zkSync",
        token: "ETH",
        amount: "10",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual("success");
      expect(res.body.transactions).toHaveLength(1);
    });

    it.skip("When transfer non-native asset on zkSync", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0x8FB9af3Bb0645Fca6979464999299D1511260d51",
        recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
        chainName: "zkSync",
        token: "USDC",
        amount: "1",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual("success");
      expect(res.body.transactions).toHaveLength(1);
    });

    it("When transfer native asset to ENS address", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
        recipient: "niyant.eth",
        chainName: "Ethereum",
        token: "ETH",
        amount: "10",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual("success");
      expect(res.body.transactions).toHaveLength(1);

      const success = await simulateTxs(
        1,
        res.body.transactions,
        "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
        18621400,
      );
      expect(success).toEqual(true);
    });

    it("When transfer non-native asset to ENS address", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
        recipient: "niyant.eth",
        chainName: "Ethereum",
        token: "USDT",
        amount: "10",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual("success");
      expect(res.body.transactions).toHaveLength(1);

      const success = await simulateTxs(
        1,
        res.body.transactions,
        "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
        18621400,
      );
      expect(success).toEqual(true);
    });
  });

  describe("Fail", () => {
    describe("With wrong recipient", () => {
      it("When transfer native asset to self address", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          chainName: "Ethereum",
          token: "ETH",
          amount: "10",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual(
          "You are trying to transfer to your Slate account. Commands only work for funds already in your Slate account. Please transfer funds manually to get started!",
        );
      });

      it("When transfer non-native asset to self address", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          chainName: "Ethereum",
          token: "Aave",
          amount: "10",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual(
          "You are trying to transfer to your Slate account. Commands only work for funds already in your Slate account. Please transfer funds manually to get started!",
        );
      });

      it("When transfer native asset to invalid recipient", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "",
          chainName: "Ethereum",
          token: "ETH",
          amount: "10",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual(
          "No recipient provided. Please specify a recipient for your transfer.",
        );
      });

      it("When transfer non-native asset to invalid recipient", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "",
          chainName: "Ethereum",
          token: "Aave",
          amount: "10",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual(
          "No recipient provided. Please specify a recipient for your transfer.",
        );
      });

      it("When transfer native asset to invalid ENS address", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "invalid.ens",
          chainName: "Ethereum",
          token: "ETH",
          amount: "10",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual(
          "The provided recipient invalid.ens is an invalid address. Please specify a valid recipient for your transfer.",
        );
      });

      it("When transfer non-native asset to invalid ENS address", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "invalid.ens",
          chainName: "Ethereum",
          token: "Aave",
          amount: "10",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual(
          "The provided recipient invalid.ens is an invalid address. Please specify a valid recipient for your transfer.",
        );
      });
    });

    describe("With wrong chain", () => {
      it("When transfer native asset on invalid chain", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
          chainName: "invalid chain",
          token: "ETH",
          amount: "10",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual(getChainError("invalid chain"));
      });

      it("When transfer non-native asset on invalid chain", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
          chainName: "",
          token: "Aave",
          amount: "10",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual("Missing chainName error");
      });
    });

    describe("With wrong asset", () => {
      it("When asset is empty", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
          chainName: "Arbitrum",
          token: "",
          amount: "10",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual(
          "Token symbol  or chain name Arbitrum is invalid.",
        );
      });

      it("When asset is invalid", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
          chainName: "Ethereum",
          token: "invalid asset",
          amount: "10",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual(
          "Token invalid asset not found on Ethereum. Ensure you specify a chain and token properly in your next prompt.",
        );
      });
    });

    describe("With wrong amount", () => {
      it("When transfer amount of native asset exceeds balance", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
          chainName: "Arbitrum",
          token: "ETH",
          amount: "2000000000",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toMatch(
          /Insufficient balance on Arbitrum. On your Slate account, you have [+-]?([0-9]*[.])?[0-9]+ and need 2000000000.0. Please onboard [+-]?([0-9]*[.])?[0-9]+ more eth and try again./i,
        );
      });

      it("When transfer amount of non-native asset exceeds balance", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
          chainName: "Ethereum",
          token: "Aave",
          amount: "2000000000",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toMatch("Insufficient balance");
      });

      it("When transfer amount of native asset is zero", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
          chainName: "Arbitrum",
          token: "ETH",
          amount: "0",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual(
          "The amount being used is zero, ensure you have funds on your Slate account",
        );
      });

      it("When transfer amount of non-native asset is zero", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
          chainName: "Ethereum",
          token: "Aave",
          amount: "0",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual(
          "The amount being used is zero, ensure you have funds on your Slate account",
        );
      });

      it("When transfer amount of native asset is negative", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
          chainName: "Arbitrum",
          token: "ETH",
          amount: "-10",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual(
          "-10 is an invalid amount. Please specify an amount correctly and try again.",
        );
      });

      it("When transfer amount of non-native asset is negative", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
          chainName: "Ethereum",
          token: "Aave",
          amount: "-10",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual(
          "-10 is an invalid amount. Please specify an amount correctly and try again.",
        );
      });

      it("When transfer amount of native asset is invalid", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
          chainName: "Arbitrum",
          token: "ETH",
          amount: "invalid amount",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual(
          "invalid amount is an invalid amount. Please specify an amount correctly and try again.",
        );
      });

      it("When transfer amount of non-native asset is invalid", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
          chainName: "Ethereum",
          token: "Aave",
          amount: "invalid amount",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toEqual("error");
        expect(res.body.message).toEqual(
          "invalid amount is an invalid amount. Please specify an amount correctly and try again.",
        );
      });
    });

    it("Insufficient balance", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xd6216fC19Db775df9774a6E33526131Da7D19a20",
        recipient: "0x3Ea26f9F185B0f0f0ff68C958A8Ac982100c4d62",
        chainName: "Ethereum",
        token: "USDC",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        "Insufficient balance on Ethereum. On your Slate account, you have 0.0 and need 100.0. Please onboard 100.0 more usdc and try again.",
      );
    });
  });
});
