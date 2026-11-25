"""Websocket API for shared_diet. The panel is open to every HA user; a non-admin may only change their own profile."""

from __future__ import annotations

import math
import re
from datetime import date
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.auth.permissions.const import POLICY_CONTROL
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN
from .model import category_for, fold_name, food_of, shopping_items, shopping_text
from .todo import UNIQUE_ID as SHOPPING_UNIQUE_ID
from .store import (
    MAX_CATEGORIES,
    MAX_PROFILES,
    ConflictError,
    DietStore,
    DuplicateNameError,
    InUseError,
    LimitError,
    UnknownRecipeError,
)

MAX_SPAN_DAYS = 62
# Cardinality caps: resolving a meal costs lines x recipe ingredients, so every list needs a bound.
MAX_ALTS = 10  # per ingredient and per line
MAX_INGREDIENTS = 40  # per recipe
MAX_LINES = 30  # per option
MAX_OPTIONS = 10  # per meal
MAX_MEALS = 12  # per day
MAX_DATES = 400  # exception dates and per-date choices
MAX_KEYS = 200  # other id-keyed maps (choice defaults, recipe overrides)
MAX_EXCLUDE = 1000  # shopping rows left out of the todo list
MAX_ROW_LEN = 1000  # characters per excluded row
MAX_SHOP_QTY = 100_000  # edited shopping quantity: keeps "Nome - <qty:g> unità" out of exponent notation
_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}", re.ASCII)


def _pattern(pattern: str):
    rx = re.compile(pattern, re.ASCII)

    def check(value: Any) -> str:
        if not isinstance(value, str) or rx.fullmatch(value) is None:
            raise vol.Invalid(f"must match {pattern}")
        return value

    return check


def _iso_date(value: Any) -> str:
    if not isinstance(value, str) or _DATE_RE.fullmatch(value) is None:
        raise vol.Invalid("expected YYYY-MM-DD")
    try:
        date.fromisoformat(value)
    except ValueError as err:
        raise vol.Invalid("invalid date") from err
    return value


def _int(minimum: int, maximum: int | None = None):
    def check(value: Any) -> int:
        if type(value) is not int:  # rejects bool and floats
            raise vol.Invalid("expected integer")
        return value

    return vol.All(check, vol.Range(min=minimum, max=maximum))


def _qty(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise vol.Invalid("expected number")
    try:
        number = float(value)  # huge ints overflow here
    except OverflowError as err:
        raise vol.Invalid("expected number") from err
    if not math.isfinite(number) or number < 0:
        raise vol.Invalid("expected number >= 0")
    return number


def _unique_ids(ingredients: list) -> list:
    ids = [i["id"] for i in ingredients]
    alt_ids = [a["id"] for i in ingredients for a in i["alts"]]
    if len(set(ids)) != len(ids) or len(set(alt_ids)) != len(alt_ids):
        raise vol.Invalid("ingredient and alternative ids must be unique")
    return ingredients


def _nonnull_qty(value: Any) -> float:
    if value is None:
        raise vol.Invalid("expected number >= 0")
    return _qty(value)


NON_EMPTY = vol.All(str, vol.Length(min=1))


def _capped(validator, maximum: int):
    return vol.All(validator, vol.Length(max=maximum))


def _recipe_name(value: Any) -> str:
    if not isinstance(value, str) or not fold_name(value):
        raise vol.Invalid("expected a non-blank name")
    return value


RECIPE_NAME = vol.All(str, _recipe_name)
CATEGORY_NAME = vol.All(str, vol.Strip, vol.Length(max=40), _recipe_name)
TIME = _pattern(r"([01]\d|2[0-3]):[0-5]\d")
PERSON = vol.Any(None, _pattern(r"person\.[a-z0-9_]+"))
NOTIFY = vol.Any(None, _pattern(r"notify\.[a-z0-9_]+"))
# The panel keys plain JS objects by meal id: a leading "_" would allow "__proto__".
MEAL_ID = _pattern(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")

ITEM = {
    vol.Required("food"): NON_EMPTY,
    vol.Required("qty"): _qty,
    vol.Required("unit"): str,
    vol.Required("note"): str,
}
ITEM_OR_RECIPE = vol.Any(ITEM, {vol.Required("recipe"): NON_EMPTY})
ALT = {
    vol.Required("id"): NON_EMPTY,
    vol.Required("food"): NON_EMPTY,
    vol.Required("qty"): _qty,
    vol.Required("unit"): str,
}
INGREDIENT = {
    vol.Required("id"): NON_EMPTY,
    vol.Required("alts"): vol.All([ALT], vol.Length(min=1, max=MAX_ALTS)),
}
RECIPE_SCHEMA = vol.Schema(
    {
        vol.Required("id"): NON_EMPTY,
        vol.Required("name"): RECIPE_NAME,
        vol.Required("note"): str,
        vol.Required("ingredients"): vol.All([INGREDIENT], vol.Length(max=MAX_INGREDIENTS), _unique_ids),
        vol.Required("rev"): _int(1),
    },
    extra=vol.PREVENT_EXTRA,
)
LINE = {vol.Required("alts"): vol.All([ITEM_OR_RECIPE], vol.Length(min=1, max=MAX_ALTS))}
MEAL = {
    vol.Required("id"): MEAL_ID,
    vol.Required("name"): NON_EMPTY,
    vol.Required("time"): vol.Any(None, TIME),
    vol.Optional("remind"): bool,  # False: no reminder for this meal; absent means on
    # Profiles this meal is eaten with: None/absent = everyone, [] = nobody. Ids are not checked (profiles change in parallel).
    vol.Optional("shared_with"): vol.Any(None, _capped([NON_EMPTY], MAX_PROFILES)),
    vol.Required("options"): vol.All([_capped([LINE], MAX_LINES)], vol.Length(min=1, max=MAX_OPTIONS)),
}
DAY = _capped([MEAL], MAX_MEALS)
CHOICE = {
    vol.Required("option"): _int(0),
    vol.Required("lines"): _capped({_pattern(r"\d+"): _int(0)}, MAX_LINES),
    vol.Optional("recipes"): _capped({NON_EMPTY: _capped({NON_EMPTY: NON_EMPTY}, MAX_INGREDIENTS)}, MAX_KEYS),
}
CHOICES_BY_MEAL = _capped({NON_EMPTY: CHOICE}, MAX_KEYS)
PROFILE_SCHEMA = vol.Schema(
    {
        vol.Required("id"): NON_EMPTY,
        vol.Required("name"): NON_EMPTY,
        # Sent back by the panel's merge after a conflict; ignored: the store keeps the owner it has.
        vol.Optional("user_id"): vol.Any(None, str),
        vol.Required("person"): PERSON,
        vol.Required("reminder"): {
            vol.Required("enabled"): bool,
            vol.Required("minutes"): _int(0, 240),
            vol.Required("notify"): NOTIFY,
        },
        vol.Required("week"): {vol.Required(str(d)): DAY for d in range(7)},
        vol.Required("exceptions"): _capped({_iso_date: DAY}, MAX_DATES),
        vol.Required("choices"): {
            vol.Required("defaults"): CHOICES_BY_MEAL,
            vol.Required("dates"): _capped({_iso_date: CHOICES_BY_MEAL}, MAX_DATES),
        },
        vol.Optional("recipe_qty", default=dict): _capped(
            {NON_EMPTY: _capped({NON_EMPTY: _nonnull_qty}, MAX_INGREDIENTS * MAX_ALTS)}, MAX_KEYS
        ),
        vol.Required("rev"): _int(1),
    },
    extra=vol.PREVENT_EXTRA,
)


def _store(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> DietStore | None:
    store = hass.data.get(DOMAIN)
    if store is None:
        connection.send_error(msg["id"], "not_loaded", "Integrazione non caricata")
    return store


@websocket_api.websocket_command({vol.Required("type"): "shared_diet/subscribe"})
@websocket_api.async_response
async def ws_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _store(hass, connection, msg)
    if store is None:
        return
    # Each subscription is pushed the whole store on every commit: one per connection is all the panel needs.
    if any(getattr(unsub, "shared_diet", False) for unsub in connection.subscriptions.values()):
        connection.send_error(msg["id"], "already_subscribed", "Già sottoscritto")
        return

    @callback
    def push() -> None:
        connection.send_message(websocket_api.event_message(msg["id"], store.snapshot()))

    unsub = store.async_add_listener(push)
    unsub.shared_diet = True
    connection.subscriptions[msg["id"]] = unsub
    connection.send_result(msg["id"])
    push()


@websocket_api.websocket_command(
    {vol.Required("type"): "shared_diet/save_profile", vol.Required("profile"): PROFILE_SCHEMA}
)
@websocket_api.async_response
async def ws_save_profile(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _store(hass, connection, msg)
    if store is None:
        return
    current = store.profile(msg["profile"]["id"])
    if current is not None and not connection.user.is_admin and current["user_id"] != connection.user.id:
        connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "Puoi modificare solo il tuo profilo")
        return
    try:
        profile = await store.async_save_profile(msg["profile"])
    except KeyError:
        connection.send_error(msg["id"], "not_found", "Profilo non trovato")
        return
    except UnknownRecipeError:
        connection.send_error(
            msg["id"],
            "invalid_format",
            "Una ricetta del pasto è stata eliminata: usa «Usa alimento semplice»",
        )
        return
    except ConflictError:
        connection.send_error(msg["id"], "conflict", "Profilo modificato da un altro utente")
        return
    connection.send_result(msg["id"], {"profile": profile})


@websocket_api.websocket_command(
    {vol.Required("type"): "shared_diet/delete_profile", vol.Required("profile_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete_profile(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _store(hass, connection, msg)
    if store is None:
        return
    await store.async_delete_profile(msg["profile_id"])
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {vol.Required("type"): "shared_diet/create_recipe", vol.Required("name"): RECIPE_NAME}
)
@websocket_api.async_response
async def ws_create_recipe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _store(hass, connection, msg)
    if store is None:
        return
    try:
        recipe = await store.async_create_recipe(msg["name"])
    except DuplicateNameError:
        connection.send_error(msg["id"], "duplicate_name", "Esiste già una ricetta con questo nome")
        return
    connection.send_result(msg["id"], {"recipe": recipe})


@websocket_api.websocket_command(
    {vol.Required("type"): "shared_diet/save_recipe", vol.Required("recipe"): RECIPE_SCHEMA}
)
@websocket_api.async_response
async def ws_save_recipe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _store(hass, connection, msg)
    if store is None:
        return
    try:
        recipe = await store.async_save_recipe(msg["recipe"])
    except KeyError:
        connection.send_error(msg["id"], "not_found", "Ricetta non trovata")
        return
    except ConflictError:
        connection.send_error(msg["id"], "conflict", "Ricetta modificata da un altro utente")
        return
    except DuplicateNameError:
        connection.send_error(msg["id"], "duplicate_name", "Esiste già una ricetta con questo nome")
        return
    connection.send_result(msg["id"], {"recipe": recipe})


@websocket_api.websocket_command(
    {vol.Required("type"): "shared_diet/delete_recipe", vol.Required("recipe_id"): str}
)
@websocket_api.async_response
async def ws_delete_recipe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _store(hass, connection, msg)
    if store is None:
        return
    try:
        await store.async_delete_recipe(msg["recipe_id"])
    except InUseError as err:
        connection.send_error(msg["id"], "in_use", str(err))
        return
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "shared_diet/shopping",
        vol.Required("start"): cv.date,
        vol.Required("end"): cv.date,
        vol.Required("profile_ids"): vol.Any(None, [str]),
        # True: the rows are added to the family shopping list (todo entity); otherwise only previewed.
        vol.Optional("add", default=False): bool,
        vol.Optional("exclude", default=[]): _capped([_capped(str, MAX_ROW_LEN)], MAX_EXCLUDE),
        # Quantities edited in the panel, by row text: the row is added with this quantity instead (rows with one only).
        vol.Optional("qty", default=dict): _capped(
            {_capped(str, MAX_ROW_LEN): vol.All(_nonnull_qty, vol.Range(min=0, min_included=False, max=MAX_SHOP_QTY))}, MAX_EXCLUDE
        ),
    }
)
@websocket_api.async_response
async def ws_shopping(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _store(hass, connection, msg)
    if store is None:
        return
    start, end = msg["start"], msg["end"]
    if start > end or (end - start).days + 1 > MAX_SPAN_DAYS:
        connection.send_error(msg["id"], "invalid_format", "Intervallo non valido")
        return

    data = store.snapshot()
    profiles = data["profiles"]
    if msg["profile_ids"] is None:
        selected = list(profiles.values())
    else:
        if any(pid not in profiles for pid in msg["profile_ids"]):
            connection.send_error(msg["id"], "not_found", "Profilo non trovato")
            return
        selected = [profiles[pid] for pid in dict.fromkeys(msg["profile_ids"])]

    items = shopping_items(selected, start, end, data["recipes"], data["categories"], data["food_categories"])
    position = {cid: i for i, cid in enumerate(store.category_order(connection.user.id))}
    items.sort(key=lambda row: position[row["category"]])  # stable: by name within a category
    if msg["add"]:
        # Same right HA's todo services ask for: a read-only user cannot fill the family list.
        entity_id = er.async_get(hass).async_get_entity_id("todo", DOMAIN, SHOPPING_UNIQUE_ID)
        if entity_id is None or not connection.user.permissions.check_entity(entity_id, POLICY_CONTROL):
            connection.send_error(msg["id"], "unauthorized", "Non hai i permessi sulla lista della spesa")
            return
        excluded = set(msg["exclude"])
        items = [row for row in items if row["text"] not in excluded]
        edited = msg["qty"]
        for row in items:
            if row["qty"] is not None and row["text"] in edited:
                row["qty"] = edited[row["text"]]
                row["text"] = shopping_text(row["food"], row["qty"], row["unit"])
        await store.async_add_shopping([row["text"] for row in items])
    connection.send_result(msg["id"], {"items": items})


_DUPLICATE_CATEGORY = "Esiste già una categoria con questo nome"


@websocket_api.websocket_command(
    {vol.Required("type"): "shared_diet/create_category", vol.Required("name"): CATEGORY_NAME}
)
@websocket_api.async_response
async def ws_create_category(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _store(hass, connection, msg)
    if store is None:
        return
    try:
        category = await store.async_create_category(msg["name"])
    except DuplicateNameError:
        connection.send_error(msg["id"], "duplicate_name", _DUPLICATE_CATEGORY)
        return
    except LimitError:
        connection.send_error(msg["id"], "invalid_format", f"Massimo {MAX_CATEGORIES} categorie")
        return
    connection.send_result(msg["id"], {"category": category})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "shared_diet/rename_category",
        vol.Required("category_id"): str,
        vol.Required("name"): CATEGORY_NAME,
    }
)
@websocket_api.async_response
async def ws_rename_category(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _store(hass, connection, msg)
    if store is None:
        return
    try:
        await store.async_rename_category(msg["category_id"], msg["name"])
    except KeyError:
        connection.send_error(msg["id"], "not_found", "Categoria non trovata")
        return
    except DuplicateNameError:
        connection.send_error(msg["id"], "duplicate_name", _DUPLICATE_CATEGORY)
        return
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {vol.Required("type"): "shared_diet/delete_category", vol.Required("category_id"): str}
)
@websocket_api.async_response
async def ws_delete_category(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _store(hass, connection, msg)
    if store is None:
        return
    try:
        await store.async_delete_category(msg["category_id"])
    except KeyError:
        connection.send_error(msg["id"], "not_found", "Categoria non trovata")
        return
    except ValueError:
        connection.send_error(msg["id"], "invalid_format", "Questa categoria non si può eliminare: raccoglie gli alimenti senza categoria")
        return
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "shared_diet/set_food_category",
        vol.Required("food"): _capped(NON_EMPTY, MAX_ROW_LEN),
        vol.Required("category_id"): vol.Any(None, str),  # None: back to the automatic category
    }
)
@websocket_api.async_response
async def ws_set_food_category(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _store(hass, connection, msg)
    if store is None:
        return
    try:
        await store.async_set_food_category(msg["food"], msg["category_id"])
    except KeyError:
        connection.send_error(msg["id"], "not_found", "Categoria non trovata")
        return
    except ValueError:
        connection.send_error(msg["id"], "invalid_format", "Alimento non valido")
        return
    except LimitError:
        connection.send_error(msg["id"], "invalid_format", "Troppe categorie personalizzate per gli alimenti")
        return
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command({vol.Required("type"): "shared_diet/get_category_order"})
@websocket_api.async_response
async def ws_get_category_order(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _store(hass, connection, msg)
    if store is None:
        return
    connection.send_result(msg["id"], {"order": store.category_order(connection.user.id)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "shared_diet/set_category_order",
        vol.Required("order"): _capped([str], MAX_KEYS),
    }
)
@websocket_api.async_response
async def ws_set_category_order(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _store(hass, connection, msg)
    if store is None:
        return
    try:
        order = await store.async_set_category_order(connection.user.id, msg["order"])
    except KeyError:
        connection.send_error(msg["id"], "invalid_format", "Categoria sconosciuta")
        return
    connection.send_result(msg["id"], {"order": order})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "shared_diet/categorize",
        vol.Required("texts"): _capped([_capped(str, MAX_ROW_LEN)], MAX_EXCLUDE),
    }
)
@websocket_api.async_response
async def ws_categorize(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Category of each todo item text (shopping rows or items typed by hand), for the panel's Lista tab."""
    store = _store(hass, connection, msg)
    if store is None:
        return
    data = store.snapshot()
    categories = [category_for(food_of(t), data["categories"], data["food_categories"]) for t in msg["texts"]]
    connection.send_result(msg["id"], {"categories": categories})


COMMANDS = (
    ws_subscribe,
    ws_save_profile,
    ws_delete_profile,
    ws_create_recipe,
    ws_save_recipe,
    ws_delete_recipe,
    ws_shopping,
    ws_create_category,
    ws_rename_category,
    ws_delete_category,
    ws_set_food_category,
    ws_get_category_order,
    ws_set_category_order,
    ws_categorize,
)


@callback
def async_register(hass: HomeAssistant) -> None:
    for command in COMMANDS:
        websocket_api.async_register_command(hass, command)
