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
const { expandItem, fmtItem, resolveMeal, cleanProfile, cleanRecipe, setRecipeQty, matchRecipes, SharedDietPanel } = vm.runInContext(
  `${readFileSync(panel, "utf8")}\n;({ expandItem, fmtItem, resolveMeal, cleanProfile, cleanRecipe, setRecipeQty, matchRecipes, SharedDietPanel });`, ctx);
// Recipe draft cleaning: trims, drops ingredients without food, keeps rev, rejects negative quantities.
{
  const cleaned = cleanRecipe({ id: "r1", name: "  Pancake ", note: " Mescolare ", rev: 3, ingredients: [
    { id: "i1", food: " Farina ", qty: 60, unit: " g " },
    { id: "i2", food: "  ", qty: 1, unit: "pz" },
    { id: "i3", food: "Uova", qty: null, unit: "" },
  ] });
  assert.deepEqual(JSON.parse(JSON.stringify(cleaned)), { id: "r1", name: "Pancake", note: "Mescolare", rev: 3, ingredients: [
    { id: "i1", food: "Farina", qty: 60, unit: "g" },
    { id: "i3", food: "Uova", qty: null, unit: "" },
  ] });
  assert.throws(() => cleanRecipe({ id: "r1", name: " ", note: "", rev: 1, ingredients: [] }), /obbligatorio/);
  assert.throws(() => cleanRecipe({ id: "r1", name: "X", note: "", rev: 1, ingredients: [{ id: "i", food: "Sale", qty: -1, unit: "g" }] }), /negativa/);
}

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
  assert.throws(() => cleanProfile({ ...draft, recipe_qty: { r1: { i1: -1 } } }), /negativa/);
}

// setRecipeQty: sets, clears (dropping emptied recipe maps), keeps negatives for the save check, never mutates.
{
  const m = plain(setRecipeQty({}, "r1", "i1", 40));
  assert.deepStrictEqual(m, { r1: { i1: 40 } });
  assert.deepStrictEqual(plain(setRecipeQty(m, "r1", "i2", 0)), { r1: { i1: 40, i2: 0 } });
  assert.deepStrictEqual(plain(setRecipeQty(m, "r1", "i1", null)), {});
  assert.deepStrictEqual(plain(setRecipeQty({ r1: { i1: 40 }, r2: { i3: 2 } }, "r2", "i3", null)), { r1: { i1: 40 } });
  assert.deepStrictEqual(plain(setRecipeQty({ r1: { i1: 40 } }, "r1", "i1", -5)), { r1: { i1: -5 } });
  const orig = { r1: { i1: 40 } };
  setRecipeQty(orig, "r1", "i1", 9);
  assert.equal(orig.r1.i1, 40);
}

// matchRecipes: folded substring match, prefix matches first, no match is empty.
{
  const recipes = { a: { id: "a", name: "Pancake" }, b: { id: "b", name: "Lasagne al pancake" }, c: { id: "c", name: "Minestra" } };
  assert.deepStrictEqual(plain(matchRecipes("pan", recipes)).map((r) => r.id), ["a", "b"]);
  assert.deepStrictEqual(plain(matchRecipes("lasagne", recipes)).map((r) => r.id), ["b"]);
  assert.deepStrictEqual(plain(matchRecipes("zz", recipes)), []);
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
  // Recipe row: name, per-person grams in the input (override 40, default 60), reset button, note, simple-food button.
  assert.match(editor, /<strong>Pancake<\/strong><span class="tag">Ricetta<\/span>/);
  assert.match(editor, /value="40" placeholder="60"/);
  assert.match(editor, /placeholder="1"\s+aria-label="Grammi di Uova"/);
  assert.equal((editor.match(/Ripristina default/g) ?? []).length, 1);
  assert.match(editor, /Vale per tutti i pasti di Luca/);
  assert.match(editor, /Usa alimento semplice/);
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

// Deleted recipe in a meal: "Ricetta mancante" with only the simple-food button; profile name is escaped in the note.
{
  const meal = { id: "m1", name: "Colazione", time: null, options: [[{ alts: [{ recipe: "gone" }] }]] };
  const week = {}; for (let d = 0; d < 7; d++) week[d] = [meal];
  const profile = { id: "p1", name: "<i>Luca</i>", person: null, reminder: { enabled: false, minutes: 15, notify: null },
    week, exceptions: {}, choices: { defaults: {}, dates: {} }, rev: 1, recipe_qty: {} };
  const p = new SharedDietPanel();
  p._recipes = {};
  p._profiles = { p1: profile };
  p._profileId = "p1";
  p._draft = JSON.parse(JSON.stringify(profile));
  p._view = "week";
  p._foldToggled.add(`w${p._wday}:m1`);
  const body = p._body();
  assert.match(body, /Ricetta mancante/);
  assert.match(body, /Usa alimento semplice/);
  assert.doesNotMatch(body, /Ripristina default|Vale per tutti|undefined|NaN/);
  p._foldToggled.clear();
  p._recipes = RECIPES;
  p._draft.recipe_qty = {};
  p._foldToggled.add(`w${p._wday}:m1`);
  p._draft.week[p._wday] = [{ ...meal, options: [[{ alts: [{ recipe: "r1" }] }]] }];
  assert.match(p._body(), /Vale per tutti i pasti di &lt;i&gt;Luca&lt;\/i&gt;/);
}

console.log("resolve.test.mjs: all assertions passed");
