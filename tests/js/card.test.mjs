// Run: node tests/js/card.test.mjs. The dashboard card's `list` view, with a fake shadow root and connection.
import assert from "node:assert/strict";
import { loadCard } from "./load.mjs";

// Shadow root stand-in: innerHTML is kept as text; getElementById finds an element whose id="…" appears in it.
class Root {
  html = "";
  els = new Map();
  addEventListener() {}
  set innerHTML(h) { this.html = h; this.els.clear(); }
  get innerHTML() { return this.html; }
  getElementById(id) {
    if (!this.html.includes(`id="${id}"`)) return null;
    if (!this.els.has(id)) this.els.set(id, { innerHTML: "", textContent: "", hidden: false, value: "", focus() {} });
    return this.els.get(id);
  }
}
const ctx = {
  HTMLElement: class { attachShadow() { this.shadowRoot = new Root(); } isConnected = true; },
  customElements: { get: () => undefined, define() {} },
  window: {},
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
};
const { SharedDietCard } = loadCard(ctx, ["SharedDietCard"]);
const tick = () => new Promise((r) => setTimeout(r));
const plain = (o) => JSON.parse(JSON.stringify(o));

assert.throws(() => new SharedDietCard().setConfig({ view: "spesa" }), /next, today oppure list/);

let dietPush, todoPush, unsubbed = 0;
const ws = [], services = [];
const hass = {
  entities: { "todo.lista_della_spesa_2": { entity_id: "todo.lista_della_spesa_2", platform: "shared_diet" } },
  connection: {
    subscribeMessage: async (cb, m) => {
      ws.push(plain(m));
      if (m.type === "shared_diet/subscribe") dietPush = cb;
      else todoPush = cb;
      return () => { unsubbed++; };
    },
  },
  callWS: async (m) => {
    ws.push(plain(m));
    if (m.type === "shared_diet/get_category_order") return { order: ["frutta"] };
    if (m.type === "frontend/get_user_data") return { value: { listView: "check" } };
    if (m.type === "frontend/set_user_data") return {};
    return { categories: m.texts.map((t) => (t.startsWith("Pollo") ? "carne" : t.startsWith("Mele") ? "frutta" : "altro")) };
  },
  callService: async (...a) => { services.push(plain(a)); },
};

const card = new SharedDietCard();
card.setConfig({ view: "list" });
card.hass = hass;
await tick();
const body = () => card.shadowRoot.getElementById("listbody").innerHTML;
assert.match(card.shadowRoot.html, /id="newitem"/); // add row on top
assert.match(body(), /Caricamento/); // no diet data yet (categories)
assert.deepEqual(ws.find((m) => m.type === "todo/item/subscribe"), { type: "todo/item/subscribe", entity_id: "todo.lista_della_spesa_2" });
dietPush({ profiles: {}, recipes: {}, categories: [{ id: "carne", name: "Carne" }, { id: "frutta", name: "Frutta" }, { id: "altro", name: "Altro" }] });
await todoPush({ items: [
  { uid: "1", summary: "Pollo - 300 g", status: "needs_action" },
  { uid: "2", summary: "Mele - 2 pz", status: "needs_action" },
  { uid: "3", summary: "Detersivo", status: "needs_action" },
  { uid: "4", summary: "Sale (q.b.)", status: "completed" },
] });
// Grouped by department in this user's order (saved first), completed at the bottom.
assert.deepEqual([...body().matchAll(/<h3>([^ <]+)/g)].map((m) => m[1]), ["Frutta", "Carne", "Altro"]);
assert.match(body(), /<summary>Completati \(1\)<\/summary><label class="check"><input type="checkbox" data-ch="litem" data-uid="4" checked>/);
assert.equal(card.getCardSize(), 3 + 2); // 3 open items
const click = (dataset) => card._listClick({ target: { closest: () => ({ dataset }) } });

// Ticking completes the item in the todo entity.
click({ act: "litem", uid: "2" });
await tick();
assert.deepEqual(services.at(-1), ["todo", "update_item", { item: "2", status: "completed" }, { entity_id: "todo.lista_della_spesa_2" }]);
assert.match(body(), /Completati \(2\)/);

// Card view, saved per user like the panel's.
click({ act: "lview", v: "card" });
await tick();
assert.deepEqual(ws.at(-1), { type: "frontend/set_user_data", key: "shared_diet", value: { listView: "card" } });
assert.match(body(), /class="lcard" data-act="litem" data-uid="1"/);
assert.match(card.shadowRoot.getElementById("chips").innerHTML, /aria-pressed="true">Card/);

// Adding by hand: quantity and unit optional, the fields cleared once added; a bad quantity is reported.
const field = (id, v) => { card.shadowRoot.getElementById(id).value = v; };
field("newitem", "Farina"); field("newqty", "2500"); field("newunit", "g");
await card._addItem();
assert.deepEqual(services.at(-1), ["todo", "add_item", { item: "Farina - 2,5 kg" }, { entity_id: "todo.lista_della_spesa_2" }]);
assert.equal(card.shadowRoot.getElementById("newitem").value, "");
field("newitem", "Latte"); field("newqty", "-1");
await card._addItem();
assert.equal(services.at(-1)[2].item, "Farina - 2,5 kg");
assert.equal(card.shadowRoot.getElementById("msg").textContent, "Quantità non valida");

// The editor's preview never changes the list.
const n = services.length;
card.preview = true;
click({ act: "litem", uid: "1" });
await card._addItem();
assert.equal(services.length, n);
card.preview = false;

// Another view stops following the todo entity.
card.setConfig({ view: "next" });
await tick();
assert.equal(unsubbed, 1);
assert.doesNotMatch(card.shadowRoot.html, /listbody/);
clearTimeout(card._msgTimer);
console.log("card ok");
