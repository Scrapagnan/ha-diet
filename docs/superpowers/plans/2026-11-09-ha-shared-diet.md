# HA Shared Diet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrazione custom Home Assistant (HACS) `shared_diet` per gestire le diete settimanali di N profili, con pannello laterale, sensori, promemoria e lista spesa verso una To-do di HA.

**Architecture:** Logica pura (giorno effettivo, risoluzione alternative, pasto attuale/prossimo, aggregazione spesa) in `model.py` senza dipendenze HA. Persistenza in `store.py` su `homeassistant.helpers.storage.Store` con revisione per profilo (concorrenza ottimistica). API websocket per il pannello, entità sensore per profilo, un tick al minuto che aggiorna i sensori e invia i promemoria. Frontend = un solo web component JS vanilla, senza build.

**Tech Stack:** Python 3.13, Home Assistant Core ≥ 2025.1, voluptuous, pytest + `pytest-homeassistant-custom-component`, JS vanilla (Custom Elements), `<datalist>` per autocompletamento.

**Spec:** `docs/superpowers/specs/2026-11-09-ha-shared-diet-design.md`

## Global Constraints

- Dominio: `shared_diet`. Cartella: `custom_components/shared_diet/`.
- Distribuzione HACS (`hacs.json` in root); non richiede Supervisor.
- Persistenza solo in `.storage` (chiave `shared_diet.data`, versione 1); nessun DB esterno.
- Pannello visibile a tutti gli utenti (`require_admin=False`); comandi websocket senza `@require_admin`.
- UI in italiano.
- Nessuno storico modifiche.
- Formato riga spesa con totale: `"<Nome> - <qty> <unit>"` (em dash, es. `"Pasta integrale - 560 g"`); qty senza `.0` finale.
- Priorità scelta alternative: ritocco per data > default per pasto dello schema > prima opzione (indice 0). Indice non più valido → 0.
- Giorno effettivo: eccezione per data se esiste, altrimenti giorno dello schema (`weekday()`: 0=lunedì).
- Pasti senza orario: mai "attuale/prossimo", mai promemoria.
- "Pasto attuale" = ultimo pasto con orario ≤ ora attuale (oggi), fino all'orario del successivo; dopo l'ultimo resta fino a mezzanotte.
- Ora locale via `homeassistant.util.dt.now()`.

## Data model (JSON in storage, condiviso da tutti i task)

```jsonc
{
  "profiles": {
    "<profile_id>": {
      "id": "<uuid hex>", "name": "Luca", "person": "person.luca" | null,
      "reminder": {"enabled": false, "minutes": 15, "notify": "notify.mobile_app_x" | null},
      "week": {"0": [Meal], ..., "6": [Meal]},          // tutte e 7 le chiavi presenti
      "exceptions": {"2026-11-18": [Meal]},             // giorno intero sostituito
      "choices": {
        "defaults": {"<meal_id>": Choice},
        "dates": {"2026-11-18": {"<meal_id>": Choice}}
      },
      "rev": 3
    }
  }
}
// Meal   = {"id": "<uuid hex>", "name": "Colazione", "time": "07:30" | null, "options": [[Line, ...], ...]}  // >=1 opzione
// Line   = {"alts": [Item, ...]}                         // >=1 item; >1 = "OPPURE"
// Item   = {"food": "Pasta integrale", "qty": 80.0 | null, "unit": "g", "note": "q.b." | ""}
// Choice = {"option": 0, "lines": {"<line_idx>": <alt_idx>}}   // line_idx relativo all'opzione scelta
```

Quando il pannello crea un'eccezione copia il giorno dello schema **mantenendo i `meal.id`**, così le scelte di default continuano ad applicarsi.

## Review Focus

1. Due persone salvano lo stesso profilo da due telefoni → la seconda riceve errore `conflict`, il pannello ricarica; nessuna sovrascrittura silenziosa (test in Task 4 e Task 5).
2. Scelta salvata che punta a opzione/alternativa rimossa dopo una modifica dello schema → si usa indice 0, nessun crash (test in Task 2).
3. Stesso alimento scritto con maiuscole/spazi diversi ("Pasta integrale" / " pasta integrale ") → sommato in una riga (test in Task 3).
4. Input malformato dal pannello (orario "7:5", qty negativa, settimana senza 7 giorni, intervallo spesa con fine < inizio o > 62 giorni) → errore websocket `invalid_format`, dati non salvati (test in Task 5).
5. Servizio notify configurato che non esiste più → warning nel log, tick e sensori continuano (test in Task 6).

---

### Task 1: Scaffold, config flow, repo

**Files:**
- Create: `custom_components/shared_diet/manifest.json`, `__init__.py`, `const.py`, `config_flow.py`, `strings.json`, `translations/it.json`, `translations/en.json`
- Create: `hacs.json`, `requirements_test.txt`, `pyproject.toml` (solo config pytest), `.gitignore`
- Test: `tests/conftest.py`, `tests/test_config_flow.py`

**Interfaces:**
- Produces: `const.DOMAIN = "shared_diet"`, `const.STORAGE_KEY = "shared_diet.data"`, `const.STORAGE_VERSION = 1`, `const.PANEL_URL = "shared-diet"`. `async_setup_entry(hass, entry) -> bool` salva in `entry.runtime_data` (Task 4 lo riempie con `DietStore`).

- [ ] **Step 1:** `git init`, `.gitignore` Python standard.
- [ ] **Step 2:** `manifest.json`: `domain`, `name: "Shared Diet"`, `config_flow: true`, `dependencies: ["http", "frontend", "panel_custom", "websocket_api"]`, `iot_class: "local_push"`, `version: "0.1.0"`, `single_config_entry: true`. `hacs.json`: `{"name": "Shared Diet", "homeassistant": "2025.1.0"}`. `requirements_test.txt`: `pytest-homeassistant-custom-component`. `conftest.py`: fixture autouse `auto_enable_custom_integrations`.
- [ ] **Step 3: Test fallisce**

```python
async def test_user_flow_creates_entry(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] == "create_entry"
    assert result["title"] == "Shared Diet"

async def test_second_flow_aborts(hass):
    MockConfigEntry(domain=DOMAIN).add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] == "abort"
    assert result["reason"] == "single_instance_allowed"
```

Run: `pytest tests/test_config_flow.py -v` → FAIL (modulo mancante).
- [ ] **Step 4:** `ConfigFlow` con step `user` senza campi (form vuoto, poi `async_create_entry(title="Shared Diet", data={})`). `__init__.py` con `async_setup_entry`/`async_unload_entry` minimi.
- [ ] **Step 5:** `pytest tests/test_config_flow.py -v` → PASS.
- [ ] **Step 6:** Commit `feat: scaffold shared_diet integration`.

### Task 2: Logica giorno/pasti (`model.py`)

**Files:**
- Create: `custom_components/shared_diet/model.py`
- Test: `tests/test_model_day.py`

**Interfaces:**
- Produces:
  - `effective_day(profile: dict, day: date) -> list[dict]` - lista Meal.
  - `choice_for(profile: dict, day: date, meal_id: str) -> dict` - Choice con priorità data > default > `{"option": 0, "lines": {}}`.
  - `resolve_meal(meal: dict, choice: dict) -> dict` → `{"id", "name", "time", "option": int, "items": [Item], "all_options": meal["options"]}`; indici fuori range → 0.
  - `current_and_next(profile: dict, now: datetime) -> tuple[dict | None, dict | None]` - pasti risolti; il "prossimo" può essere il primo con orario di domani.

- [ ] **Step 1: Test fallisce**

```python
MON = date(2026, 11, 9)  # lunedì
def meal(id, time, options): return {"id": id, "name": id, "time": time, "options": options}
def line(*foods): return {"alts": [{"food": f, "qty": 80.0, "unit": "g", "note": ""} for f in foods]}

def test_exception_replaces_schema_day():
    p = profile(week={"0": [meal("a", "08:00", [[line("Pane")]])]},
                exceptions={"2026-11-09": [meal("x", "20:00", [[line("Pizza")]])]})
    assert [m["id"] for m in effective_day(p, MON)] == ["x"]
    assert [m["id"] for m in effective_day(p, MON + timedelta(7))] == ["a"]

def test_choice_priority_date_over_default_over_first():
    p = profile(choices={"defaults": {"a": {"option": 1, "lines": {}}},
                         "dates": {"2026-11-09": {"a": {"option": 2, "lines": {}}}}})
    assert choice_for(p, MON, "a")["option"] == 2
    assert choice_for(p, MON + timedelta(7), "a")["option"] == 1
    assert choice_for(p, MON, "zzz") == {"option": 0, "lines": {}}

def test_resolve_meal_picks_option_and_line_alt():
    m = meal("a", "13:00", [[line("Pasta", "Riso"), line("Verdure")], [line("Legumi")]])
    r = resolve_meal(m, {"option": 0, "lines": {"0": 1}})
    assert [i["food"] for i in r["items"]] == ["Riso", "Verdure"]

def test_resolve_meal_out_of_range_falls_back_to_zero():
    m = meal("a", "13:00", [[line("Pasta", "Riso")]])
    r = resolve_meal(m, {"option": 5, "lines": {"0": 9, "7": 1}})
    assert r["option"] == 0 and [i["food"] for i in r["items"]] == ["Pasta"]

def test_current_and_next():
    p = profile(week={"0": [meal("c", "07:30", [[line("Latte")]]), meal("s", None, [[line("Mela")]]),
                            meal("p", "13:00", [[line("Pasta")]])],
                      "1": [meal("c2", "07:00", [[line("Yogurt")]])]})
    tz = dt_util.DEFAULT_TIME_ZONE
    cur, nxt = current_and_next(p, datetime(2026, 11, 9, 7, 0, tzinfo=tz))
    assert cur is None and nxt["id"] == "c"
    cur, nxt = current_and_next(p, datetime(2026, 11, 9, 10, 0, tzinfo=tz))
    assert cur["id"] == "c" and nxt["id"] == "p"
    cur, nxt = current_and_next(p, datetime(2026, 11, 9, 23, 0, tzinfo=tz))
    assert cur["id"] == "p" and nxt["id"] == "c2"
```

(`profile(**kw)` = helper nel test che riempie i default del data model con le 7 chiavi `week`.)

Run: `pytest tests/test_model_day.py -v` → FAIL.
- [ ] **Step 2:** Implementa le quattro funzioni in `model.py`. Indici in `choice["lines"]` sono stringhe (JSON). "Prossimo" cerca oggi dopo `now`, poi i giorni successivi fino a 7.
- [ ] **Step 3:** `pytest tests/test_model_day.py -v` → PASS.
- [ ] **Step 4:** Commit `feat: day resolution and alternatives logic`.

### Task 3: Aggregazione spesa (`model.py`)

**Files:**
- Modify: `custom_components/shared_diet/model.py`
- Test: `tests/test_model_shopping.py`

**Interfaces:**
- Consumes: `effective_day`, `choice_for`, `resolve_meal` (Task 2).
- Produces: `shopping_items(profiles: list[dict], start: date, end: date) -> list[str]` - estremi inclusi, ordinate alfabeticamente per nome normalizzato.

- [ ] **Step 1: Test fallisce**

```python
def test_sums_same_food_normalized_across_profiles_and_days():
    # Luca: Pasta integrale 80 g lun+mar; Anna: " pasta integrale " 100 g lun
    assert "Pasta integrale - 260 g" in shopping_items([luca, anna], MON, MON + timedelta(1))

def test_different_units_stay_separate():
    assert set(shopping_items([p_latte_ml_and_pz], MON, MON)) >= {"Latte - 200 ml", "Latte - 1 pz"}

def test_no_qty_listed_once_without_total():
    # due righe "Sale" qty None note "q.b."
    assert shopping_items([p_sale_twice], MON, MON).count("Sale (q.b.)") == 1

def test_no_qty_dropped_when_same_food_has_numeric_qty():
    assert shopping_items([p_olio_qb_and_10ml], MON, MON) == ["Olio - 10 ml"]

def test_uses_chosen_alternative_and_exception():
    # scelta default "Riso" su lunedì, eccezione martedì con Pizza
    items = shopping_items([p_with_choice_and_exception], MON, MON + timedelta(1))
    assert "Riso - 80 g" in items and "Pizza - 1 pz" in items and not any(i.startswith("Pasta") for i in items)

def test_decimal_qty_formatting():
    assert "Olio - 7.5 ml" in shopping_items([p_olio_2_5_x3], MON, MON)
```

Run: `pytest tests/test_model_shopping.py -v` → FAIL.
- [ ] **Step 2:** Implementa `shopping_items`. Chiave = `(food.strip().casefold(), unit.strip())`; nome mostrato = prima grafia vista (strip). Righe senza qty: `"<Nome> (<note>)"` o solo `"<Nome>"` se nota vuota, una per alimento normalizzato, scartate se lo stesso alimento ha una qty numerica. Formato numero: `f"{q:g}"`.
- [ ] **Step 3:** `pytest tests/ -v` → PASS.
- [ ] **Step 4:** Commit `feat: shopping list aggregation`.

### Task 4: Storage con concorrenza (`store.py`)

**Files:**
- Create: `custom_components/shared_diet/store.py`
- Modify: `custom_components/shared_diet/__init__.py` (crea e carica `DietStore`, `entry.runtime_data = store`)
- Test: `tests/test_store.py`

**Interfaces:**
- Produces:
  - `class ConflictError(Exception)`
  - `class DietStore(hass)`: `async_load() -> None`; `profiles -> dict[str, dict]`; `async_create_profile(name: str) -> dict` (uuid hex, `rev=1`, 7 giorni vuoti, reminder default `{"enabled": False, "minutes": 15, "notify": None}`); `async_save_profile(profile: dict) -> dict` (richiede `profile["rev"] == stored rev`, altrimenti `ConflictError`; incrementa `rev`; ritorna il profilo salvato); `async_delete_profile(profile_id: str) -> None`; `async_add_listener(cb: Callable[[], None]) -> Callable[[], None]` (unsubscribe).
  - Il salvataggio usa `Store.async_delay_save(..., 1)`; i listener sono chiamati dopo ogni modifica.

- [ ] **Step 1: Test fallisce**

```python
async def test_create_save_and_reload(hass, hass_storage):
    s = DietStore(hass); await s.async_load()
    p = await s.async_create_profile("Luca")
    p["name"] = "Luca S."
    saved = await s.async_save_profile(p)
    assert saved["rev"] == 2
    await hass.async_block_till_done()  # + flush delayed save
    s2 = DietStore(hass); await s2.async_load()
    assert s2.profiles[p["id"]]["name"] == "Luca S."

async def test_stale_rev_raises_conflict(hass):
    s = DietStore(hass); await s.async_load()
    p = await s.async_create_profile("Anna")
    a, b = dict(p), dict(p)
    await s.async_save_profile(a)
    with pytest.raises(ConflictError):
        await s.async_save_profile(b)

async def test_listener_called_on_change(hass):
    s = DietStore(hass); await s.async_load()
    calls = []; unsub = s.async_add_listener(lambda: calls.append(1))
    await s.async_create_profile("X"); unsub(); await s.async_create_profile("Y")
    assert calls == [1]
```

Run → FAIL.
- [ ] **Step 2:** Implementa `DietStore`. `ponytail:` commento: revisione per profilo intero; granularità per pasto se i conflitti diventano frequenti.
- [ ] **Step 3:** `pytest tests/ -v` → PASS.
- [ ] **Step 4:** Commit `feat: persistent store with optimistic concurrency`.

### Task 5: API websocket (`websocket.py`)

**Files:**
- Create: `custom_components/shared_diet/websocket.py`
- Modify: `__init__.py` (registra i comandi una sola volta)
- Test: `tests/test_websocket.py`

**Interfaces:**
- Consumes: `DietStore`, `ConflictError` (Task 4), `shopping_items` (Task 3).
- Produces (comandi, tutti senza require_admin):
  - `shared_diet/subscribe` → invia subito e a ogni cambio un evento `{"profiles": {...}}`.
  - `shared_diet/create_profile {name}` → `{"profile": ...}`
  - `shared_diet/save_profile {profile}` → `{"profile": ...}` | errore `conflict`
  - `shared_diet/delete_profile {profile_id}` → `{}`
  - `shared_diet/shopping {start, end, profile_ids: list[str] | null, todo_entity_id}` → `{"items": [str]}`; chiama `todo.add_item` (`{"entity_id": todo_entity_id, "item": s}`, `blocking=True`) per ogni riga. `profile_ids` null = tutti.
  - `PROFILE_SCHEMA` (voluptuous) in `websocket.py`: orari `^([01]\d|2[0-3]):[0-5]\d$` o None; `qty` None o ≥ 0; `week` con esattamente chiavi `"0"`–`"6"`; date chiavi `YYYY-MM-DD`; `options` e `alts` non vuoti; `reminder.minutes` 0–240.
  - Validazione spesa: `start <= end`, intervallo ≤ 62 giorni, altrimenti `invalid_format`.

- [ ] **Step 1: Test fallisce**

```python
async def test_non_admin_can_create_and_save(hass, hass_ws_client, hass_read_only_access_token):
    # setup entry; client con utente non admin
    ...
    assert resp["success"] and resp["result"]["profile"]["rev"] == 2

async def test_save_conflict_returns_error(hass, hass_ws_client):
    # salva due volte con lo stesso rev
    assert resp2["error"]["code"] == "conflict"

async def test_invalid_time_rejected(hass, hass_ws_client):
    # meal time "7:5"
    assert resp["error"]["code"] == "invalid_format"

async def test_subscribe_pushes_on_change(hass, hass_ws_client):
    # subscribe, create_profile → evento con il nuovo profilo
    ...

async def test_shopping_adds_to_todo(hass, hass_ws_client):
    calls = async_mock_service(hass, "todo", "add_item")
    # profilo con Pasta 80 g lun, intervallo lun-lun
    assert resp["result"]["items"] == ["Pasta - 80 g"]
    assert calls[0].data == {"entity_id": "todo.spesa", "item": "Pasta - 80 g"}

async def test_shopping_bad_range_rejected(hass, hass_ws_client):
    # end < start, poi range di 63 giorni
    assert resp["error"]["code"] == "invalid_format"
```

Run → FAIL.
- [ ] **Step 2:** Implementa comandi con `@websocket_api.websocket_command` + `@websocket_api.async_response`; `ConflictError` → `connection.send_error(msg["id"], "conflict", "Profilo modificato da un altro utente")`.
- [ ] **Step 3:** `pytest tests/ -v` → PASS.
- [ ] **Step 4:** Commit `feat: websocket api`.

### Task 6: Sensori, tick al minuto, promemoria

**Files:**
- Create: `custom_components/shared_diet/sensor.py`
- Modify: `__init__.py` (forward platform `sensor`; tick con `async_track_time_change(hass, cb, second=0)`; reload entry quando cambia l'insieme degli id profilo)
- Test: `tests/test_sensor.py`

**Interfaces:**
- Consumes: `current_and_next` (Task 2), `DietStore` listener (Task 4).
- Produces: per profilo `sensor.<slug nome>_pasto_attuale` e `sensor.<slug nome>_prossimo_pasto`, `unique_id = f"{profile_id}_current"` / `f"{profile_id}_next"`. Stato = nome pasto o `None` (unknown). Attributi: `time`, `items` (lista `"Nome 80 g"` / `"Nome (q.b.)"`), `option`, `profile_id`, `person`. Si aggiornano al tick e a ogni cambio dello store.
- Promemoria nel tick: per ogni profilo con `reminder.enabled` e `notify`, per i pasti di oggi con orario == `now + minutes` (HH:MM), chiama `notify.<service>` con `title="<Nome profilo>: <Pasto> alle <HH:MM>"`, `message` = items uniti da `", "`. Errore servizio (`ServiceNotFound` ecc.) → `_LOGGER.warning`, continua.

- [ ] **Step 1: Test fallisce** (usa `freezer` per l'ora)

```python
async def test_sensors_reflect_current_and_next(hass, freezer):
    freezer.move_to("2026-11-09 10:00:00")  # profilo "Luca": colazione 07:30, pranzo 13:00
    assert hass.states.get("sensor.luca_pasto_attuale").state == "Colazione"
    assert hass.states.get("sensor.luca_prossimo_pasto").attributes["time"] == "13:00"

async def test_reminder_sent_minutes_before(hass, freezer):
    calls = async_mock_service(hass, "notify", "mobile_app_x")
    # reminder enabled 15 min, pranzo 13:00
    freezer.move_to("2026-11-09 12:45:00"); async_fire_time_changed(hass); await hass.async_block_till_done()
    assert len(calls) == 1 and calls[0].data["title"] == "Luca: Pranzo alle 13:00"

async def test_missing_notify_service_does_not_break(hass, freezer, caplog):
    # notify.non_esiste configurato
    ...
    assert "non_esiste" in caplog.text
    assert hass.states.get("sensor.luca_pasto_attuale").state == "Pranzo"

async def test_adding_profile_creates_entities(hass):
    # create_profile → dopo block_till_done esistono i due sensori del nuovo profilo
```

Run → FAIL.
- [ ] **Step 2:** Implementa. `ponytail:` tick ogni minuto anche senza pasti, schedulare per orario se serve risparmio.
- [ ] **Step 3:** `pytest tests/ -v` → PASS.
- [ ] **Step 4:** Commit `feat: meal sensors and reminders`.

### Task 7: Pannello frontend

**Files:**
- Create: `custom_components/shared_diet/frontend/shared-diet-panel.js`
- Modify: `__init__.py` (static path + pannello)
- Create: `README.md` (installazione HACS, uso, esempio automazione)
- Test: `tests/test_panel.py` + verifica manuale

**Interfaces:**
- Consumes: comandi websocket Task 5 tramite `this.hass.connection.subscribeMessage` / `this.hass.callWS`.
- Produces: static path `/shared_diet_static` → cartella `frontend` (`StaticPathConfig(..., cache_headers=False)`); `panel_custom.async_register_panel(hass, webcomponent_name="shared-diet-panel", frontend_url_path="shared-diet", module_url="/shared_diet_static/shared-diet-panel.js?v=<version>", sidebar_title="Dieta", sidebar_icon="mdi:food-apple", require_admin=False)`; rimosso con `frontend.async_remove_panel` all'unload.

- [ ] **Step 1: Test fallisce**

```python
async def test_panel_registered(hass):
    # setup entry
    assert "shared-diet" in hass.data["frontend_panels"]
    assert hass.data["frontend_panels"]["shared-diet"].require_admin is False
```

- [ ] **Step 2:** Registrazione panel/static path → test PASS.
- [ ] **Step 3:** Web component vanilla (`customElements.define("shared-diet-panel", ...)`), proprietà `hass`, `narrow`. Layout mobile-first, testi italiani. Viste (tab):
  - **Oggi**: selettore profilo; pasti del giorno effettivo risolti con la scelta; link "vedi alternative".
  - **Settimana**: Lun–Dom; aggiungi/rimuovi/riordina pasti; nome, orario opzionale; opzioni A/B…; righe con alimento, qty, unità, nota; "OPPURE" su riga. Campo alimento con `<datalist>` dei nomi già usati in tutti i profili.
  - **Date**: scegli data → "crea eccezione" (copia del giorno con stessi `meal.id`) / modifica / elimina eccezione.
  - **Scelte**: intervallo da–a; per ogni pasto con alternative: default schema + ritocco per data.
  - **Spesa**: intervallo, profili (checkbox, default tutti), entità `todo.*` (select da `hass.states`), anteprima e invio.
  - **Profili**: crea/rinomina/elimina (conferma), persona collegata (select `person.*`), promemoria (on/off, minuti, servizio notify da `hass.services.notify`).
  - Ogni salvataggio invia il profilo intero con il suo `rev`; errore `conflict` → avviso "Modificato da un altro utente, dati ricaricati" e si usano i dati della subscribe.
- [ ] **Step 4: Verifica manuale** in un HA di sviluppo (`hass -c config` con la cartella linkata): da utente non admin sul telefono (o DevTools mobile 390px) crea profilo, compila una settimana con alternative, crea eccezione, fai scelte, genera spesa in `todo.shopping_list`; apri due browser e verifica che le modifiche compaiano nell'altro e che un salvataggio concorrente mostri l'avviso.
- [ ] **Step 5:** `pytest tests/ -v` → PASS. Commit `feat: sidebar panel`.
