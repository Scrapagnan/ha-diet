/* Dieta: logica condivisa da pannello e card (shared-diet-panel.js, shared-diet-card.js). ES module, nessuna dipendenza. */

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };
const weekday = (s) => (parseIso(s).getDay() + 6) % 7; // 0 = lunedì, as in model.py
const fmtDay = (s, opts) => parseIso(s).toLocaleDateString("it-IT", opts);
// Mirrors model.py format_item: "Nome 80 g", "Nome (nota)", "Nome", "Ricetta: ingredienti".
const fmtItem = (it) => {
  if (!it) return "";
  if ("recipe" in it) return it.ingredients.length ? `${it.food}: ${it.ingredients.map((i) => fmtItem(i)).join(", ")}` : it.food;
  return it.qty !== null ? `${it.food} ${it.qty} ${it.unit}` : it.note ? `${it.food} (${it.note})` : it.food;
};
// Comparison key for food names: case, accents and repeated spaces ignored ("Caffè " ~ "caffe").
const foldText = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
const zeroChoice = () => ({ option: 0, lines: {} });
// Meals by time ("HH:MM" compares as text); meals without a time last. Stable: equal times keep their order.
// A meal is eaten with profile `pid` when its shared_with is absent/null (everyone) or lists it.
const sharesWith = (m, pid) => !Array.isArray(m.shared_with) || m.shared_with.includes(pid);
const byTime = (a, b) => { const x = a.time || "~", y = b.time || "~"; return x < y ? -1 : x > y ? 1 : 0; };
// Mirrors model.py nearest_meal: of the candidates ({ time, tomorrow? }), the one nearest to `now` ("HH:MM" today),
// before or after; ties go to the future one. ponytail: wall-clock minutes, a DST night can be off by an hour.
const nearestMeal = (cands, now) => {
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const score = (c) => { const d = mins(c.time) + (c.tomorrow ? 1440 : 0) - mins(now); return Math.abs(d) * 2 + (d < 0); };
  return cands.reduce((best, c) => (!best || score(c) < score(best) ? c : best), null);
};
// A meal offers choices with several options or lines, or with a recipe that has an ingredient with alternatives.
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
// Read-only resolved items as <li>. Recipe: name, ingredients with grams, preparation note folded away (withNote).
// With "Vedi alternative": the ingredients' other alternatives, greyed out, after the chosen ones.
function itemsHtml(items, { withAlts = false, withNote = true } = {}) {
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

// Meals of a date for every enabled profile, grouped by meal name (case/accents ignored), sorted by the group's earliest time.
// Same-name meals share a group only through mutual sharing (each includes the other's profile), transitively.
function mealGroups(profiles, recipes, s) {
  const byName = new Map();
  for (const p of Object.values(profiles).filter((p) => !p.disabled)) {
    for (const m of effectiveDay(p, s)) {
      const k = foldText(m.name);
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push({ p, m });
    }
  }
  const groups = [];
  for (const rows of byName.values()) {
    // Union-find over mutual links. ponytail: O(n²) pairs per name, n is at most profiles x meals per day.
    const parent = rows.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      if (sharesWith(rows[i].m, rows[j].p.id) && sharesWith(rows[j].m, rows[i].p.id)) parent[find(i)] = find(j);
    }
    const parts = new Map();
    rows.forEach((row, i) => { const k = find(i); if (!parts.has(k)) parts.set(k, []); parts.get(k).push(row); });
    // Same name and time: stable order by profile name.
    const sorted = [...parts.values()].sort((a, b) => a[0].p.name.localeCompare(b[0].p.name, "it"));
    for (const part of sorted) {
      const g = { name: part[0].m.name, time: null, rows: [] };
      for (const { p, m } of part) {
        if (m.time && (!g.time || m.time < g.time)) g.time = m.time; // earliest time of the group
        g.rows.push({ p, m, r: resolveMeal(m, choiceFor(p, s, m.id), p, recipes) });
      }
      groups.push(g);
    }
  }
  return groups.sort(byTime);
}

// Next meal: of the timed groups of date `s` (list = mealGroups(…, s)) and the first timed group of the day after
// (marked tomorrow), the one nearest to `now`.
function nextGroup(profiles, recipes, list, s, now) {
  const first = mealGroups(profiles, recipes, addDays(s, 1)).find((g) => g.time);
  return nearestMeal([...list.filter((g) => g.time), ...(first ? [{ ...first, tomorrow: true }] : [])], now);
}

// The day Oggi shows at `d`: today, or tomorrow when tomorrow's first meal is nearer than any of today's
// (from 00:00 its first meal is the nearest). A day without timed meals stays on today.
// { day, now ("HH:MM", "00:00" for tomorrow), tomorrow, list (groups of day), next (nearest group or null) }.
function todayPlan(profiles, recipes, d = new Date()) {
  const day = iso(d);
  const now = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const list = mealGroups(profiles, recipes, day);
  const next = nextGroup(profiles, recipes, list, day, now);
  if (!(list.some((g) => g.time) && next?.tomorrow === true)) return { day, now, tomorrow: false, list, next };
  const tday = addDays(day, 1);
  const tlist = mealGroups(profiles, recipes, tday);
  return { day: tday, now: "00:00", tomorrow: true, list: tlist, next: nextGroup(profiles, recipes, tlist, tday, "00:00") };
}

// Meal groups as cards: summed totals, then each person's portion. `next` is highlighted as "Prossimo".
// withAlts: every option and alternative of each person's meal, the chosen one in full.
function groupsHtml(list, next, recipes, withAlts = false) {
  if (!list.length) return `<p class="muted">Nessun pasto.</p>`;
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
        opt.map((l) => l.alts.map((a) => esc("recipe" in a ? itemLabel(a, recipes) : fmtItem(a))).join(" / ")).join(" + ")}</li>`).join("");
      return `<div class="sub">${esc(p.name)}</div>
        <ul>${itemsHtml(r.items, { withAlts, withNote: !shared })}</ul>
        ${withAlts ? `<ul class="alts">${alts}</ul>` : ""}`;
    }).join("");
    return `<section class="card${g === next ? " next" : ""}">
      <div class="meal-head"><strong>${esc(g.name)}${g === next ? `<span class="tag">Prossimo</span>` : ""}</strong>
        <span class="muted">${esc(g.time ?? "senza orario")}</span></div>
      ${shared ? `<div class="sub">Totale</div><ul>${itemsHtml(sumItems(g.rows.flatMap(({ r }) => r.items)))}</ul>` : ""}
      ${people}
    </section>`;
  }).join("");
}

// One shared_diet/subscribe per connection, shared by the panel and every card: the server allows only one
// (already_subscribed), and each is pushed the whole store. cb(msg) on every push, cb(null, err) if it fails;
// a late subscriber gets the last push at once. Returns the unsubscribe; the last one closes the subscription.
const SUBS = new WeakMap(); // connection -> { cbs, last, error, unsub }
function subscribeDiet(hass, cb) {
  const conn = hass.connection;
  let s = SUBS.get(conn);
  if (!s) {
    const sub = { cbs: new Set(), last: null, error: null };
    s = sub;
    SUBS.set(conn, sub);
    sub.unsub = conn.subscribeMessage((msg) => {
      sub.last = msg;
      for (const f of sub.cbs) f(msg);
    }, { type: "shared_diet/subscribe" }).catch((err) => {
      sub.error = err;
      if (SUBS.get(conn) === sub) SUBS.delete(conn); // the next subscriber retries
      for (const f of sub.cbs) f(null, err);
      return null;
    });
  }
  clearTimeout(s.closing); // resubscribed before the close: keep the open subscription
  s.cbs.add(cb);
  if (s.last) cb(s.last);
  else if (s.error) cb(null, s.error);
  return () => {
    if (!s.cbs.delete(cb) || s.cbs.size) return;
    // Closed on the next task: a card moved in the DOM (disconnect + connect at once) reuses it instead of
    // sending a second subscribe before the server has dropped this one (already_subscribed).
    s.closing = setTimeout(() => {
      if (s.cbs.size) return;
      if (SUBS.get(conn) === s) SUBS.delete(conn);
      s.unsub.then((unsub) => unsub?.(), () => {});
    });
  };
}

// ---- Lista: the family shopping list (todo entity), shared by the panel's Lista tab and the card's `list` view. ----

const MAX_SHOP_QTY = 100000; // as the server's cap on an edited shopping quantity
// Per-user preferences, kept by HA's frontend user data (server side, follows the user on every device).
const PREFS_KEY = "shared_diet";
const LIST_VIEWS = ["check", "card"];

// Card text of a list item: the food, then its quantity on a smaller line ("Pollo - 1,05 kg", "Sale (q.b.)").
// Same split as the server's food_of; items typed by hand stay whole.
const splitQty = (s) => s.match(/^(.+?) - (\d[\d.,e+-]*(?: .*)?)$/) ?? s.match(/^(.+) \(([^()]*)\)$/);
const cardText = (s) => { const m = splitQty(s); return m ? `${esc(m[1])}<span class="lqty">${esc(m[2])}</span>` : esc(s); };

// Text of an item typed by hand with a quantity, as the server writes diet rows: "Latte - 1,5 l", over 1000 g in kg.
const shopText = (food, qty, unit) => {
  if (unit.toLowerCase() === "g" && qty > 1000) [qty, unit] = [qty / 1000, "kg"];
  return `${food} - ${String(+qty.toPrecision(6)).replace(".", ",")}${unit ? ` ${unit}` : ""}`;
};

// The todo text of an item typed by hand (trimmed fields; badInput: the quantity field could not be parsed).
// Throws an Error with the message to show.
function newItemText(name, rawQty, unit, badInput = false) {
  if (!name) throw new Error("Scrivi l'articolo da aggiungere");
  const qty = Number(rawQty);
  if (badInput || (rawQty && !(qty > 0 && qty <= MAX_SHOP_QTY))) throw new Error("Quantità non valida");
  if (unit && !rawQty) throw new Error("Indica la quantità per l'unità");
  return rawQty ? shopText(name, qty, unit) : name;
}

// The family shopping list: the integration's own todo entity (found by platform, in case it was renamed).
const todoEntity = (hass) => Object.values(hass.entities ?? {})
  .find((e) => e.platform === "shared_diet" && e.entity_id.startsWith("todo."))?.entity_id ?? "todo.lista_della_spesa";

// A user's category order: the saved one on existing categories, then the rest in list order (as the server does).
function catOrder(categories, saved) {
  const ids = categories.map((c) => c.id);
  const order = [...new Set(saved)].filter((id) => ids.includes(id));
  return [...order, ...ids.filter((id) => !order.includes(id))];
}

// This user's Checkbox/Card choice ("check" by default), and saving it.
const loadListView = (hass) => hass.callWS({ type: "frontend/get_user_data", key: PREFS_KEY })
  .then(({ value }) => (LIST_VIEWS.includes(value?.listView) ? value.listView : "check"), () => "check");
const saveListView = (hass, view) => hass.callWS({ type: "frontend/set_user_data", key: PREFS_KEY, value: { listView: view } });

// Live items of a todo entity, each with the category of its text (asked to the server once per new text, items typed
// by hand included). onChange() after each update; onError(message) when reading, classifying or ticking fails.
// Returns { entity, items (null until the first push), cats (text -> category id), categorize(all), toggle(uid), add(text), close() }.
function watchTodo(hass, entity, onChange, onError) {
  const w = { entity, items: null, cats: new Map(), closed: false };
  // `all` asks again for every text, keeping the current groups until the answer replaces them.
  w.categorize = async (all = false) => {
    const texts = [...new Set((w.items ?? []).map((i) => i.summary))].filter((t) => all || !w.cats.has(t)).slice(0, 1000);
    if (texts.length) {
      try {
        const res = await hass.callWS({ type: "shared_diet/categorize", texts });
        if (w.closed) return;
        const into = all ? (w.cats = new Map()) : w.cats;
        texts.forEach((t, i) => into.set(t, res.categories[i]));
      } catch (err) {
        if (!w.closed) onError(err?.message || "Impossibile classificare la lista");
      }
    }
    if (!w.closed) onChange();
  };
  const sub = hass.connection.subscribeMessage((ev) => {
    if (w.closed) return;
    w.items = ev.items ?? [];
    return w.categorize();
  }, { type: "todo/item/subscribe", entity_id: entity }).catch((err) => {
    if (!w.closed) {
      w.items = [];
      onError(err?.message || "Impossibile leggere la lista");
      onChange();
    }
    return () => {};
  });
  // Ticks or unticks an item: shown at once, confirmed by the subscription, back if refused.
  w.toggle = async (uid) => {
    const item = w.items?.find((i) => i.uid === uid);
    if (!item) return;
    const before = item.status;
    item.status = before === "completed" ? "needs_action" : "completed";
    onChange();
    try {
      await hass.callService("todo", "update_item", { item: uid, status: item.status }, { entity_id: entity });
    } catch (err) {
      item.status = before;
      onError(err?.message || "Operazione non riuscita");
      onChange();
    }
  };
  w.add = (text) => hass.callService("todo", "add_item", { item: text }, { entity_id: entity });
  w.close = () => {
    w.closed = true;
    sub.then((unsub) => unsub?.(), () => {});
  };
  return w;
}

// The list grouped by category in `order`, a clear gap between groups; ticked items go to the bottom, folded under
// Completati (open when doneOpen). view: "check" (checkboxes, data-ch="litem") or "card" (buttons, data-act="litem").
function todoListHtml({ items, cats, categories, order, view, doneOpen = false }) {
  if (items === null) return `<p class="muted">Caricamento…</p>`;
  if (!items.length) return `<p class="muted">Lista vuota.</p>`;
  const names = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const catOf = (i) => { const c = cats.get(i.summary); return order.includes(c) ? c : "altro"; };
  const open = items.filter((i) => i.status !== "completed");
  const done = items.filter((i) => i.status === "completed");
  const check = (i) => `<label class="check"><input type="checkbox" data-ch="litem" data-uid="${esc(i.uid)}"${
    i.status === "completed" ? " checked" : ""}> ${esc(i.summary)}</label>`;
  const card = (i) => i.status === "completed"
    ? `<button class="lcard done" data-act="litem" data-uid="${esc(i.uid)}" aria-label="Riapri ${esc(i.summary)}">${cardText(i.summary)}</button>`
    : `<button class="lcard" data-act="litem" data-uid="${esc(i.uid)}" aria-label="Completa ${esc(i.summary)}">${cardText(i.summary)}</button>`;
  const listHtml = (list) => (view === "card" ? `<div class="lcards">${list.map(card).join("")}</div>` : list.map(check).join(""));
  const groups = order.map((cid) => {
    const group = open.filter((i) => catOf(i) === cid);
    if (!group.length) return "";
    return `<section class="lgroup"><h3>${esc(names[cid])} <span class="muted">${group.length}</span></h3>${listHtml(group)}</section>`;
  }).join("");
  return (groups || `<p class="muted">Tutto preso.</p>`) +
    (done.length ? `<details class="lgroup" id="done"${doneOpen ? " open" : ""}><summary>Completati (${done.length})</summary>${listHtml(done)}</details>` : "");
}

// Checkbox/Card switch (data-act="lview" data-v).
const listViewChips = (view) => `<div class="chips">${[["check", "Checkbox"], ["card", "Card"]].map(([v, l]) =>
  `<button class="chip${view === v ? " on" : ""}" data-act="lview" data-v="${v}" aria-pressed="${view === v}">${l}</button>`).join("")}</div>`;

// The row to add an item by hand: name, optional quantity and unit (#newitem, #newqty, #newunit, data-act="ladd").
const todoAddHtml = ({ newItem = "", newQty = "", newUnit = "" } = {}) => `<div class="row"><input class="grow" id="newitem" maxlength="255"
    placeholder="Articolo fuori dieta (es. Detersivo)" aria-label="Nuovo articolo" value="${esc(newItem)}">
    <div class="addrest"><input id="newqty" class="nqty" type="number" min="0" max="${MAX_SHOP_QTY}" step="any" inputmode="decimal" placeholder="Qtà"
      aria-label="Quantità" value="${esc(newQty)}">
    <select id="newunit" class="nunit" aria-label="Unità di misura">${["", "g", "kg", "ml", "l", "pz", "conf"].map((u) =>
      `<option value="${u}"${u === newUnit ? " selected" : ""}>${u || "Unità"}</option>`).join("")}</select>
    <button data-act="ladd">Aggiungi</button></div></div>`;

const LIST_CSS = `
/* Quantity, unit and button wrap together: when the row is too narrow the name stays alone on the first line. */
.addrest { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.nqty { width: 80px; }
.nunit { width: 92px; }
/* Native picker on tap, but styled like the inputs: same height, own arrow, long options cut with an ellipsis. */
select { appearance: none; -webkit-appearance: none; padding-right: 28px; text-overflow: ellipsis; cursor: pointer;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: right 14px center, right 9px center; background-size: 5px 5px; background-repeat: no-repeat; }
.lgroup { margin-top: 24px; padding-top: 12px; border-top: 2px solid var(--divider-color, #e0e0e0); }
.lgroup h3 { margin: 0 0 8px; }
.lcards { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.lcard { min-height: 64px; text-align: left; white-space: normal; border-radius: 12px;
  background: var(--card-background-color, #fff); box-shadow: 0 1px 3px rgba(0, 0, 0, .2); }
.lcard .lqty { display: block; font-size: 0.85em; opacity: 0.75; margin-top: 2px; }
.lcard.done { opacity: 0.55; text-decoration: line-through; box-shadow: none; }
details.lgroup .lcards { margin-top: 8px; }
`;

export {
  esc, pad, iso, parseIso, addDays, weekday, fmtDay, fmtItem, foldText, zeroChoice, sharesWith, byTime, nearestMeal,
  effectiveDay, own, choiceFor, recipeOf, expandItem, itemLabel, sumItems, resolveMeal,
  itemsHtml, mealGroups, nextGroup, todayPlan, groupsHtml, subscribeDiet,
  MAX_SHOP_QTY, PREFS_KEY, splitQty, cardText, shopText, newItemText, todoEntity, catOrder, loadListView, saveListView,
  watchTodo, todoListHtml, listViewChips, todoAddHtml, LIST_CSS,
};
