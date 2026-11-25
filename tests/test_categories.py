"""Shopping categories: automatic assignment, overrides, house list and per-user order."""

from datetime import date

import pytest
from pytest_homeassistant_custom_component.common import async_mock_service

from custom_components.shared_diet.const import DEFAULT_CATEGORIES, STORAGE_KEY
from custom_components.shared_diet.model import category_for, effective_order, shopping_items
from custom_components.shared_diet.store import MAX_CATEGORIES, DietStore, DuplicateNameError, LimitError

from test_websocket import MONDAY, _user_client, call, item, meal, own_profile, setup_entry  # noqa: F401

CATS = DEFAULT_CATEGORIES


# --- model -----------------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("food", "expected"),
    [
        ("Petto di pollo", "carne"),
        ("  MELE golden ", "frutta_verdura"),
        ("Caffè", "dispensa"),  # accents folded
        ("Fiocchi d'avena", "pasta_cereali"),  # punctuation ignored
        ("Latte di soia", "bevande"),  # same start as "latte": the longest wins
        ("Yogurt alla fragola", "latticini_uova"),  # the first food in the name wins
        ("Olio di semi", "condimenti"),
        ("Gelato al cioccolato", "surgelati"),
        ("Spinaci surgelati", "surgelati"),  # qualifier wins wherever it is
        ("Latte", "latticini_uova"),
        ("Verdure surgelate", "surgelati"),
        ("Pollame", "altro"),  # whole words only: "pollo" is not in "pollame"
        ("Qualcosa", "altro"),
    ],
)
def test_category_for_keywords(food, expected):
    assert category_for(food, CATS, {}) == expected


def test_category_for_override_and_missing_categories():
    assert category_for(" pollo ", CATS, {"pollo": "pesce"}) == "pesce"  # keyed by fold_name
    without_carne = [c for c in CATS if c["id"] != "carne"]
    assert category_for("Pollo", without_carne, {}) == "altro"  # guessed category deleted
    assert category_for("Pollo", CATS, {"pollo": "gone"}) == "carne"  # stale override ignored


def test_effective_order():
    cats = [{"id": i, "name": i} for i in ("a", "b", "c", "d")]
    assert effective_order([], cats) == ["a", "b", "c", "d"]
    assert effective_order(["c", "x", "a", "c"], cats) == ["c", "a", "b", "d"]


def test_shopping_rows_carry_food_and_category():
    week = {str(d): [] for d in range(7)}
    week["0"] = [meal("l", "13:00", [[{"alts": [item("Pollo", 100.0)]}, {"alts": [item("Sale", None, "", "q.b.")]}]])]
    p = {"week": week, "exceptions": {}, "choices": {"defaults": {}, "dates": {}}}
    rows = shopping_items([p], MONDAY, MONDAY, {}, CATS, {"sale": "dispensa"})
    assert rows == [
        {"text": "Pollo - 100 g", "food": "Pollo", "category": "carne", "manual": False},
        {"text": "Sale (q.b.)", "food": "Sale", "category": "dispensa", "manual": True},
    ]


def test_shopping_manual_flag_uses_server_folding():
    week = {str(d): [] for d in range(7)}
    week["0"] = [meal("l", "13:00", [[{"alts": [item("Weißwurst", 100.0)]}]])]
    p = {"week": week, "exceptions": {}, "choices": {"defaults": {}, "dates": {}}}
    [row] = shopping_items([p], MONDAY, MONDAY, {}, CATS, {"weisswurst": "carne"})  # casefold: ß -> ss
    assert row["category"] == "carne" and row["manual"] is True


# --- store -----------------------------------------------------------------------------------------------------


async def test_old_store_gets_default_categories(hass, hass_storage):
    hass_storage[STORAGE_KEY] = {"version": 1, "key": STORAGE_KEY, "data": {"profiles": {}, "recipes": {}}}
    s = DietStore(hass)
    await s.async_load()
    snap = s.snapshot()
    assert snap["categories"] == DEFAULT_CATEGORIES and snap["food_categories"] == {}
    assert "category_order" not in snap  # other users' data stays private
    assert s.category_order("u1") == [c["id"] for c in DEFAULT_CATEGORIES]


async def test_category_crud_persists(hass):
    s = DietStore(hass)
    await s.async_load()
    new = await s.async_create_category("Detersivi")
    with pytest.raises(DuplicateNameError):
        await s.async_create_category(" DETERSIVI ")
    await s.async_rename_category("altro", "Varie")  # rename the fallback is fine
    with pytest.raises(DuplicateNameError):
        await s.async_rename_category(new["id"], "varie")
    await s.async_set_food_category("Sapone", new["id"])
    await s.async_set_food_category("Pollo", "pesce")
    await s.async_set_category_order("u1", [new["id"], "carne"])
    with pytest.raises(ValueError):
        await s.async_delete_category("altro")
    with pytest.raises(KeyError):
        await s.async_delete_category("nope")
    with pytest.raises(KeyError):
        await s.async_set_food_category("Pane", "nope")

    await s.async_delete_category(new["id"])  # its overrides go with it
    s2 = DietStore(hass)
    await s2.async_load()
    snap = s2.snapshot()
    assert new["id"] not in [c["id"] for c in snap["categories"]]
    assert next(c["name"] for c in snap["categories"] if c["id"] == "altro") == "Varie"
    assert snap["food_categories"] == {"pollo": "pesce"}
    assert s2.category_order("u1")[0] == "carne"

    await s2.async_set_food_category(" POLLO ", None)  # back to automatic
    assert s2.snapshot()["food_categories"] == {}


async def test_category_limits(hass):
    s = DietStore(hass)
    await s.async_load()
    for i in range(MAX_CATEGORIES - len(DEFAULT_CATEGORIES)):
        await s.async_create_category(f"Cat {i}")
    with pytest.raises(LimitError):
        await s.async_create_category("Troppe")
    with pytest.raises(KeyError):
        await s.async_set_category_order("u1", ["carne", "nope"])


async def test_order_change_does_not_push(hass):
    s = DietStore(hass)
    await s.async_load()
    calls = []
    s.async_add_listener(lambda: calls.append(1))
    assert (await s.async_set_category_order("u1", ["carne", "carne"]))[:2] == ["carne", "frutta_verdura"]
    assert calls == []


# --- websocket -------------------------------------------------------------------------------------------------


async def test_two_users_see_their_own_order(hass, hass_ws_client, setup_entry):  # noqa: F811
    calls = async_mock_service(hass, "todo", "add_item")
    anna = await _user_client(hass, hass_ws_client, "Anna")
    bea = await _user_client(hass, hass_ws_client, "Bea")
    profile = own_profile(anna)
    profile["week"]["0"] = [
        meal("l", "12:00", [[{"alts": [item("Pasta", 80.0)]}, {"alts": [item("Pollo", 100.0)]}, {"alts": [item("Mele", 2.0, "pz")]}]])
    ]
    assert (await call(anna, "save_profile", profile=profile))["success"]
    resp = await call(anna, "set_category_order", order=["pasta_cereali", "carne"])
    assert resp["result"]["order"][:3] == ["pasta_cereali", "carne", "frutta_verdura"]

    base = {"start": MONDAY.isoformat(), "end": MONDAY.isoformat(), "profile_ids": None}
    texts = lambda resp: [r["text"] for r in resp["result"]["items"]]  # noqa: E731
    assert texts(await call(anna, "shopping", **base)) == ["Pasta - 80 g", "Pollo - 100 g", "Mele - 2 pz"]
    assert texts(await call(bea, "shopping", **base)) == ["Mele - 2 pz", "Pollo - 100 g", "Pasta - 80 g"]

    # Override is the house's: Bea moves Mele and Anna sees it too.
    assert (await call(bea, "set_food_category", food="mele", category_id="altro"))["success"]
    rows = (await call(anna, "shopping", **base))["result"]["items"]
    assert rows[-1] == {"text": "Mele - 2 pz", "food": "Mele", "category": "altro", "manual": True}

    # A new category goes last for everyone.
    new = (await call(bea, "create_category", name=" Carni bianche "))["result"]["category"]
    assert new["name"] == "Carni bianche"
    assert (await call(anna, "get_category_order"))["result"]["order"][-1] == new["id"]
    assert (await call(bea, "set_food_category", food="Pollo", category_id=new["id"]))["success"]
    assert texts(await call(anna, "shopping", **base)) == ["Pasta - 80 g", "Mele - 2 pz", "Pollo - 100 g"]

    # The todo list is filled in category order, with the plain text.
    await call(bea, "shopping", **base, todo_entity_id="todo.spesa")
    assert [c.data["item"] for c in calls] == ["Pasta - 80 g", "Mele - 2 pz", "Pollo - 100 g"]


async def test_category_command_errors(hass, hass_ws_client, setup_entry):  # noqa: F811
    c = await _user_client(hass, hass_ws_client)
    assert (await call(c, "delete_category", category_id="altro"))["error"]["code"] == "invalid_format"
    assert (await call(c, "delete_category", category_id="nope"))["error"]["code"] == "not_found"
    assert (await call(c, "rename_category", category_id="nope", name="X"))["error"]["code"] == "not_found"
    assert (await call(c, "create_category", name="  "))["error"]["code"] == "invalid_format"
    assert (await call(c, "create_category", name="x" * 41))["error"]["code"] == "invalid_format"
    assert (await call(c, "create_category", name="carne"))["error"]["code"] == "duplicate_name"
    assert (await call(c, "rename_category", category_id="pesce", name="CARNE"))["error"]["code"] == "duplicate_name"
    assert (await call(c, "set_food_category", food="Pane", category_id="nope"))["error"]["code"] == "not_found"
    assert (await call(c, "set_category_order", order=["nope"]))["error"]["code"] == "invalid_format"
    assert (await call(c, "rename_category", category_id="altro", name="Varie"))["success"]
    assert (await call(c, "delete_category", category_id="carne"))["success"]
    order = (await call(c, "get_category_order"))["result"]["order"]
    assert "carne" not in order and order[-1] == "altro"


async def test_removed_user_order_is_dropped(hass, hass_storage):
    s = DietStore(hass)
    await s.async_load()
    await s.async_set_category_order("gone", ["carne"])
    await s.async_set_category_order("kept", ["pesce"])
    await s.async_set_category_order("removed", ["pesce"])
    await s.async_delete_user_profile("removed")  # user without a profile: the order still goes
    await s.async_sync_users({"kept": "Kept"}, {})
    assert hass_storage[STORAGE_KEY]["data"]["category_order"] == {"kept": ["pesce"]}
