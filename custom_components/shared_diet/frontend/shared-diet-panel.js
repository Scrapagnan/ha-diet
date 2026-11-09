/* Dieta: pannello laterale di Shared Diet. Web component vanilla, nessuna dipendenza. */

const TABS = [
  ["today", "Oggi"], ["week", "Settimana"], ["dates", "Date"],
  ["choices", "Scelte"], ["shop", "Spesa"], ["profiles", "Profili"],
];
const DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const DAYS_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN = 62;

const CSS = `
:host { display: block; min-height: 100%; box-sizing: border-box;
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
.line { border-left: 3px solid var(--divider-color, #e0e0e0); padding-left: 8px; margin: 8px 0; }
.item { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 6px; margin: 4px 0; }
.item .food { grid-column: 1 / 4; }
.or { font-size: 12px; font-weight: 600; text-align: center; color: var(--secondary-text-color, #727272); }
.chips { display: flex; gap: 4px; }
.muted { color: var(--secondary-text-color, #727272); font-size: 14px; }
.msg { padding: 8px 12px; border-radius: 8px; margin: 8px 0; }
.msg.ok { background: rgba(67, 160, 71, 0.15); }
.msg.err { background: rgba(219, 68, 55, 0.15); color: var(--error-color, #db4437); }
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
const fmtItem = (it) => (it.qty !== null ? `${it.food} ${it.qty} ${it.unit}` : it.note ? `${it.food} (${it.note})` : it.food);
const blankItem = () => ({ food: "", qty: null, unit: "g", note: "" });
const newMeal = () => ({ id: uid(), name: "Pasto", time: null, options: [[{ alts: [blankItem()] }]] });
const zeroChoice = () => ({ option: 0, lines: {} });
const hasChoice = (m) => m.options.length > 1 || m.options.some((o) => o.some((l) => l.alts.length > 1));

// Mirrors model.py: effective day, choice priority, option/alternative resolution.
const effectiveDay = (p, s) => p.exceptions[s] ?? p.week[String(weekday(s))];
const choiceFor = (p, s, mid) => p.choices.dates[s]?.[mid] ?? p.choices.defaults[mid] ?? zeroChoice();
function resolveMeal(meal, choice) {
  const opt = choice.option >= 0 && choice.option < meal.options.length ? choice.option : 0;
  const items = meal.options[opt].map((line, i) => {
    const alt = choice.lines[String(i)] ?? 0;
    return line.alts[alt >= 0 && alt < line.alts.length ? alt : 0];
  });
  return { option: opt, items };
}

// Cleans the draft before saving: trims, drops empty food rows, rejects empty meals.
const cleanItem = (a) => ({
  food: a.food.trim(), qty: Number.isFinite(a.qty) ? a.qty : null, unit: a.unit.trim(), note: a.note.trim(),
});
function cleanMeals(meals) {
  return meals.map((m) => {
    const name = m.name.trim();
    if (!name) throw new Error("Ogni pasto deve avere un nome");
    const options = m.options
      .map((opt) => opt.map((line) => ({ alts: line.alts.filter((a) => a.food.trim()).map(cleanItem) })).filter((l) => l.alts.length))
      .filter((opt) => opt.length);
    if (!options.length) throw new Error(`«${name}»: inserisci almeno un alimento`);
    return { id: m.id, name, time: m.time || null, options };
  });
}
function cleanProfile(p) {
  const name = p.name.trim();
  if (!name) throw new Error("Il nome del profilo è obbligatorio");
  const week = {};
  for (let d = 0; d < 7; d++) week[d] = cleanMeals(p.week[d]);
  const exceptions = Object.fromEntries(Object.entries(p.exceptions).map(([s, meals]) => [s, cleanMeals(meals)]));
  return {
    id: p.id, name, person: p.person || null,
    reminder: { enabled: Boolean(p.reminder.enabled), minutes: p.reminder.minutes, notify: p.reminder.notify || null },
    week, exceptions, choices: p.choices, rev: p.rev,
  };
}

class SharedDietPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    const today = iso(new Date());
    this._view = "today";
    this._profiles = null; // last subscribe payload
    this._loadError = "";
    this._profileId = null;
    this._draft = null; // editable copy of the selected profile
    this._dirty = false;
    this._busy = false;
    this._msg = null; // {ok, text}
    this._narrow = false;
    this._showAlts = false;
    this._date = today; // Date view
    this._wday = weekday(today); // Settimana view
    this._range = { from: today, to: addDays(today, 6) }; // Scelte view
    this._shop = { from: today, to: addDays(today, 6), off: new Set(), todo: "", items: null };
    this.shadowRoot.addEventListener("click", (e) => this._onClick(e));
    this.shadowRoot.addEventListener("change", (e) => this._onChange(e));
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
  }

  _subscribe() {
    this._unsub = this._hass.connection
      .subscribeMessage((msg) => this._onData(msg.profiles), { type: "shared_diet/subscribe" })
      .catch((err) => {
        this._loadError = err?.message || "Impossibile caricare i dati";
        this._render();
        return () => {};
      });
  }

  // Latest server data. Unsaved edits to the selected profile survive; a deleted profile resets the selection.
  _onData(profiles) {
    this._profiles = profiles;
    if (!profiles[this._profileId]) {
      this._profileId = Object.keys(profiles)[0] ?? null;
      this._draft = null;
      this._dirty = false;
    }
    if (this._profileId && !(this._dirty && this._draft)) {
      this._draft = clone(profiles[this._profileId]);
      this._dirty = false;
    }
    this._render();
  }

  // ---- state helpers -------------------------------------------------------

  _canDiscard() {
    return !this._dirty || confirm("Ci sono modifiche non salvate: scartarle?");
  }

  _selectProfile(id) {
    if (id === this._profileId) return;
    if (!this._canDiscard()) return this._render();
    this._profileId = id;
    this._draft = clone(this._profiles[id]);
    this._dirty = false;
    this._msg = null;
    this._render();
  }

  _edit() {
    this._dirty = true;
    this._render();
  }

  _markDirty() {
    this._dirty = true;
    const el = this.shadowRoot.getElementById("state");
    if (el) el.textContent = "Modifiche non salvate";
  }

  _flash(text) {
    this._msg = { ok: false, text };
    this._render();
  }

  async _run(fn, okText = "") {
    if (this._busy) return;
    this._busy = true;
    this._msg = null;
    this._render();
    try {
      await fn();
      this._msg = okText ? { ok: true, text: okText } : null;
    } catch (err) {
      this._msg = { ok: false, text: err?.message || "Operazione non riuscita" };
    } finally {
      this._busy = false;
      this._render();
    }
  }

  _save() {
    const id = this._profileId;
    return this._run(async () => {
      const profile = cleanProfile(this._draft);
      try {
        const res = await this._hass.callWS({ type: "shared_diet/save_profile", profile });
        this._draft = clone(res.profile);
        this._dirty = false;
      } catch (err) {
        if (err?.code === "conflict") {
          // Someone else saved first: drop the local copy and use the latest subscribed data.
          this._draft = this._profiles[id] ? clone(this._profiles[id]) : null;
          this._dirty = false;
          throw new Error("Modificato da un altro utente, dati ricaricati");
        }
        throw err;
      }
    }, "Salvato");
  }

  _createProfile() {
    const name = this.shadowRoot.querySelector("[data-newname]")?.value.trim();
    if (!name) return this._flash("Inserisci un nome per il profilo");
    if (!this._canDiscard()) return;
    return this._run(async () => {
      const res = await this._hass.callWS({ type: "shared_diet/create_profile", name });
      this._profileId = res.profile.id;
      this._draft = clone(res.profile);
      this._dirty = false;
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
        this._dirty = false;
      }
    }, "Profilo eliminato");
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
      this._msg = null;
      return this._render();
    }
    switch (d.act) {
      case "menu":
        return this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
      case "save": return this._save();
      case "create": return this._createProfile();
      case "delprofile": return this._deleteProfile();
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
      case "addmeal": list.push(newMeal()); break;
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
      case "delopt": list[i].options.splice(oi, 1); break;
      case "addline": list[i].options[oi].push({ alts: [blankItem()] }); break;
      case "delline": list[i].options[oi].splice(li, 1); break;
      case "addalt": list[i].options[oi][li].alts.push(blankItem()); break;
      case "delalt": list[i].options[oi][li].alts.splice(ai, 1); break;
      default: return;
    }
    this._edit();
  }

  _onChange(e) {
    const el = e.target;
    const d = el.dataset;
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
      case "copt": {
        const c = this._choiceSlot(d.date, d.mid, true);
        c.option = Number(el.value);
        c.lines = {};
        return this._edit();
      }
      case "cline":
        this._choiceSlot(d.date, d.mid, true).lines[d.l] = Number(el.value);
        return this._markDirty();
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
        <main>${this._body()}</main>
      </div>`;
  }

  _body() {
    if (this._loadError) return `<p class="msg err">${esc(this._loadError)}</p>`;
    if (!this._profiles) return `<p class="muted">Caricamento…</p>`;
    const views = {
      today: () => this._vToday(), week: () => this._vWeek(), dates: () => this._vDates(),
      choices: () => this._vChoices(), shop: () => this._vShop(), profiles: () => this._vProfiles(),
    };
    const msg = this._msg ? `<div class="msg ${this._msg.ok ? "ok" : "err"}" role="status">${esc(this._msg.text)}</div>` : "";
    return msg + views[this._view]() + this._datalists();
  }

  _picker() {
    const ids = Object.keys(this._profiles);
    if (!ids.length) return `<p class="muted">Nessun profilo ancora: creane uno nella scheda «Profili».</p>`;
    return `<label class="row">Profilo
      <select data-ch="pick">${ids.map((id) => `<option value="${esc(id)}"${id === this._profileId ? " selected" : ""}>${esc(this._profiles[id].name)}</option>`).join("")}</select>
    </label>`;
  }

  _saveBar() {
    return `<div class="savebar">
      <span id="state" class="muted">${this._dirty ? "Modifiche non salvate" : "Tutte le modifiche salvate"}</span>
      <button class="primary" data-act="save"${this._busy ? " disabled" : ""}>Salva</button>
    </div>`;
  }

  _datalists() {
    const meals = Object.values(this._profiles).flatMap((p) => [...Object.values(p.week).flat(), ...Object.values(p.exceptions).flat()]);
    const items = meals.flatMap((m) => m.options.flat().flatMap((l) => l.alts));
    const foods = [...new Set(items.map((i) => i.food.trim()).filter(Boolean))].sort();
    const units = [...new Set(["g", "ml", "pz", ...items.map((i) => i.unit.trim()).filter(Boolean)])];
    return `<datalist id="foods">${foods.map((f) => `<option value="${esc(f)}">`).join("")}</datalist>
      <datalist id="units">${units.map((u) => `<option value="${esc(u)}">`).join("")}</datalist>`;
  }

  // Read-only resolved meals for a date (choices applied), optionally with all alternatives.
  _resolved(p, s, withAlts = false) {
    const meals = effectiveDay(p, s);
    if (!meals.length) return `<p class="muted">Nessun pasto.</p>`;
    return meals.map((m) => {
      const r = resolveMeal(m, choiceFor(p, s, m.id));
      const alts = m.options.map((opt, oi) => `<li class="${oi === r.option ? "" : "muted"}">Opzione ${oi + 1}: ${
        opt.map((l) => l.alts.map((a) => esc(fmtItem(a))).join(" / ")).join(" + ")}</li>`).join("");
      return `<section class="card">
        <div class="meal-head"><strong>${esc(m.name)}</strong><span class="muted">${esc(m.time ?? "senza orario")}</span></div>
        <ul>${r.items.map((i) => `<li>${esc(fmtItem(i))}</li>`).join("")}</ul>
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
    return `${this._picker()}${this._saveBar()}
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
    return `${this._picker()}${this._saveBar()}
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
        for (const m of effectiveDay(this._draft, s)) if (hasChoice(m)) cards += this._choiceCard(s, m);
      }
      if (!cards) cards = `<p class="muted">Nessun pasto con alternative nell'intervallo.</p>`;
    }
    return `${this._picker()}${this._saveBar()}
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
    const { option } = resolveMeal(m, choice);
    const attrs = `data-date="${esc(date)}" data-mid="${esc(m.id)}"`;
    const opts = m.options.map((o, oi) => `<option value="${oi}"${oi === option ? " selected" : ""}>Opzione ${oi + 1}: ${
      esc(o.map((l) => l.alts.map((a) => a.food).join(" / ")).join(" + "))}</option>`).join("");
    const lines = m.options[option].map((line, li) => {
      if (line.alts.length < 2) return "";
      const want = choice.lines[String(li)] ?? 0;
      const sel = want >= 0 && want < line.alts.length ? want : 0;
      return `<label class="sub-row">Riga ${li + 1}
        <select data-ch="cline" ${attrs} data-l="${li}">${line.alts.map((a, ai) => `<option value="${ai}"${ai === sel ? " selected" : ""}>${esc(a.food)}</option>`).join("")}</select>
      </label>`;
    }).join("");
    return `<label class="sub-row">Opzione <select data-ch="copt" ${attrs}>${opts}</select></label>${lines}`;
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

  _vProfiles() {
    const head = `<h2>Profili</h2>
      <div class="row"><input data-newname placeholder="Nome del nuovo profilo" aria-label="Nome nuovo profilo">
        <button data-act="create">Crea profilo</button></div>`;
    const p = this._draft;
    if (!p) return head;
    const persons = Object.keys(this._hass.states).filter((e) => e.startsWith("person.")).sort();
    const notifies = Object.keys(this._hass.services.notify ?? {}).map((n) => `notify.${n}`).sort();
    const select = (field, current, list, empty) => {
      const all = current && !list.includes(current) ? [current, ...list] : list;
      return `<select data-ch="pfield" data-f="${field}"><option value="">${empty}</option>${all.map((v) =>
        `<option value="${esc(v)}"${v === current ? " selected" : ""}>${esc(v)}</option>`).join("")}</select>`;
    };
    return `${head}${this._picker()}${this._saveBar()}
      <section class="card">
        <label class="sub-row">Nome <input value="${esc(p.name)}" data-ch="pfield" data-f="name"></label>
        <label class="sub-row">Persona collegata ${select("person", p.person, persons, "Nessuna")}</label>
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
    return `<section class="card">
      <div class="row">
        <input class="grow" value="${esc(m.name)}" data-ch="meal" data-f="name" ${at} aria-label="Nome pasto">
        <input type="time" value="${esc(m.time ?? "")}" data-ch="meal" data-f="time" ${at} aria-label="Orario">
      </div>
      ${m.options.map((opt, oi) => this._optionEditor(ctx, i, oi, opt, m.options.length)).join("")}
      <div class="row">
        <button data-act="addopt" ${at}>+ Opzione</button>
        <button data-act="up" ${at}${i === 0 ? " disabled" : ""} aria-label="Sposta su">↑</button>
        <button data-act="down" ${at}${i === n - 1 ? " disabled" : ""} aria-label="Sposta giù">↓</button>
        <button class="danger" data-act="delmeal" ${at}>Elimina pasto</button>
      </div>
    </section>`;
  }

  _optionEditor(ctx, i, oi, opt, nOptions) {
    const at = `data-ctx="${esc(ctx)}" data-i="${i}" data-o="${oi}"`;
    const lines = opt.map((line, li) => `<div class="line">
        ${line.alts.map((a, ai) => `${ai ? `<div class="or">OPPURE</div>` : ""}
          <div class="item">
            <input class="food" list="foods" value="${esc(a.food)}" placeholder="Alimento" aria-label="Alimento"
              data-ch="item" data-f="food" ${at} data-l="${li}" data-a="${ai}">
            <button class="icon" data-act="delalt" ${at} data-l="${li}" data-a="${ai}" aria-label="Rimuovi alimento">×</button>
            <input type="number" min="0" step="any" value="${esc(a.qty ?? "")}" placeholder="Quantità" aria-label="Quantità"
              data-ch="item" data-f="qty" ${at} data-l="${li}" data-a="${ai}">
            <input list="units" value="${esc(a.unit)}" placeholder="Unità" aria-label="Unità"
              data-ch="item" data-f="unit" ${at} data-l="${li}" data-a="${ai}">
            <input value="${esc(a.note)}" placeholder="Nota" aria-label="Nota"
              data-ch="item" data-f="note" ${at} data-l="${li}" data-a="${ai}">
          </div>`).join("")}
        <div class="row">
          <button data-act="addalt" ${at} data-l="${li}">+ OPPURE</button>
          <button class="danger" data-act="delline" ${at} data-l="${li}">Rimuovi riga</button>
        </div>
      </div>`).join("");
    return `<div class="option">
      <div class="row">
        <strong class="grow">Opzione ${oi + 1}</strong>
        ${nOptions > 1 ? `<button class="danger" data-act="delopt" ${at}>Rimuovi opzione</button>` : ""}
      </div>
      ${lines}
      <button data-act="addline" ${at}>+ Riga</button>
    </div>`;
  }
}

if (!customElements.get("shared-diet-panel")) {
  customElements.define("shared-diet-panel", SharedDietPanel);
}
