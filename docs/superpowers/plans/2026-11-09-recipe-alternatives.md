# Alternative negli ingredienti delle ricette - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ogni ingrediente di una ricetta può avere alternative OPPURE; la scelta funziona come per i pasti (predefinita + ritocco per data, fallback alla prima); grammature per persona per alternativa.

**Architecture:** Nuova forma ingrediente `{id, alts:[{id, food, qty, unit}]}` con migrazione al caricamento. La Choice del pasto acquista `recipes: {recipe_id: {ingredient_id: alt_id}}`. `expand_item` riceve la scelta della ricetta. Il pannello replica la logica, aggiunge "+ OPPURE" nella scheda Ricette, i campi grammatura per alternativa nella riga-ricetta, e le tendine nella scheda Scelte.

**Tech Stack:** come il progetto (Python/HA in Docker `shared-diet-test`, JS vanilla in un file, node:22 per i test JS).

**Spec:** `docs/superpowers/specs/2026-11-09-recipes-design.md`, sezione "Aggiunta (2026-11-09): alternative OPPURE negli ingredienti" (+ "Decisioni dopo la revisione" di quella sezione).

## Global Constraints

- Ingrediente: `{id, alts: [{id, food, qty: float|null, unit}, …]}`, `alts` ≥ 1; id alternative unici in tutta la ricetta; id ingredienti unici nella ricetta.
- Migrazione (store, al caricamento, `STORAGE_VERSION` invariata): ingrediente vecchio `{id, food, qty, unit}` → `{id, alts: [{id: <stesso id>, food, qty, unit}]}`.
- `recipe_qty[recipe_id][alt_id]` = numero ≥ 0 (solo numero).
- Choice: `{option, lines, recipes?}`; `recipes: {recipe_id: {ingredient_id: alt_id}}`, assente = `{}`. Choice resta un oggetto unico (data > predefinita > `{"option": 0, "lines": {}}`).
- Alternativa effettiva di un ingrediente: `alt_id` scelto se esiste nell'ingrediente, altrimenti la prima.
- Grammatura effettiva: `recipe_qty[rid][alt_id]` se presente, altrimenti `alt.qty` (anche `None`).
- Testi invariati: `"Pancake: Farina 60 g, Latte 100 ml"`, `"Ricetta mancante"`.
- Test: `MSYS_NO_PATHCONV=1 docker run --rm -v "D:/code/ha-shared-diet:/app" shared-diet-test python -m pytest tests/ -q`; JS: `MSYS_NO_PATHCONV=1 docker run --rm -v "D:/code/ha-shared-diet:/app" -w /app node:22-slim sh -c "node --check custom_components/shared_diet/frontend/shared-diet-panel.js && for f in tests/js/*.test.mjs; do node \$f || exit 1; done"`.
- Versione finale `0.3.0` (const `VERSION` + `manifest.json`).

## Review Focus

1. Dati salvati con la versione 0.2.0 (ingredienti vecchio formato, override per ingrediente) → dopo la migrazione stesse grammature e stessa spesa (test Task 2).
2. Choice salvate prima di questa versione (senza `recipes`) → valgono le prime alternative, nessun errore (test Task 1 e Task 3).
3. Alternativa eliminata dalla ricetta mentre una persona l'aveva scelta → si usa la prima, la spesa non contiene l'alternativa eliminata (test Task 1).
4. Stessa ricetta in due pasti dello stesso giorno con scelte diverse per pasto (Choice diverse) → ogni pasto usa la sua (test Task 1).
5. Ricetta come alternativa non scelta di una riga → le sue tendine non compaiono in Scelte e non entra nella spesa (test Task 1 e verifica UI Task 4).

---

### Task 1: Logica `model.py`

**Files:** Modify `custom_components/shared_diet/model.py`; Test `tests/test_model_recipes.py` (aggiorna fixture al nuovo formato + nuovi casi).

**Interfaces - Produces:**
- `expand_item(item, profile, recipes, recipe_choice: dict | None = None) -> dict` - `recipe_choice` = `{ingredient_id: alt_id}`; per ogni ingrediente l'alternativa effettiva diventa la voce in `ingredients` (`{"food","qty","unit","note": ""}`); il risultato aggiunge `"choices": [{"ingredient_id", "alts": [{"id","food","qty","unit"}], "chosen": alt_id}]` per i soli ingredienti con più alternative (serve al pannello/"Vedi alternative"; grammature effettive della persona).
- `resolve_meal(meal, choice, profile=None, recipes=None)` passa `choice.get("recipes", {}).get(rid, {})` a `expand_item`.
- `shopping_items`, `current_and_next`, `format_item`: firme invariate; usano l'alternativa effettiva.

- [ ] **Step 1: test che falliscono** (RECIPES con Farina [60 g] e Latte [Latte 100 ml | Soia 120 ml], id alternative `a1`, `a2`, `a3`):
  - nessuna scelta → `"Pancake: Farina 60 g, Latte 100 ml"`;
  - Choice `recipes {r1: {i2: "a3"}}` → `"Pancake: Farina 60 g, Soia 120 ml"` e spesa con `"Soia - 120 ml"` senza Latte;
  - override `recipe_qty {r1: {a3: 90}}` + scelta Soia → `Soia 90 ml`; override su `a2` non influenza Soia;
  - `alt_id` inesistente → prima alternativa;
  - stessa ricetta in due pasti con Choice diverse → spesa somma Latte e Soia;
  - ricetta come alternativa non scelta → niente ingredienti in spesa;
  - `choices` presente solo per ingredienti con ≥2 alternative, con `chosen` corretto.
- [ ] **Step 2:** implementa. **Step 3:** suite → PASS. Commit `feat(model): ingredient alternatives in recipes`.

### Task 2: Store, migrazione, websocket, sensori

**Files:** Modify `store.py`, `websocket.py`; Test `tests/test_store_recipes.py`, `tests/test_websocket_recipes.py`, `tests/test_sensor.py` (aggiorna fixture al nuovo formato + nuovi casi).

**Interfaces - Consumes:** Task 1. **Produces:**
- Store: migrazione ingredienti al caricamento (vedi Global Constraints); `async_save_profile` pota `recipe_qty` per **alt id** (ricette/alternative inesistenti); `async_create_recipe` invariata.
- Websocket: `INGREDIENT = {id, alts: [ {id, food, qty, unit} ] (≥1)}`, id alternative unici nella ricetta (e id ingredienti unici); `CHOICE` accetta `vol.Optional("recipes")`: `{NON_EMPTY: {NON_EMPTY: NON_EMPTY}}`.
- Sensori/promemoria: nessuna modifica di codice attesa (passano già la Choice); aggiungi un test che la scelta Soia compare nel sensore.

- [ ] **Step 1: test che falliscono:** storage 0.2.0 (ingredienti piatti + `recipe_qty[r1][<ingredient id>]`) si carica in nuovo formato e la grammatura personalizzata resta; potatura per alt id; schema rifiuta ingrediente con `food` al primo livello, `alts: []`, alt id duplicati tra ingredienti, `recipes` con valori vuoti; accetta Choice con `recipes`; sensore con scelta Soia.
- [ ] **Step 2:** implementa. **Step 3:** suite → PASS. Commit `feat: ingredient alternatives in store and api`.

### Task 3: Pannello - logica, Ricette, riga-ricetta

**Files:** Modify `custom_components/shared_diet/frontend/shared-diet-panel.js`; Test `tests/js/resolve.test.mjs`.

**Interfaces - Consumes:** Task 1–2 (forma dati). **Produces:** `expandItem(item, profile, recipes, recipeChoice)` allineato a `expand_item` (incluso `choices`); `resolveMeal` passa `choice.recipes?.[rid]`; `cleanRecipe` per il nuovo formato; `setRecipeQty` invariata ma con chiave alt id.

- [ ] **Step 1: test node che falliscono:** stessi casi testuali di Task 1 per `expandItem`/`fmtItem`; `cleanRecipe` con alternative (rimuove alternative con alimento vuoto, rimuove ingredienti senza alternative, mantiene gli id).
- [ ] **Step 2:** implementa:
  - Scheda Ricette: ogni ingrediente come blocco con le sue alternative (alimento, quantità di default, unità), "+ OPPURE" (nuova alternativa con `uid()`, focus sul campo alimento), rimozione per alternativa (ultima = rimuove l'ingrediente), stesso stile dell'editor dei pasti.
  - Riga-ricetta nel pasto: per ogni ingrediente tutte le alternative ("Latte · ml / OPPURE Soia · ml"), ciascuna con il proprio campo grammatura (`data-ch="rqty"` con `data-iid` = **alt id**), sincronizzazione fra righe e "Ripristina default" come oggi.
  - Oggi / "Vedi alternative": la ricetta mostra l'alternativa scelta; con "Vedi alternative" le altre alternative degli ingredienti in grigio.
- [ ] **Step 3:** test JS + suite Python → PASS. Commit `feat(panel): ingredient alternatives in recipes tab and meals`.

### Task 4: Pannello - scheda Scelte, versione, README

**Files:** Modify `custom_components/shared_diet/frontend/shared-diet-panel.js`, `const.py`, `manifest.json`, `README.md`.

**Interfaces - Consumes:** Task 3.

- [ ] **Step 1:** Scelte: nel blocco di ogni pasto, dopo le tendine delle righe, per ogni ricetta nel percorso scelto (opzione scelta + alternativa scelta di ogni riga) e ogni suo ingrediente con ≥2 alternative, una tendina `"<Ricetta> · Ingrediente N"` (valori = alt id, etichette = alimento + grammatura effettiva della persona) sia per "Predefinito" sia per "Questa data" (con ritocco). Scrive `choice.recipes[rid][iid] = altId`. Cambiare l'alternativa di una riga ridisegna la vista.
- [ ] **Step 2:** versione `0.3.0`; README: alternative negli ingredienti (scheda Ricette, scelta in Scelte, grammature per alternativa).
- [ ] **Step 3:** `node --check` + test JS + suite Python → PASS. Commit `feat(panel): choose ingredient alternatives in Scelte`.
