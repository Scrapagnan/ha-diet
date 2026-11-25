// Run: node tests/js/shopqty.test.mjs. Loads shopQty from the panel source without a browser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const panel = fileURLToPath(new URL("../../custom_components/shared_diet/frontend/shared-diet-panel.js", import.meta.url));
const ctx = { HTMLElement: class {}, customElements: { get: () => undefined, define() {} } };
vm.createContext(ctx);
const { shopQty } = vm.runInContext(`${readFileSync(panel, "utf8")}\n;({ shopQty });`, ctx);
const run = (edits, skip = []) => JSON.parse(JSON.stringify(shopQty(rows, new Map(edits), new Set(skip))));

const rows = [
  { text: "Pasta - 80 g", food: "Pasta", qty: 80, unit: "g" },
  { text: "Pollo - 300 g", food: "Pollo", qty: 300, unit: "g" },
  { text: "Sale (q.b.)", food: "Sale", qty: null, unit: "" },
];

assert.deepEqual(run([]), {});
assert.deepEqual(run([["Pasta - 80 g", "250.5"], ["Pollo - 300 g", "300"]]), { "Pasta - 80 g": 250.5 }); // unchanged: not sent
assert.deepEqual(run([["Pasta - 80 g", " "]]), {}); // empty: computed quantity
assert.deepEqual(run([["Sale (q.b.)", "5"]]), {}); // no quantity: not editable
assert.deepEqual(run([["Pasta - 80 g", "0"]], ["Pasta - 80 g"]), {}); // skipped rows are not checked
assert.throws(() => run([["Pasta - 80 g", "0"]]), /Pasta/);
assert.throws(() => run([["Pasta - 80 g", "-1"]]), /Pasta/);
assert.throws(() => run([["Pasta - 80 g", "abc"]]), /Pasta/);
assert.throws(() => run([["Pasta - 80 g", "?"]]), /Pasta/); // unparsable input (badInput)
assert.throws(() => run([["Pasta - 80 g", "100001"]]), /Pasta/);
assert.deepEqual(run([["Pasta - 80 g", "100000"]]), { "Pasta - 80 g": 100000 });
console.log("shopqty ok");
