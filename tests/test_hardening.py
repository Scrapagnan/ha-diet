"""Regression tests for the run-1 security audit findings (resource bounds, permissions, lifecycle)."""

import copy

import pytest
from homeassistant.components.todo import (
    DATA_COMPONENT,
    DOMAIN as TODO_DOMAIN,
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.setup import async_setup_component

from custom_components.shared_diet import websocket as ws
from custom_components.shared_diet.const import DOMAIN
from custom_components.shared_diet import store as store_mod
from test_websocket import CLIENT_ID, MONDAY, _non_admin_client, call, client, item, meal, setup_entry  # noqa: F401


def _alts(n):
    return [{"id": f"a{k}", "food": f"f{k}", "qty": 1.0, "unit": "g"} for k in range(n)]


async def _recipe(client, ingredients):
    recipe = (await call(client, "create_recipe", name="R"))["result"]["recipe"]
    recipe["ingredients"] = ingredients
    return await call(client, "save_recipe", recipe=recipe)


# --- finding 1: recipe references multiply resolved data -------------------------------------------


async def test_recipe_alternatives_are_capped(client):
    resp = await _recipe(client, [{"id": "i", "alts": _alts(ws.MAX_ALTS + 1)}])
    assert resp["error"]["code"] == "invalid_format"


async def test_recipe_ingredients_are_capped(client):
    ingredients = [
        {"id": f"i{k}", "alts": [{"id": f"a{k}", "food": "f", "qty": 1.0, "unit": "g"}]}
        for k in range(ws.MAX_INGREDIENTS + 1)
    ]
    resp = await _recipe(client, ingredients)
    assert resp["error"]["code"] == "invalid_format"


@pytest.mark.parametrize(
    ("week_meals", "label"),
    [
        (lambda: [meal(f"m{k}", "12:00", [[{"alts": [item("x", 1.0)]}]]) for k in range(ws.MAX_MEALS + 1)], "meals"),
        (lambda: [meal("m", "12:00", [[{"alts": [item("x", 1.0)]}] for _ in range(ws.MAX_OPTIONS + 1)])], "options"),
        (lambda: [meal("m", "12:00", [[{"alts": [item("x", 1.0)]}] * (ws.MAX_LINES + 1)])], "lines"),
        (lambda: [meal("m", "12:00", [[{"alts": [item("x", 1.0)] * (ws.MAX_ALTS + 1)}]])], "line-alts"),
    ],
)
async def test_profile_cardinality_is_capped(client, week_meals, label):
    profile = (await call(client, "create_profile", name="P"))["result"]["profile"]
    profile["week"]["0"] = week_meals()
    resp = await call(client, "save_profile", profile=profile)
    assert resp["error"]["code"] == "invalid_format", label


# --- finding 2: shopping must not act as a deputy for users without todo permission -----------------


class _List(TodoListEntity):
    _attr_supported_features = TodoListEntityFeature.CREATE_TODO_ITEM

    def __init__(self) -> None:
        self.entity_id = "todo.privata"
        self._attr_name = "Privata"
        self._attr_unique_id = "privata"
        self._attr_todo_items = []

    async def async_create_todo_item(self, item: TodoItem) -> None:
        self._attr_todo_items.append(TodoItem(summary=item.summary, uid=str(len(self._attr_todo_items)), status=TodoItemStatus.NEEDS_ACTION))
        self.async_write_ha_state()


async def test_shopping_respects_todo_permissions(hass, hass_ws_client, setup_entry):
    assert await async_setup_component(hass, TODO_DOMAIN, {})
    todo = _List()
    await hass.data[DATA_COMPONENT].async_add_entities([todo])
    user = await hass.auth.async_create_user("Ospite", group_ids=["system-read-only"])
    refresh = await hass.auth.async_create_refresh_token(user, CLIENT_ID)
    reader = await hass_ws_client(hass, hass.auth.async_create_access_token(refresh))

    profile = (await call(reader, "create_profile", name="P"))["result"]["profile"]
    profile["week"]["0"] = [meal("pasta", "12:00", [[{"alts": [item("Pasta", 80.0)]}]])]
    assert (await call(reader, "save_profile", profile=profile))["success"]
    resp = await call(
        reader, "shopping", start=MONDAY.isoformat(), end=MONDAY.isoformat(), profile_ids=None, todo_entity_id="todo.privata"
    )
    assert resp["error"]["code"] == "unauthorized"
    assert todo.todo_items == []


# --- finding 3: the API must stop when the config entry is unloaded --------------------------------


async def test_commands_not_loaded_after_unload(hass, client):
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert await hass.config_entries.async_unload(entry.entry_id)
    resp = await call(client, "create_profile", name="Dopo")
    assert resp["error"]["code"] == "not_loaded"

    assert await hass.config_entries.async_setup(entry.entry_id)
    resp = await call(client, "create_profile", name="Riattivata")
    assert resp["success"], resp


# --- finding 4: meal ids that collide with JS object internals --------------------------------------


async def test_meal_id_proto_rejected(client):
    profile = (await call(client, "create_profile", name="P"))["result"]["profile"]
    profile["week"]["0"] = [meal("__proto__", "12:00", [[{"alts": [item("x", 1.0)]}]])]
    resp = await call(client, "save_profile", profile=profile)
    assert resp["error"]["code"] == "invalid_format"


# --- findings 5 and 6: per-commit cost must not grow with sensors or subscriptions -------------------


async def test_commit_copies_store_independent_of_profiles_and_subscribers(hass, hass_ws_client, client, monkeypatch):
    for k in range(10):
        assert (await call(client, "create_profile", name=f"p{k}"))["success"]
    await hass.async_block_till_done()
    for _ in range(3):
        sub = await _non_admin_client(hass, hass_ws_client)
        await sub.send_json_auto_id({"type": "shared_diet/subscribe"})
        assert (await sub.receive_json())["success"]

    store = hass.data[DOMAIN]
    real = copy.deepcopy
    full_copies = 0

    def counting(obj, memo=None):
        nonlocal full_copies
        if obj is store._profiles:
            full_copies += 1
        return real(obj, memo)

    monkeypatch.setattr(copy, "deepcopy", counting)
    profile = (await call(client, "create_profile", name="last"))["result"]["profile"]
    full_copies = 0
    assert (await call(client, "save_profile", profile=profile))["success"]
    await hass.async_block_till_done()
    assert full_copies <= 2


async def test_second_subscribe_on_same_connection_rejected(client):
    await client.send_json_auto_id({"type": "shared_diet/subscribe"})
    assert (await client.receive_json())["success"]
    await client.receive_json()  # initial push
    await client.send_json_auto_id({"type": "shared_diet/subscribe"})
    resp = await client.receive_json()
    assert resp["error"]["code"] == "already_subscribed"


async def test_profile_count_is_capped(hass, client):
    for k in range(store_mod.MAX_PROFILES):
        assert (await call(client, "create_profile", name=f"p{k}"))["success"]
    resp = await call(client, "create_profile", name="troppi")
    assert resp["error"]["code"] == "limit"


# --- finding 7: recipe_qty filtering must not be quadratic, and stale revs fail first ---------------


async def test_recipe_qty_filter_builds_alt_set_once_per_recipe(hass, client, monkeypatch):
    recipe = (await _recipe(client, [{"id": "i", "alts": _alts(5)}]))["result"]["recipe"]
    profile = (await call(client, "create_profile", name="P"))["result"]["profile"]
    profile["recipe_qty"] = {recipe["id"]: {f"a{k}": 2.0 for k in range(5)}}

    store = hass.data[DOMAIN]
    real = store._alt_ids
    calls = []
    monkeypatch.setattr(store, "_alt_ids", lambda rid: calls.append(rid) or real(rid))

    stale = {**profile, "rev": 99}
    assert (await call(client, "save_profile", profile=stale))["error"]["code"] == "conflict"
    assert calls == []  # rev is checked before any filtering work

    assert (await call(client, "save_profile", profile=profile))["success"]
    assert calls == [recipe["id"]]
