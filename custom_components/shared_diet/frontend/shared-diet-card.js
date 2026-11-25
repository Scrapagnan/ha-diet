/* Dieta: card per le dashboard (custom:shared-diet-card). Pasti in sola lettura (tap -> pannello Dieta), o la lista della spesa. */

import {
  esc, fmtDay, todayPlan, groupsHtml, subscribeDiet, newItemText, todoEntity, catOrder, loadListView, saveListView, watchTodo,
  todoListHtml, listViewChips, todoAddHtml, LIST_CSS,
} from "./shared-diet-core.js";

const PANEL_PATH = "/shared-diet"; // const.py PANEL_URL
const VIEWS = ["next", "today", "list"];

const CSS = `
ha-card { padding: 12px 16px; cursor: pointer; }
h2 { font-size: 16px; font-weight: 500; margin: 0 0 4px; }
ul { margin: 4px 0; padding-left: 20px; }
p { margin: 4px 0; }
.card { padding: 8px 0; border-top: 1px solid var(--divider-color, #e0e0e0); }
.card:first-of-type { border-top: 0; }
.meal-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.sub { margin: 8px 0 4px; font-size: 12px; color: var(--secondary-text-color, #727272);
  text-transform: uppercase; letter-spacing: 0.04em; }
.muted { color: var(--secondary-text-color, #727272); }
.tag { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 6px; font-size: 12px;
  background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); vertical-align: middle; }
/* list view: interactive, so no tap-to-panel */
ha-card.list { cursor: default; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.head h2 { margin: 0; }
h3 { font-size: 15px; font-weight: 500; }
button, input { font: inherit; color: inherit; }
button { min-height: 36px; padding: 6px 12px; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 8px;
  background: var(--card-background-color, #fff); cursor: pointer; }
input { padding: 6px 8px; min-width: 0; max-width: 100%; border: 1px solid var(--divider-color, #e0e0e0);
  border-radius: 6px; background: var(--card-background-color, #fff); }
.chips { display: flex; gap: 4px; }
button.chip { padding: 4px 10px; min-height: 0; }
button.chip.on { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); border-color: transparent; }
.row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.grow { flex: 1 1 140px; }
.check { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
.err { color: var(--error-color, #db4437); }
${LIST_CSS}
.lgroup { margin-top: 16px; }
`;

// Visual editor: the view, and the profiles to show (none ticked = all). Profile names come from the shared subscription.
class SharedDietCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.addEventListener("change", (e) => {
      const config = { ...this._config };
      if (e.target.name === "view") config.view = e.target.value;
      else {
        const ids = [...this.shadowRoot.querySelectorAll('input[name="profile"]:checked')].map((i) => i.value);
        if (ids.length) config.profiles = ids;
        else delete config.profiles;
      }
      this._config = config;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
    });
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this.isConnected && !this._unsub) this._subscribe();
  }

  connectedCallback() {
    if (this._hass && !this._unsub) this._subscribe();
  }

  disconnectedCallback() {
    this._unsub?.();
    this._unsub = null;
  }

  _subscribe() {
    this._unsub = subscribeDiet(this._hass, (msg) => {
      this._profiles = msg?.profiles ?? null;
      this._render();
    });
  }

  _render() {
    if (!this._config) return;
    const view = this._config.view ?? "next";
    const picked = this._config.profiles ?? [];
    // Ids in the config whose profile is gone stay listed, so they can be unticked.
    const all = { ...Object.fromEntries(picked.map((id) => [id, { name: id }])), ...(this._profiles ?? {}) };
    const profiles = Object.entries(all).map(([id, p]) => `<label class="row">
      <input type="checkbox" name="profile" value="${esc(id)}"${picked.includes(id) ? " checked" : ""}> ${esc(p.name)}</label>`).join("");
    const radio = (v, l) => `<label class="row"><input type="radio" name="view" value="${v}"${view === v ? " checked" : ""}> ${l}</label>`;
    this.shadowRoot.innerHTML = `<style>
      fieldset { border: 0; padding: 0; margin: 0 0 16px; } legend { font-weight: 500; margin-bottom: 4px; }
      .row { display: flex; align-items: center; gap: 8px; margin: 4px 0; } .muted { color: var(--secondary-text-color, #727272); }
    </style>
    <fieldset><legend>Vista</legend>
      ${radio("next", "Prossimo pasto")}${radio("today", "Pasti di oggi")}${radio("list", "Lista della spesa")}
    </fieldset>
    ${view === "list" ? `<div class="muted">La lista di famiglia, nell'ordine dei reparti di chi la guarda.</div>` : `<fieldset><legend>Profili</legend>
      <div class="muted">Nessuno selezionato: tutti i profili.</div>
      ${this._profiles || picked.length ? profiles : `<div class="muted">Caricamento…</div>`}
    </fieldset>`}`;
  }
}

class SharedDietCard extends HTMLElement {
  static getStubConfig() {
    return { view: "next" };
  }

  static getConfigElement() {
    return document.createElement("shared-diet-card-editor");
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.addEventListener("click", (e) => {
      if (this._config?.view === "list") return this._listClick(e);
      // Not while configuring the dashboard (editor preview, edit mode), nor when opening a recipe's Preparazione.
      if (this.preview || this.editMode || e.target.closest("details")) return;
      history.pushState(null, "", PANEL_PATH);
      window.dispatchEvent(new CustomEvent("location-changed"));
    });
    // List view: a checkbox ticks its item; Enter in the add fields adds.
    this.shadowRoot.addEventListener("change", (e) => {
      if (e.target.dataset?.ch === "litem" && !this.preview) this._watch?.toggle(e.target.dataset.uid);
    });
    this.shadowRoot.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && ["newitem", "newqty", "newunit"].includes(e.target.id)) this._addItem();
    });
  }

  setConfig(config) {
    if (config.view !== undefined && !VIEWS.includes(config.view)) throw new Error("view: next, today oppure list");
    if (config.profiles !== undefined && !Array.isArray(config.profiles)) throw new Error("profiles: lista di id profilo");
    this._config = { view: "next", ...config };
    this._listWatch();
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this.isConnected && !this._unsub) this._subscribe();
    this._listWatch();
  }

  connectedCallback() {
    if (this._hass && !this._unsub) this._subscribe();
    this._listWatch();
    // The "Prossimo" highlight follows the clock, as in the panel's Oggi. After an error (integration not loaded,
    // e.g. during a reload) the subscription is retried once a minute.
    this._tick = setInterval(() => {
      if (this._error && this._hass) {
        this._unsub?.();
        this._subscribe();
      }
      this._render();
    }, 60000);
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    this._unsub?.();
    this._unsub = null;
    this._watch?.close();
    this._watch = null;
  }

  // Units of ~50px for the masonry view; the list grows with its open items (about two per unit).
  getCardSize() {
    const view = this._config?.view;
    if (view === "list") return 3 + Math.ceil((this._watch?.items ?? []).filter((i) => i.status !== "completed").length / 2);
    return view === "today" ? 6 : 3;
  }

  _subscribe() {
    this._unsub = subscribeDiet(this._hass, (msg, err) => {
      const recat = msg && this._data && msg.categories !== this._data.categories;
      this._data = msg;
      this._error = err;
      if (recat) this._watch?.categorize(true); // categories or overrides may have changed
      this._render();
    });
  }

  // List view: follows the family todo entity (only while shown), with this user's category order and Checkbox/Card choice.
  // ponytail: the order is read once per watch; a reorder made in the panel shows here on the next page load.
  _listWatch() {
    const entity = this._config?.view === "list" && this._hass && this.isConnected ? todoEntity(this._hass) : "";
    if (entity === (this._watch?.entity ?? "")) return;
    this._watch?.close();
    this._watch = null;
    if (!entity) return;
    this._order = null;
    this._hass.callWS({ type: "shared_diet/get_category_order" }).then((r) => r.order, () => []).then((order) => {
      this._order = order;
      this._render();
    });
    loadListView(this._hass).then((v) => {
      this._listView = v;
      this._render();
    });
    this._watch = watchTodo(this._hass, entity, () => this._render(), (m) => this._flash(m));
  }

  // An error under the add row, for a few seconds.
  _flash(msg) {
    this._msg = msg;
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => {
      this._msg = "";
      this._render();
    }, 5000);
    this._render();
  }

  _listClick(e) {
    const el = e.target.closest("[data-act]");
    if (!el || this.preview) return; // the editor's preview shows the list, never changes it
    const d = el.dataset;
    if (d.act === "litem") return this._watch?.toggle(d.uid);
    if (d.act === "ladd") return this._addItem();
    if (d.act === "lview") {
      this._listView = d.v;
      saveListView(this._hass, d.v).catch((err) => this._flash(err?.message || "Preferenza non salvata"));
      this._render();
    }
  }

  // An item typed by hand, outside the diet: added to the family list, the fields cleared once added.
  async _addItem() {
    if (!this._watch || this.preview || this._adding) return;
    const el = (id) => this.shadowRoot.getElementById(id);
    const ids = ["newitem", "newqty", "newunit"];
    const [name, rawQty, unit] = ids.map((id) => el(id)?.value.trim() ?? "");
    this._adding = true;
    try {
      await this._watch.add(newItemText(name, rawQty, unit, el("newqty")?.validity?.badInput));
      for (const id of ids) if (el(id)) el(id).value = "";
      el("newitem")?.focus();
    } catch (err) {
      this._flash(err?.message || "Articolo non aggiunto");
    } finally {
      this._adding = false;
    }
  }

  _body() {
    if (this._error) {
      return `<p class="muted">${this._error.code === "not_loaded" ? "Integrazione non caricata" : esc(this._error.message || "Errore")}</p>`;
    }
    if (!this._data) return `<p class="muted">Caricamento…</p>`;
    const ids = this._config.profiles;
    const profiles = Object.fromEntries(Object.entries(this._data.profiles).filter(([id]) => !ids || ids.includes(id)));
    const recipes = this._data.recipes ?? {};
    const { day, tomorrow, list, next } = todayPlan(profiles, recipes);
    if (this._config.view === "next") {
      if (!next) return `<p class="muted">Nessun pasto</p>`;
      return `<h2>${tomorrow || next.tomorrow ? "Domani" : "Prossimo pasto"}</h2>${groupsHtml([next], next, recipes)}`;
    }
    if (!list.length) return `<p class="muted">Nessun pasto</p>`;
    return `<h2>${tomorrow ? "Domani · " : ""}${esc(fmtDay(day, { weekday: "long", day: "numeric", month: "long" }))}</h2>
      ${groupsHtml(list, next, recipes)}`;
  }

  // List view: title, add row and the containers are drawn once, so a push never wipes what is being typed;
  // the Checkbox/Card switch, the message and the list are redrawn.
  _renderList() {
    const root = this.shadowRoot;
    if (!root.getElementById("listbody")) {
      root.innerHTML = `<style>${CSS}</style><ha-card class="list">
        <div class="head"><h2>Lista della spesa</h2><span id="chips"></span></div>
        ${todoAddHtml()}<p id="msg" class="err" hidden></p><div id="listbody"></div></ha-card>`;
    }
    const view = this._listView ?? "check";
    root.getElementById("chips").innerHTML = listViewChips(view);
    const msg = root.getElementById("msg");
    msg.textContent = this._msg ?? "";
    msg.hidden = !this._msg;
    let body;
    if (this._error) body = this._body();
    else if (!this._data || !this._watch || this._order == null) body = `<p class="muted">Caricamento…</p>`;
    else {
      const categories = this._data.categories ?? [];
      body = todoListHtml({
        items: this._watch.items, cats: this._watch.cats, categories, order: catOrder(categories, this._order), view,
        doneOpen: root.getElementById("done")?.open,
      });
    }
    root.getElementById("listbody").innerHTML = body;
  }

  _render() {
    if (!this._config) return;
    if (this._config.view === "list") return this._renderList();
    this.shadowRoot.innerHTML = `<style>${CSS}</style><ha-card>${this._body()}</ha-card>`;
  }
}

if (!customElements.get("shared-diet-card-editor")) customElements.define("shared-diet-card-editor", SharedDietCardEditor);
if (!customElements.get("shared-diet-card")) {
  customElements.define("shared-diet-card", SharedDietCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "shared-diet-card",
    name: "Dieta",
    description: "Prossimo pasto, pasti di oggi o lista della spesa di Shared Diet.",
  });
}
