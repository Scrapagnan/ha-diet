/* Dieta: pannello laterale di Shared Diet. Web component vanilla, nessuna dipendenza. */

const TABS = [
  ["today", "Oggi"], ["week", "Settimana"], ["choices", "Scelte"], ["recipes", "Ricette"], ["shop", "Spesa"], ["profiles", "Profili"],
];
const DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const DAYS_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const CADENCES = [["1w", "Settimanale"], ["2w", "Ogni 2 settimane"], ["1m", "Mensile"]];

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
.card.next { border: 2px solid var(--primary-color, #03a9f4); }
/* Title + action on one line; on narrow screens the title wraps, the button never does. */
.page-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.page-head h2 { flex: 1 1 auto; min-width: 0; }
.page-head button { flex: 0 0 auto; white-space: nowrap; }
.meal-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.sub { margin: 8px 0 4px; font-size: 12px; color: var(--secondary-text-color, #727272);
  text-transform: uppercase; letter-spacing: 0.04em; }
.option { border-top: 1px dashed var(--divider-color, #e0e0e0); margin-top: 10px; padding-top: 8px; }
.line { border-left: 4px solid var(--primary-color, #03a9f4); border-radius: 8px; padding: 6px 8px; margin: 10px 0;
  background: rgba(127, 127, 127, 0.08); }
.line-head { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--primary-color, #03a9f4); margin-bottom: 2px; }
.summary { margin: 4px 0 0; }
.card[data-act="fold"] { cursor: pointer; } /* folded: a tap anywhere opens it */
.sugg { grid-column: 1 / -1; display: flex; flex-direction: column; margin-top: -2px;
  border: 1px solid var(--divider-color, #e0e0e0); border-radius: 6px; overflow: hidden;
  background: var(--card-background-color, #fff); }
.sugg button { border: 0; border-radius: 0; text-align: left; padding: 10px 12px; background: none;
  border-bottom: 1px solid var(--divider-color, #e0e0e0); }
.sugg button:last-child { border-bottom: 0; }
.sugg button.on { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); }
.item { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 6px; margin: 4px 0; }
.item .food { grid-column: 1 / 4; }
.item [data-f="qty"] { grid-column: 1; } /* always start a new row, with or without the × button */
.item .recipe-line { grid-column: 1 / 4; }
.tag { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 6px; font-size: 12px;
  background: rgba(3, 169, 244, 0.15); color: var(--primary-color, #03a9f4); }
.ing { display: grid; grid-template-columns: 1fr 96px auto; gap: 6px; align-items: center; margin: 4px 0; }
.ing input { width: 100%; }
textarea { font: inherit; font-size: 16px; color: inherit; width: 100%; padding: 6px 8px; border: 1px solid var(--divider-color, #e0e0e0);
  border-radius: 6px; background: var(--card-background-color, #fff); }
details p { white-space: pre-line; margin: 6px 0; }
.or { font-size: 12px; font-weight: 600; text-align: center; color: var(--secondary-text-color, #727272); }
.chips { display: flex; gap: 4px; }
.remind button.chip { flex: 0 0 auto; padding: 6px 10px; }
.remind > span { width: 32px; }
/* Switch: checkbox (role=switch) or button (role=checkbox, aria-checked true/false/mixed). Mixed: knob in the middle. */
.switch { appearance: none; position: relative; flex: 0 0 auto; width: 40px; height: 22px; min-height: 0; margin: 0; padding: 0;
  border: 0; border-radius: 11px; background: var(--disabled-color, #bdbdbd); cursor: pointer; transition: background 0.15s; }
.switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: left 0.15s; }
.switch:checked, .switch[aria-checked="true"] { background: var(--primary-color, #03a9f4); }
.switch:checked::after, .switch[aria-checked="true"]::after { left: 21px; }
.switch[aria-checked="mixed"] { background: rgba(3, 169, 244, 0.5); }
.switch[aria-checked="mixed"]::after { left: 12px; }
.switch:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }
.muted { color: var(--secondary-text-color, #727272); font-size: 14px; }
.msg { padding: 8px 12px; border-radius: 8px; margin: 8px 0; }
.msg.ok { background: rgba(67, 160, 71, 0.15); }
.msg.info { background: rgba(3, 169, 244, 0.15); }
.msg.err { background: rgba(219, 68, 55, 0.15); color: var(--error-color, #db4437); }
[hidden] { display: none !important; }
.savebar { position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between; align-items: center;
  gap: 8px; padding: 8px 0; background: var(--primary-background-color, #fafafa);
  border-bottom: 1px solid var(--divider-color, #e0e0e0); }
.savebar h2 { margin: 0; min-height: 36px; line-height: 36px; }
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
// Shopping range for a cadence, starting today: 7 or 14 days, or up to the day before the same date next month.
const cadenceRange = (cadence, from = iso(new Date())) => {
  if (cadence !== "1m") return { from, to: addDays(from, cadence === "2w" ? 13 : 6) };
  const d = parseIso(from);
  d.setMonth(d.getMonth() + 1, d.getDate() - 1); // Jan 31 -> Mar 2: overflow is fine, still under the 62-day cap
  return { from, to: iso(d) };
};
const weekday = (s) => (parseIso(s).getDay() + 6) % 7; // 0 = lunedì, as in model.py
const fmtDay = (s, opts) => parseIso(s).toLocaleDateString("it-IT", opts);
// Mirrors model.py format_item: "Nome 80 g", "Nome (nota)", "Nome", "Ricetta: ingredienti".
const fmtItem = (it) => {
  if (!it) return "";
  if ("recipe" in it) return it.ingredients.length ? `${it.food}: ${it.ingredients.map((i) => fmtItem(i)).join(", ")}` : it.food;
  return it.qty !== null ? `${it.food} ${it.qty} ${it.unit}` : it.note ? `${it.food} (${it.note})` : it.food;
};
const blankItem = () => ({ food: "", qty: null, unit: "g", note: "" });
const newMeal = () => ({ id: uid(), name: "", time: null, options: [[{ alts: [blankItem()] }]] });
// Comparison key for food names: case, accents and repeated spaces ignored ("Caffè " ~ "caffe").
const foldText = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
// Selector of a food input in the meal editor (to focus a just-added field).
const foodSel = (ctx, i, o, l, a) =>
  `input.food[data-ctx="${ctx}"][data-i="${i}"][data-o="${o}"][data-l="${l}"][data-a="${a}"]`;
const zeroChoice = () => ({ option: 0, lines: {} });
// Meals by time ("HH:MM" compares as text); meals without a time last. Stable: equal times keep their order.
const byTime = (a, b) => { const x = a.time || "~", y = b.time || "~"; return x < y ? -1 : x > y ? 1 : 0; };
// A meal offers choices with several options or lines, or with a recipe that has an ingredient with alternatives.
const hasChoice = (m, recipes) => m.options.length > 1 || m.options.some((o) => o.some((l) => l.alts.length > 1
  || l.alts.some((a) => "recipe" in a && recipeOf(a.recipe, recipes)?.ingredients.some((g) => g.alts.length > 1))));

// Mirrors model.py: effective day, choice priority, option/alternative resolution.
const effectiveDay = (p, s) => p.exceptions[s] ?? p.week[String(weekday(s))];
// Meal ids come from stored data: read only own keys, or "constructor"/"toString" would resolve to Object internals.
const own = (o, k) => (o && Object.hasOwn(o, k) ? o[k] : undefined);
const choiceFor = (p, s, mid) => own(own(p.choices.dates, s), mid) ?? own(p.choices.defaults, mid) ?? zeroChoice();
const recipeOf = (rid, recipes) => (Object.hasOwn(recipes, rid) ? recipes[rid] : null);
// Mirrors model.py expand_item: a recipe item becomes its name and, per ingredient, the chosen alternative with the person's grams
// (override by alt id, else default). Ingredients with 2+ alternatives also list them in `choices` (panel only: model.py skips them).
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
// Totals of resolved items (Oggi, several people): same food and unit summed; a recipe keeps its name and sums its ingredients.
// Items without a quantity are listed once.
function sumItems(items) {
  const add = (map, it) => {
    const k = `${foldText(it.food)}|${it.unit ?? ""}|${it.qty === null}`;
    const cur = map.get(k);
    if (!cur) map.set(k, { ...it });
    else if (cur.qty !== null) cur.qty = Math.round((cur.qty + it.qty) * 1000) / 1000;
  };
  const rows = new Map();
  for (const it of items) {
    if (!("recipe" in it)) { add(rows, it); continue; }
    const k = `recipe|${it.recipe}`;
    if (!rows.has(k)) rows.set(k, { ...it, parts: new Map() });
    for (const g of it.ingredients) add(rows.get(k).parts, g);
  }
  return [...rows.values()].map(({ parts, ...r }) => (parts ? { ...r, ingredients: [...parts.values()] } : r));
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
    // remind: stored only when off (no reminder for this meal); absent means on.
    return { id: m.id, name, time: m.time || null, options, ...(m.remind === false ? { remind: false } : {}) };
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
    this._rDrafts = {}; // recipe id -> draft, only for recipes with unsaved edits; saved together by the page's Salva
    // "ctx:mealId" of meals whose fold state differs from the default (default: folded). View-only.
    this._foldToggled = new Set();
    this._busy = false;
    this._narrow = false;
    this._showAlts = false;
    this._wday = weekday(today); // Settimana and Scelte views
    let cadence = "1w";
    try { cadence = localStorage.getItem("shared_diet.cadence") ?? "1w"; } catch { /* storage blocked */ }
    this._shop = { cadence: CADENCES.some(([k]) => k === cadence) ? cadence : "1w", off: new Set(), todo: "", preview: null, skip: new Set(), seq: 0 };
    this.shadowRoot.addEventListener("click", (e) => this._onClick(e));
    this.shadowRoot.addEventListener("change", (e) => this._onChange(e));
    this.shadowRoot.addEventListener("input", (e) => this._onInput(e));
    // Keep focus in the food field when a suggestion is tapped, so the tap lands as a click.
    for (const ev of ["pointerdown", "mousedown"])
      this.shadowRoot.addEventListener(ev, (e) => { if (e.target.closest(".sugg")) e.preventDefault(); });
    this.shadowRoot.addEventListener("keydown", (e) => this._suggKey(e));
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
    for (const r of [...Object.values(this._recipes), ...Object.values(this._rDrafts)])
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

  // Arrows move the highlight in the suggestion list, Enter picks it, Escape closes it. Focus stays in the field.
  _suggKey(e) {
    if (e.target !== this._suggFor) return;
    const btns = [...this.shadowRoot.querySelectorAll(".sugg button")];
    const cur = btns.findIndex((b) => b.classList.contains("on"));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? (cur + 1) % btns.length : (cur <= 0 ? btns.length : cur) - 1;
      btns.forEach((b, i) => b.classList.toggle("on", i === next));
      btns[next].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && cur >= 0) {
      e.preventDefault();
      btns[cur].click();
    } else if (e.key === "Escape") this._hideSugg();
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
    // Oggi has no inputs: re-render each minute so the next-meal highlight follows the clock.
    this._tick = setInterval(() => { if (this._view === "today" && !this._busy) this._render(); }, 60000);
  }

  disconnectedCallback() {
    clearInterval(this._tick);
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
      ? this._recipeDirty()
      : this._dirty && ["week", "choices", "profiles"].includes(this._view);
    if (editing) {
      const el = this.shadowRoot.getElementById("notice");
      if (el) {
        el.innerHTML = this._noticeHtml();
        return;
      }
    }
    if (this._view === "shop") this._loadShop();
    this._render();
  }

  _load(profile) {
    this._draft = clone(profile);
    this._base = clone(profile);
    this._dirty = false;
  }

  // A recipe deleted on the server drops its draft; only another user's deletion warns (ours also arrives as a push, before its reply).
  _syncRecipe() {
    for (const [id, r] of Object.entries(this._rDrafts)) {
      if (this._recipes[id]) continue;
      if (id !== this._deletingId) this._flash(`Ricetta «${r.name}» eliminata da un altro utente: modifiche scartate`);
      delete this._rDrafts[id];
    }
  }

  _recipeDirty() {
    return Object.keys(this._rDrafts).length > 0;
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

  // Profili: editing a profile's card makes it the draft. Unsaved edits to another profile need a confirm (false: cancelled).
  _editCard(pid) {
    if (pid === this._profileId) return true;
    const wasDirty = this._dirty;
    if (!this._canDiscard()) {
      this._render();
      return false;
    }
    this._profileId = pid;
    this._load(this._profiles[pid]);
    if (wasDirty) this._render();
    return true;
  }

  // Draft of a recipe, created on its first edit (null: the recipe is gone).
  _rDraft(rid) {
    if (!Object.hasOwn(this._rDrafts, rid)) {
      if (!this._recipes[rid]) return null;
      this._rDrafts[rid] = clone(this._recipes[rid]);
    }
    return this._rDrafts[rid];
  }

  _markRecipeDirty() {
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
    // No re-render while typing. Profili has one Save per card: show only the edited profile's.
    for (const b of this.shadowRoot.querySelectorAll('[data-act="save"]')) b.hidden = b.dataset.pid ? b.dataset.pid !== this._profileId : false;
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

  _deleteProfile(id = this._profileId) {
    if (!this._profiles[id]) return;
    if (!confirm(`Eliminare il profilo «${this._profiles[id].name}»? L'operazione non si annulla.`)) return;
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

  // Saves every edited recipe. A conflict drops that draft (the server copy shows); any other error stops, keeping the rest.
  _saveRecipes() {
    const n = Object.keys(this._rDrafts).length;
    return this._run(async () => {
      const lost = [];
      for (const [id, draft] of Object.entries(this._rDrafts)) {
        try {
          const res = await this._hass.callWS({ type: "shared_diet/save_recipe", recipe: cleanRecipe(draft) });
          this._recipes = { ...this._recipes, [id]: res.recipe }; // shown at once, before the push
        } catch (err) {
          if (err?.code !== "conflict") throw new Error(`${draft.name}: ${err?.message || "salvataggio non riuscito"}`);
          lost.push(draft.name);
        }
        delete this._rDrafts[id];
      }
      if (lost.length) throw new Error(`Modificate da un altro utente, dati ricaricati: ${lost.join(", ")}`);
    }, n === 1 ? "Ricetta salvata" : "Ricette salvate");
  }

  // Creates "Nuova ricetta" (or "Nuova ricetta N" if taken) and opens it with the name field focused for renaming.
  _createRecipe() {
    const taken = new Set(Object.values(this._recipes).map((r) => foldText(r.name)));
    let name = "Nuova ricetta";
    for (let n = 2; taken.has(foldText(name)); n++) name = `Nuova ricetta ${n}`;
    return this._run(async () => {
      const res = await this._hass.callWS({ type: "shared_diet/create_recipe", name });
      this._recipes = { ...this._recipes, [res.recipe.id]: res.recipe }; // shown at once, before the push
      this._foldToggled.add(`r:${res.recipe.id}`);
      this._focus = `[data-ch="rfield"][data-f="name"][data-rid="${res.recipe.id}"]`;
    }, "Ricetta creata");
  }

  _deleteRecipe(id) {
    if (!confirm("Eliminare la ricetta?")) return;
    return this._run(async () => {
      this._deletingId = id;
      try {
        await this._hass.callWS({ type: "shared_diet/delete_recipe", recipe_id: id });
      } finally {
        this._deletingId = null;
      }
      delete this._rDrafts[id];
    }, "Ricetta eliminata");
  }

  _todo() {
    const todos = Object.keys(this._hass.states).filter((e) => e.startsWith("todo."));
    return todos.includes(this._shop.todo) ? this._shop.todo : todos[0] ?? "";
  }

  _shopMsg() {
    const { from, to } = cadenceRange(this._shop.cadence);
    const ids = Object.keys(this._profiles);
    const selected = ids.filter((id) => !this._shop.off.has(id));
    return { type: "shared_diet/shopping", start: from, end: to, profile_ids: selected.length === ids.length ? null : selected };
  }

  // Preview of the rows to buy (no todo entity: nothing is added). Stale replies are dropped.
  async _loadShop() {
    const seq = ++this._shop.seq;
    const msg = this._shopMsg();
    let items = [];
    if (msg.profile_ids?.length !== 0 && Object.keys(this._profiles ?? {}).length) {
      try {
        items = (await this._hass.callWS(msg)).items;
      } catch (err) {
        this._flash(err?.message || "Impossibile calcolare la spesa");
      }
    }
    if (seq !== this._shop.seq) return;
    this._shop.preview = items;
    if (this._view === "shop") this._render();
  }

  // Master switch: true/false/mixed over the previewed rows.
  _shopAll() {
    const rows = this._shop.preview ?? [];
    const off = rows.filter((t) => this._shop.skip.has(t)).length;
    return !rows.length || off === rows.length ? "false" : off ? "mixed" : "true";
  }

  _runShop() {
    const todo = this._todo();
    if (!todo) return this._flash("Nessuna lista To-do disponibile");
    const exclude = (this._shop.preview ?? []).filter((t) => this._shop.skip.has(t));
    if (this._shopAll() === "false") return this._flash("Nessun alimento selezionato");
    return this._run(async () => {
      await this._hass.callWS({ ...this._shopMsg(), todo_entity_id: todo, exclude });
    }, "Lista della spesa aggiornata");
  }

  // Meal list addressed by ctx: "w<weekday>" (weekly schema).
  _list(ctx) {
    return this._draft.week[ctx.slice(1)];
  }

  // Choice object for a meal: date override when date is set, else the per-meal default.
  _choiceSlot(date, mid, create) {
    const c = this._draft.choices;
    const holder = date ? (create ? (c.dates[date] ??= {}) : own(c.dates, date) ?? {}) : c.defaults;
    if (create && !Object.hasOwn(holder, mid)) holder[mid] = zeroChoice();
    return own(holder, mid);
  }

  // ---- events --------------------------------------------------------------

  _onClick(e) {
    const el = e.target.closest("[data-act],[data-tab]");
    if (!el) return;
    const d = el.dataset;
    if (d.tab) {
      this._view = d.tab;
      if (d.tab === "shop") this._loadShop();
      return this._render();
    }
    if (d.act === "fold") {
      // A folded card opens on a tap anywhere but its fields.
      if (el !== e.target && e.target.closest?.("input, select, textarea")) return;
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
      case "delprofile": return this._deleteProfile(d.pid);
      case "remind": {
        if (!this._editCard(d.pid)) return;
        const m = this._draft.week[d.d].find((x) => x.id === d.mid);
        if (!m) return;
        if (m.remind === false) delete m.remind;
        else m.remind = false;
        return this._edit();
      }
      case "remindall": {
        // All on -> all off; off or mixed -> all on. Only timed meals: the others never notify.
        if (!this._editCard(d.pid)) return;
        const timed = Object.values(this._draft.week).flat().filter((m) => m.time);
        const allOn = timed.every((m) => m.remind !== false);
        for (const m of timed) {
          if (allOn) m.remind = false;
          else delete m.remind;
        }
        return this._edit();
      }
      case "rcreate": return this._createRecipe();
      case "rsave": return this._saveRecipes();
      case "rdelete": return this._deleteRecipe(d.rid);
    }
    const draft = ["raddingr", "raddalt", "rdelalt", "rdelingr"].includes(d.act) && this._rDraft(d.rid);
    if (draft === null) return;
    switch (d.act) {
      case "raddingr":
        draft.ingredients.push({ id: uid(), alts: [{ id: uid(), food: "", qty: null, unit: "g" }] });
        this._focus = `[data-ch="ring"][data-rid="${d.rid}"][data-f="food"][data-i="${draft.ingredients.length - 1}"][data-a="0"]`;
        return this._render();
      case "raddalt": {
        const g = draft.ingredients[Number(d.i)];
        g.alts.push({ id: uid(), food: "", qty: null, unit: "g" });
        this._focus = `[data-ch="ring"][data-rid="${d.rid}"][data-f="food"][data-i="${d.i}"][data-a="${g.alts.length - 1}"]`;
        return this._render();
      }
      case "rdelalt": {
        const g = draft.ingredients[Number(d.i)];
        if (g.alts.length > 1) g.alts.splice(Number(d.a), 1); // the last alternative goes with "Rimuovi ingrediente"
        return this._render();
      }
      case "rdelingr":
        draft.ingredients.splice(Number(d.i), 1);
        return this._render();
      case "shop": return this._runShop();
      case "shopall": {
        const on = this._shopAll() !== "true";
        this._shop.skip = on ? new Set() : new Set(this._shop.preview);
        return this._render();
      }
      case "alts": this._showAlts = !this._showAlts; return this._render();
      case "wday": this._wday = Number(d.d); return this._render();
    }
    if (!d.ctx) return;
    const list = this._list(d.ctx);
    const i = Number(d.i), oi = Number(d.o), li = Number(d.l), ai = Number(d.a);
    switch (d.act) {
      case "addmeal":
        list.push(newMeal());
        this._foldToggled.add(`${d.ctx}:${list.at(-1).id}`); // a new meal opens for filling in
        this._focus = `[data-ch="meal"][data-f="name"][data-ctx="${d.ctx}"][data-i="${list.length - 1}"]`;
        break;
      case "lup":
      case "ldown": {
        const opt = list[i].options[oi], j = d.act === "lup" ? li - 1 : li + 1;
        if (j < 0 || j >= opt.length) return;
        [opt[li], opt[j]] = [opt[j], opt[li]];
        this._swapLineChoices(list[i].id, oi, li, j);
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

  // Moving a line: its chosen alternative (keyed by line index) moves with it.
  _swapLineChoices(mid, oi, a, b) {
    const c = this._draft.choices;
    for (const ch of [own(c.defaults, mid), ...Object.values(c.dates).map((day) => own(day, mid))]) {
      if (!ch || ch.option !== oi) continue;
      const x = ch.lines[a], y = ch.lines[b];
      delete ch.lines[a];
      delete ch.lines[b];
      if (x !== undefined) ch.lines[b] = x;
      if (y !== undefined) ch.lines[a] = y;
    }
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
    else if (["pfield", "meal", "item", "rfield", "ring", "rqty"].includes(el.dataset.ch) && el.type !== "checkbox") this._onChange(e);
    if (el.classList.contains("food")) this._suggest(el);
  }

  _onChange(e) {
    const el = e.target;
    const d = el.dataset;
    if (this._busy) return; // the success path replaces the draft, so an edit now would be lost
    switch (d.ch) {
      case "pick": return this._selectProfile(el.value);
      case "cadence":
        this._shop.cadence = el.value;
        try { localStorage.setItem("shared_diet.cadence", el.value); } catch { /* storage blocked */ }
        return this._loadShop();
      case "rfield":
        const r = this._rDraft(d.rid);
        if (!r) return;
        r[d.f] = el.value; // name or note
        return this._markRecipeDirty();
      case "ring": {
        const r = this._rDraft(d.rid);
        if (!r) return;
        const alt = r.ingredients[Number(d.i)].alts[Number(d.a)];
        alt[d.f] = d.f === "qty" ? (el.value === "" ? null : Number(el.value)) : el.value;
        return this._markRecipeDirty();
      }
      case "stodo": this._shop.todo = el.value; return;
      case "sprof":
        if (el.checked) this._shop.off.delete(d.id);
        else this._shop.off.add(d.id);
        return this._loadShop();
      case "sitem": {
        // Updated in place: a full render would move focus away from the switch.
        const t = this._shop.preview?.[Number(d.i)];
        if (t === undefined) return;
        if (el.checked) this._shop.skip.delete(t);
        else this._shop.skip.add(t);
        const state = this._shopAll();
        this.shadowRoot.querySelector('[data-act="shopall"]')?.setAttribute("aria-checked", state);
        const btn = this.shadowRoot.querySelector('[data-act="shop"]');
        if (btn) btn.disabled = state === "false" || !this._todo() || this._busy;
        return;
      }
      case "pfield": {
        if (!this._editCard(d.pid)) return;
        const p = this._draft;
        const v = el.type === "checkbox" ? el.checked : el.value;
        if (d.f === "name") p.name = v;
        else if (d.f === "person") p.person = v || null;
        else if (d.f === "rem.on") {
          p.reminder.enabled = v;
          return this._edit(); // shows or hides the reminder settings
        }
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
      today: () => this._vToday(), week: () => this._vWeek(),
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

  // Read-only resolved items as <li>. Recipe: name, ingredients with grams, preparation note folded away (withNote).
  // With "Vedi alternative": the ingredients' other alternatives, greyed out, after the chosen ones.
  _itemsHtml(items, { withAlts = false, withNote = true } = {}) {
    const otherAlts = (i) => (withAlts ? (i.choices ?? []).map((c) => {
      const chosen = c.alts.find((a) => a.id === c.chosen);
      const others = c.alts.filter((a) => a.id !== c.chosen).map((a) => fmtItem(a)).join(" / ");
      return `<li class="muted">Alternativa a ${esc(chosen.food)}: ${esc(others)}</li>`;
    }).join("") : "");
    return items.map((i) => ("recipe" in i
      ? `<li><strong>${esc(i.food)}</strong>${i.ingredients.length
        ? `<ul class="muted">${i.ingredients.map((g) => `<li>${esc(fmtItem(g))}</li>`).join("")}${otherAlts(i)}</ul>` : ""}${
        withNote && i.note.trim() ? `<details><summary>Preparazione</summary><p>${esc(i.note)}</p></details>` : ""}</li>`
      : `<li>${esc(fmtItem(i))}</li>`)).join("");
  }

  // Meals of a date for every profile, grouped by meal name (case/accents ignored), sorted by the group's earliest time.
  _groups(s) {
    const groups = new Map();
    for (const p of Object.values(this._profiles)) {
      for (const m of effectiveDay(p, s)) {
        const k = foldText(m.name);
        if (!groups.has(k)) groups.set(k, { name: m.name, time: m.time, rows: [] });
        const g = groups.get(k);
        if (m.time && (!g.time || m.time < g.time)) g.time = m.time; // earliest time of the group
        g.rows.push({ p, m, r: resolveMeal(m, choiceFor(p, s, m.id), p, this._recipes) });
      }
    }
    return [...groups.values()].sort(byTime);
  }

  // Meal groups of a date: summed totals, then each person's portion. The first group from `now` on is highlighted as next.
  _today(s, now, withAlts = false) {
    const list = this._groups(s);
    if (!list.length) return `<p class="muted">Nessun pasto.</p>`;
    const next = list.find((g) => g.time && g.time >= now);
    // Same food (or recipe) for two people: comparison key of a resolved item.
    const key = (i) => ("recipe" in i ? `recipe|${i.recipe}` : `${foldText(i.food)}|${i.unit ?? ""}`);
    return list.map((g) => {
      // Totals only when 2+ people share at least one food: one person, or entirely different meals, get none.
      const seen = new Map(); // item key -> profile id that has it
      const shared = new Set(g.rows.map((x) => x.p.id)).size > 1 && g.rows.some(({ p, r }) => r.items.some((i) => {
        const k = key(i);
        if (seen.has(k) && seen.get(k) !== p.id) return true;
        seen.set(k, p.id);
        return false;
      }));
      const people = g.rows.map(({ p, m, r }) => {
        const alts = m.options.map((opt, oi) => `<li class="${oi === r.option ? "" : "muted"}">${m.options.length > 1 ? `Opzione ${oi + 1}: ` : ""}${
          opt.map((l) => l.alts.map((a) => esc("recipe" in a ? itemLabel(a, this._recipes) : fmtItem(a))).join(" / ")).join(" + ")}</li>`).join("");
        return `<div class="sub">${esc(p.name)}</div>
          <ul>${this._itemsHtml(r.items, { withAlts, withNote: !shared })}</ul>
          ${withAlts ? `<ul class="alts">${alts}</ul>` : ""}`;
      }).join("");
      return `<section class="card${g === next ? " next" : ""}">
        <div class="meal-head"><strong>${esc(g.name)}${g === next ? `<span class="tag">Prossimo</span>` : ""}</strong>
          <span class="muted">${esc(g.time ?? "senza orario")}</span></div>
        ${shared ? `<div class="sub">Totale</div><ul>${this._itemsHtml(sumItems(g.rows.flatMap(({ r }) => r.items)))}</ul>` : ""}
        ${people}
      </section>`;
    }).join("");
  }

  _vToday() {
    if (!Object.keys(this._profiles).length) return this._picker();
    const d = new Date();
    let day = iso(d);
    let now = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    // Every timed meal of today is past: show tomorrow, so its first meal is the next one.
    const timed = this._groups(day).filter((g) => g.time);
    const tomorrow = timed.length > 0 && timed.every((g) => g.time < now);
    if (tomorrow) [day, now] = [addDays(day, 1), "00:00"];
    return `<h2>${tomorrow ? "Domani · " : ""}${esc(fmtDay(day, { weekday: "long", day: "numeric", month: "long" }))}</h2>
      <button data-act="alts">${this._showAlts ? "Nascondi alternative" : "Vedi alternative"}</button>
      ${this._today(day, now, this._showAlts)}`;
  }

  // Weekday chips (Settimana, Scelte) and the day heading.
  _dayChips() {
    const chips = DAYS_SHORT.map((d, i) => `<button class="chip${i === this._wday ? " on" : ""}" data-act="wday" data-d="${i}">${d}</button>`).join("");
    return `<div class="chips" role="group">${chips}</div><h2>${DAYS[this._wday]}</h2>`;
  }

  _vWeek() {
    if (!this._draft) return this._picker();
    return `${this._picker(true)}${this._dayChips()}
      ${this._mealEditor(`w${this._wday}`, this._draft.week[String(this._wday)])}`;
  }

  // Choices of the weekly schema's meals for the selected weekday (choices.defaults, by meal id).
  _vChoices() {
    if (!this._draft) return this._picker();
    const meals = [...this._draft.week[String(this._wday)]].sort(byTime).filter((m) => hasChoice(m, this._recipes));
    const cards = meals.map((m) => `<section class="card">
      <div class="meal-head"><strong>${esc(m.name)}</strong><span class="muted">${esc(m.time ?? "")}</span></div>
      ${this._choiceEditor("", m, own(this._draft.choices.defaults, m.id) ?? zeroChoice())}
    </section>`).join("");
    return `${this._picker(true)}${this._dayChips()}
      ${cards || `<p class="muted">Nessun pasto con alternative.</p>`}`;
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
    const profiles = ids.map((id) => `<label class="check"><input type="checkbox" role="switch" class="switch" data-ch="sprof" data-id="${esc(id)}"${
      this._shop.off.has(id) ? "" : " checked"}> ${esc(this._profiles[id].name)}</label>`).join("") || `<p class="muted">Nessun profilo.</p>`;
    const todoSel = todos.length
      ? `<label class="row">Lista To-do <select data-ch="stodo">${todos.map((e) => `<option value="${esc(e)}"${e === todo ? " selected" : ""}>${esc(this._hass.states[e].attributes.friendly_name ?? e)}</option>`).join("")}</select></label>`
      : `<p class="msg err">Nessuna lista To-do: creane una in Home Assistant.</p>`;
    const rows = this._shop.preview;
    const all = this._shopAll();
    const items = rows === null ? `<p class="muted">Caricamento…</p>`
      : rows.length ? `<div class="check"><button class="switch" role="checkbox" aria-checked="${all}" data-act="shopall"
          aria-label="Tutti gli alimenti"></button> Tutti gli alimenti</div>${rows.map((t, i) =>
          `<label class="check"><input type="checkbox" role="switch" class="switch" data-ch="sitem" data-i="${i}"${
            this._shop.skip.has(t) ? "" : " checked"}> ${esc(t)}</label>`).join("")}`
      : `<p class="muted">Nessun alimento nell'intervallo.</p>`;
    return `<div class="page-head"><h2>Lista della spesa</h2>
        <button class="primary" data-act="shop"${todo && all !== "false" && !this._busy ? "" : " disabled"}>Aggiungi alla lista</button></div>
      <label class="row">Cadenza <select data-ch="cadence">${CADENCES.map(([k, l]) =>
        `<option value="${k}"${k === this._shop.cadence ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <fieldset><legend>Profili</legend>${profiles}</fieldset>
      ${todoSel}
      <fieldset><legend>Da comprare</legend>${items}</fieldset>`;
  }

  // One foldable card per recipe, like the Settimana meals; the name is always editable. Any number of recipes can be
  // edited at once (a draft each); the sticky bar's Salva saves them all.
  _vRecipes() {
    const list = Object.values(this._recipes).sort((a, b) => a.name.localeCompare(b.name, "it"));
    const cards = list.map((r) => this._recipeCard(this._rDrafts[r.id] ?? r)).join("");
    return `<div class="savebar"><h2>Ricette</h2>
        <button class="primary" id="rsave" data-act="rsave"${this._recipeDirty() ? "" : " hidden"}${this._busy ? " disabled" : ""}>Salva</button>
      </div>
      <button class="add" data-act="rcreate">+ Aggiungi ricetta</button>
      ${cards || `<p class="muted">Nessuna ricetta ancora.</p>`}`;
  }

  _recipeCard(r) {
    const rid = `data-rid="${esc(r.id)}"`;
    const key = esc(`r:${r.id}`);
    const open = this._foldToggled.has(`r:${r.id}`);
    const head = `<div class="row">
        <input class="grow" value="${esc(r.name)}" data-ch="rfield" data-f="name" ${rid} placeholder="Ricetta" aria-label="Nome ricetta">
        <button class="icon" data-act="fold" data-key="${key}" aria-expanded="${open}"
          aria-label="${open ? "Comprimi ricetta" : "Espandi ricetta"}">${open ? "▾" : "▸"}</button>
      </div>`;
    if (!open) {
      const foods = r.ingredients.map((g) => g.alts.map((a) => a.food).join(" / "));
      return `<section class="card" data-act="fold" data-key="${key}">${head}
        <p class="muted summary">${foods.length ? esc(foods.join(" · ")) : "Nessun ingrediente"}</p></section>`;
    }
    const ings = r.ingredients.map((g, k) => `<div class="line">
        <div class="line-head">Ingrediente ${k + 1}</div>
        ${g.alts.map((a, ai) => {
          const sep = ai ? `<div class="or">oppure</div>` : "";
          const del = g.alts.length > 1 ? `<button class="icon" data-act="rdelalt" ${rid} data-i="${k}" data-a="${ai}" aria-label="Rimuovi alternativa">×</button>` : "";
          const at = `data-ch="ring" ${rid} data-i="${k}" data-a="${ai}"`;
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
          <button data-act="raddalt" ${rid} data-i="${k}">+ OPPURE</button>
          <button class="danger" data-act="rdelingr" ${rid} data-i="${k}">Rimuovi ingrediente</button>
        </div>
      </div>`).join("");
    return `<section class="card">${head}
      <label class="sub-row">Preparazione <textarea rows="4" data-ch="rfield" data-f="note" ${rid}>${esc(r.note)}</textarea></label>
      <div class="sub">Ingredienti</div>
      ${ings}
      <button data-act="raddingr" ${rid}>+ Ingrediente</button>
      <div class="row"><button class="danger" data-act="rdelete" ${rid}>Elimina ricetta</button></div>
    </section>`;
  }

  _vProfiles() {
    const head = `<h2>Profili</h2>
      <div class="row"><input data-newname value="${esc(this._newName)}" placeholder="Nome del nuovo profilo" aria-label="Nome nuovo profilo">
        <button data-act="create">Crea profilo</button></div>`;
    const persons = Object.keys(this._hass.states).filter((e) => e.startsWith("person.")).sort();
    const notifies = Object.entries(this._hass.services.notify ?? {})
      .filter(([n, svc]) => n !== "send_message" && !svc.fields?.entity_id)
      .map(([n]) => `notify.${n}`).sort();
    // Per weekday, one button per timed meal: coloured = notification on. Meals without a time never notify, so they're not listed.
    // Above the grid, a 3-state switch for all of them: on, off, or mixed.
    const remindGrid = (p, pid) => {
      const rows = DAYS_SHORT.map((label, d) => {
        const meals = [...p.week[String(d)]].filter((m) => m.time).sort(byTime);
        if (!meals.length) return "";
        return `<div class="row remind"><span class="muted">${label}</span>${meals.map((m) => {
          const on = m.remind !== false;
          return `<button class="chip${on ? " on" : ""}" data-act="remind" ${pid} data-d="${d}" data-mid="${esc(m.id)}" aria-pressed="${on}">${
            esc(m.name)}</button>`;
        }).join("")}</div>`;
      }).join("");
      if (!rows) return "";
      const timed = Object.values(p.week).flat().filter((m) => m.time);
      const on = timed.filter((m) => m.remind !== false).length;
      const state = on === timed.length ? "true" : on ? "mixed" : "false";
      return `<div class="sub">Notifica per pasto</div>
        <div class="check"><button class="switch" role="checkbox" aria-checked="${state}" data-act="remindall" ${pid}
          aria-label="Tutti i pasti"></button> Tutti i pasti</div>${rows}`;
    };
    // One card per profile. The profile being edited shows its draft; editing another card switches the draft to it.
    const card = (id) => {
      const p = id === this._profileId && this._draft ? this._draft : this._profiles[id];
      const pid = `data-pid="${esc(id)}"`;
      const select = (field, current, list, empty, label = (v) => v) => {
        const all = current && !list.includes(current) ? [current, ...list] : list;
        return `<select data-ch="pfield" ${pid} data-f="${field}"><option value="">${empty}</option>${all.map((v) =>
          `<option value="${esc(v)}"${v === current ? " selected" : ""}>${esc(label(v))}</option>`).join("")}</select>`;
      };
      const dirty = id === this._profileId && this._dirty;
      return `<section class="card">
        <label class="sub-row">Nome <input value="${esc(p.name)}" data-ch="pfield" ${pid} data-f="name"></label>
        <label class="sub-row">Persona collegata ${select("person", p.person, persons, "Nessuna", (v) => this._hass.states[v]?.attributes.friendly_name ?? v)}</label>
        <label class="check"><input type="checkbox" role="switch" class="switch" data-ch="pfield" ${pid} data-f="rem.on"${p.reminder.enabled ? " checked" : ""}> Promemoria</label>
        ${p.reminder.enabled ? `<label class="sub-row">Minuti prima del pasto
          <input type="number" min="0" max="240" step="1" value="${esc(p.reminder.minutes)}" data-ch="pfield" ${pid} data-f="rem.min"></label>
        <label class="sub-row">Servizio notifica ${select("rem.notify", p.reminder.notify, notifies, "Nessuno")}</label>
        ${remindGrid(p, pid)}` : ""}
        <div class="row">
          <button class="primary" data-act="save" ${pid}${dirty ? "" : " hidden"}${this._busy ? " disabled" : ""}>Salva</button>
          <button class="danger" data-act="delprofile" ${pid}>Elimina profilo</button>
        </div>
      </section>`;
    };
    return head + Object.keys(this._profiles).map(card).join("");
  }

  _mealEditor(ctx, meals) {
    meals.sort(byTime); // in place: data-i indexes address the sorted list, and it is saved in this order
    return meals.map((m, i) => this._mealCard(ctx, m, i)).join("")
      + `<button class="add" data-act="addmeal" data-ctx="${esc(ctx)}">+ Aggiungi pasto</button>`;
  }

  _mealCard(ctx, m, i) {
    const at = `data-ctx="${esc(ctx)}" data-i="${i}"`;
    const key = `${ctx}:${m.id}`;
    const folded = !this._foldToggled.has(key);
    const head = `<div class="row">
        <input class="grow" value="${esc(m.name)}" data-ch="meal" data-f="name" ${at} placeholder="Pasto" aria-label="Nome pasto">
        <input type="time" value="${esc(m.time ?? "")}" data-ch="meal" data-f="time" ${at} aria-label="Orario">
        <button class="icon" data-act="fold" data-key="${esc(key)}" aria-expanded="${!folded}"
          aria-label="${folded ? "Espandi pasto" : "Comprimi pasto"}">${folded ? "▸" : "▾"}</button>
      </div>`;
    if (folded) {
      const foods = m.options.flat().map((l) => l.alts.map((a) => itemLabel(a, this._recipes).trim()).filter(Boolean).join(" / ")).filter(Boolean);
      return `<section class="card" data-act="fold" data-key="${esc(key)}">${head}
        <p class="muted summary">${foods.length ? esc(foods.join(" · ")) : "Nessun alimento"}</p></section>`;
    }
    return `<section class="card">${head}
      ${m.options.map((opt, oi) => this._optionEditor(ctx, i, oi, opt, m.options.length)).join("")}
      <div class="row">
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
          <button data-act="lup" ${at} data-l="${li}"${li === 0 ? " disabled" : ""} aria-label="Sposta su">↑</button>
          <button data-act="ldown" ${at} data-l="${li}"${li === opt.length - 1 ? " disabled" : ""} aria-label="Sposta giù">↓</button>
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
