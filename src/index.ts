import dotEnv from "dotenv";
import webpush from "web-push";
import app from "./app.js";
import { checkTx } from "./handler.js";

dotEnv.config();

const port = process.env.PORT || 5000;

const subject = process.env.SUBJECT ?? "mailto: <niyant@slate.ceo>";
const publicVapidKey = process.env.PUBLIC_VAPID_KEY ?? "";
const privateVapidKey = process.env.PRIVATE_VAPID_KEY ?? "";
webpush.setVapidDetails(subject, publicVapidKey, privateVapidKey);

if (process.argv[2] === "checkTx") {
  // prod
  console.log("called with checkTx");
  await checkTx(undefined, true);
} else if (process.argv[2] === "checkTxXp") {
  // test
  console.log("called with checkTxXp");
  await checkTx();
} else {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}!`);
  });
}
