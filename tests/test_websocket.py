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
from custom_components.shared_diet.store import MAX_PROFILES
from custom_components.shared_diet.websocket import _qty

CLIENT_ID = "https://example.com/shared-diet-test"
MONDAY = date(2026, 11, 9)


def item(food, qty, unit="g", note=""):
    return {"food": food, "qty": qty, "unit": unit, "note": note}


def meal(meal_id, time, options):
    return {"id": meal_id, "name": meal_id.title(), "time": time, "options": options}


def full_profile(base):
    """A profile exercising every field of the data model (as the panel sends it: without user_id)."""
    base = {k: v for k, v in base.items() if k != "user_id"}
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
    snack = {**meal("snack", None, [[{"alts": [item("Frutta", 1.0, "pz")]}]]), "remind": False, "shared_with": []}
    return {
        **base,
        "person": "person.luca",
        "reminder": {"enabled": True, "minutes": 15, "notify": "notify.mobile_app_x"},
        "week": {str(d): ([lunch, snack] if d == 0 else []) for d in range(7)},
        "exceptions": {"2026-11-18": [{**lunch, "shared_with": ["other"]}]},
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


async def _user_client(hass, hass_ws_client, name="Kid", group="system-users"):
    """A websocket client for a new user; `client.store`/`client.user_id` find that user's own profile."""
    user = await hass.auth.async_create_user(name, group_ids=[group])
    assert user.is_admin is (group == "system-admin")
    await hass.async_block_till_done()  # user_added gives the user a profile
    refresh = await hass.auth.async_create_refresh_token(user, CLIENT_ID)
    client = await hass_ws_client(hass, hass.auth.async_create_access_token(refresh))
    client.store, client.user_id = hass.data.get(DOMAIN), user.id
    return client


async def _non_admin_client(hass, hass_ws_client):
    return await _user_client(hass, hass_ws_client)


def own_profile(client):
    """The client's profile as the panel sends it back: without user_id, which only the server sets."""
    profile = next(p for p in client.store.profiles.values() if p["user_id"] == client.user_id)
    del profile["user_id"]
    return profile


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


async def test_non_admin_saves_own_profile(client):
    profile = own_profile(client)
    assert profile["name"] == "Kid"
    profile["name"] = "Luca S."
    resp = await call(client, "save_profile", profile=profile)
    assert resp["success"] and resp["result"]["profile"]["rev"] == 2
    assert resp["result"]["profile"]["user_id"] == client.user_id


async def test_save_conflict_returns_error(client):
    profile = own_profile(client)
    assert (await call(client, "save_profile", profile=profile))["success"]
    resp = await call(client, "save_profile", profile=profile)  # stale rev 1
    assert resp["success"] is False
    assert resp["error"]["code"] == "conflict"
    assert resp["error"]["message"] == "Profilo modificato da un altro utente"


async def test_invalid_time_rejected(client):
    profile = full_profile(own_profile(client))
    profile["week"]["0"][0]["time"] = "7:5"
    resp = await call(client, "save_profile", profile=profile)
    assert resp["error"]["code"] == "invalid_format"


async def test_full_valid_profile_is_accepted(client):
    profile = full_profile(own_profile(client))
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
        pytest.param(lambda p: p["week"]["0"][0].update({"shared_with": "all"}), id="shared-not-list"),
        pytest.param(lambda p: p["week"]["0"][0].update({"shared_with": [""]}), id="shared-empty-id"),
        pytest.param(lambda p: p["week"]["0"][0].update({"shared_with": [1]}), id="shared-non-string"),
        pytest.param(lambda p: p["week"]["0"][0].update({"shared_with": [f"p{k}" for k in range(MAX_PROFILES + 1)]}), id="shared-too-many"),
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
    profile = full_profile(own_profile(client))
    mutate(profile)
    resp = await call(client, "save_profile", profile=profile)
    assert resp["error"]["code"] == "invalid_format"


async def test_save_unknown_profile_not_found(client):
    profile = full_profile(own_profile(client))
    profile["id"] = "does-not-exist"
    resp = await call(client, "save_profile", profile=profile)
    assert resp["error"]["code"] == "not_found"


async def test_only_admin_deletes_profiles(hass, hass_ws_client, client):
    profile = own_profile(client)
    resp = await call(client, "delete_profile", profile_id=profile["id"])
    assert resp["error"]["code"] == "unauthorized"
    admin = await _user_client(hass, hass_ws_client, "Boss", "system-admin")
    resp = await call(admin, "delete_profile", profile_id=profile["id"])
    assert resp["success"] and resp["result"] == {}
    assert profile["id"] not in client.store.profiles


async def test_non_admin_cannot_save_another_profile(hass, hass_ws_client, client):
    other = await _user_client(hass, hass_ws_client, "Anna")
    legacy = await client.store.async_create_profile("Vecchio")  # no user: admin only
    targets = [(own_profile(other), other.user_id), (legacy, None)]
    for target, _ in targets:
        resp = await call(client, "save_profile", profile=full_profile(target))
        assert resp["error"]["code"] == "unauthorized"
    admin = await _user_client(hass, hass_ws_client, "Boss", "system-admin")
    for target, owner in targets:
        resp = await call(admin, "save_profile", profile=full_profile(target))
        assert resp["success"], resp
        assert resp["result"]["profile"]["user_id"] == owner


async def test_client_cannot_change_profile_owner(client):
    """The panel's conflict merge sends user_id back: it is accepted and ignored."""
    resp = await call(client, "save_profile", profile={**own_profile(client), "user_id": "someone-else"})
    assert resp["success"], resp
    assert resp["result"]["profile"]["user_id"] == client.user_id


async def test_profiles_are_not_created_by_hand(client):
    resp = await call(client, "create_profile", name="X")
    assert resp["error"]["code"] == "unknown_command"


async def test_subscribe_pushes_on_change(client):
    await client.send_json_auto_id({"type": "shared_diet/subscribe"})
    assert (await client.receive_json())["success"]
    event = await client.receive_json()
    assert event["type"] == "event" and event["event"] == client.store.snapshot()
    assert set(event["event"]) == {"profiles", "recipes", "categories", "food_categories"}

    await client.send_json_auto_id({"type": "shared_diet/save_profile", "profile": full_profile(own_profile(client))})
    msgs = [await client.receive_json(), await client.receive_json()]
    pushed = next(m for m in msgs if m["type"] == "event")
    saved = next(m for m in msgs if m["type"] == "result")["result"]["profile"]
    assert pushed["event"]["profiles"][saved["id"]] == saved


async def test_shopping_adds_to_todo(hass, client):
    calls = async_mock_service(hass, "todo", "add_item")
    profile = own_profile(client)
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
    assert resp["result"]["items"] == [{"text": "Pasta - 80 g", "food": "Pasta", "category": "pasta_cereali"}]
    assert len(calls) == 1
    assert calls[0].data == {"entity_id": "todo.spesa", "item": "Pasta - 80 g"}


async def test_shopping_preview_and_exclude(hass, client):
    calls = async_mock_service(hass, "todo", "add_item")
    profile = own_profile(client)
    profile["week"]["0"] = [meal("pasta", "12:00", [[{"alts": [item("Pasta", 80.0)]}, {"alts": [item("Olio", 10.0, "ml")]}]])]
    assert (await call(client, "save_profile", profile=profile))["success"]
    base = {"start": MONDAY.isoformat(), "end": MONDAY.isoformat(), "profile_ids": None}

    resp = await call(client, "shopping", **base)  # no todo entity: preview only
    assert [r["text"] for r in resp["result"]["items"]] == ["Pasta - 80 g", "Olio - 10 ml"]  # category order
    assert calls == []

    resp = await call(client, "shopping", **base, todo_entity_id="todo.spesa", exclude=["Olio - 10 ml"])
    assert [r["text"] for r in resp["result"]["items"]] == ["Pasta - 80 g"]
    assert [c.data["item"] for c in calls] == ["Pasta - 80 g"]

    resp = await call(client, "shopping", **base, exclude=["x" * 1001])  # each excluded row is length-capped
    assert not resp["success"]


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
    resp = await call(client, "create_recipe", name="X")
    assert resp["error"]["code"] == "not_loaded"


def test_huge_int_qty_is_invalid_not_overflow():
    # orjson rejects >64-bit ints on the wire, so this guard is only reachable directly.
    with pytest.raises(vol.Invalid):
        _qty(10**400)
