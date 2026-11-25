// Run: node tests/js/subscribe.test.mjs. The panel and the cards share one shared_diet/subscribe per connection.
import assert from "node:assert/strict";
import vm from "node:vm";
import { coreSource } from "./load.mjs";

const ctx = {};
vm.createContext(ctx);
const { subscribeDiet } = vm.runInContext(`${coreSource()}\n;({ subscribeDiet });`, ctx);
const tick = () => new Promise((r) => setTimeout(r, 0));

// A fake connection: counts server subscriptions and their closes; push() sends to the open one.
function conn({ fail = false } = {}) {
  const c = { opened: 0, closed: 0, push: null };
  c.subscribeMessage = (cb, msg) => {
    assert.equal(msg.type, "shared_diet/subscribe");
    c.opened++;
    c.push = cb;
    return fail ? Promise.reject({ code: "not_loaded", message: "x" }) : Promise.resolve(() => { c.closed++; });
  };
  return c;
}

{
  const c = conn();
  const hass = { connection: c };
  const a = [], b = [];
  const unA = subscribeDiet(hass, (m) => a.push(m));
  const unB = subscribeDiet(hass, (m) => b.push(m));
  assert.equal(c.opened, 1); // one server subscription for both
  c.push({ n: 1 });
  assert.deepEqual([a.length, b.length], [1, 1]);
  const late = [];
  const unC = subscribeDiet(hass, (m) => late.push(m));
  assert.equal(late[0].n, 1); // a late subscriber gets the last push at once
  unA(); unA(); // idempotent
  unB();
  await tick();
  assert.equal(c.closed, 0); // still one subscriber
  unC();
  await tick();
  assert.equal(c.closed, 1); // the last one closes it
  subscribeDiet(hass, () => {});
  assert.equal(c.opened, 2); // a new subscriber opens a new one
}

{
  const c = conn({ fail: true });
  const hass = { connection: c };
  const errs = [];
  subscribeDiet(hass, (m, err) => errs.push(err.code));
  await tick();
  assert.deepEqual(errs, ["not_loaded"]);
  subscribeDiet(hass, () => {});
  assert.equal(c.opened, 2); // after an error the next subscriber retries
}

console.log("subscribe ok");
