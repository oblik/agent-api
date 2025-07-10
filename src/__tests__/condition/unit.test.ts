import request from "supertest";
import app from "../../app.js";
import { ConditionsDev, Histories, Tracking } from "../../db/index.js";
import { checkTx } from "../../handler.js";
import { fillBody } from "../../utils/index.js";
import type { Call, CommonArgs, Query } from "../../utils/types.js";
import { groupConditions, parseTime } from "../helper.js";

const backendSecret = process.env.BACKEND_TOKEN_SECRET;

describe("Condition", () => {
  beforeEach(() => {
    console.log(expect.getState().currentTestName);
  });

  const address = "0xD86Ac74165F26cb77383E0947c182BD2885F527B";

  let query: Query;
  let conditionId: number;
  let messageId: number;

  it("firstsimstatus is success, change status properly in 1 minute", async () => {
    const startTime = Number(
      await saveCondition("swap 2 dai for eth in 1 minute"),
    );
    let condition = await getCondition();

    expect(condition).not.toBeUndefined();

    expect(condition).toHaveProperty("useraddress");
    expect(condition).toHaveProperty("messageId");
    expect(condition).toHaveProperty("conditions");
    expect(condition).toHaveProperty("actions");
    expect(condition).toHaveProperty("query");
    expect(condition).toHaveProperty("status");
    expect(condition).toHaveProperty("simstatus");

    expect(condition?.useraddress).toEqual(address.toLowerCase());
    expect(condition?.messageId).toEqual(messageId);
    expect(condition?.conditions).toHaveLength(1);
    expect(condition?.actions).toHaveLength(1);
    expect(condition?.status).toEqual("pending");
    expect(condition?.simstatus).toEqual(0);

    if (startTime * 1000 > Date.now())
      await new Promise((r) => setTimeout(r, startTime * 1000 - Date.now()));
    await checkTx();

    condition = await getCondition();
    expect(condition?.status).toEqual("ready");
  });

  it("Should generate transactions", async () => {
    const condition = await getCondition();
    const body = fillBody(
      condition?.actions[0].name,
      condition?.actions[0].args,
      address,
    );
    const res = await request(app)
      .post(`/${condition?.actions[0].name}?secret=${backendSecret}`)
      .send(body);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(2);
  });

  it("firstsimstatus is failed, change status properly", async () => {
    // set gas as condition meets
    await saveCondition("swap 2 usdc for eth when gas is above 20");

    let condition = await getCondition();
    expect(condition?.simstatus).toEqual(1);
    expect(condition?.status).toEqual("pending"); // optional

    await checkTx();

    condition = await getCondition();
    expect(condition?.status).toEqual("ready");
  });

  it("finalize condition call execution with different status", async () => {
    const condition = await getCondition();
    const conditions = condition?.conditions;
    const actions = condition?.actions;
    const body = {
      accountAddress: address,
      conditions,
      query,
      actions,
    };
    let prevHistoryId = await getLastHistoryId();
    // user canceled but all actions were executed already
    await finalize(true, true, true, body);
    // expected result: history saved, execution status success
    let tracking = await getTracking();
    let historyId = await getLastHistoryId();
    expect(tracking?.executed_status).toEqual(0);
    prevHistoryId = historyId;

    // user canceled and one action was executed already, but not for all
    await finalize(true, true, false, body);
    // expected result: history saved, execution status canceled
    tracking = await getTracking();
    historyId = await getLastHistoryId();
    expect(tracking?.executed_status).toEqual(2);
    expect(historyId).toEqual(prevHistoryId + 1);
    prevHistoryId = historyId;

    // user canceled and no actions were executed yet
    await finalize(true, false, false, body);
    // expected result: history not saved, execution status canceled
    tracking = await getTracking();
    historyId = await getLastHistoryId();
    expect(tracking?.executed_status).toEqual(2);
    expect(historyId).toEqual(prevHistoryId);
    prevHistoryId = historyId;

    // user didn't cancel and all actions were executed already
    await finalize(false, true, true, body);
    // expected result: history saved, execution status success
    tracking = await getTracking();
    historyId = await getLastHistoryId();
    expect(tracking?.executed_status).toEqual(0);
    expect(historyId).toEqual(prevHistoryId + 1);
    prevHistoryId = historyId;

    // user didn't cancel and not all actions were executed
    await finalize(false, true, false, body);
    // expected result: history not saved, execution status failed
    tracking = await getTracking();
    historyId = await getLastHistoryId();
    expect(tracking?.executed_status).toEqual(1);
    expect(historyId).toEqual(prevHistoryId);
    prevHistoryId = historyId;

    // user didn't cancel and no actions were executed
    await finalize(false, false, false, body);
    // expected result: history not saved, execution status failed
    tracking = await getTracking();
    historyId = await getLastHistoryId();
    expect(tracking?.executed_status).toEqual(1);
    expect(historyId).toEqual(prevHistoryId);
    prevHistoryId = historyId;
  });

  it("group conditions revert when end_time case has no nearby condition", () => {
    const calls: Call[] = [
      {
        name: "transfer",
        body: {},
        args: {},
      },
      {
        name: "condition",
        body: {},
        args: {},
      },
      {
        name: "time",
        body: {},
        args: {
          end_time: "1",
          recurrence: {
            times: 2,
          },
        },
      },
      {
        name: "time",
        body: {},
        args: {
          end_time: "1",
        },
      },
      {
        name: "transfer",
        body: {},
        args: {},
      },
      {
        name: "condition",
        body: {},
        args: {},
      },
      {
        name: "transfer",
        body: {},
        args: {},
      },
    ];
    const { status, message } = groupConditions(calls);
    expect(status).toEqual(-1);
    expect(message).toEqual(
      "end_time specified without recurrence or nearby condition",
    );
  });

  it("group conditions case 1", () => {
    /**
     * acttaca
     * a1 => [t1]
     * a2 => [c1, t2]
     * a3 => [c2, t2]
     */
    const calls: Call[] = [
      {
        name: "transfer",
        body: {},
        args: {},
      },
      {
        name: "condition",
        body: {},
        args: {},
      },
      {
        name: "time",
        body: {},
        args: {},
      },
      {
        name: "time",
        body: {},
        args: {},
      },
      {
        name: "transfer",
        body: {},
        args: {},
      },
      {
        name: "condition",
        body: {},
        args: {},
      },
      {
        name: "transfer",
        body: {},
        args: {},
      },
    ];
    const { status, conditions } = groupConditions(calls);
    expect(status).toEqual(1);
    expect(conditions?.[0].actions).toHaveLength(1);
    expect(conditions?.[0].conditions).toHaveLength(1);
    expect(conditions?.[1].actions).toHaveLength(1);
    expect(conditions?.[1].conditions).toHaveLength(2);
    expect(conditions?.[2].actions).toHaveLength(1);
    expect(conditions?.[2].conditions).toHaveLength(2);
  });

  it("group conditions case 2", () => {
    /**
     * actacta
     * a1 => []
     * a2 => [c1, t1]
     * a3 => [c2, t2]
     */
    const calls: Call[] = [
      {
        name: "transfer",
        body: {},
        args: {},
      },
      {
        name: "condition",
        body: {},
        args: {},
      },
      {
        name: "time",
        body: {},
        args: {},
      },
      {
        name: "transfer",
        body: {},
        args: {},
      },
      {
        name: "condition",
        body: {},
        args: {},
      },
      {
        name: "time",
        body: {},
        args: {},
      },
      {
        name: "transfer",
        body: {},
        args: {},
      },
    ];
    const { status, conditions } = groupConditions(calls);
    expect(status).toEqual(1);
    expect(conditions?.[0].actions).toHaveLength(1);
    expect(conditions?.[0].conditions).toHaveLength(0);
    expect(conditions?.[1].actions).toHaveLength(1);
    expect(conditions?.[1].conditions).toHaveLength(2);
    expect(conditions?.[2].actions).toHaveLength(1);
    expect(conditions?.[2].conditions).toHaveLength(2);
  });

  it("group conditions case 3 for end_time case", () => {
    /**
     * actca
     * a1 => [c1, t]
     * a2 => [c2]
     */
    const calls: Call[] = [
      {
        name: "transfer",
        body: {},
        args: {},
      },
      {
        name: "condition",
        body: {},
        args: {},
      },
      {
        name: "time",
        body: {},
        args: {
          end_time: "1",
        },
      },
      {
        name: "condition",
        body: {},
        args: {},
      },
      {
        name: "transfer",
        body: {},
        args: {},
      },
    ];
    const { status, conditions } = groupConditions(calls);
    expect(status).toEqual(1);
    expect(conditions?.[0].actions).toHaveLength(1);
    expect(conditions?.[0].conditions).toHaveLength(2);
    expect(conditions?.[1].actions).toHaveLength(1);
    expect(conditions?.[1].conditions).toHaveLength(1);
  });

  it("group conditions case 4 for end_time case", () => {
    /**
     * acatca
     * a1 => []
     * a2 => [c1]
     * a3 => [c2, t]
     */
    const calls: Call[] = [
      {
        name: "transfer",
        body: {},
        args: {},
      },
      {
        name: "condition",
        body: {},
        args: {},
      },
      {
        name: "transfer",
        body: {},
        args: {},
      },
      {
        name: "time",
        body: {},
        args: {
          end_time: "1",
        },
      },
      {
        name: "condition",
        body: {},
        args: {},
      },
      {
        name: "transfer",
        body: {},
        args: {},
      },
    ];
    const { status, conditions } = groupConditions(calls);
    expect(status).toEqual(1);
    expect(conditions?.[0].actions).toHaveLength(1);
    expect(conditions?.[0].conditions).toHaveLength(0);
    expect(conditions?.[1].actions).toHaveLength(1);
    expect(conditions?.[1].conditions).toHaveLength(1);
    expect(conditions?.[2].actions).toHaveLength(1);
    expect(conditions?.[2].conditions).toHaveLength(2);
  });

  it("overhaul 1", () => {
    /**
     * aac, [[a],[a,c]]
     * a1 => []
     * a2 => [c]
     */
    const calls: Call[] = [
      {
        name: "swap",
        body: {},
        args: {},
      },
      {
        name: "swap",
        body: {},
        args: {},
      },
      {
        name: "condition",
        body: {},
        args: {},
      },
    ];
    const { status, conditions } = groupConditions(calls, [
      ["swap"],
      ["swap", "condition"],
    ]);
    expect(status).toEqual(1);
    expect(conditions?.[0].actions).toHaveLength(1);
    expect(conditions?.[0].conditions).toHaveLength(0);
    expect(conditions?.[1].actions).toHaveLength(1);
    expect(conditions?.[1].conditions).toHaveLength(1);
  });

  it("overhaul 2", () => {
    /**
     * atat, [[a],[a,t],[t]]
     * a1 => [t2]
     * a2 => [t1, t2]
     */
    const calls: Call[] = [
      {
        name: "swap",
        body: {},
        args: {},
      },
      {
        name: "time",
        body: {},
        args: {},
      },
      {
        name: "swap",
        body: {},
        args: {},
      },
      {
        name: "time",
        body: {},
        args: {},
      },
    ];
    const { status, conditions } = groupConditions(calls, [
      ["swap"],
      ["swap", "time"],
      ["time"],
    ]);
    expect(status).toEqual(1);
    expect(conditions?.[0].actions).toHaveLength(1);
    expect(conditions?.[0].conditions).toHaveLength(1);
    expect(conditions?.[1].actions).toHaveLength(1);
    expect(conditions?.[1].conditions).toHaveLength(2);
  });

  it("overhaul 3", () => {
    /**
     * taactac, [[t],[a,c],[t,a],[c]]
     * a1 => [t1, c1, c2]
     * a2 => [t1, t2, c2]
     */
    const calls: Call[] = [
      {
        name: "time",
        body: {},
        args: {},
      },
      {
        name: "swap",
        body: {},
        args: {},
      },
      {
        name: "swap",
        body: {},
        args: {},
      },
      {
        name: "condition",
        body: {},
        args: {},
      },
      {
        name: "time",
        body: {},
        args: {},
      },
      {
        name: "swap",
        body: {},
        args: {},
      },
      {
        name: "condition",
        body: {},
        args: {},
      },
    ];
    const { status, conditions } = groupConditions(calls, [
      ["time"],
      ["swap", "condition"],
      ["time", "swap"],
      ["condition"],
    ]);
    expect(status).toEqual(1);
    expect(conditions?.[0].actions).toHaveLength(1);
    expect(conditions?.[0].conditions).toHaveLength(3);
    expect(conditions?.[1].actions).toHaveLength(1);
    expect(conditions?.[1].conditions).toHaveLength(3);
  });

  it("overhaul 4", () => {
    /**
     * cattca, [[c],[a,t],[t,c,a]]
     * a1 => [c1, t1]
     * a2 => [c1, t2, c2]
     */
    const calls: Call[] = [
      {
        name: "condition",
        body: {},
        args: {},
      },
      {
        name: "swap",
        body: {},
        args: {},
      },
      {
        name: "time",
        body: {},
        args: {},
      },
      {
        name: "time",
        body: {},
        args: {},
      },
      {
        name: "condition",
        body: {},
        args: {},
      },
      {
        name: "swap",
        body: {},
        args: {},
      },
    ];
    const { status, conditions } = groupConditions(calls, [
      ["condition"],
      ["swap", "time"],
      ["time", "condition", "swap"],
    ]);
    expect(status).toEqual(1);
    expect(conditions?.[0].actions).toHaveLength(1);
    expect(conditions?.[0].conditions).toHaveLength(2);
    expect(conditions?.[1].actions).toHaveLength(1);
    expect(conditions?.[1].conditions).toHaveLength(3);
  });

  describe("overhaul specific cases", () => {
    const cases = [
      {
        message: "close $w short on hyperliquid when price <0.2$",
        conditions: [1],
      },
      {
        message:
          "swap $10 of eth for usdc. then in 30 minutes swap the usdc to eth. repeat this 10 times",
        conditions: [1, 2],
      },
      {
        message:
          "swap $10 of eth for usdc. then in 30 minutes swap the usdc to eth. repeat this 10x",
        conditions: [1, 2],
      },
      {
        message:
          "bridge $10 of eth from arbitrum to base 10 times over the next 24 hours",
        conditions: [1],
      },
      {
        message:
          "bridge $10 of eth from arbitrum to base every 30 minutes, 10 times.",
        conditions: [1],
      },
      {
        message:
          "bridge between $10 and $25 of eth from arbitrum to base. in 30 minutes, bridge it from base to arbitrum",
        conditions: [0, 1],
      },
      {
        message:
          "bridge $10 of eth from arbitrum to base 10 times over the next 24 hours. Do this randomly.",
        conditions: [1],
      },
      {
        message:
          "bridge $10 of eth from arbitrum to base. bridge it back from base to arbitrum after 30 minutes. do this once a day, indefinitely",
        conditions: [0, 1],
      },
      {
        message:
          "when the funding rate is negative, long sol with $100 usdc. then, close the sol position when funding rate turns positive. repeat this forever.",
        conditions: [2, 2],
      },
      {
        message:
          "when the funding rate is positive, short sol with $100 usdc. then, close the sol position when funding rate turns negative. repeat this forever.",
        conditions: [2, 2],
      },
      {
        message:
          "buy dai with 88 usdc on arbitrum. sell when arb price dips 50%",
        conditions: [0, 1],
      },
      {
        message:
          "Short $w with 5x leverage using 100 usdc on hyperliquid. Close $w short when the price hits 0.2$",
        conditions: [0, 1],
      },
    ];

    const CONDITIONS = ["condition", "time"];
    for (let i = 0; i < cases.length; i++) {
      const tc = cases[i];

      it(tc.message, async () => {
        const {
          body: { data },
        } = await request(app)
          .post(`/process-message?secret=${backendSecret}`)
          .send({ user_address: address, message: tc.message });
        const { calls, message, message_id, groups } = data;
        if (!calls.find((x: Call) => CONDITIONS.includes(x.name))) return;

        messageId = message_id;

        query = {
          message: tc.message,
          messageId,
          calls,
          conditions: [],
          actions: [],
          description: message,
          simstatus: 0,
        };
        const updatedCalls = query.calls.map((x) => ({
          ...x,
          body: parseTime(x.name, x.args),
        }));
        const { conditions } = groupConditions(updatedCalls, groups);
        expect(conditions).toHaveLength(tc.conditions.length);
        for (let j = 0; j < tc.conditions.length; j++) {
          expect(conditions?.[j].conditions).toHaveLength(tc.conditions[j]);
        }
      });
    }
  });

  async function saveCondition(command: string) {
    const {
      body: { data },
    } = await request(app)
      .post(`/process-message?secret=${backendSecret}`)
      .send({ user_address: address, message: command });
    const { calls, message, message_id } = data;
    messageId = message_id;

    query = {
      message: command,
      messageId,
      calls,
      conditions: [],
      actions: [],
      description: message,
      simstatus: 0,
    };
    const updatedCalls = query.calls.map((x) => ({
      ...x,
      body: parseTime(x.name, x.args),
    }));
    const { conditions } = groupConditions(updatedCalls);

    const res = await request(app)
      .post(`/add-condition?secret=${backendSecret}&isDev=true`)
      .send({
        accountAddress: address,
        query: { ...query, calls: updatedCalls },
        conditions,
        connectedChainName: "ethereum",
        messageId,
      });
    conditionId = res.body.ids[0];
    return updatedCalls[1].body.start_time;
  }

  async function getCondition() {
    return await ConditionsDev.findOne({
      where: { id: conditionId },
      raw: true,
    });
  }

  /**
   *
   * @param isCanceled true means user clicked cancel after confirmed button
   * @param isTxSubmitted true means at least one action's simulation is passed
   *  and mined onchain
   * @param isAllLooped true means it looped all actions already
   * @param body json body for history call
   */
  async function finalize(
    isCanceled: boolean,
    isTxSubmitted: boolean,
    isAllLooped: boolean,
    body: CommonArgs,
  ) {
    await request(app)
      .post(`/set-executed-status?secret=${backendSecret}`)
      .send({
        messageId,
        status: isCanceled && !isAllLooped ? 2 : isAllLooped ? 0 : 1,
      });
    if (isTxSubmitted && (isCanceled || isAllLooped))
      await request(app).post(`/history?secret=${backendSecret}`).send(body);
  }

  async function getTracking() {
    return await Tracking.findOne({ where: { id: messageId }, raw: true });
  }

  async function getLastHistoryId() {
    const histories = await Histories.findAll({
      order: [["id", "DESC"]],
      raw: true,
    });
    return histories[0].id;
  }
});
