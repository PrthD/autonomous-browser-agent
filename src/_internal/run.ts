import "dotenv-defaults/config";
import { main } from "../main";

(async () => {
  await main();
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
