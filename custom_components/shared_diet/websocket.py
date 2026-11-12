"""Websocket API for shared_diet. No admin requirement: the panel is open to every HA user."""

from __future__ import annotations

import math
import re
from datetime import date
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN
from .model import fold_name, shopping_items
from .store import ConflictError, DietStore, DuplicateNameError, InUseError, LimitError, UnknownRecipeError

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
    {vol.Required("type"): "shared_diet/create_profile", vol.Required("name"): NON_EMPTY}
)
@websocket_api.async_response
async def ws_create_profile(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _store(hass, connection, msg)
    if store is None:
        return
    try:
        profile = await store.async_create_profile(msg["name"])
    except LimitError as err:
        connection.send_error(msg["id"], "limit", f"Massimo {err.args[0]} profili")
        return
    connection.send_result(msg["id"], {"profile": profile})


@websocket_api.websocket_command(
    {vol.Required("type"): "shared_diet/save_profile", vol.Required("profile"): PROFILE_SCHEMA}
)
@websocket_api.async_response
async def ws_save_profile(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _store(hass, connection, msg)
    if store is None:
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
        # Without a todo entity nothing is added: the call only previews the items.
        vol.Optional("todo_entity_id"): _pattern(r"todo\.[a-z0-9_]+"),
        vol.Optional("exclude", default=[]): _capped([str], MAX_EXCLUDE),
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

    items = shopping_items(selected, start, end, data["recipes"])
    if "todo_entity_id" not in msg:
        connection.send_result(msg["id"], {"items": items})
        return
    excluded = set(msg["exclude"])
    items = [text for text in items if text not in excluded]
    try:
        for text in items:
            # The caller's context makes HA enforce their own permission on the todo entity.
            await hass.services.async_call(
                "todo",
                "add_item",
                {"entity_id": msg["todo_entity_id"], "item": text},
                blocking=True,
                context=connection.context(msg),
            )
    except Unauthorized:
        connection.send_error(msg["id"], "unauthorized", "Non hai i permessi su questa lista")
        return
    connection.send_result(msg["id"], {"items": items})


COMMANDS = (
    ws_subscribe,
    ws_create_profile,
    ws_save_profile,
    ws_delete_profile,
    ws_create_recipe,
    ws_save_recipe,
    ws_delete_recipe,
    ws_shopping,
)


@callback
def async_register(hass: HomeAssistant) -> None:
    for command in COMMANDS:
        websocket_api.async_register_command(hass, command)
