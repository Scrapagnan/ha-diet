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
  crypto: globalThis.crypto, // uid() in the panel
};
vm.createContext(ctx);
const { expandItem, fmtItem, resolveMeal, cleanProfile, cleanRecipe, setRecipeQty, matchRecipes, SharedDietPanel } = vm.runInContext(
  `${readFileSync(panel, "utf8")}\n;({ expandItem, fmtItem, resolveMeal, cleanProfile, cleanRecipe, setRecipeQty, matchRecipes, SharedDietPanel });`, ctx);
// Recipe draft cleaning: trims, drops alternatives without food and ingredients left without any, keeps ids and rev, rejects negative quantities.
{
  const cleaned = cleanRecipe({ id: "r1", name: "  Pancake ", note: " Mescolare ", rev: 3, ingredients: [
    { id: "i1", alts: [{ id: "a1", food: " Farina ", qty: 60, unit: " g " }, { id: "a9", food: "  ", qty: 1, unit: "pz" }] },
    { id: "i2", alts: [{ id: "a2", food: "  ", qty: 1, unit: "pz" }] },
    { id: "i3", alts: [{ id: "a3", food: "Uova", qty: null, unit: "" }] },
  ] });
  assert.deepEqual(JSON.parse(JSON.stringify(cleaned)), { id: "r1", name: "Pancake", note: "Mescolare", rev: 3, ingredients: [
    { id: "i1", alts: [{ id: "a1", food: "Farina", qty: 60, unit: "g" }] },
    { id: "i3", alts: [{ id: "a3", food: "Uova", qty: null, unit: "" }] },
  ] });
  assert.throws(() => cleanRecipe({ id: "r1", name: " ", note: "", rev: 1, ingredients: [] }), /obbligatorio/);
  assert.throws(() => cleanRecipe({ id: "r1", name: "X", note: "", rev: 1, ingredients: [{ id: "i", alts: [{ id: "a", food: "Sale", qty: -1, unit: "g" }] }] }), /negativa/);
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const RECIPES = {
  r1: {
    id: "r1", name: "Pancake", note: "Mescolare", rev: 1,
    ingredients: [
      { id: "i1", alts: [{ id: "a1", food: "Farina", qty: 60, unit: "g" }] },
      { id: "i2", alts: [{ id: "a2", food: "Uova", qty: 1, unit: "pz" }] },
      { id: "i3", alts: [{ id: "a3", food: "Sale", qty: null, unit: "g" }] },
    ],
  },
  r2: {
    id: "r2", name: "Cappuccino", note: "", rev: 1,
    ingredients: [
      { id: "i4", alts: [{ id: "a4", food: "Latte", qty: 100, unit: "ml" }, { id: "a5", food: "Soia", qty: 120, unit: "ml" }] },
      { id: "i5", alts: [{ id: "a6", food: "Caffè", qty: null, unit: "" }] },
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
  const p = { recipe_qty: { r1: { a1: 40, a3: 2 } } };
  const e = plain(expandItem({ recipe: "r1" }, p, RECIPES));
  assert.deepStrictEqual(e.ingredients.map((i) => i.qty), [40, 1, 2]);
  assert.deepStrictEqual(e.ingredients.map((i) => i.unit), ["g", "pz", "g"]);
}
{
  const e = plain(expandItem({ recipe: "nope" }, {}, RECIPES));
  assert.deepStrictEqual(e, { recipe: "nope", food: "Ricetta mancante", note: "", ingredients: [], missing: true, choices: [] });
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
  const r = plain(resolveMeal(meal, { option: 0, lines: {} }, { recipe_qty: { r1: { a1: 40 } } }, RECIPES));
  assert.equal(r.items[0].food, "Pancake");
  assert.equal(r.items[0].ingredients[0].qty, 40);
  const alt = plain(resolveMeal(meal, { option: 0, lines: { 0: 1 } }, {}, RECIPES));
  assert.equal(fmtItem(alt.items[0]), "Latte 200 ml");
}

// M3: a line with no alternative is dropped instead of throwing.
{
  const meal = { id: "m1", name: "Colazione", time: null, options: [[{ alts: [] }, { alts: [{ food: "Latte", qty: 200, unit: "ml", note: "" }] }]] };
  const r = plain(resolveMeal(meal, { option: 0, lines: {} }, {}, RECIPES));
  assert.deepEqual(r.items.map(fmtItem), ["Latte 200 ml"]);
}

// I1: a draft on a recipe deleted by another user is announced; our own delete (pushed before its reply) and a clean draft are not.
{
  const p = new SharedDietPanel();
  const flashes = [];
  p._flash = (t) => flashes.push(t);
  p._recipes = {};
  p._recipeId = "r1"; p._recipeDirty = true; p._recipeDraft = { id: "r1" };
  p._syncRecipe();
  assert.deepEqual(flashes, ["Ricetta eliminata da un altro utente: modifiche scartate"]);
  assert.equal(p._recipeId, null);
  p._recipeId = "r2"; p._recipeDirty = true; p._deletingId = "r2";
  p._syncRecipe();
  p._recipeId = "r3"; p._recipeDirty = false;
  p._syncRecipe();
  assert.equal(flashes.length, 1);
}

// I2: an edit in one meal's grams field is copied into the same ingredient elsewhere, and only its reset button is toggled.
{
  const fakeRow = (rid, iid) => {
    const reset = { hidden: true };
    const ing = { querySelector: () => reset };
    return { dataset: { ch: "rqty", rid, iid }, value: "", closest: () => ing, reset };
  };
  const a = fakeRow("r1", "i1"), b = fakeRow("r1", "i1"), other = fakeRow("r1", "i2");
  const p = new SharedDietPanel();
  p.shadowRoot = { querySelectorAll: () => [a, b, other] };
  a.value = "40";
  p._syncRecipeQty(a, 40);
  assert.equal(String(b.value), "40");
  assert.equal(other.value, "");
  assert.equal(a.reset.hidden, false);
  assert.equal(b.reset.hidden, false);
  assert.equal(other.reset.hidden, true);
  p._syncRecipeQty(a, null);
  assert.equal(b.value, "");
  assert.equal(b.reset.hidden, true);
}

// cleanProfile keeps {recipe} items (drops only empty simple items) and carries recipe_qty.
{
  const draft = {
    id: "p1", name: " Luca ", person: null, reminder: { enabled: false, minutes: 15, notify: null },
    week: { 0: [{ id: "m1", name: "Colazione", time: null, options: [[{ alts: [{ recipe: "r1" }, { food: "  ", qty: null, unit: "g", note: "" }] }]] }],
      1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
    exceptions: {}, choices: { defaults: {}, dates: {} }, rev: 3,
    recipe_qty: { r1: { a1: 80 } },
  };
  const c = plain(cleanProfile(draft));
  assert.deepStrictEqual(c.week[0][0].options, [[{ alts: [{ recipe: "r1" }] }]]);
  assert.deepStrictEqual(c.recipe_qty, { r1: { a1: 80 } });
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
    week, exceptions: {}, choices: { defaults: {}, dates: {} }, rev: 1, recipe_qty: { r1: { a1: 40 } } };
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
  assert.match(editor, /placeholder="1"\s+aria-label="Quantità di Uova"/);
  const resetButtons = editor.match(/<button data-act="rreset"[^>]*>/g) ?? [];
  assert.equal(resetButtons.length, 3); // one per ingredient; only the overridden one is visible
  assert.equal(resetButtons.filter((b) => !b.includes(" hidden")).length, 1);
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
  assert.match(p._body(), /data-act="rreset"[^>]* hidden>/); // no override: the reset button is there but hidden
}

// Alternatives (mirror of model.py expand_item): chosen alt per ingredient, fallback to the first, grams per alt, choices for 2+ alts.
{
  const e = plain(expandItem({ recipe: "r2" }, {}, RECIPES));
  assert.equal(fmtItem(e), "Cappuccino: Latte 100 ml, Caffè");
  assert.deepStrictEqual(e.choices, [{ ingredient_id: "i4", alts: [
    { id: "a4", food: "Latte", qty: 100, unit: "ml" }, { id: "a5", food: "Soia", qty: 120, unit: "ml" }], chosen: "a4" }]);
}
{
  const e = plain(expandItem({ recipe: "r2" }, {}, RECIPES, { i4: "a5" }));
  assert.equal(fmtItem(e), "Cappuccino: Soia 120 ml, Caffè");
  assert.equal(e.choices[0].chosen, "a5");
  assert.equal(fmtItem(expandItem({ recipe: "r2" }, {}, RECIPES, { i4: "nope" })), "Cappuccino: Latte 100 ml, Caffè");
}
{
  // Overrides are keyed by alt id and apply to the chosen alt only; choices carry each alt's own grams.
  const p = { recipe_qty: { r2: { a5: 90 } } };
  const e = plain(expandItem({ recipe: "r2" }, p, RECIPES, { i4: "a5" }));
  assert.equal(fmtItem(e), "Cappuccino: Soia 90 ml, Caffè");
  assert.deepStrictEqual(e.choices[0].alts.map((a) => a.qty), [100, 90]);
  assert.equal(expandItem({ recipe: "r2" }, p, RECIPES, { i4: "a4" }).ingredients[0].qty, 100);
}
{
  // resolveMeal hands each recipe its own choice map; another recipe's choices are ignored.
  const meal = { id: "m2", name: "Caffè", time: null, options: [[{ alts: [{ recipe: "r2" }] }]] };
  const pick = (choice) => fmtItem(plain(resolveMeal(meal, choice, {}, RECIPES)).items[0]);
  assert.equal(pick({ option: 0, lines: {}, recipes: { r2: { i4: "a5" } } }), "Cappuccino: Soia 120 ml, Caffè");
  assert.equal(pick({ option: 0, lines: {}, recipes: { r1: { i4: "a5" } } }), "Cappuccino: Latte 100 ml, Caffè");
  assert.equal(pick({ option: 0, lines: {} }), "Cappuccino: Latte 100 ml, Caffè");
}
{
  // cleanRecipe: drops alts with no food, ingredients left without alts; keeps ids.
  const cleaned = plain(cleanRecipe({ id: "r1", name: "Caffè", note: "", rev: 2, ingredients: [
    { id: "i1", alts: [
      { id: "a1", food: " Latte ", qty: 100, unit: " ml " },
      { id: "a2", food: "  ", qty: null, unit: "ml" },
      { id: "a3", food: "Soia", qty: null, unit: "" },
    ] },
    { id: "i2", alts: [{ id: "a4", food: " ", qty: 1, unit: "pz" }] },
    { id: "i3", alts: [{ id: "a5", food: "Zucchero", qty: null, unit: "g" }] },
  ] }));
  assert.deepStrictEqual(cleaned.ingredients, [
    { id: "i1", alts: [{ id: "a1", food: "Latte", qty: 100, unit: "ml" }, { id: "a3", food: "Soia", qty: null, unit: "" }] },
    { id: "i3", alts: [{ id: "a5", food: "Zucchero", qty: null, unit: "g" }] },
  ]);
}
{
  // Ricette tab: each ingredient lists its alternatives with "oppure" between them; "+ OPPURE" adds an alt and focuses it; × removes one.
  const p = new SharedDietPanel();
  p._render = () => {};
  p._profiles = {};
  p._recipes = RECIPES;
  p._recipeId = "r2";
  p._recipeDraft = plain(RECIPES.r2);
  p._view = "recipes";
  const html = p._body();
  assert.equal(html.match(/class="food"[^>]*data-i="\d" data-a="\d"/g).length, 3); // one food field per alternative
  assert.equal(html.match(/data-act="raddalt"/g).length, 2);
  assert.equal(html.match(/data-act="rdelalt"/g).length, 2); // × only where there is more than one alternative
  assert.equal(html.match(/<div class="or">oppure<\/div>/g).length, 1);
  assert.doesNotMatch(html, /undefined|NaN/);

  p.shadowRoot = { getElementById: () => null, querySelector: () => null, addEventListener() {} };
  p._onClick({ target: { closest: () => ({ dataset: { act: "raddalt", i: "1" } }) } });
  const added = p._recipeDraft.ingredients[1].alts;
  assert.equal(added.length, 2);
  assert.equal(added[1].food, "");
  assert.equal(typeof added[1].id, "string");
  assert.notEqual(added[1].id, added[0].id);
  assert.equal(p._focus, '[data-ch="ring"][data-f="food"][data-i="1"][data-a="1"]');
  assert.equal(p._recipeDirty, true);

  p._onChange({ target: { value: "Zucchero", type: "text", dataset: { ch: "ring", f: "food", i: "1", a: "1" } } });
  assert.equal(p._recipeDraft.ingredients[1].alts[1].food, "Zucchero");
  assert.equal(p._recipeDraft.ingredients[1].alts[0].food, "Caffè");

  p._onClick({ target: { closest: () => ({ dataset: { act: "rdelalt", i: "0", a: "1" } }) } });
  assert.deepStrictEqual(p._recipeDraft.ingredients[0].alts.map((a) => a.food), ["Latte"]);

  p._onClick({ target: { closest: () => ({ dataset: { act: "raddingr" } }) } });
  assert.equal(p._recipeDraft.ingredients.at(-1).alts.length, 1);
  assert.equal(p._focus, '[data-ch="ring"][data-f="food"][data-i="2"][data-a="0"]');
}
{
  // Recipe row in a meal: every alternative of an ingredient has its own grams field (data-iid = alt id) and reset button.
  const meal = { id: "m2", name: "Caffè", time: "08:00", options: [[{ alts: [{ recipe: "r2" }] }]] };
  const week = {}; for (let d = 0; d < 7; d++) week[d] = [meal];
  const profile = { id: "p1", name: "Luca", person: null, reminder: { enabled: false, minutes: 15, notify: null },
    week, exceptions: {}, choices: { defaults: {}, dates: {} }, rev: 1, recipe_qty: { r2: { a5: 90 } } };
  const p = new SharedDietPanel();
  p._recipes = RECIPES;
  p._profiles = { p1: profile };
  p._profileId = "p1";
  p._draft = plain(profile);
  p._view = "week";
  p._foldToggled.add(`w${p._wday}:m2`);
  const body = p._body();
  assert.match(body, /Latte · ml/);
  assert.match(body, /Soia · ml/);
  assert.match(body, /data-rid="r2" data-iid="a4"/);
  assert.match(body, /value="90"[^>]*data-iid="a5"/);
  assert.match(body, /<div class="or">oppure<\/div>/);
  assert.doesNotMatch(body, /undefined|NaN/);
}
{
  // Oggi: the chosen alternative is shown; "Vedi alternative" adds the other alternatives in grey.
  const meal = { id: "m2", name: "Caffè", time: "08:00", options: [[{ alts: [{ recipe: "r2" }] }]] };
  const week = {}; for (let d = 0; d < 7; d++) week[d] = [meal];
  const profile = { id: "p1", name: "Luca", person: null, reminder: { enabled: false, minutes: 15, notify: null },
    week, exceptions: {}, choices: { defaults: {}, dates: {} }, rev: 1, recipe_qty: { r2: { a5: 90 } } };
  const p = new SharedDietPanel();
  p._recipes = RECIPES;
  const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  assert.match(p._resolved(profile, iso), /Latte 100 ml/);
  assert.doesNotMatch(p._resolved(profile, iso), /Alternativa a/);
  const withChoice = { ...profile, choices: { defaults: { m2: { option: 0, lines: {}, recipes: { r2: { i4: "a5" } } } }, dates: {} } };
  assert.match(p._resolved(withChoice, iso), /Soia 90 ml/);
  assert.match(p._resolved(withChoice, iso, true), /<li class="muted">Alternativa a Soia: Latte 100 ml<\/li>/);
}
{
  // Same recipe on two lines of the chosen path: one select per ingredient, not one per line.
  const R = { ...RECIPES, r3: { id: "r3", name: "Caffè freddo", note: "", rev: 1, ingredients: [
    { id: "i8", alts: [{ id: "a8", food: "Zucchero", qty: 10, unit: "g" }, { id: "a9", food: "Miele", qty: 8, unit: "g" }] },
  ] } };
  const meal = { id: "m4", name: "Pausa", time: null, options: [[{ alts: [{ recipe: "r3" }] }, { alts: [{ recipe: "r3" }] }]] };
  const p = new SharedDietPanel();
  p._render = () => {};
  p._recipes = R;
  p._draft = plain({ id: "p1", name: "Luca", person: null, reminder: { enabled: false, minutes: 15, notify: null },
    week: {}, exceptions: {}, choices: { defaults: {}, dates: {} }, rev: 1, recipe_qty: {} });
  const html = p._choiceEditor("", meal, { option: 0, lines: {} });
  assert.equal((html.match(/data-rid="r3" data-iid="i8"/g) ?? []).length, 1);
  assert.equal((html.match(/data-ch="cing"/g) ?? []).length, 1);
}

{
  // Food suggestions include the alternatives of recipe ingredients.
  const p = new SharedDietPanel();
  p._recipes = RECIPES;
  assert.ok(p._foodNames().has("latte") && p._foodNames().has("soia"));
}

{
  // Scelte: a recipe on the chosen path gets one select per ingredient with 2+ alternatives; other recipes get none.
  const R = { ...RECIPES, r3: { id: "r3", name: "Caffè freddo", note: "", rev: 1, ingredients: [
    { id: "i7", alts: [{ id: "a7", food: "Ghiaccio", qty: 5, unit: "pz" }] },
    { id: "i8", alts: [{ id: "a8", food: "Zucchero", qty: 10, unit: "g" }, { id: "a9", food: "Miele", qty: 8, unit: "g" }] },
  ] } };
  const meal = { id: "m3", name: "Colazione", time: null, options: [[{ alts: [{ recipe: "r2" }, { recipe: "r3" }] }]] };
  const profile = { id: "p1", name: "Luca", person: null, reminder: { enabled: false, minutes: 15, notify: null },
    week: {}, exceptions: {}, choices: { defaults: {}, dates: {} }, rev: 1, recipe_qty: { r2: { a5: 90 } } };
  const p = new SharedDietPanel();
  p._render = () => {};
  p._recipes = R;
  p._draft = plain(profile);

  const r2Path = p._choiceEditor("", meal, { option: 0, lines: {} });
  assert.match(r2Path, /data-ch="cing" data-date="" data-mid="m3" data-rid="r2" data-iid="i4"/);
  assert.match(r2Path, /Cappuccino · Ingrediente 1/);
  assert.match(r2Path, /<option value="a4" selected>Latte 100 ml<\/option><option value="a5">Soia 90 ml<\/option>/); // grams of this person
  assert.doesNotMatch(r2Path, /data-rid="r3"/);
  assert.doesNotMatch(r2Path, /undefined|NaN/);

  const r3Path = p._choiceEditor("", meal, { option: 0, lines: { 0: 1 } });
  assert.match(r3Path, /data-rid="r3" data-iid="i8"/);
  assert.match(r3Path, /Caffè freddo · Ingrediente 2/);
  assert.match(r3Path, /<option value="a8" selected>Zucchero 10 g<\/option><option value="a9">Miele 8 g<\/option>/);
  assert.doesNotMatch(r3Path, /data-rid="r2"/);

  // cing writes choices.defaults[mid].recipes[rid][iid]; a per-date override writes into choices.dates[date][mid].
  p._onChange({ target: { value: "a9", type: "select-one", dataset: { ch: "cing", date: "", mid: "m3", rid: "r3", iid: "i8" } } });
  assert.equal(p._draft.choices.defaults.m3.recipes.r3.i8, "a9");
  p._draft.choices.dates["2026-11-10"] = { m3: { option: 0, lines: {} } };
  p._onChange({ target: { value: "a5", type: "select-one", dataset: { ch: "cing", date: "2026-11-10", mid: "m3", rid: "r2", iid: "i4" } } });
  assert.equal(p._draft.choices.dates["2026-11-10"].m3.recipes.r2.i4, "a5");
  assert.equal(p._draft.choices.defaults.m3.recipes.r2, undefined);
  const override = p._choiceEditor("2026-11-10", meal, p._draft.choices.dates["2026-11-10"].m3);
  assert.match(override, /data-date="2026-11-10" data-mid="m3" data-rid="r2" data-iid="i4"/);
  assert.match(override, /<option value="a5" selected>Soia 90 ml<\/option>/);

  // Changing a line alternative re-renders, so the recipe selects follow the chosen path.
  let renders = 0;
  p._render = () => { renders += 1; };
  p._onChange({ target: { value: "1", type: "select-one", dataset: { ch: "cline", date: "", mid: "m3", l: "0" } } });
  assert.equal(renders, 1);
  assert.equal(p._draft.choices.defaults.m3.lines["0"], 1);

  // A meal whose only choice is inside a recipe still gets a card in Scelte.
  p._render = () => {};
  const solo = { ...meal, options: [[{ alts: [{ recipe: "r3" }] }]] };
  const all = {}; for (let d = 0; d < 7; d++) all[d] = [solo];
  p._draft = plain({ ...profile, week: all, choices: { defaults: {}, dates: {} } });
  p._profiles = { p1: p._draft };
  p._profileId = "p1";
  p._view = "choices";
  p._range = { from: "2026-11-10", to: "2026-11-10" };
  assert.match(p._body(), /Caffè freddo · Ingrediente 2/);
}

console.log("resolve.test.mjs: all assertions passed");
