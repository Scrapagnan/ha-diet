import pytest

from custom_components.shared_diet.const import STORAGE_KEY
from custom_components.shared_diet.store import (
    ConflictError,
    DietStore,
    DuplicateNameError,
    InUseError,
    UnknownRecipeError,
)


def _meal(*alts):
    """One-option meal whose single line offers the given alternatives."""
    return {"id": "m", "name": "Pranzo", "time": "13:00", "options": [[{"alts": list(alts)}]]}


async def _store(hass):
    s = DietStore(hass)
    await s.async_load()
    return s


async def test_legacy_storage_loads_with_empty_recipes_and_recipe_qty(hass, hass_storage):
    hass_storage[STORAGE_KEY] = {"version": 1, "data": {"profiles": {"p1": {"id": "p1", "name": "Luca", "rev": 1}}}}
    s = await _store(hass)
    assert s.recipes == {}
    assert s.profiles["p1"]["recipe_qty"] == {}


async def test_recipes_survive_reload(hass, hass_storage):
    s = await _store(hass)
    r = await s.async_create_recipe("Pancake")
    s2 = await _store(hass)
    assert s2.recipes[r["id"]]["name"] == "Pancake"


async def test_create_recipe_defaults_and_deep_copy(hass):
    s = await _store(hass)
    r = await s.async_create_recipe("Pancake")
    assert len(r["id"]) == 32
    assert r["note"] == "" and r["ingredients"] == [] and r["rev"] == 1
    r["name"] = "Hacked"
    assert s.recipes[r["id"]]["name"] == "Pancake"


async def test_save_recipe_bumps_rev_and_stale_rev_conflicts(hass):
    s = await _store(hass)
    r = await s.async_create_recipe("Pancake")
    stale = dict(r)
    r["note"] = "Mescolare"
    saved = await s.async_save_recipe(r)
    assert saved["rev"] == 2
    assert s.recipes[r["id"]]["note"] == "Mescolare"
    with pytest.raises(ConflictError):
        await s.async_save_recipe(stale)


async def test_save_unknown_recipe_raises_key_error(hass):
    s = await _store(hass)
    with pytest.raises(KeyError):
        await s.async_save_recipe({"id": "nope", "rev": 1, "name": "X"})


async def test_duplicate_name_on_create_uses_fold_name(hass):
    s = await _store(hass)
    await s.async_create_recipe("Caffè latte")
    with pytest.raises(DuplicateNameError):
        await s.async_create_recipe("caffe  LATTE")


async def test_duplicate_name_on_rename_but_keeping_own_name_is_ok(hass):
    s = await _store(hass)
    await s.async_create_recipe("Tè")
    latte = await s.async_create_recipe("Latte")
    latte["name"] = "tè "
    with pytest.raises(DuplicateNameError):
        await s.async_save_recipe(latte)
    latte["name"] = "LATTE"
    saved = await s.async_save_recipe(latte)
    assert saved["name"] == "LATTE"


async def test_delete_recipe_in_use_raises_with_sorted_profile_names(hass):
    s = await _store(hass)
    r = await s.async_create_recipe("Pancake")
    luca = await s.async_create_profile("Luca")
    luca["week"]["0"] = [_meal({"recipe": r["id"]})]
    await s.async_save_profile(luca)
    anna = await s.async_create_profile("Anna")
    anna["exceptions"]["2026-11-10"] = [_meal({"recipe": r["id"]})]
    await s.async_save_profile(anna)
    with pytest.raises(InUseError) as err:
        await s.async_delete_recipe(r["id"])
    assert err.value.profile_names == ["Anna", "Luca"]
    assert str(err.value) == "Ricetta usata da: Anna, Luca"
    assert r["id"] in s.recipes


async def test_delete_unused_recipe_and_unknown_id(hass):
    s = await _store(hass)
    r = await s.async_create_recipe("Pancake")
    await s.async_delete_recipe(r["id"])
    assert s.recipes == {}
    await s.async_delete_recipe("nope")


async def test_save_profile_with_unknown_recipe_raises_and_changes_nothing(hass):
    s = await _store(hass)
    p = await s.async_create_profile("Luca")
    before = s.profiles[p["id"]]
    p["week"]["0"] = [_meal({"recipe": "ghost"})]
    with pytest.raises(UnknownRecipeError):
        await s.async_save_profile(p)
    assert s.profiles[p["id"]] == before


async def test_save_profile_prunes_recipe_qty(hass):
    s = await _store(hass)
    r = await s.async_create_recipe("Pancake")
    r["ingredients"] = [{"id": "i1", "food": "Farina", "qty": 60.0, "unit": "g"}]
    r = await s.async_save_recipe(r)
    p = await s.async_create_profile("Luca")
    p["recipe_qty"] = {r["id"]: {"i1": 1, "gone": 2}, "nope": {"i1": 3}}
    saved = await s.async_save_profile(p)
    assert saved["recipe_qty"] == {r["id"]: {"i1": 1}}
    assert s.profiles[p["id"]]["recipe_qty"] == {r["id"]: {"i1": 1}}


async def test_recipe_changes_notify_listeners(hass):
    s = await _store(hass)
    calls = []
    s.async_add_listener(lambda: calls.append(1))
    r = await s.async_create_recipe("Pancake")
    r["note"] = "Mescolare"
    await s.async_save_recipe(r)
    await s.async_delete_recipe(r["id"])
    assert calls == [1, 1, 1]
