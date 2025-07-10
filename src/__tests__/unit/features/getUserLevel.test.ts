import { Conditions, Histories, initModels } from "../../../db/index.js";

describe("getUserLevel", () => {
  const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";

  beforeEach(async () => {
    await initModels();
  });

  it("get user level", async () => {
    const userLevel: (number | null)[] = Array.from(
      { length: 11 },
      (_, i) => i + 1,
    );
    const userHistory: { [key: number]: string[] } = {};
    const userConditions: { [key: number]: string[] } = {};

    const histories = await Histories.findAll({
      where: { useraddress: accountAddress.toLowerCase() },
      attributes: ["id", "actions"],
      raw: true,
    });

    const conditions = await Conditions.findAll({
      where: { useraddress: accountAddress.toLowerCase() },
      attributes: ["id", "conditions"],
      raw: true,
    });
    console.log(conditions);

    if (histories.length === 0 && conditions.length === 0) {
      return 1;
    }

    for (const history of histories) {
      const historyId = history.id;
      const actionNames = history.actions.map((action) => action.name);
      userHistory[historyId] = actionNames;
    }

    for (const condition of conditions) {
      const conditionId = condition.id;
      const conditionTypes: string[] = [];
      for (const conditionObject of condition.conditions) {
        if (conditionObject.args) {
          if (conditionObject.args.type) {
            conditionTypes.push(conditionObject.args.type);
          }
          if (conditionObject.args.start_time) {
            conditionTypes.push("time");
          }
          if (conditionObject.args.recurrence) {
            conditionTypes.push("recurrence");
          }
        }
      }
      userConditions[conditionId] = conditionTypes;
    }

    if (
      Object.values(userHistory).some((actions) => actions.includes("swap"))
    ) {
      userLevel[0] = null;
    }

    if (
      Object.values(userHistory).some((actions) => actions.includes("bridge"))
    ) {
      userLevel[0] = null;
      userLevel[1] = null;
    }
    console.log(
      userConditions,
      Object.values(userConditions).some((types) => types.includes("time")),
    );
    if (Object.values(userConditions).some((types) => types.includes("time"))) {
      userLevel[2] = null;
    }

    if (
      Object.values(userHistory).some(
        (actions) => actions.includes("bridge") && actions.length > 1,
      )
    ) {
      userLevel[3] = null;
    }

    if (
      Object.values(userConditions).some((types) =>
        types.includes("recurrence"),
      )
    ) {
      userLevel[4] = null;
    }

    if (
      Object.values(userHistory).some((actions) => {
        const filteredActions = actions.filter(
          (action) => !["bridge", "transfer", "fee"].includes(action),
        );
        const uniqueActionsWithSingleSwap = [
          ...new Set(
            filteredActions.map((action) =>
              action === "swap" ? "swap" : action,
            ),
          ),
        ];
        return uniqueActionsWithSingleSwap.length > 1;
      })
    ) {
      userLevel[5] = null;
    }

    if (
      Object.values(userConditions).some((types) => types.includes("price"))
    ) {
      userLevel[6] = null;
    }

    if (
      Object.values(userConditions).some((types) =>
        types.includes("market cap"),
      )
    ) {
      userLevel[7] = null;
    }

    if (Object.values(userConditions).some((types) => types.includes("gas"))) {
      userLevel[8] = null;
    }

    if (Object.values(userConditions).some((types) => types.length > 1)) {
      userLevel[9] = null;
    }

    const value = userLevel.find((level) => level !== null);
    console.log(value);
    expect(value).toEqual(11);
  });
});
