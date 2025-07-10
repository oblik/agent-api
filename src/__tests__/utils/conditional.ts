/* eslint-disable no-await-in-loop */
import { Op } from "sequelize";
import request from "supertest";
import app from "../../app.js";
import { ConditionsDev } from "../../db/index.js";
import { checkTx } from "../../handler.js";
import { getErrorMessage, sleep } from "../../utils/index.js";
import type { Call, JSONObject } from "../../utils/types.js";
import { groupConditions, parseTime } from "../helper.js";
import { DEFAULT_TEST_ADDRESS, backendSecret } from "./common.js";

export async function testStatus(rawIds: number[], shouldReady: boolean) {
  const ids = [...rawIds];
  let onePassed = false;
  try {
    let count = 0;
    while (count++ < 5 && ids.length > 0) {
      await checkTx(ids);

      const entities = await getConditions(ids);
      let i = 0;
      for (; i < entities.length; i++)
        if (entities[i].status === "ready") break;
      if (i < entities.length) {
        expect(entities[i].status).toEqual("ready");
        ids.splice(i, 1);
        onePassed = true;
        break;
      }
      await sleep(15);
    }
  } catch (err) {
    console.log(getErrorMessage(err));
  }
  expect(onePassed).toEqual(shouldReady);
}

export async function test(
  calls: JSONObject[],
  accountAddress = DEFAULT_TEST_ADDRESS,
  shouldPending = false,
) {
  let ids = [];
  try {
    const { status, conditions } = groupConditions(
      calls.map((x) => ({
        ...(x as Call),
        body: parseTime(x.name, x.args),
      })),
    );
    expect(status).toEqual(1);
    const res = await request(app)
      .post(`/add-condition?secret=${backendSecret}&isDev=true`)
      .send({
        accountAddress,
        connectedChainName: "Ethereum",
        conditions,
        messageId: 1,
      });
    ids = res.body.ids || [];
  } catch (err) {
    console.log(getErrorMessage(err));
  }
  expect(ids.length).toBeGreaterThan(0);
  await testStatus(ids, !shouldPending);
  return ids;
}

export async function completeConditions(ids: number[]) {
  const conditions = await ConditionsDev.findAll({
    where: { id: { [Op.in]: ids } },
  });
  for (const condition of conditions) {
    condition.set("status", "executing");
    await condition.save();
  }
  await Promise.all(
    ids.map((id) =>
      request(app).post(`/update-condition?secret=${backendSecret}`).send({
        accountAddress: DEFAULT_TEST_ADDRESS,
        conditionId: id,
        status: "pending",
      }),
    ),
  );
}

export async function getConditions(ids: number[]) {
  return await ConditionsDev.findAll({
    where: { id: { [Op.in]: ids } },
    raw: true,
  });
}

export async function deleteConditions() {
  await ConditionsDev.destroy({
    where: {
      useraddress: DEFAULT_TEST_ADDRESS.toLowerCase(),
      status: {
        [Op.or]: ["ready", "pending"],
      },
    },
  });
}
