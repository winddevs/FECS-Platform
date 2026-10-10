// Use-case journeys of the fashion platform (Requirement section 7), driven
// over HTTP against the docker stack. See docker/e2e/run.sh.
//
//   JOURNEYS=make-to-stock,made-to-order,social,returns   (default: all)
import { checkCount, mock } from "./lib.mjs";
import { setup } from "./setup.mjs";

const wanted = (
  process.env.JOURNEYS ?? "smoke,make-to-stock,made-to-order,social,returns"
).split(",");
const journeys = {
  smoke: () => import("./smoke.mjs").then((m) => m.smoke),
  "make-to-stock": () =>
    import("./make-to-stock.mjs").then((m) => m.makeToStock),
  "made-to-order": () =>
    import("./made-to-order.mjs").then((m) => m.madeToOrder),
  social: () => import("./social.mjs").then((m) => m.social),
  returns: () => import("./returns.mjs").then((m) => m.returns),
};

const started = Date.now();
try {
  await mock.reset();
  const ctx = await setup();
  for (const name of wanted) {
    await (
      await journeys[name]()
    )(ctx);
  }
  console.log(
    `\nE2E PASSED (${checkCount()} checks, ${((Date.now() - started) / 1000).toFixed(0)}s)`
  );
} catch (error) {
  console.error(
    `\nE2E FAILED after ${checkCount()} checks: ${error.stack ?? error}`
  );
  process.exit(1);
}
