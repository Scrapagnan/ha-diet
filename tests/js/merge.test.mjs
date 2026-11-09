// Run: node tests/js/merge.test.mjs. Loads mergeProfiles from the panel source without a browser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const panel = fileURLToPath(new URL("../../custom_components/shared_diet/frontend/shared-diet-panel.js", import.meta.url));
const ctx = { HTMLElement: class {}, customElements: { get: () => undefined, define() {} } };
vm.createContext(ctx);
const { mergeProfiles } = vm.runInContext(`${readFileSync(panel, "utf8")}\n;({ mergeProfiles });`, ctx);

// Results are built in the vm realm; round-trip them so deepStrictEqual compares plain objects.
const plain = (v) => JSON.parse(JSON.stringify(v));
const merge = (base, mine, theirs) => {
  const { merged, overlaps } = mergeProfiles(base, mine, theirs);
  return { merged: plain(merged), overlaps: plain(overlaps) };
};

const meal = (id) => ({ id, name: id, time: "13:00", options: [[{ alts: [{ food: "Pasta", qty: 80, unit: "g", note: "" }] }]] });
const base = () => ({
  id: "p1", name: "Luca", person: null, reminder: { enabled: false, minutes: 15, notify: null },
  week: { 0: [meal("pranzo")], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
  exceptions: {}, choices: { defaults: {}, dates: {} }, recipe_qty: {}, rev: 3,
});

// Disjoint edits: mine changes week["0"], theirs changes choices.defaults -> both kept.
{
  const b = base();
  const mine = base(); mine.week[0] = [meal("cena")];
  const theirs = base(); theirs.choices.defaults.pranzo = { option: 0, lines: {} }; theirs.rev = 4;
  const { merged, overlaps } = merge(b, mine, theirs);
  assert.deepStrictEqual(merged.week[0], mine.week[0]);
  assert.deepStrictEqual(merged.choices.defaults, { pranzo: { option: 0, lines: {} } });
  assert.deepStrictEqual(overlaps, []);
  assert.equal(merged.rev, 4);
}

// Same-key overlap: both changed week["0"] differently -> theirs kept and listed.
{
  const b = base();
  const mine = base(); mine.week[0] = [meal("cena")];
  const theirs = base(); theirs.week[0] = [meal("colazione")]; theirs.rev = 4;
  const { merged, overlaps } = merge(b, mine, theirs);
  assert.deepStrictEqual(merged.week[0], theirs.week[0]);
  assert.deepStrictEqual(overlaps, ["week.0"]);
}

// Exception added by theirs survives a merge where mine edited the weekly schema.
{
  const b = base();
  const mine = base(); mine.week[0] = [meal("cena")];
  const theirs = base(); theirs.exceptions["2026-11-10"] = [meal("festa")]; theirs.rev = 4;
  const { merged, overlaps } = merge(b, mine, theirs);
  assert.deepStrictEqual(merged.exceptions, { "2026-11-10": [meal("festa")] });
  assert.deepStrictEqual(merged.week[0], mine.week[0]);
  assert.deepStrictEqual(overlaps, []);
}

// Key changed by neither side -> theirs (which here equals base, plus theirs' own change elsewhere).
{
  const b = base();
  const mine = base(); mine.week[0] = [meal("cena")];
  const theirs = base(); theirs.reminder.minutes = 30; theirs.rev = 4;
  const { merged, overlaps } = merge(b, mine, theirs);
  assert.deepStrictEqual(merged.reminder, { enabled: false, minutes: 30, notify: null });
  assert.deepStrictEqual(overlaps, []);
}

// Disjoint edits: mine changes recipe_qty.r1, theirs changes week.0 -> both kept.
{
  const b = base();
  const mine = base(); mine.recipe_qty.r1 = { i1: 80 };
  const theirs = base(); theirs.week[0] = [meal("cena")]; theirs.rev = 4;
  const { merged, overlaps } = merge(b, mine, theirs);
  assert.deepStrictEqual(merged.recipe_qty, { r1: { i1: 80 } });
  assert.deepStrictEqual(merged.week[0], theirs.week[0]);
  assert.deepStrictEqual(overlaps, []);
}

// Same recipe_qty key changed differently on both sides -> theirs kept and listed.
{
  const b = base();
  const mine = base(); mine.recipe_qty.r1 = { i1: 80 };
  const theirs = base(); theirs.recipe_qty.r1 = { i1: 20 }; theirs.rev = 4;
  const { merged, overlaps } = merge(b, mine, theirs);
  assert.deepStrictEqual(merged.recipe_qty, { r1: { i1: 20 } });
  assert.deepStrictEqual(overlaps, ["recipe_qty.r1"]);
}

console.log("merge.test.mjs: all assertions passed");
