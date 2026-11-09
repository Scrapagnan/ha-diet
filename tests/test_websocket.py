"""Websocket API for shared_diet: non-admin access, validation, and behaviour."""

from datetime import date, timedelta

import pytest
import voluptuous as vol
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_mock_service,
)

from custom_components.shared_diet.const import DOMAIN
from custom_components.shared_diet.websocket import _qty

CLIENT_ID = "https://example.com/shared-diet-test"
MONDAY = date(2026, 11, 9)


def item(food, qty, unit="g", note=""):
    return {"food": food, "qty": qty, "unit": unit, "note": note}


def meal(meal_id, time, options):
    return {"id": meal_id, "name": meal_id.title(), "time": time, "options": options}


def full_profile(base):
    """A profile exercising every field of the data model."""
    lunch = meal(
        "lunch",
        "12:30",
        [
            [
                {"alts": [item("Pasta integrale", 80.0), item("Riso", 70.0)]},
                {"alts": [item("Olio", None, "", "q.b.")]},
            ],
            [{"alts": [item("Insalata", 200.0)]}],
        ],
    )
    snack = meal("snack", None, [[{"alts": [item("Frutta", 1.0, "pz")]}]])
    return {
        **base,
        "person": "person.luca",
        "reminder": {"enabled": True, "minutes": 15, "notify": "notify.mobile_app_x"},
        "week": {str(d): ([lunch, snack] if d == 0 else []) for d in range(7)},
        "exceptions": {"2026-11-18": [lunch]},
        "choices": {
            "defaults": {"lunch": {"option": 1, "lines": {}}},
            "dates": {
                "2026-11-18": {"lunch": {"option": 0, "lines": {"0": 1}}},
            },
        },
    }


async def call(client, command, **data):
    await client.send_json_auto_id({"type": f"shared_diet/{command}", **data})
    return await client.receive_json()


async def _non_admin_client(hass, hass_ws_client):
    user = await hass.auth.async_create_user("Kid", group_ids=["system-users"])
    assert user.is_admin is False
    refresh = await hass.auth.async_create_refresh_token(user, CLIENT_ID)
    token = hass.auth.async_create_access_token(refresh)
    return await hass_ws_client(hass, token)


@pytest.fixture
async def setup_entry(hass):
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


@pytest.fixture
async def client(hass, hass_ws_client, setup_entry):
    """Every test runs as a non-admin user, the way the panel is used."""
    return await _non_admin_client(hass, hass_ws_client)


async def test_non_admin_can_create_and_save(client):
    resp = await call(client, "create_profile", name="Luca")
    assert resp["success"], resp
    profile = resp["result"]["profile"]
    profile["name"] = "Luca S."
    resp = await call(client, "save_profile", profile=profile)
    assert resp["success"] and resp["result"]["profile"]["rev"] == 2


async def test_save_conflict_returns_error(client):
    profile = (await call(client, "create_profile", name="Anna"))["result"]["profile"]
    assert (await call(client, "save_profile", profile=profile))["success"]
    resp = await call(client, "save_profile", profile=profile)  # stale rev 1
    assert resp["success"] is False
    assert resp["error"]["code"] == "conflict"
    assert resp["error"]["message"] == "Profilo modificato da un altro utente"


async def test_invalid_time_rejected(client):
    profile = full_profile((await call(client, "create_profile", name="Luca"))["result"]["profile"])
    profile["week"]["0"][0]["time"] = "7:5"
    resp = await call(client, "save_profile", profile=profile)
    assert resp["error"]["code"] == "invalid_format"


async def test_full_valid_profile_is_accepted(client):
    profile = full_profile((await call(client, "create_profile", name="Luca"))["result"]["profile"])
    resp = await call(client, "save_profile", profile=profile)
    assert resp["success"], resp
    assert resp["result"]["profile"]["rev"] == 2


@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(lambda p: p["week"].pop("6"), id="week-missing-day"),
        pytest.param(lambda p: p["week"].update({"7": []}), id="week-extra-day"),
        pytest.param(lambda p: p["exceptions"].update({"2026-02-30": []}), id="impossible-date"),
        pytest.param(lambda p: p["exceptions"].update({"2026-1-5": []}), id="date-not-padded"),
        pytest.param(lambda p: p["week"]["0"][0].update({"options": []}), id="no-options"),
        pytest.param(lambda p: p["week"]["0"][0]["options"][0][0].update({"alts": []}), id="no-alts"),
        pytest.param(lambda p: p["week"]["0"][0]["options"][0][0]["alts"][0].update({"qty": -1}), id="negative-qty"),
        pytest.param(lambda p: p["week"]["0"][0]["options"][0][0]["alts"][0].update({"qty": True}), id="bool-qty"),
        pytest.param(lambda p: p["reminder"].update({"minutes": 241}), id="reminder-too-long"),
        pytest.param(lambda p: p["reminder"].update({"notify": "light.x"}), id="notify-wrong-domain"),
        pytest.param(lambda p: p.update({"person": "luca"}), id="person-wrong-domain"),
        pytest.param(lambda p: p.update({"rev": 0}), id="rev-zero"),
        pytest.param(lambda p: p.update({"name": ""}), id="empty-name"),
        pytest.param(lambda p: p.update({"hacked": True}), id="extra-key"),
        pytest.param(lambda p: p["choices"]["defaults"].update({"lunch": {"option": -1, "lines": {}}}), id="negative-option"),
        pytest.param(lambda p: p["choices"]["defaults"].update({"lunch": {"option": 0, "lines": {"x": 0}}}), id="bad-line-key"),
    ],
)
async def test_invalid_profile_rejected(client, mutate):
    profile = full_profile((await call(client, "create_profile", name="Luca"))["result"]["profile"])
    mutate(profile)
    resp = await call(client, "save_profile", profile=profile)
    assert resp["error"]["code"] == "invalid_format"


async def test_save_unknown_profile_not_found(client):
    profile = full_profile((await call(client, "create_profile", name="Luca"))["result"]["profile"])
    profile["id"] = "does-not-exist"
    resp = await call(client, "save_profile", profile=profile)
    assert resp["error"]["code"] == "not_found"


async def test_delete_profile(client):
    profile = (await call(client, "create_profile", name="Tom"))["result"]["profile"]
    resp = await call(client, "delete_profile", profile_id=profile["id"])
    assert resp["success"] and resp["result"] == {}


async def test_subscribe_pushes_on_change(client):
    await client.send_json_auto_id({"type": "shared_diet/subscribe"})
    assert (await client.receive_json())["success"]
    event = await client.receive_json()
    assert event["type"] == "event" and event["event"] == {"profiles": {}}

    await client.send_json_auto_id({"type": "shared_diet/create_profile", "name": "Ana"})
    msgs = [await client.receive_json(), await client.receive_json()]
    pushed = next(m for m in msgs if m["type"] == "event")
    created = next(m for m in msgs if m["type"] == "result")["result"]["profile"]
    assert pushed["event"]["profiles"] == {created["id"]: created}


async def test_shopping_adds_to_todo(hass, client):
    calls = async_mock_service(hass, "todo", "add_item")
    profile = (await call(client, "create_profile", name="Luca"))["result"]["profile"]
    profile["week"]["0"] = [meal("pasta", "12:00", [[{"alts": [item("Pasta", 80.0)]}]])]
    assert (await call(client, "save_profile", profile=profile))["success"]

    resp = await call(
        client,
        "shopping",
        start=MONDAY.isoformat(),
        end=MONDAY.isoformat(),
        profile_ids=None,
        todo_entity_id="todo.spesa",
    )
    assert resp["result"]["items"] == ["Pasta — 80 g"]
    assert len(calls) == 1
    assert calls[0].data == {"entity_id": "todo.spesa", "item": "Pasta — 80 g"}


async def test_shopping_bad_range_rejected(client):
    base = {"profile_ids": None, "todo_entity_id": "todo.spesa", "start": MONDAY.isoformat()}

    resp = await call(client, "shopping", **base, end=(MONDAY - timedelta(days=1)).isoformat())
    assert resp["error"]["code"] == "invalid_format"

    resp = await call(client, "shopping", **base, end=(MONDAY + timedelta(days=62)).isoformat())
    assert resp["error"]["code"] == "invalid_format"

    resp = await call(client, "shopping", **base, end=(MONDAY + timedelta(days=61)).isoformat())
    assert resp["success"] and resp["result"]["items"] == []


async def test_shopping_rejects_non_todo_entity(client):
    resp = await call(
        client,
        "shopping",
        start=MONDAY.isoformat(),
        end=MONDAY.isoformat(),
        profile_ids=None,
        todo_entity_id="light.spesa",
    )
    assert resp["error"]["code"] == "invalid_format"


async def test_shopping_unknown_profile_not_found(client):
    resp = await call(
        client,
        "shopping",
        start=MONDAY.isoformat(),
        end=MONDAY.isoformat(),
        profile_ids=["does-not-exist"],
        todo_entity_id="todo.spesa",
    )
    assert resp["error"]["code"] == "not_found"


async def test_commands_report_not_loaded_without_entry(hass, hass_ws_client):
    assert await async_setup_component(hass, DOMAIN, {})
    client = await _non_admin_client(hass, hass_ws_client)
    resp = await call(client, "create_profile", name="X")
    assert resp["error"]["code"] == "not_loaded"


def test_huge_int_qty_is_invalid_not_overflow():
    # orjson rejects >64-bit ints on the wire, so this guard is only reachable directly.
    with pytest.raises(vol.Invalid):
        _qty(10**400)
