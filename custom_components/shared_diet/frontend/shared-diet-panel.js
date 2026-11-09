/* Dieta: pannello laterale di Shared Diet. Web component vanilla, nessuna dipendenza. */

const TABS = [
  ["today", "Oggi"], ["week", "Settimana"], ["dates", "Date"],
  ["choices", "Scelte"], ["recipes", "Ricette"], ["shop", "Spesa"], ["profiles", "Profili"],
];
const DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const DAYS_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN = 62;

const CSS = `
:host { display: block; height: 100%; overflow-y: auto; box-sizing: border-box;
  background: var(--primary-background-color, #fafafa); color: var(--primary-text-color, #212121);
  font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif); }
* { box-sizing: border-box; }
header { display: flex; align-items: center; gap: 8px; padding: 8px 16px;
  background: var(--app-header-background-color, var(--primary-color, #03a9f4));
  color: var(--app-header-text-color, #fff); }
h1 { margin: 0; font-size: 20px; font-weight: 400; }
h2 { font-size: 18px; margin: 16px 0 8px; }
h3 { font-size: 16px; margin: 16px 0 8px; }
.tabs { display: flex; overflow-x: auto; background: var(--card-background-color, #fff);
  border-bottom: 1px solid var(--divider-color, #e0e0e0); }
.tab { flex: 0 0 auto; border: 0; border-radius: 0; border-bottom: 3px solid transparent; background: none;
  color: var(--secondary-text-color, #727272); padding: 12px 14px; }
.tab.on { color: var(--primary-color, #03a9f4); border-bottom-color: var(--primary-color, #03a9f4); }
main { max-width: 720px; margin: 0 auto; padding: 8px 16px 32px; }
button, input, select { font: inherit; font-size: 16px; color: inherit; }
button { min-height: 36px; padding: 6px 12px; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 8px;
  background: var(--card-background-color, #fff); cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
button.primary { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); border-color: transparent; }
button.danger { color: var(--error-color, #db4437); }
button.icon { background: none; border: 0; font-size: 22px; padding: 4px 8px; min-height: 0; color: inherit; }
button.add { width: 100%; border-style: dashed; margin: 8px 0; }
button.chip { flex: 1 1 0; min-width: 0; padding: 6px 0; }
button.chip.on { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); border-color: transparent; }
input, select { padding: 6px 8px; min-width: 0; max-width: 100%; border: 1px solid var(--divider-color, #e0e0e0);
  border-radius: 6px; background: var(--card-background-color, #fff); }
.row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.grow { flex: 1 1 140px; }
.sub-row, .check { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
.card { background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #e0e0e0);
  border-radius: 12px; padding: 12px; margin: 10px 0; }
.meal-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.sub { margin: 8px 0 4px; font-size: 12px; color: var(--secondary-text-color, #727272);
  text-transform: uppercase; letter-spacing: 0.04em; }
.option { border-top: 1px dashed var(--divider-color, #e0e0e0); margin-top: 10px; padding-top: 8px; }
.line { border-left: 4px solid var(--primary-color, #03a9f4); border-radius: 8px; padding: 6px 8px; margin: 10px 0;
  background: rgba(127, 127, 127, 0.08); }
.line-head { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--primary-color, #03a9f4); margin-bottom: 2px; }
.summary { margin: 4px 0 0; }
.sugg { grid-column: 1 / -1; display: flex; flex-direction: column; margin-top: -2px;
  border: 1px solid var(--divider-color, #e0e0e0); border-radius: 6px; overflow: hidden;
  background: var(--card-background-color, #fff); }
.sugg button { border: 0; border-radius: 0; text-align: left; padding: 10px 12px; background: none;
  border-bottom: 1px solid var(--divider-color, #e0e0e0); }
.sugg button:last-child { border-bottom: 0; }
.item { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 6px; margin: 4px 0; }
.item .food { grid-column: 1 / 4; }
.item [data-f="qty"] { grid-column: 1; } /* always start a new row, with or without the × button */
.item .recipe-line { grid-column: 1 / 4; }
.recipe-row { width: 100%; text-align: left; }
.tag { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 6px; font-size: 12px;
  background: rgba(3, 169, 244, 0.15); color: var(--primary-color, #03a9f4); }
.ing { display: grid; grid-template-columns: 1fr 96px auto; gap: 6px; align-items: center; margin: 4px 0; }
.ing input { width: 100%; }
textarea { font: inherit; font-size: 16px; color: inherit; width: 100%; padding: 6px 8px; border: 1px solid var(--divider-color, #e0e0e0);
  border-radius: 6px; background: var(--card-background-color, #fff); }
details p { white-space: pre-line; margin: 6px 0; }
.or { font-size: 12px; font-weight: 600; text-align: center; color: var(--secondary-text-color, #727272); }
.chips { display: flex; gap: 4px; }
.muted { color: var(--secondary-text-color, #727272); font-size: 14px; }
.msg { padding: 8px 12px; border-radius: 8px; margin: 8px 0; }
.msg.ok { background: rgba(67, 160, 71, 0.15); }
.msg.info { background: rgba(3, 169, 244, 0.15); }
.msg.err { background: rgba(219, 68, 55, 0.15); color: var(--error-color, #db4437); }
[hidden] { display: none !important; }
.savebar { position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between; align-items: center;
  gap: 8px; padding: 8px 0; background: var(--primary-background-color, #fafafa);
  border-bottom: 1px solid var(--divider-color, #e0e0e0); }
ul { padding-left: 20px; margin: 6px 0; }
ul.alts { list-style: none; padding-left: 0; font-size: 14px; }
fieldset { border: 1px solid var(--divider-color, #e0e0e0); border-radius: 8px; }
`;

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("")).replaceAll("-", "");
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };
const span = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 864e5) + 1;
const weekday = (s) => (parseIso(s).getDay() + 6) % 7; // 0 = lunedì, as in model.py
const fmtDay = (s, opts) => parseIso(s).toLocaleDateString("it-IT", opts);
// Mirrors model.py format_item: "Nome 80 g", "Nome (nota)", "Nome", "Ricetta: ingredienti".
const fmtItem = (it) => {
  if (!it) return "";
  if ("recipe" in it) return it.ingredients.length ? `${it.food}: ${it.ingredients.map((i) => fmtItem(i)).join(", ")}` : it.food;
  return it.qty !== null ? `${it.food} ${it.qty} ${it.unit}` : it.note ? `${it.food} (${it.note})` : it.food;
};
const blankItem = () => ({ food: "", qty: null, unit: "g", note: "" });
const newMeal = () => ({ id: uid(), name: "Pasto", time: null, options: [[{ alts: [blankItem()] }]] });
// Meal editor context: "w<weekday>" in Settimana, "x<ISO date>" in Date (see _list).
const isWeekCtx = (ctx) => ctx[0] === "w";
// Comparison key for food names: case, accents and repeated spaces ignored ("Caffè " ~ "caffe").
const foldText = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
// Selector of a food input in the meal editor (to focus a just-added field).
const foodSel = (ctx, i, o, l, a) =>
  `input.food[data-ctx="${ctx}"][data-i="${i}"][data-o="${o}"][data-l="${l}"][data-a="${a}"]`;
const zeroChoice = () => ({ option: 0, lines: {} });
// A meal offers choices with several options or lines, or with a recipe that has an ingredient with alternatives.
const hasChoice = (m, recipes) => m.options.length > 1 || m.options.some((o) => o.some((l) => l.alts.length > 1
  || l.alts.some((a) => "recipe" in a && recipeOf(a.recipe, recipes)?.ingredients.some((g) => g.alts.length > 1))));

// Mirrors model.py: effective day, choice priority, option/alternative resolution.
const effectiveDay = (p, s) => p.exceptions[s] ?? p.week[String(weekday(s))];
const choiceFor = (p, s, mid) => p.choices.dates[s]?.[mid] ?? p.choices.defaults[mid] ?? zeroChoice();
const recipeOf = (rid, recipes) => (Object.hasOwn(recipes, rid) ? recipes[rid] : null);
// Mirrors model.py expand_item: a recipe item becomes its name and, per ingredient, the chosen alternative with the person's grams
// (override by alt id, else default). Ingredients with 2+ alternatives also list them in `choices`.
function expandItem(item, profile, recipes, recipeChoice = {}) {
  if (!("recipe" in item)) return item;
  const recipe = recipeOf(item.recipe, recipes);
  if (!recipe) return { recipe: item.recipe, food: "Ricetta mancante", note: "", ingredients: [], missing: true, choices: [] };
  const overrides = profile.recipe_qty?.[item.recipe] ?? {};
  const grams = (a) => (Object.hasOwn(overrides, a.id) ? overrides[a.id] : a.qty);
  const ingredients = [];
  const choices = [];
  for (const ing of recipe.ingredients) {
    const alt = ing.alts.find((a) => a.id === recipeChoice[ing.id]) ?? ing.alts[0];
    ingredients.push({ food: alt.food, qty: grams(alt), unit: alt.unit, note: "" });
    if (ing.alts.length >= 2) {
      choices.push({
        ingredient_id: ing.id,
        alts: ing.alts.map((a) => ({ id: a.id, food: a.food, qty: grams(a), unit: a.unit })),
        chosen: alt.id,
      });
    }
  }
  return { recipe: item.recipe, food: recipe.name, note: recipe.note, ingredients, missing: false, choices };
}
// Display name of a meal item: the recipe's name, or the food name ("Ricetta mancante" if the recipe was deleted).
const itemLabel = (item, recipes) => ("recipe" in item ? recipeOf(item.recipe, recipes)?.name ?? "Ricetta mancante" : item.food);
// Sets one person's grams for a recipe ingredient (value: number), or clears the override (value: null). Returns a new map; emptied recipe maps are dropped.
function setRecipeQty(map, rid, iid, value) {
  const next = { ...map };
  const byIng = { ...(next[rid] ?? {}) };
  if (value === null) delete byIng[iid];
  else byIng[iid] = value;
  if (Object.keys(byIng).length) next[rid] = byIng;
  else delete next[rid];
  return next;
}
// Recipes whose folded name contains the folded query, prefix matches first (meal food suggestions).
function matchRecipes(q, recipes) {
  return Object.values(recipes)
    .filter((r) => foldText(r.name).includes(q))
    .sort((a, b) => (foldText(b.name).startsWith(q) - foldText(a.name).startsWith(q)) || a.name.localeCompare(b.name, "it"))
    .slice(0, 6);
}
function resolveMeal(meal, choice, profile, recipes) {
  const opt = choice.option >= 0 && choice.option < meal.options.length ? choice.option : 0;
  const items = meal.options[opt].map((line, i) => {
    const alt = choice.lines[String(i)] ?? 0;
    const a = line.alts[alt >= 0 && alt < line.alts.length ? alt : 0];
    return a && expandItem(a, profile ?? {}, recipes ?? {}, choice.recipes?.[a.recipe] ?? {});
  }).filter(Boolean); // a line emptied in the editor has no alternative to show
  return { option: opt, items };
}

// Cleans the draft before saving: trims, drops empty food rows, rejects empty meals. Recipe references pass through as {recipe} only.
const cleanItem = (a) => {
  if (a.qty < 0) throw new Error("La quantità non può essere negativa");
  return { food: a.food.trim(), qty: Number.isFinite(a.qty) ? a.qty : null, unit: a.unit.trim(), note: a.note.trim() };
};
const cleanAlt = (a) => ("recipe" in a ? { recipe: a.recipe } : cleanItem(a));
const hasAltContent = (a) => "recipe" in a || a.food.trim();
// `shape` is the option/line/alt counts: if cleaning changes it, indexes moved and the meal's choices are stale.
const shape = (options) => JSON.stringify(options.map((o) => o.map((l) => l.alts.length)));
function cleanMeals(meals, changed) {
  return meals.map((m) => {
    const name = m.name.trim();
    if (!name) throw new Error("Ogni pasto deve avere un nome");
    const options = m.options
      .map((opt) => opt.map((line) => ({ alts: line.alts.filter(hasAltContent).map(cleanAlt) })).filter((l) => l.alts.length))
      .filter((opt) => opt.length);
    if (!options.length) throw new Error(`«${name}»: inserisci almeno un alimento`);
    if (shape(options) !== shape(m.options)) changed.add(m.id);
    return { id: m.id, name, time: m.time || null, options };
  });
}
function cleanProfile(p) {
  const name = p.name.trim();
  if (!name) throw new Error("Il nome del profilo è obbligatorio");
  const changed = new Set();
  const week = {};
  for (let d = 0; d < 7; d++) week[d] = cleanMeals(p.week[d], changed);
  const exceptions = Object.fromEntries(Object.entries(p.exceptions).map(([s, meals]) => [s, cleanMeals(meals, changed)]));
  // Choices index into options/lines/alts: drop those of meals whose structure changed or that no longer exist.
  const live = new Set([...Object.values(week).flat(), ...Object.values(exceptions).flat()].map((m) => m.id));
  const keep = (mid) => live.has(mid) && !changed.has(mid);
  const choices = { defaults: {}, dates: {} };
  for (const [mid, c] of Object.entries(p.choices.defaults)) if (keep(mid)) choices.defaults[mid] = c;
  const recipeQty = clone(p.recipe_qty ?? {});
  if (Object.values(recipeQty).some((byIng) => Object.values(byIng).some((v) => v < 0))) throw new Error("La quantità non può essere negativa");
  for (const [date, byMeal] of Object.entries(p.choices.dates)) {
    const kept = Object.fromEntries(Object.entries(byMeal).filter(([mid]) => keep(mid)));
    if (Object.keys(kept).length) choices.dates[date] = kept;
  }
  return {
    id: p.id, name, person: p.person || null,
    reminder: {
      enabled: Boolean(p.reminder.enabled),
      minutes: Math.min(240, Math.max(0, Math.round(Number(p.reminder.minutes) || 0))),
      notify: p.reminder.notify || null,
    },
    week, exceptions, choices, recipe_qty: recipeQty, rev: p.rev,
  };
}

// Three-way merge for save conflicts. base: profile when editing started; mine: cleaned draft; theirs: latest server copy.
// Each key is a unit. Mine wins where only I changed it, theirs otherwise; a true overlap keeps theirs and is listed.
const canon = (v) => (v && typeof v === "object"
  ? Array.isArray(v) ? v.map(canon) : Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
  : v);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
function mergeProfiles(base, mine, theirs) {
  const merged = clone(theirs);
  const overlaps = [];
  const take = (label, b, m, t) => {
    const mineChanged = !same(m, b);
    const overlap = mineChanged && !same(t, b) && !same(m, t);
    if (overlap) overlaps.push(label);
    const v = mineChanged && !overlap ? m : t;
    return v === undefined ? undefined : clone(v);
  };
  const mergeMap = (prefix, b, m, t, target) => {
    for (const k of new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(t)])) {
      const v = take(prefix + k, b[k], m[k], t[k]);
      if (v === undefined) delete target[k];
      else target[k] = v;
    }
  };
  for (const k of ["name", "person", "reminder"]) merged[k] = take(k, base[k], mine[k], theirs[k]);
  for (let d = 0; d < 7; d++) merged.week[d] = take(`week.${d}`, base.week[d], mine.week[d], theirs.week[d]);
  mergeMap("exceptions.", base.exceptions, mine.exceptions, theirs.exceptions, merged.exceptions);
  mergeMap("choices.defaults.", base.choices.defaults, mine.choices.defaults, theirs.choices.defaults, merged.choices.defaults);
  for (const date of new Set([...Object.keys(base.choices.dates), ...Object.keys(mine.choices.dates), ...Object.keys(theirs.choices.dates)])) {
    const target = (merged.choices.dates[date] ??= {});
    mergeMap(`choices.dates.${date}.`, base.choices.dates[date] ?? {}, mine.choices.dates[date] ?? {}, theirs.choices.dates[date] ?? {}, target);
    if (!Object.keys(target).length) delete merged.choices.dates[date];
  }
  merged.recipe_qty ??= {};
  mergeMap("recipe_qty.", base.recipe_qty ?? {}, mine.recipe_qty ?? {}, theirs.recipe_qty ?? {}, merged.recipe_qty);
  return { merged, overlaps };
}

// Cleans a recipe draft before saving: trims, drops alternatives without food and ingredients left without any. Mirrors cleanProfile.
function cleanRecipe(r) {
  const name = r.name.trim();
  if (!name) throw new Error("Il nome della ricetta è obbligatorio");
  return {
    id: r.id, name, note: r.note.trim(),
    ingredients: r.ingredients.map((g) => ({
      id: g.id,
      alts: g.alts.filter((a) => a.food.trim()).map((a) => {
        if (a.qty < 0) throw new Error("La quantità non può essere negativa");
        return { id: a.id, food: a.food.trim(), qty: Number.isFinite(a.qty) ? a.qty : null, unit: a.unit.trim() };
      }),
    })).filter((g) => g.alts.length),
    rev: r.rev,
  };
}

class SharedDietPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    const today = iso(new Date());
    this._view = "today";
    this._profiles = null; // last subscribe payload
    this._recipes = {}; // recipe book from the same payload, by id
    this._loadError = "";
    this._profileId = null;
    this._draft = null; // editable copy of the selected profile
    this._base = null; // server copy the draft was taken from: the "original" for three-way merges
    this._dirty = false;
    this._newName = ""; // new-profile name, kept across re-renders
    this._recipeId = null; // selected recipe; its draft and dirty flag are separate from the profile's
    this._recipeDraft = null;
    this._recipeDirty = false;
    this._newRecipe = ""; // new-recipe name, kept across re-renders
    // "ctx:mealId" of meals whose fold state differs from the default (Settimana: folded, Date: open). View-only.
    this._foldToggled = new Set();
    this._busy = false;
    this._narrow = false;
    this._showAlts = false;
    this._date = today; // Date view
    this._wday = weekday(today); // Settimana view
    this._range = { from: today, to: addDays(today, 6) }; // Scelte view
    this._shop = { from: today, to: addDays(today, 6), off: new Set(), todo: "", items: null };
    this.shadowRoot.addEventListener("click", (e) => this._onClick(e));
    this.shadowRoot.addEventListener("change", (e) => this._onChange(e));
    this.shadowRoot.addEventListener("input", (e) => this._onInput(e));
    // Keep focus in the food field when a suggestion is tapped, so the tap lands as a click.
    for (const ev of ["pointerdown", "mousedown"])
      this.shadowRoot.addEventListener(ev, (e) => { if (e.target.closest(".sugg")) e.preventDefault(); });
    this.shadowRoot.addEventListener("focusout", (e) => { if (e.target.classList?.contains("food")) this._hideSugg(); });
  }

  // Food names already used anywhere (all profiles, saved or still being edited), one per spelling-insensitive name.
  _foodNames() {
    const profiles = [...Object.values(this._profiles ?? {}), ...(this._draft ? [this._draft] : [])];
    const names = new Map();
    const add = (food) => {
      const name = food.trim().replace(/\s+/g, " ");
      if (name && !names.has(foldText(name))) names.set(foldText(name), name);
    };
    for (const p of profiles)
      for (const m of [...Object.values(p.week).flat(), ...Object.values(p.exceptions).flat()])
        for (const a of m.options.flat().flatMap((l) => l.alts)) {
          if ("recipe" in a) continue; // recipe names are not food names
          add(a.food);
        }
    // Recipe ingredients' alternatives are foods too.
    for (const r of [...Object.values(this._recipes), ...(this._recipeDraft ? [this._recipeDraft] : [])])
      for (const g of r.ingredients) for (const a of g.alts) add(a.food);
    return names;
  }

  _suggest(input) {
    this._hideSugg();
    const q = foldText(input.value);
    if (!q) return;
    const foods = [...this._foodNames()].filter(([k]) => k.includes(q) && k !== q)
      .sort(([a], [b]) => (b.startsWith(q) - a.startsWith(q)) || a.localeCompare(b)) // prefix matches first
      .slice(0, 6).map(([, name]) => name);
    // Recipes are offered only in meal items; an ingredient field of the Ricette tab takes foods only.
    const recipes = input.dataset.ch === "item" ? matchRecipes(q, this._recipes) : [];
    if (!foods.length && !recipes.length) return;
    this._suggFor = input;
    const html = [
      ...foods.map((h) => `<button type="button" role="option" data-act="sugg" data-v="${esc(h)}">${esc(h)}</button>`),
      ...recipes.map((r) => `<button type="button" role="option" data-act="sugg-recipe" data-rid="${esc(r.id)}">${esc(r.name)}<span class="tag">Ricetta</span></button>`),
    ].join("");
    // After the × button when present, so the list spans the full row under the food field.
    const anchor = input.nextElementSibling?.tagName === "BUTTON" ? input.nextElementSibling : input;
    anchor.insertAdjacentHTML("afterend", `<div class="sugg" role="listbox">${html}</div>`);
  }

  _hideSugg() {
    this.shadowRoot.querySelectorAll(".sugg").forEach((s) => s.remove());
    this._suggFor = null;
  }

  _pickSugg(value) {
    const input = this._suggFor;
    this._hideSugg();
    if (!input?.isConnected) return;
    input.value = value;
    this._onChange({ target: input });
    input.closest(".item")?.querySelector('[data-f="qty"]')?.focus();
  }

  // Recipe suggestion: the alternative becomes {recipe}. Choices stay, since the meal's structure is unchanged.
  _pickRecipe(rid) {
    const input = this._suggFor;
    this._hideSugg();
    if (!input?.isConnected || !this._recipes[rid]) return;
    const d = input.dataset;
    this._list(d.ctx)[Number(d.i)].options[Number(d.o)][Number(d.l)].alts[Number(d.a)] = { recipe: rid };
    this._edit();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._unsub) this._subscribe();
    // Not re-rendered on every hass update: that would wipe inputs the user is typing into.
    if (!this._rendered) this._render();
  }

  set narrow(narrow) {
    this._narrow = narrow;
    this._render();
  }

  connectedCallback() {
    if (this._hass && !this._unsub) this._subscribe();
  }

  disconnectedCallback() {
    this._unsub?.then((unsub) => unsub?.(), () => {});
    this._unsub = null;
    document.getElementById("shared-diet-error")?.remove(); // don't leave it over other HA pages
  }

  _subscribe() {
    this._unsub = this._hass.connection
      .subscribeMessage((msg) => this._onData(msg.profiles, msg.recipes), { type: "shared_diet/subscribe" })
      .catch((err) => {
        this._loadError = err?.message || "Impossibile caricare i dati";
        this._render();
        return () => {};
      });
  }

  // Latest server data. Unsaved edits to the selected profile survive; a deleted profile resets the selection.
  _onData(profiles, recipes) {
    this._profiles = profiles;
    this._recipes = recipes ?? {};
    if (!profiles[this._profileId]) {
      this._profileId = Object.keys(profiles)[0] ?? null;
      this._draft = null;
      this._dirty = false;
    }
    if (this._profileId && !this._dirty) this._load(profiles[this._profileId]);
    this._syncRecipe();
    // A dirty editor is only annotated: re-rendering it would drop focus and the caret mid-typing.
    const editing = this._view === "recipes"
      ? this._recipeDirty
      : this._dirty && ["week", "dates", "choices", "profiles"].includes(this._view);
    if (editing) {
      const el = this.shadowRoot.getElementById("notice");
      if (el) {
        el.innerHTML = this._noticeHtml();
        return;
      }
    }
    this._render();
  }

  _load(profile) {
    this._draft = clone(profile);
    this._base = clone(profile);
    this._dirty = false;
  }

  // Keeps the selected recipe in step with the server: unsaved edits survive, a deleted recipe clears the selection.
  _syncRecipe() {
    if (!this._recipeId) return;
    const r = this._recipes[this._recipeId];
    if (!r) {
      // Our own delete also arrives as a push, before its reply: only another user's deletion warns.
      if (this._recipeDirty && this._recipeId !== this._deletingId) this._flash("Ricetta eliminata da un altro utente: modifiche scartate");
      this._clearRecipe();
    } else if (!this._recipeDirty) this._loadRecipe(r);
  }

  _loadRecipe(r) {
    this._recipeDraft = clone(r);
    this._recipeDirty = false;
  }

  _clearRecipe() {
    this._recipeId = null;
    this._recipeDraft = null;
    this._recipeDirty = false;
  }

  _noticeHtml() {
    const server = this._profiles[this._profileId];
    return this._dirty && this._draft && server && server.rev > this._draft.rev
      ? `<p class="msg info" role="status">Un altro utente ha modificato questo profilo; al salvataggio le modifiche verranno unite</p>`
      : "";
  }

  // ---- state helpers -------------------------------------------------------

  _canDiscard() {
    return !this._dirty || confirm("Ci sono modifiche non salvate: scartarle?");
  }

  _selectProfile(id) {
    if (id === this._profileId) return;
    if (!this._canDiscard()) return this._render();
    this._profileId = id;
    this._load(this._profiles[id]);
    this._render();
  }

  _edit() {
    this._dirty = true;
    this._render();
  }

  _canDiscardRecipe() {
    return !this._recipeDirty || confirm("Ci sono modifiche non salvate: scartarle?");
  }

  _selectRecipe(id) {
    if (id === this._recipeId) return;
    if (!this._canDiscardRecipe()) return this._render();
    if (id && this._recipes[id]) {
      this._recipeId = id;
      this._loadRecipe(this._recipes[id]);
    } else this._clearRecipe();
    this._render();
  }

  _recipeEdit() {
    this._recipeDirty = true;
    this._render();
  }

  _markRecipeDirty() {
    this._recipeDirty = true;
    this.shadowRoot.getElementById("rsave")?.removeAttribute("hidden"); // no re-render while typing
  }

  // The same recipe can sit in two meals: copies the grams into every row showing this ingredient, and shows its reset button only when overridden.
  _syncRecipeQty(el, v) {
    const { rid, iid } = el.dataset;
    for (const input of this.shadowRoot.querySelectorAll('input[data-ch="rqty"]')) {
      if (input.dataset.rid !== rid || input.dataset.iid !== iid) continue;
      if (input !== el) input.value = v ?? "";
      const reset = input.closest(".ing")?.querySelector('[data-act="rreset"]');
      if (reset) reset.hidden = v === null;
    }
  }

  _markDirty() {
    this._dirty = true;
    this.shadowRoot.getElementById("save")?.removeAttribute("hidden"); // no re-render while typing
  }

  // Errors: red toast, 8 s or until tapped. HA's own toast (used for success) has no error style.
  // Lives in document.body so panel re-renders don't remove it; textContent keeps it XSS-safe.
  _flash(text) {
    clearTimeout(this._errTimer);
    document.getElementById("shared-diet-error")?.remove();
    const t = Object.assign(document.createElement("div"), { id: "shared-diet-error", role: "alert", textContent: text });
    Object.assign(t.style, {
      position: "fixed", left: "50%", bottom: "24px", transform: "translateX(-50%)", zIndex: 10000,
      maxWidth: "min(560px, calc(100vw - 32px))", padding: "12px 16px", borderRadius: "8px", cursor: "pointer",
      background: "var(--error-color, #db4437)", color: "#fff", boxShadow: "0 3px 10px rgba(0,0,0,.35)",
      font: "14px var(--paper-font-body1_-_font-family, Roboto, sans-serif)",
    });
    t.onclick = () => t.remove();
    document.body.append(t);
    this._errTimer = setTimeout(() => t.remove(), 8000);
  }

  async _run(fn, okText = "") {
    if (this._busy) return;
    this._busy = true;
    this._render();
    try {
      const done = (await fn()) || okText;
      // Success goes to HA's own toast (auto-closing).
      if (done) this.dispatchEvent(new CustomEvent("hass-notification", {
        detail: { message: done, duration: done === okText ? 3000 : 6000 }, bubbles: true, composed: true }));
    } catch (err) {
      this._flash(err?.message || "Operazione non riuscita");
    } finally {
      this._busy = false;
      this._render();
    }
  }

  _save() {
    const id = this._profileId;
    return this._run(async () => {
      let profile = cleanProfile(this._draft);
      let note = "";
      let retried = false;
      for (;;) {
        try {
          const res = await this._hass.callWS({ type: "shared_diet/save_profile", profile });
          this._load(res.profile);
          return note;
        } catch (err) {
          if (err?.code !== "conflict") throw err;
          const theirs = this._profiles[id];
          if (retried || !theirs) {
            // Second conflict (or no server copy): drop the local edits and show the latest server data.
            if (theirs) this._load(theirs);
            else {
              this._draft = null;
              this._base = null;
              this._dirty = false;
            }
            throw new Error("Modificato da un altro utente, dati ricaricati");
          }
          retried = true;
          const { merged, overlaps } = mergeProfiles(this._base, profile, theirs);
          profile = merged;
          note = "Un altro utente ha modificato il profilo: modifiche unite"
            + (overlaps.length ? `; conflitti su: ${overlaps.join(", ")}, tenuta la versione dell'altro utente` : "");
        }
      }
    }, "Salvato");
  }

  _createProfile() {
    const name = this._newName.trim();
    if (!name) return this._flash("Inserisci un nome per il profilo");
    if (!this._canDiscard()) return;
    return this._run(async () => {
      const res = await this._hass.callWS({ type: "shared_diet/create_profile", name });
      this._profileId = res.profile.id;
      this._load(res.profile);
      this._newName = "";
    }, "Profilo creato");
  }

  _deleteProfile() {
    const id = this._profileId;
    if (!confirm(`Eliminare il profilo «${this._draft.name}»? L'operazione non si annulla.`)) return;
    return this._run(async () => {
      await this._hass.callWS({ type: "shared_diet/delete_profile", profile_id: id });
      if (this._profileId === id) {
        this._profileId = null;
        this._draft = null;
        this._base = null;
        this._dirty = false;
      }
    }, "Profilo eliminato");
  }

  _saveRecipe() {
    const id = this._recipeId;
    return this._run(async () => {
      const recipe = cleanRecipe(this._recipeDraft);
      try {
        const res = await this._hass.callWS({ type: "shared_diet/save_recipe", recipe });
        this._loadRecipe(res.recipe);
      } catch (err) {
        if (err?.code !== "conflict") throw err;
        // Someone else changed it: take the latest server copy and say so.
        if (this._recipes[id]) this._loadRecipe(this._recipes[id]);
        else this._clearRecipe();
        throw new Error("Ricetta modificata da un altro utente, dati ricaricati");
      }
    }, "Ricetta salvata");
  }

  _createRecipe() {
    const name = this._newRecipe.trim();
    if (!name) return this._flash("Inserisci un nome per la ricetta");
    if (!this._canDiscardRecipe()) return;
    return this._run(async () => {
      const res = await this._hass.callWS({ type: "shared_diet/create_recipe", name });
      this._recipeId = res.recipe.id;
      this._loadRecipe(res.recipe);
      this._newRecipe = "";
    }, "Ricetta creata");
  }

  _deleteRecipe() {
    const id = this._recipeId;
    if (!confirm("Eliminare la ricetta?")) return;
    return this._run(async () => {
      this._deletingId = id;
      try {
        await this._hass.callWS({ type: "shared_diet/delete_recipe", recipe_id: id });
      } finally {
        this._deletingId = null;
      }
      if (this._recipeId === id) this._clearRecipe();
    }, "Ricetta eliminata");
  }

  _todo() {
    const todos = Object.keys(this._hass.states).filter((e) => e.startsWith("todo."));
    return todos.includes(this._shop.todo) ? this._shop.todo : todos[0] ?? "";
  }

  _runShop() {
    const { from, to } = this._shop;
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return this._flash("Intervallo non valido");
    const todo = this._todo();
    if (!todo) return this._flash("Nessuna lista To-do disponibile");
    const ids = Object.keys(this._profiles);
    const selected = ids.filter((id) => !this._shop.off.has(id));
    if (!selected.length) return this._flash("Seleziona almeno un profilo");
    return this._run(async () => {
      const res = await this._hass.callWS({
        type: "shared_diet/shopping",
        start: from,
        end: to,
        profile_ids: selected.length === ids.length ? null : selected,
        todo_entity_id: todo,
      });
      this._shop.items = res.items;
    }, "Lista della spesa aggiornata");
  }

  // Meal list addressed by ctx: "w<weekday>" for the weekly schema, "x<date>" for an exception.
  _list(ctx) {
    return ctx[0] === "w" ? this._draft.week[ctx.slice(1)] : this._draft.exceptions[ctx.slice(1)];
  }

  // Choice object for a meal: date override when date is set, else the per-meal default.
  _choiceSlot(date, mid, create) {
    const c = this._draft.choices;
    const holder = date ? (create ? (c.dates[date] ??= {}) : c.dates[date] ?? {}) : c.defaults;
    if (create) holder[mid] ??= zeroChoice();
    return holder[mid];
  }

  // ---- events --------------------------------------------------------------

  _onClick(e) {
    const el = e.target.closest("[data-act],[data-tab]");
    if (!el) return;
    const d = el.dataset;
    if (d.tab) {
      this._view = d.tab;
      return this._render();
    }
    if (d.act === "fold") {
      if (!this._foldToggled.delete(d.key)) this._foldToggled.add(d.key);
      return this._render();
    }
    if (this._busy && d.act !== "menu") return; // nothing may change while a save is in flight
    switch (d.act) {
      case "menu":
        return this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
      case "sugg": return this._pickSugg(d.v);
      case "sugg-recipe": return this._pickRecipe(d.rid);
      case "rreset":
        this._draft.recipe_qty = setRecipeQty(this._draft.recipe_qty ?? {}, d.rid, d.iid, null);
        return this._edit();
      case "save": return this._save();
      case "create": return this._createProfile();
      case "delprofile": return this._deleteProfile();
      case "rcreate": return this._createRecipe();
      case "rsave": return this._saveRecipe();
      case "rdelete": return this._deleteRecipe();
      case "ropen": return this._selectRecipe(d.rid);
      case "raddingr":
        this._recipeDraft.ingredients.push({ id: uid(), alts: [{ id: uid(), food: "", qty: null, unit: "g" }] });
        this._focus = `[data-ch="ring"][data-f="food"][data-i="${this._recipeDraft.ingredients.length - 1}"][data-a="0"]`;
        return this._recipeEdit();
      case "raddalt": {
        const g = this._recipeDraft.ingredients[Number(d.i)];
        g.alts.push({ id: uid(), food: "", qty: null, unit: "g" });
        this._focus = `[data-ch="ring"][data-f="food"][data-i="${d.i}"][data-a="${g.alts.length - 1}"]`;
        return this._recipeEdit();
      }
      case "rdelalt": {
        const g = this._recipeDraft.ingredients[Number(d.i)];
        if (g.alts.length > 1) g.alts.splice(Number(d.a), 1); // the last alternative goes with "Rimuovi ingrediente"
        return this._recipeEdit();
      }
      case "rdelingr":
        this._recipeDraft.ingredients.splice(Number(d.i), 1);
        return this._recipeEdit();
      case "shop": return this._runShop();
      case "alts": this._showAlts = !this._showAlts; return this._render();
      case "wday": this._wday = Number(d.d); return this._render();
      case "mkex":
        this._draft.exceptions[d.date] = clone(this._draft.week[String(weekday(d.date))]);
        return this._edit();
      case "delex":
        if (!confirm("Eliminare l'eccezione? Torna lo schema settimanale.")) return;
        delete this._draft.exceptions[d.date];
        return this._edit();
      case "ov": {
        const day = (this._draft.choices.dates[d.date] ??= {});
        day[d.mid] = clone(this._draft.choices.defaults[d.mid] ?? zeroChoice());
        return this._edit();
      }
      case "clrov": {
        const day = this._draft.choices.dates[d.date];
        delete day[d.mid];
        if (!Object.keys(day).length) delete this._draft.choices.dates[d.date];
        return this._edit();
      }
    }
    if (!d.ctx) return;
    const list = this._list(d.ctx);
    const i = Number(d.i), oi = Number(d.o), li = Number(d.l), ai = Number(d.a);
    switch (d.act) {
      case "addmeal":
        list.push(newMeal());
        if (isWeekCtx(d.ctx)) this._foldToggled.add(`${d.ctx}:${list.at(-1).id}`); // a new meal opens for filling in
        this._focus = `[data-ch="meal"][data-f="name"][data-ctx="${d.ctx}"][data-i="${list.length - 1}"]`;
        break;
      case "up":
      case "down": {
        const j = d.act === "up" ? i - 1 : i + 1;
        if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
        break;
      }
      case "delmeal":
        if (!confirm("Eliminare questo pasto?")) return;
        list.splice(i, 1);
        break;
      case "addopt": list[i].options.push([{ alts: [blankItem()] }]); break;
      case "delopt": list[i].options.splice(oi, 1); this._forgetChoices(list[i].id); break;
      case "addline":
        list[i].options[oi].push({ alts: [blankItem()] });
        this._focus = foodSel(d.ctx, i, oi, list[i].options[oi].length - 1, 0);
        break;
      case "delline": list[i].options[oi].splice(li, 1); this._forgetChoices(list[i].id); break;
      case "addalt":
        list[i].options[oi][li].alts.push(blankItem());
        this._focus = foodSel(d.ctx, i, oi, li, list[i].options[oi][li].alts.length - 1);
        break;
      case "ualt": // back to a simple food: an empty item, as a new alternative would be
        list[i].options[oi][li].alts[ai] = blankItem();
        this._focus = foodSel(d.ctx, i, oi, li, ai);
        break;
      case "delalt": {
        // Removing the sole alternative removes the line: an empty line would have nothing to show.
        const alts = list[i].options[oi][li].alts;
        if (alts.length > 1) alts.splice(ai, 1);
        else list[i].options[oi].splice(li, 1);
        this._forgetChoices(list[i].id);
        break;
      }
      default: return;
    }
    this._edit();
  }

  // Removing an option, line or alternative shifts indexes: the meal's stored choices can no longer be trusted.
  _forgetChoices(mid) {
    const c = this._draft.choices;
    delete c.defaults[mid];
    for (const [date, byMeal] of Object.entries(c.dates)) {
      delete byMeal[mid];
      if (!Object.keys(byMeal).length) delete c.dates[date];
    }
  }

  // Typing updates the draft without re-rendering, so a push from another user cannot wipe it.
  _onInput(e) {
    const el = e.target;
    if (this._busy || !["INPUT", "TEXTAREA"].includes(el.tagName)) return;
    if ("newname" in el.dataset) this._newName = el.value;
    else if ("newrecipe" in el.dataset) this._newRecipe = el.value;
    else if (["pfield", "meal", "item", "rfield", "ring", "rqty"].includes(el.dataset.ch) && el.type !== "checkbox") this._onChange(e);
    if (el.classList.contains("food")) this._suggest(el);
  }

  _onChange(e) {
    const el = e.target;
    const d = el.dataset;
    if (this._busy) return; // the success path replaces the draft, so an edit now would be lost
    switch (d.ch) {
      case "pick": return this._selectProfile(el.value);
      case "date":
        if (!el.value) return;
        this._date = el.value;
        return this._render();
      case "range":
        this._range[d.f] = el.value;
        return this._render();
      case "srange":
        this._shop[d.f] = el.value;
        return this._render();
      case "rpick": return this._selectRecipe(el.value);
      case "rfield":
        this._recipeDraft[d.f] = el.value; // name or note
        return this._markRecipeDirty();
      case "ring": {
        const alt = this._recipeDraft.ingredients[Number(d.i)].alts[Number(d.a)];
        alt[d.f] = d.f === "qty" ? (el.value === "" ? null : Number(el.value)) : el.value;
        return this._markRecipeDirty();
      }
      case "stodo": this._shop.todo = el.value; return;
      case "sprof":
        if (el.checked) this._shop.off.delete(d.id);
        else this._shop.off.add(d.id);
        return;
      case "pfield": {
        const p = this._draft;
        const v = el.type === "checkbox" ? el.checked : el.value;
        if (d.f === "name") p.name = v;
        else if (d.f === "person") p.person = v || null;
        else if (d.f === "rem.on") p.reminder.enabled = v;
        else if (d.f === "rem.min") p.reminder.minutes = Number(v) || 0;
        else if (d.f === "rem.notify") p.reminder.notify = v || null;
        return this._markDirty();
      }
      case "meal": {
        const m = this._list(d.ctx)[Number(d.i)];
        m[d.f] = d.f === "time" ? el.value || null : el.value;
        return this._markDirty();
      }
      case "item": {
        const a = this._list(d.ctx)[Number(d.i)].options[Number(d.o)][Number(d.l)].alts[Number(d.a)];
        a[d.f] = d.f === "qty" ? (el.value === "" ? null : Number(el.value)) : el.value;
        return this._markDirty();
      }
      case "rqty": {
        const n = Number(el.value);
        const v = el.value === "" || !Number.isFinite(n) ? null : n; // negatives are kept, and rejected on save
        this._draft.recipe_qty = setRecipeQty(this._draft.recipe_qty ?? {}, d.rid, d.iid, v);
        this._syncRecipeQty(el, v);
        return this._markDirty();
      }
      case "copt": {
        const c = this._choiceSlot(d.date, d.mid, true);
        c.option = Number(el.value);
        c.lines = {};
        return this._edit();
      }
      case "cline":
        this._choiceSlot(d.date, d.mid, true).lines[d.l] = Number(el.value);
        return this._edit(); // the recipes on the chosen path can change
      case "cing": {
        const c = this._choiceSlot(d.date, d.mid, true);
        (c.recipes ??= {})[d.rid] ??= {};
        c.recipes[d.rid][d.iid] = el.value;
        return this._edit();
      }
    }
  }

  // ---- rendering -----------------------------------------------------------

  _render() {
    this._rendered = true;
    this.shadowRoot.innerHTML = `
      <style>${CSS}</style>
      <div class="app">
        <header>
          ${this._narrow ? `<button class="icon" data-act="menu" aria-label="Apri menu">☰</button>` : ""}
          <h1>Dieta</h1>
        </header>
        <nav class="tabs" role="tablist">
          ${TABS.map(([k, l]) => `<button class="tab${k === this._view ? " on" : ""}" data-tab="${k}" role="tab">${l}</button>`).join("")}
        </nav>
        <main${this._busy ? " inert" : ""}>${this._body()}</main>
      </div>`;
    // Re-rendering drops focus; move it to the field the user just added and bring it into view.
    if (this._focus) {
      const el = this.shadowRoot.querySelector(this._focus);
      this._focus = null;
      if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "center" }); }
    }
  }

  _body() {
    if (this._loadError) return `<p class="msg err">${esc(this._loadError)}</p>`;
    if (!this._profiles) return `<p class="muted">Caricamento…</p>`;
    const views = {
      today: () => this._vToday(), week: () => this._vWeek(), dates: () => this._vDates(),
      choices: () => this._vChoices(), recipes: () => this._vRecipes(), shop: () => this._vShop(), profiles: () => this._vProfiles(),
    };
    return `<div id="notice">${this._noticeHtml()}</div>` + views[this._view]() + this._datalists();
  }

  // Profile selector; in editor views also the Save button on the same (sticky) row, shown only with unsaved edits.
  _picker(withSave = false) {
    const ids = Object.keys(this._profiles);
    if (!ids.length) return `<p class="muted">Nessun profilo ancora: creane uno nella scheda «Profili».</p>`;
    const sel = `<label class="row">Profilo
      <select data-ch="pick">${ids.map((id) => `<option value="${esc(id)}"${id === this._profileId ? " selected" : ""}>${esc(this._profiles[id].name)}</option>`).join("")}</select>
    </label>`;
    if (!withSave) return sel;
    return `<div class="savebar">${sel}
      <button class="primary" id="save" data-act="save"${this._dirty ? "" : " hidden"}${this._busy ? " disabled" : ""}>Salva</button>
    </div>`;
  }

  _datalists() {
    const meals = Object.values(this._profiles).flatMap((p) => [...Object.values(p.week).flat(), ...Object.values(p.exceptions).flat()]);
    const items = [
      ...meals.flatMap((m) => m.options.flat().flatMap((l) => l.alts)).filter((i) => !("recipe" in i)),
      ...Object.values(this._recipes).flatMap((r) => r.ingredients.flatMap((g) => g.alts)),
    ];
    // Units: case-insensitive like model.py. Food suggestions use the in-panel list (_suggest): datalists are unreliable in the Companion app.
    const units = [...new Set(["g", "ml", "pz", ...items.map((i) => i.unit.trim().toLowerCase()).filter(Boolean)])];
    return `<datalist id="units">${units.map((u) => `<option value="${esc(u)}">`).join("")}</datalist>`;
  }

  // Read-only resolved meals for a date (choices applied), optionally with all alternatives.
  _resolved(p, s, withAlts = false) {
    const meals = effectiveDay(p, s);
    if (!meals.length) return `<p class="muted">Nessun pasto.</p>`;
    // Recipe: name, ingredients with the person's grams, preparation note folded away.
    // With "Vedi alternative": the ingredients' other alternatives, greyed out, after the chosen ones.
    const otherAlts = (i) => (withAlts ? i.choices.map((c) => {
      const chosen = c.alts.find((a) => a.id === c.chosen);
      const others = c.alts.filter((a) => a.id !== c.chosen).map((a) => fmtItem(a)).join(" / ");
      return `<li class="muted">Alternativa a ${esc(chosen.food)}: ${esc(others)}</li>`;
    }).join("") : "");
    const itemHtml = (i) => ("recipe" in i
      ? `<li><strong>${esc(i.food)}</strong>${i.ingredients.length
        ? `<ul class="muted">${i.ingredients.map((g) => `<li>${esc(fmtItem(g))}</li>`).join("")}${otherAlts(i)}</ul>` : ""}${
        i.note.trim() ? `<details><summary>Preparazione</summary><p>${esc(i.note)}</p></details>` : ""}</li>`
      : `<li>${esc(fmtItem(i))}</li>`);
    return meals.map((m) => {
      const r = resolveMeal(m, choiceFor(p, s, m.id), p, this._recipes);
      const alts = m.options.map((opt, oi) => `<li class="${oi === r.option ? "" : "muted"}">${m.options.length > 1 ? `Opzione ${oi + 1}: ` : ""}${
        opt.map((l) => l.alts.map((a) => esc("recipe" in a ? itemLabel(a, this._recipes) : fmtItem(a))).join(" / ")).join(" + ")}</li>`).join("");
      return `<section class="card">
        <div class="meal-head"><strong>${esc(m.name)}</strong><span class="muted">${esc(m.time ?? "senza orario")}</span></div>
        <ul>${r.items.map(itemHtml).join("")}</ul>
        ${withAlts ? `<ul class="alts">${alts}</ul>` : ""}
      </section>`;
    }).join("");
  }

  _vToday() {
    const p = this._profiles[this._profileId];
    if (!p) return this._picker();
    const today = iso(new Date());
    return `${this._picker()}
      <h2>${esc(fmtDay(today, { weekday: "long", day: "numeric", month: "long" }))}</h2>
      <button data-act="alts">${this._showAlts ? "Nascondi alternative" : "Vedi alternative"}</button>
      ${this._resolved(p, today, this._showAlts)}`;
  }

  _vWeek() {
    if (!this._draft) return this._picker();
    const chips = DAYS_SHORT.map((d, i) => `<button class="chip${i === this._wday ? " on" : ""}" data-act="wday" data-d="${i}">${d}</button>`).join("");
    return `${this._picker(true)}
      <div class="chips" role="group">${chips}</div>
      <h2>${DAYS[this._wday]}</h2>
      ${this._mealEditor(`w${this._wday}`, this._draft.week[String(this._wday)])}`;
  }

  _vDates() {
    if (!this._draft) return this._picker();
    const p = this._draft;
    const s = this._date;
    const body = p.exceptions[s]
      ? `<p class="muted">Eccezione: sostituisce lo schema di ${DAYS[weekday(s)]}.</p>
         ${this._mealEditor(`x${s}`, p.exceptions[s])}
         <button class="danger" data-act="delex" data-date="${esc(s)}">Elimina eccezione</button>`
      : `<p class="muted">Nessuna eccezione: vale lo schema di ${DAYS[weekday(s)]}.</p>
         ${this._resolved(p, s)}
         <button class="primary" data-act="mkex" data-date="${esc(s)}">Crea eccezione</button>`;
    return `${this._picker(true)}
      <label class="row">Data <input type="date" value="${esc(s)}" data-ch="date"></label>
      <h2>${esc(fmtDay(s, { weekday: "long", day: "numeric", month: "long" }))}</h2>
      ${body}`;
  }

  _vChoices() {
    if (!this._draft) return this._picker();
    const { from, to } = this._range;
    let cards = "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) cards = `<p class="msg err">Intervallo non valido.</p>`;
    else if (span(from, to) > MAX_SPAN) cards = `<p class="msg err">Intervallo massimo di ${MAX_SPAN} giorni.</p>`;
    else {
      for (let s = from; s <= to; s = addDays(s, 1)) {
        for (const m of effectiveDay(this._draft, s)) if (hasChoice(m, this._recipes)) cards += this._choiceCard(s, m);
      }
      if (!cards) cards = `<p class="muted">Nessun pasto con alternative nell'intervallo.</p>`;
    }
    return `${this._picker(true)}
      <div class="row">Dal <input type="date" value="${esc(from)}" data-ch="range" data-f="from"> al
        <input type="date" value="${esc(to)}" data-ch="range" data-f="to"></div>
      ${cards}`;
  }

  _choiceCard(s, m) {
    const mid = esc(m.id);
    const ov = this._draft.choices.dates[s]?.[m.id];
    const def = this._draft.choices.defaults[m.id] ?? zeroChoice();
    const dateBlock = ov
      ? `${this._choiceEditor(s, m, ov)}<button data-act="clrov" data-date="${esc(s)}" data-mid="${mid}">Usa predefinito</button>`
      : `<p class="muted">Usa il predefinito</p><button data-act="ov" data-date="${esc(s)}" data-mid="${mid}">Ritocca per questa data</button>`;
    return `<section class="card">
      <div class="meal-head"><strong>${esc(fmtDay(s, { weekday: "short", day: "numeric", month: "numeric" }))} · ${esc(m.name)}</strong></div>
      <div class="sub">Predefinito</div>
      ${this._choiceEditor("", m, def)}
      <div class="sub">Questa data</div>
      ${dateBlock}
    </section>`;
  }

  _choiceEditor(date, m, choice) {
    const { option, items } = resolveMeal(m, choice, this._draft, this._recipes);
    const attrs = `data-date="${esc(date)}" data-mid="${esc(m.id)}"`;
    const opts = m.options.map((o, oi) => `<option value="${oi}"${oi === option ? " selected" : ""}>Opzione ${oi + 1}: ${
      esc(o.map((l) => l.alts.map((a) => itemLabel(a, this._recipes)).join(" / ")).join(" + "))}</option>`).join("");
    const lines = m.options[option].map((line, li) => {
      if (line.alts.length < 2) return "";
      const want = choice.lines[String(li)] ?? 0;
      const sel = want >= 0 && want < line.alts.length ? want : 0;
      return `<label class="sub-row">Alimento ${li + 1}
        <select data-ch="cline" ${attrs} data-l="${li}">${line.alts.map((a, ai) => `<option value="${ai}"${ai === sel ? " selected" : ""}>${esc(itemLabel(a, this._recipes))}</option>`).join("")}</select>
      </label>`;
    }).join("");
    // Whole-meal options are no longer offered in the editor; the selector only shows for meals that still have several.
    const optSel = m.options.length > 1 ? `<label class="sub-row">Opzione <select data-ch="copt" ${attrs}>${opts}</select></label>` : "";
    // Ingredient alternatives of the recipes on the chosen path: "<Ricetta> · Ingrediente N" (N = position in the recipe).
    // A recipe on two lines shares its choices (keyed by recipe and ingredient): one set of selects per recipe.
    const seenRecipes = new Set();
    const recipeSels = items.flatMap((it) => {
      if (seenRecipes.has(it.recipe)) return [];
      seenRecipes.add(it.recipe);
      return (it.choices ?? []).map((ch) => {
        const n = recipeOf(it.recipe, this._recipes).ingredients.findIndex((g) => g.id === ch.ingredient_id) + 1;
        return `<label class="sub-row">${esc(it.food)} · Ingrediente ${n}
          <select data-ch="cing" ${attrs} data-rid="${esc(it.recipe)}" data-iid="${esc(ch.ingredient_id)}">${ch.alts.map((a) =>
            `<option value="${esc(a.id)}"${a.id === ch.chosen ? " selected" : ""}>${esc(fmtItem({ ...a, note: "" }))}</option>`).join("")}</select>
        </label>`;
      });
    }).join("");
    return optSel + lines + recipeSels;
  }

  _vShop() {
    const ids = Object.keys(this._profiles);
    const todos = Object.keys(this._hass.states).filter((e) => e.startsWith("todo."));
    const todo = this._todo();
    const profiles = ids.map((id) => `<label class="check"><input type="checkbox" data-ch="sprof" data-id="${esc(id)}"${
      this._shop.off.has(id) ? "" : " checked"}> ${esc(this._profiles[id].name)}</label>`).join("") || `<p class="muted">Nessun profilo.</p>`;
    const todoSel = todos.length
      ? `<label class="row">Lista To-do <select data-ch="stodo">${todos.map((e) => `<option value="${esc(e)}"${e === todo ? " selected" : ""}>${esc(this._hass.states[e].attributes.friendly_name ?? e)}</option>`).join("")}</select></label>`
      : `<p class="msg err">Nessuna lista To-do: creane una in Home Assistant.</p>`;
    const items = this._shop.items === null ? ""
      : this._shop.items.length ? `<h3>Aggiunti alla lista</h3><ul>${this._shop.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
      : `<p class="muted">Nessun alimento nell'intervallo.</p>`;
    return `<h2>Lista della spesa</h2>
      <div class="row">Dal <input type="date" value="${esc(this._shop.from)}" data-ch="srange" data-f="from"> al
        <input type="date" value="${esc(this._shop.to)}" data-ch="srange" data-f="to"></div>
      <fieldset><legend>Profili</legend>${profiles}</fieldset>
      ${todoSel}
      <button class="primary" data-act="shop"${todo && !this._busy ? "" : " disabled"}>Aggiungi alla lista</button>
      ${items}`;
  }

  _vRecipes() {
    if (!this._recipeDraft) {
      const list = Object.values(this._recipes).sort((a, b) => a.name.localeCompare(b.name, "it"));
      const rows = list.map((r) => {
        const n = r.ingredients.length;
        return `<section class="card"><button class="recipe-row" data-act="ropen" data-rid="${esc(r.id)}">${esc(r.name)}
          <span class="muted">· ${n} ${n === 1 ? "ingrediente" : "ingredienti"}</span></button></section>`;
      }).join("");
      return `<h2>Ricette</h2>
        <div class="row"><input data-newrecipe value="${esc(this._newRecipe)}" placeholder="Nome della nuova ricetta" aria-label="Nome nuova ricetta">
          <button data-act="rcreate">Crea ricetta</button></div>
        ${rows || `<p class="muted">Nessuna ricetta ancora: creane una qui sopra.</p>`}`;
    }
    const r = this._recipeDraft;
    const ids = Object.values(this._recipes).sort((a, b) => a.name.localeCompare(b.name, "it"));
    const opts = ids.map((x) => `<option value="${esc(x.id)}"${x.id === this._recipeId ? " selected" : ""}>${esc(x.name)}</option>`).join("");
    const picker = `<div class="savebar">
        <label class="row">Ricetta <select data-ch="rpick"><option value="">— elenco —</option>${opts}</select></label>
        <button class="primary" id="rsave" data-act="rsave"${this._recipeDirty ? "" : " hidden"}${this._busy ? " disabled" : ""}>Salva</button>
      </div>`;
    const ings = r.ingredients.map((g, k) => `<div class="line">
        <div class="line-head">Ingrediente ${k + 1}</div>
        ${g.alts.map((a, ai) => {
          const sep = ai ? `<div class="or">oppure</div>` : "";
          const del = g.alts.length > 1 ? `<button class="icon" data-act="rdelalt" data-i="${k}" data-a="${ai}" aria-label="Rimuovi alternativa">×</button>` : "";
          const at = `data-ch="ring" data-i="${k}" data-a="${ai}"`;
          return `${sep}<div class="item">
            <input class="food" autocomplete="off" value="${esc(a.food)}" placeholder="Alimento" aria-label="Alimento"
              data-f="food" ${at}>
            ${del}
            <input type="number" min="0" step="any" value="${esc(a.qty ?? "")}" placeholder="Quantità" aria-label="Quantità"
              data-f="qty" ${at}>
            <input list="units" value="${esc(a.unit)}" placeholder="Unità" aria-label="Unità"
              data-f="unit" ${at}>
          </div>`;
        }).join("")}
        ${g.alts.length > 1 ? `<p class="muted">La prima è la predefinita</p>` : ""}
        <div class="row">
          <button data-act="raddalt" data-i="${k}">+ OPPURE</button>
          <button class="danger" data-act="rdelingr" data-i="${k}">Rimuovi ingrediente</button>
        </div>
      </div>`).join("");
    return `${picker}
      <label class="sub-row">Nome <input value="${esc(r.name)}" data-ch="rfield" data-f="name"></label>
      <label class="sub-row">Preparazione <textarea rows="4" data-ch="rfield" data-f="note">${esc(r.note)}</textarea></label>
      <h3>Ingredienti</h3>
      ${ings}
      <button class="add" data-act="raddingr">+ Ingrediente</button>
      <button class="danger" data-act="rdelete">Elimina ricetta</button>`;
  }

  _vProfiles() {
    const head = `<h2>Profili</h2>
      <div class="row"><input data-newname value="${esc(this._newName)}" placeholder="Nome del nuovo profilo" aria-label="Nome nuovo profilo">
        <button data-act="create">Crea profilo</button></div>`;
    const p = this._draft;
    if (!p) return head;
    const persons = Object.keys(this._hass.states).filter((e) => e.startsWith("person.")).sort();
    const notifies = Object.entries(this._hass.services.notify ?? {})
      .filter(([n, svc]) => n !== "send_message" && !svc.fields?.entity_id)
      .map(([n]) => `notify.${n}`).sort();
    const select = (field, current, list, empty, label = (v) => v) => {
      const all = current && !list.includes(current) ? [current, ...list] : list;
      return `<select data-ch="pfield" data-f="${field}"><option value="">${empty}</option>${all.map((v) =>
        `<option value="${esc(v)}"${v === current ? " selected" : ""}>${esc(label(v))}</option>`).join("")}</select>`;
    };
    return `${head}${this._picker(true)}
      <section class="card">
        <label class="sub-row">Nome <input value="${esc(p.name)}" data-ch="pfield" data-f="name"></label>
        <label class="sub-row">Persona collegata ${select("person", p.person, persons, "Nessuna", (v) => this._hass.states[v]?.attributes.friendly_name ?? v)}</label>
      </section>
      <section class="card">
        <label class="check"><input type="checkbox" data-ch="pfield" data-f="rem.on"${p.reminder.enabled ? " checked" : ""}> Promemoria</label>
        <label class="sub-row">Minuti prima del pasto
          <input type="number" min="0" max="240" step="1" value="${esc(p.reminder.minutes)}" data-ch="pfield" data-f="rem.min"></label>
        <label class="sub-row">Servizio notifica ${select("rem.notify", p.reminder.notify, notifies, "Nessuno")}</label>
      </section>
      <button class="danger" data-act="delprofile">Elimina profilo</button>`;
  }

  _mealEditor(ctx, meals) {
    return meals.map((m, i) => this._mealCard(ctx, m, i, meals.length)).join("")
      + `<button class="add" data-act="addmeal" data-ctx="${esc(ctx)}">+ Aggiungi pasto</button>`;
  }

  _mealCard(ctx, m, i, n) {
    const at = `data-ctx="${esc(ctx)}" data-i="${i}"`;
    const key = `${ctx}:${m.id}`;
    const folded = isWeekCtx(ctx) !== this._foldToggled.has(key);
    const head = `<div class="row">
        <input class="grow" value="${esc(m.name)}" data-ch="meal" data-f="name" ${at} aria-label="Nome pasto">
        <input type="time" value="${esc(m.time ?? "")}" data-ch="meal" data-f="time" ${at} aria-label="Orario">
        <button class="icon" data-act="fold" data-key="${esc(key)}" aria-expanded="${!folded}"
          aria-label="${folded ? "Espandi pasto" : "Comprimi pasto"}">${folded ? "▸" : "▾"}</button>
      </div>`;
    if (folded) {
      const foods = m.options.flat().map((l) => l.alts.map((a) => itemLabel(a, this._recipes).trim()).filter(Boolean).join(" / ")).filter(Boolean);
      return `<section class="card">${head}
        <p class="muted summary">${foods.length ? esc(foods.join(" · ")) : "Nessun alimento"}</p></section>`;
    }
    return `<section class="card">${head}
      ${m.options.map((opt, oi) => this._optionEditor(ctx, i, oi, opt, m.options.length)).join("")}
      <div class="row">
        <button data-act="up" ${at}${i === 0 ? " disabled" : ""} aria-label="Sposta su">↑</button>
        <button data-act="down" ${at}${i === n - 1 ? " disabled" : ""} aria-label="Sposta giù">↓</button>
        <button class="danger" data-act="delmeal" ${at}>Elimina pasto</button>
      </div>
    </section>`;
  }

  // Recipe alternative in a meal: name (not editable), this person's grams per ingredient, and a way back to a simple food.
  _recipeRow(at, li, ai, del, rid) {
    const loc = `${at} data-l="${li}" data-a="${ai}"`;
    const r = recipeOf(rid, this._recipes);
    if (!r) return `<div class="item"><span class="recipe-line"><strong>Ricetta mancante</strong></span>${del}</div>
      <div class="row"><button data-act="ualt" ${loc}>Usa alimento semplice</button></div>`;
    const overrides = this._draft.recipe_qty?.[rid] ?? {};
    // Grams are per alternative (keyed by alt id): each alternative of an ingredient gets its own field.
    const ings = r.ingredients.map((g) => g.alts.map((a, k) => {
      const custom = Object.hasOwn(overrides, a.id);
      return `${k ? `<div class="or">oppure</div>` : ""}<div class="ing">
          <span>${esc(a.food)}${a.unit ? ` · ${esc(a.unit)}` : ""}</span>
          <input type="number" min="0" step="any" value="${custom ? esc(overrides[a.id]) : ""}" placeholder="${esc(a.qty ?? "q.b.")}"
            aria-label="Quantità di ${esc(a.food)}" data-ch="rqty" data-rid="${esc(rid)}" data-iid="${esc(a.id)}">
          <button data-act="rreset" data-rid="${esc(rid)}" data-iid="${esc(a.id)}"${custom ? "" : " hidden"}>Ripristina default</button>
        </div>`;
    }).join("")).join("");
    return `<div class="item"><span class="recipe-line"><strong>${esc(r.name)}</strong><span class="tag">Ricetta</span></span>${del}</div>
      <p class="muted">Vale per tutti i pasti di ${esc(this._draft.name)}</p>
      ${ings || `<p class="muted">Nessun ingrediente.</p>`}
      <div class="row"><button data-act="ualt" ${loc}>Usa alimento semplice</button></div>`;
  }

  _optionEditor(ctx, i, oi, opt, nOptions) {
    const at = `data-ctx="${esc(ctx)}" data-i="${i}" data-o="${oi}"`;
    const lines = opt.map((line, li) => `<div class="line">
        <div class="line-head">Alimento ${li + 1}</div>
        ${line.alts.map((a, ai) => {
          const sep = ai ? `<div class="or">OPPURE</div>` : "";
          const del = line.alts.length > 1 ? `<button class="icon" data-act="delalt" ${at} data-l="${li}" data-a="${ai}" aria-label="Rimuovi alimento">×</button>` : "";
          if ("recipe" in a) return `${sep}${this._recipeRow(at, li, ai, del, a.recipe)}`;
          return `${sep}<div class="item">
            <input class="food" autocomplete="off" value="${esc(a.food)}" placeholder="Alimento" aria-label="Alimento"
              data-ch="item" data-f="food" ${at} data-l="${li}" data-a="${ai}">
            ${del}
            <input type="number" min="0" step="any" value="${esc(a.qty ?? "")}" placeholder="Quantità" aria-label="Quantità"
              data-ch="item" data-f="qty" ${at} data-l="${li}" data-a="${ai}">
            <input list="units" value="${esc(a.unit)}" placeholder="Unità" aria-label="Unità"
              data-ch="item" data-f="unit" ${at} data-l="${li}" data-a="${ai}">
            <input value="${esc(a.note)}" placeholder="Nota" aria-label="Nota"
              data-ch="item" data-f="note" ${at} data-l="${li}" data-a="${ai}">
          </div>`;
        }).join("")}
        <div class="row">
          <button data-act="addalt" ${at} data-l="${li}">+ OPPURE</button>
          <button class="danger" data-act="delline" ${at} data-l="${li}">Rimuovi alimento</button>
        </div>
      </div>`).join("");
    // Single option (the only kind the editor creates now): no option header. Meals saved earlier with several keep theirs.
    const header = nOptions > 1 ? `<div class="row">
        <strong class="grow">Opzione ${oi + 1}</strong>
        <button class="danger" data-act="delopt" ${at}>Rimuovi opzione</button>
      </div>` : "";
    return `<div${nOptions > 1 ? ` class="option"` : ""}>
      ${header}
      ${lines}
      <button data-act="addline" ${at}>+ Alimento</button>
    </div>`;
  }
}

if (!customElements.get("shared-diet-panel")) {
  customElements.define("shared-diet-panel", SharedDietPanel);
}
