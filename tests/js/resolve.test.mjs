// Run: node tests/js/resolve.test.mjs. Loads the panel's meal resolution, recipe expansion and read views without a browser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const panel = fileURLToPath(new URL("../../custom_components/shared_diet/frontend/shared-diet-panel.js", import.meta.url));
const ctx = {
  // The panel constructor calls attachShadow(); a plain stub is enough for rendering helpers.
  HTMLElement: class { attachShadow() { this.shadowRoot = { addEventListener() {} }; } },
  customElements: { get: () => undefined, define() {} },
};
vm.createContext(ctx);
const { expandItem, fmtItem, resolveMeal, cleanProfile, SharedDietPanel } = vm.runInContext(
  `${readFileSync(panel, "utf8")}\n;({ expandItem, fmtItem, resolveMeal, cleanProfile, SharedDietPanel });`, ctx);

const plain = (v) => JSON.parse(JSON.stringify(v));
const RECIPES = {
  r1: {
    id: "r1", name: "Pancake", note: "Mescolare", rev: 1,
    ingredients: [
      { id: "i1", food: "Farina", qty: 60, unit: "g" },
      { id: "i2", food: "Uova", qty: 1, unit: "pz" },
      { id: "i3", food: "Sale", qty: null, unit: "g" },
    ],
  },
};

// expandItem: defaults, profile overrides, override on a null default, missing recipe.
{
  const e = plain(expandItem({ recipe: "r1" }, {}, RECIPES));
  assert.equal(e.food, "Pancake");
  assert.equal(e.note, "Mescolare");
  assert.equal(e.missing, false);
  assert.deepStrictEqual(e.ingredients.map((i) => i.qty), [60, 1, null]);
}
{
  const p = { recipe_qty: { r1: { i1: 40, i3: 2 } } };
  const e = plain(expandItem({ recipe: "r1" }, p, RECIPES));
  assert.deepStrictEqual(e.ingredients.map((i) => i.qty), [40, 1, 2]);
  assert.deepStrictEqual(e.ingredients.map((i) => i.unit), ["g", "pz", "g"]);
}
{
  const e = plain(expandItem({ recipe: "nope" }, {}, RECIPES));
  assert.deepStrictEqual(e, { recipe: "nope", food: "Ricetta mancante", note: "", ingredients: [], missing: true });
}

// fmtItem mirrors format_item.
{
  const e = expandItem({ recipe: "r1" }, {}, RECIPES);
  assert.equal(fmtItem(e), "Pancake: Farina 60 g, Uova 1 pz, Sale");
  assert.equal(fmtItem(expandItem({ recipe: "nope" }, {}, RECIPES)), "Ricetta mancante");
  assert.equal(fmtItem({ food: "Pasta", qty: 80, unit: "g", note: "" }), "Pasta 80 g");
  assert.equal(fmtItem({ food: "Olio", qty: null, unit: "", note: "q.b." }), "Olio (q.b.)");
}

// resolveMeal expands recipe alternatives with the profile and recipes.
{
  const meal = { id: "m1", name: "Colazione", time: "08:00", options: [[{ alts: [{ recipe: "r1" }, { food: "Latte", qty: 200, unit: "ml", note: "" }] }]] };
  const r = plain(resolveMeal(meal, { option: 0, lines: {} }, { recipe_qty: { r1: { i1: 40 } } }, RECIPES));
  assert.equal(r.items[0].food, "Pancake");
  assert.equal(r.items[0].ingredients[0].qty, 40);
  const alt = plain(resolveMeal(meal, { option: 0, lines: { 0: 1 } }, {}, RECIPES));
  assert.equal(fmtItem(alt.items[0]), "Latte 200 ml");
}

// cleanProfile keeps {recipe} items (drops only empty simple items) and carries recipe_qty.
{
  const draft = {
    id: "p1", name: " Luca ", person: null, reminder: { enabled: false, minutes: 15, notify: null },
    week: { 0: [{ id: "m1", name: "Colazione", time: null, options: [[{ alts: [{ recipe: "r1" }, { food: "  ", qty: null, unit: "g", note: "" }] }]] }],
      1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
    exceptions: {}, choices: { defaults: {}, dates: {} }, rev: 3,
    recipe_qty: { r1: { i1: 80 } },
  };
  const c = plain(cleanProfile(draft));
  assert.deepStrictEqual(c.week[0][0].options, [[{ alts: [{ recipe: "r1" }] }]]);
  assert.deepStrictEqual(c.recipe_qty, { r1: { i1: 80 } });
  assert.deepStrictEqual(plain(cleanProfile({ ...draft, recipe_qty: undefined })).recipe_qty, {});
}

// Read views: Oggi shows recipe name, grams, collapsible note; editor and alternatives never crash on {recipe} items.
{
  const recipeMeal = { id: "m1", name: "Colazione", time: "08:00", options: [[{ alts: [{ recipe: "r1" }, { food: "Latte", qty: 200, unit: "ml", note: "" }] }]] };
  const week = {}; for (let d = 0; d < 7; d++) week[d] = [recipeMeal];
  const profile = { id: "p1", name: "Luca", person: null, reminder: { enabled: false, minutes: 15, notify: null },
    week, exceptions: {}, choices: { defaults: {}, dates: {} }, rev: 1, recipe_qty: { r1: { i1: 40 } } };
  const panelEl = new SharedDietPanel();
  panelEl._recipes = RECIPES;
  panelEl._profiles = { p1: profile };
  panelEl._profileId = "p1";
  panelEl._draft = JSON.parse(JSON.stringify(profile));
  const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  panelEl._view = "today";
  const oggi = panelEl._body();
  assert.match(oggi, /<strong>Pancake<\/strong>/);
  assert.match(oggi, /Farina 40 g/);
  assert.match(oggi, /<details><summary>Preparazione<\/summary><p>Mescolare<\/p><\/details>/);
  assert.doesNotMatch(oggi, /undefined|NaN/);

  panelEl._showAlts = true;
  assert.match(panelEl._resolved(profile, iso, true), /class="alts"[\s\S]*Pancake/);

  panelEl._view = "week";
  panelEl._foldToggled.add(`w${panelEl._wday}:m1`); // unfold the meal editor
  const editor = panelEl._body();
  assert.match(editor, /Ricetta: Pancake/);
  assert.doesNotMatch(editor, /undefined|NaN/);
  panelEl._foldToggled.clear();
  assert.match(panelEl._body(), /<p class="muted summary">Pancake \/ Latte<\/p>/);

  panelEl._view = "choices";
  panelEl._range = { from: iso, to: iso };
  const choices = panelEl._body();
  assert.match(choices, /<option value="0" selected>Pancake<\/option>/);
  assert.match(choices, /<option value="1">Latte<\/option>/);
  assert.doesNotMatch(choices, /undefined|NaN/);
}

console.log("resolve.test.mjs: all assertions passed");
