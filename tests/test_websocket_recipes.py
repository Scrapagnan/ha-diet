"""Websocket API for the shared recipe book: non-admin access, validation, behaviour."""

import pytest
from pytest_homeassistant_custom_component.common import async_mock_service

from test_websocket import MONDAY, call, client, meal, setup_entry  # noqa: F401

INGREDIENT = {"id": "i1", "food": "Farina", "qty": 60.0, "unit": "g"}


def recipe_payload(**changes):
    base = {"id": None, "name": "Pancake", "note": "", "ingredients": [dict(INGREDIENT)], "rev": 1}
    base.update(changes)
    return base


async def _create_recipe(client, name="Pancake", ingredients=None):
    resp = await call(client, "create_recipe", name=name)
    assert resp["success"], resp
    recipe = resp["result"]["recipe"]
    if ingredients is not None:
        recipe["ingredients"] = ingredients
        resp = await call(client, "save_recipe", recipe=recipe)
        assert resp["success"], resp
        recipe = resp["result"]["recipe"]
    return recipe


async def test_non_admin_create_save_delete_recipe(client):
    recipe = await _create_recipe(client)
    assert recipe["rev"] == 1 and recipe["ingredients"] == []

    recipe["name"] = "Pancakes"
    recipe["ingredients"] = [dict(INGREDIENT)]
    resp = await call(client, "save_recipe", recipe=recipe)
    assert resp["success"], resp
    assert resp["result"]["recipe"]["rev"] == 2
    assert resp["result"]["recipe"]["ingredients"] == [INGREDIENT]

    resp = await call(client, "delete_recipe", recipe_id=recipe["id"])
    assert resp["success"] and resp["result"] == {}


async def test_create_duplicate_name_rejected(client):
    await _create_recipe(client, name="Pancake")
    resp = await call(client, "create_recipe", name=" pancàke ")
    assert resp["error"]["code"] == "duplicate_name"
    assert resp["error"]["message"] == "Esiste già una ricetta con questo nome"


async def test_save_duplicate_name_rejected(client):
    await _create_recipe(client, name="Pancake")
    other = await _create_recipe(client, name="Crepes")
    other["name"] = "PANCAKE"
    resp = await call(client, "save_recipe", recipe=other)
    assert resp["error"]["code"] == "duplicate_name"


async def test_save_recipe_conflict(client):
    recipe = await _create_recipe(client)
    assert (await call(client, "save_recipe", recipe=recipe))["success"]
    resp = await call(client, "save_recipe", recipe=recipe)  # stale rev 1
    assert resp["error"]["code"] == "conflict"
    assert resp["error"]["message"] == "Ricetta modificata da un altro utente"


async def test_save_unknown_recipe_not_found(client):
    recipe = recipe_payload(id="does-not-exist")
    resp = await call(client, "save_recipe", recipe=recipe)
    assert resp["error"]["code"] == "not_found"


async def test_delete_recipe_in_use_returns_error(client):
    recipe = await _create_recipe(client, ingredients=[dict(INGREDIENT)])
    profile = (await call(client, "create_profile", name="Luca"))["result"]["profile"]
    profile["week"]["0"] = [meal("pancake", "08:00", [[{"alts": [{"recipe": recipe["id"]}]}]])]
    assert (await call(client, "save_profile", profile=profile))["success"]

    resp = await call(client, "delete_recipe", recipe_id=recipe["id"])
    assert resp["error"]["code"] == "in_use"
    assert resp["error"]["message"] == "Ricetta usata da: Luca"


async def test_profile_with_recipe_item_accepted(client):
    recipe = await _create_recipe(client, ingredients=[dict(INGREDIENT)])
    profile = (await call(client, "create_profile", name="Luca"))["result"]["profile"]
    profile["week"]["0"] = [meal("pancake", "08:00", [[{"alts": [{"recipe": recipe["id"]}]}]])]
    resp = await call(client, "save_profile", profile=profile)
    assert resp["success"], resp
    assert resp["result"]["profile"]["week"]["0"][0]["options"] == [[{"alts": [{"recipe": recipe["id"]}]}]]


@pytest.mark.parametrize(
    "alt",
    [
        pytest.param({"recipe": "does-not-exist"}, id="unknown-recipe"),
        pytest.param({"recipe": "r1", "food": "x"}, id="recipe-with-food"),
        pytest.param({"recipe": "r1", "food": "x", "qty": 1, "unit": "g", "note": ""}, id="recipe-with-all-fields"),
        pytest.param({"recipe": ""}, id="empty-recipe-id"),
        pytest.param({"food": "x", "qty": 1, "unit": "g", "note": "", "recipe": "r1"}, id="item-with-recipe-key"),
    ],
)
async def test_invalid_recipe_item_rejected(client, alt):
    profile = (await call(client, "create_profile", name="Luca"))["result"]["profile"]
    if alt.get("recipe") == "r1":
        recipe = await _create_recipe(client)
        alt = {**alt, "recipe": recipe["id"]}
    profile["week"]["0"] = [meal("pancake", "08:00", [[{"alts": [alt]}]])]
    resp = await call(client, "save_profile", profile=profile)
    assert resp["error"]["code"] == "invalid_format"


async def test_recipe_qty_saved_and_invalid_values_rejected(client):
    recipe = await _create_recipe(client, ingredients=[dict(INGREDIENT)])
    profile = (await call(client, "create_profile", name="Luca"))["result"]["profile"]

    profile["recipe_qty"] = {recipe["id"]: {"i1": 30.0, "gone": 5.0}}
    resp = await call(client, "save_profile", profile=profile)
    assert resp["success"], resp
    saved = resp["result"]["profile"]
    assert saved["recipe_qty"] == {recipe["id"]: {"i1": 30.0}}

    for bad in ({recipe["id"]: {"i1": -1}}, {recipe["id"]: {"i1": None}}, {"": {"i1": 1}}, {recipe["id"]: {"": 1}}):
        profile = dict(saved)
        profile["recipe_qty"] = bad
        resp = await call(client, "save_profile", profile=profile)
        assert resp["error"]["code"] == "invalid_format", bad


@pytest.mark.parametrize(
    "changes",
    [
        pytest.param({"name": ""}, id="empty-name"),
        pytest.param({"rev": 0}, id="rev-zero"),
        pytest.param({"extra": True}, id="recipe-extra-key"),
        pytest.param({"ingredients": [{**INGREDIENT, "food": ""}]}, id="empty-food"),
        pytest.param({"ingredients": [{**INGREDIENT, "id": ""}]}, id="empty-ingredient-id"),
        pytest.param({"ingredients": [{**INGREDIENT, "qty": -1}]}, id="negative-qty"),
        pytest.param({"ingredients": [{**INGREDIENT, "qty": True}]}, id="bool-qty"),
        pytest.param({"ingredients": [{**INGREDIENT, "note": ""}]}, id="ingredient-extra-key"),
        pytest.param({"ingredients": [dict(INGREDIENT), {**INGREDIENT, "food": "Uova"}]}, id="duplicate-ingredient-id"),
    ],
)
async def test_invalid_recipe_rejected(client, changes):
    recipe = await _create_recipe(client)
    recipe.update(changes)
    resp = await call(client, "save_recipe", recipe=recipe)
    assert resp["error"]["code"] == "invalid_format"


async def test_recipe_ingredient_qty_may_be_null(client):
    recipe = await _create_recipe(client, ingredients=[{**INGREDIENT, "qty": None}])
    assert recipe["ingredients"][0]["qty"] is None


async def test_subscribe_pushes_recipes(client):
    await client.send_json_auto_id({"type": "shared_diet/subscribe"})
    assert (await client.receive_json())["success"]
    event = await client.receive_json()
    assert event["event"] == {"profiles": {}, "recipes": {}}

    await client.send_json_auto_id({"type": "shared_diet/create_recipe", "name": "Crepes"})
    msgs = [await client.receive_json(), await client.receive_json()]
    pushed = next(m for m in msgs if m["type"] == "event")
    created = next(m for m in msgs if m["type"] == "result")["result"]["recipe"]
    assert pushed["event"]["recipes"] == {created["id"]: created}


async def test_shopping_expands_recipe_ingredients(hass, client):
    calls = async_mock_service(hass, "todo", "add_item")
    recipe = await _create_recipe(
        client,
        ingredients=[dict(INGREDIENT), {"id": "i2", "food": "Uova", "qty": 1.0, "unit": "pz"}],
    )
    profile = (await call(client, "create_profile", name="Luca"))["result"]["profile"]
    profile["week"]["0"] = [meal("pancake", "08:00", [[{"alts": [{"recipe": recipe["id"]}]}]])]
    assert (await call(client, "save_profile", profile=profile))["success"]

    resp = await call(
        client,
        "shopping",
        start=MONDAY.isoformat(),
        end=MONDAY.isoformat(),
        profile_ids=None,
        todo_entity_id="todo.spesa",
    )
    assert resp["result"]["items"] == ["Farina — 60 g", "Uova — 1 pz"]
    assert [c.data["item"] for c in calls] == ["Farina — 60 g", "Uova — 1 pz"]
