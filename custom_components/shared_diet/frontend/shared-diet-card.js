/* Dieta: card per le dashboard (custom:shared-diet-card). Sola lettura; tap -> pannello Dieta. */

import { esc, fmtDay, todayPlan, groupsHtml, subscribeDiet } from "./shared-diet-core.js";

const PANEL_PATH = "/shared-diet"; // const.py PANEL_URL
const VIEWS = ["next", "today"];

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
    this.shadowRoot.innerHTML = `<style>
      fieldset { border: 0; padding: 0; margin: 0 0 16px; } legend { font-weight: 500; margin-bottom: 4px; }
      .row { display: flex; align-items: center; gap: 8px; margin: 4px 0; } .muted { color: var(--secondary-text-color, #727272); }
    </style>
    <fieldset><legend>Vista</legend>
      <label class="row"><input type="radio" name="view" value="next"${view === "next" ? " checked" : ""}> Prossimo pasto</label>
      <label class="row"><input type="radio" name="view" value="today"${view === "today" ? " checked" : ""}> Pasti di oggi</label>
    </fieldset>
    <fieldset><legend>Profili</legend>
      <div class="muted">Nessuno selezionato: tutti i profili.</div>
      ${this._profiles || picked.length ? profiles : `<div class="muted">Caricamento…</div>`}
    </fieldset>`;
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
      // Not while configuring the dashboard (editor preview, edit mode), nor when opening a recipe's Preparazione.
      if (this.preview || this.editMode || e.target.closest("details")) return;
      history.pushState(null, "", PANEL_PATH);
      window.dispatchEvent(new CustomEvent("location-changed"));
    });
  }

  setConfig(config) {
    if (config.view !== undefined && !VIEWS.includes(config.view)) throw new Error("view: next oppure today");
    if (config.profiles !== undefined && !Array.isArray(config.profiles)) throw new Error("profiles: lista di id profilo");
    this._config = { view: "next", ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this.isConnected && !this._unsub) this._subscribe();
  }

  connectedCallback() {
    if (this._hass && !this._unsub) this._subscribe();
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
  }

  getCardSize() {
    return this._config?.view === "today" ? 6 : 3;
  }

  _subscribe() {
    this._unsub = subscribeDiet(this._hass, (msg, err) => {
      this._data = msg;
      this._error = err;
      this._render();
    });
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

  _render() {
    if (!this._config) return;
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
    description: "Prossimo pasto o pasti di oggi di Shared Diet.",
  });
}
