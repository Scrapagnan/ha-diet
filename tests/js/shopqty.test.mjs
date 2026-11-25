// Run: node tests/js/shopqty.test.mjs. Loads the shopping-text helpers from the panel source without a browser.
import assert from "node:assert/strict";
import { loadPanel } from "./load.mjs";

const ctx = { HTMLElement: class {}, customElements: { get: () => undefined, define() {} } };
const { shopQty, splitQty, shopText } = loadPanel(ctx, ["shopQty", "splitQty", "shopText"]);
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

const split = (s) => { const m = splitQty(s); return m ? [m[1], m[2]] : null; };
assert.deepEqual(split("Pollo - 1,05 kg"), ["Pollo", "1,05 kg"]);
assert.deepEqual(split("Olio - 70 ml"), ["Olio", "70 ml"]);
assert.deepEqual(split("Sale (q.b.)"), ["Sale", "q.b."]);
assert.equal(split("Detersivo piatti"), null);
assert.equal(split("Pasta - integrale"), null);
console.log("splitqty ok");

// Items typed by hand: same text as the server's rows.
assert.equal(shopText("Latte", 1.5, "l"), "Latte - 1,5 l");
assert.equal(shopText("Farina", 2500, "g"), "Farina - 2,5 kg");
assert.equal(shopText("Farina", 1000, "g"), "Farina - 1000 g");
assert.equal(shopText("Uova", 6, ""), "Uova - 6");
assert.deepEqual(split(shopText("Farina", 1050, "g")), ["Farina", "1,05 kg"]);
console.log("shoptext ok");
