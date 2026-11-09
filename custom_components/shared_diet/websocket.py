"""Websocket API for shared_diet. No admin requirement: the panel is open to every HA user."""

from __future__ import annotations

import math
import re
from datetime import date
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN
from .model import shopping_items
from .store import ConflictError, DietStore

MAX_SPAN_DAYS = 62
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
    if not math.isfinite(value) or value < 0:
        raise vol.Invalid("expected number >= 0")
    return float(value)


NON_EMPTY = vol.All(str, vol.Length(min=1))
TIME = _pattern(r"([01]\d|2[0-3]):[0-5]\d")
PERSON = vol.Any(None, _pattern(r"person\.[a-z0-9_]+"))
NOTIFY = vol.Any(None, _pattern(r"notify\.[a-z0-9_]+"))

ITEM = {
    vol.Required("food"): NON_EMPTY,
    vol.Required("qty"): _qty,
    vol.Required("unit"): str,
    vol.Required("note"): str,
}
LINE = {vol.Required("alts"): vol.All([ITEM], vol.Length(min=1))}
MEAL = {
    vol.Required("id"): NON_EMPTY,
    vol.Required("name"): NON_EMPTY,
    vol.Required("time"): vol.Any(None, TIME),
    vol.Required("options"): vol.All([[LINE]], vol.Length(min=1)),
}
CHOICE = {
    vol.Required("option"): _int(0),
    vol.Required("lines"): {_pattern(r"\d+"): _int(0)},
}
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
        vol.Required("week"): {vol.Required(str(d)): [MEAL] for d in range(7)},
        vol.Required("exceptions"): {_iso_date: [MEAL]},
        vol.Required("choices"): {
            vol.Required("defaults"): {NON_EMPTY: CHOICE},
            vol.Required("dates"): {_iso_date: {NON_EMPTY: CHOICE}},
        },
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

    @callback
    def push() -> None:
        connection.send_message(websocket_api.event_message(msg["id"], {"profiles": store.profiles}))

    connection.subscriptions[msg["id"]] = store.async_add_listener(push)
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
    profile = await store.async_create_profile(msg["name"])
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
    {
        vol.Required("type"): "shared_diet/shopping",
        vol.Required("start"): cv.date,
        vol.Required("end"): cv.date,
        vol.Required("profile_ids"): vol.Any(None, [str]),
        vol.Required("todo_entity_id"): _pattern(r"todo\.[a-z0-9_]+"),
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

    profiles = store.profiles
    if msg["profile_ids"] is None:
        selected = list(profiles.values())
    else:
        if any(pid not in profiles for pid in msg["profile_ids"]):
            connection.send_error(msg["id"], "not_found", "Profilo non trovato")
            return
        selected = [profiles[pid] for pid in dict.fromkeys(msg["profile_ids"])]

    items = shopping_items(selected, start, end)
    for text in items:
        await hass.services.async_call(
            "todo",
            "add_item",
            {"entity_id": msg["todo_entity_id"], "item": text},
            blocking=True,
        )
    connection.send_result(msg["id"], {"items": items})


COMMANDS = (ws_subscribe, ws_create_profile, ws_save_profile, ws_delete_profile, ws_shopping)


@callback
def async_register(hass: HomeAssistant) -> None:
    for command in COMMANDS:
        websocket_api.async_register_command(hass, command)
