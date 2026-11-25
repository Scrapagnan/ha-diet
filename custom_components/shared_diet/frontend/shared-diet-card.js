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

class SharedDietCard extends HTMLElement {
  static getStubConfig() {
    return { view: "next" };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.addEventListener("click", () => {
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
    // The "Prossimo" highlight follows the clock, as in the panel's Oggi.
    this._tick = setInterval(() => this._render(), 60000);
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

if (!customElements.get("shared-diet-card")) {
  customElements.define("shared-diet-card", SharedDietCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "shared-diet-card",
    name: "Dieta",
    description: "Prossimo pasto o pasti di oggi di Shared Diet.",
  });
}
