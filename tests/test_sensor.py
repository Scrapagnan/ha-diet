"""Meal sensors, minute tick and reminders for shared_diet."""

import copy
from datetime import datetime
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo

from homeassistant.config_entries import ConfigEntryState
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed,
    async_mock_service,
)

from custom_components.shared_diet.const import DOMAIN

ROME = ZoneInfo("Europe/Rome")


def at(hour, minute):
    return datetime(2026, 11, 9, hour, minute, tzinfo=ROME)


def item(food, qty, unit="g", note=""):
    return {"food": food, "qty": qty, "unit": unit, "note": note}


def meal(meal_id, name, time, items):
    return {"id": meal_id, "name": name, "time": time, "options": [[{"alts": [i]} for i in items]]}


COLAZIONE = meal("colazione", "Colazione", "07:30", [item("Latte", 200.0, "ml")])
PRANZO = meal("pranzo", "Pranzo", "13:00", [item("Pasta integrale", 80.0), item("Olio", None, "", "q.b.")])


async def _setup_entry(hass):
    await hass.config.async_set_time_zone("Europe/Rome")
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return hass.data[DOMAIN]


async def _add_profile(hass, store, name, meals, notify=None):
    """Create a profile whose every weekday has `meals`, with the given reminder."""
    created = await store.async_create_profile(name)
    await hass.async_block_till_done()
    profile = store.profiles[created["id"]]
    profile["week"] = {str(d): copy.deepcopy(meals) for d in range(7)}
    profile["reminder"] = {"enabled": notify is not None, "minutes": 15, "notify": notify}
    await store.async_save_profile(profile)
    await hass.async_block_till_done()
    return created["id"]


async def _setup_luca(hass, notify=None):
    """Set up the entry, then create profile "Luca" with two meals a day and the given reminder."""
    store = await _setup_entry(hass)
    profile_id = await _add_profile(hass, store, "Luca", [COLAZIONE, PRANZO], notify)
    return store, profile_id


async def test_sensors_reflect_current_and_next(hass, freezer):
    freezer.move_to(at(10, 0))
    await _setup_luca(hass)
    assert hass.states.get("sensor.luca_pasto_attuale").state == "Colazione"
    nxt = hass.states.get("sensor.luca_prossimo_pasto")
    assert nxt.state == "Pranzo"
    assert nxt.attributes["time"] == "13:00"
    assert nxt.attributes["items"] == ["Pasta integrale 80 g", "Olio (q.b.)"]


async def test_reminder_sent_minutes_before(hass, freezer):
    calls = async_mock_service(hass, "notify", "mobile_app_x")
    freezer.move_to(at(10, 0))
    await _setup_luca(hass, notify="notify.mobile_app_x")
    freezer.move_to(at(12, 45))
    async_fire_time_changed(hass, at(12, 45))
    await hass.async_block_till_done()
    assert len(calls) == 1
    assert calls[0].data["title"] == "Luca: Pranzo alle 13:00"
    assert calls[0].data["message"] == "Pasta integrale 80 g, Olio (q.b.)"


async def test_missing_notify_service_does_not_break(hass, freezer, caplog):
    freezer.move_to(at(10, 0))
    await _setup_luca(hass, notify="notify.non_esiste")
    freezer.move_to(at(12, 45))
    async_fire_time_changed(hass, at(12, 45))
    await hass.async_block_till_done()
    assert "non_esiste" in caplog.text
    freezer.move_to(at(13, 0))
    async_fire_time_changed(hass, at(13, 0))
    await hass.async_block_till_done()
    assert hass.states.get("sensor.luca_pasto_attuale").state == "Pranzo"


async def test_adding_and_deleting_profiles_does_not_reload_entry(hass, freezer):
    freezer.move_to(at(10, 0))
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    store = hass.data[DOMAIN]
    with (
        patch.object(hass.config_entries, "async_schedule_reload") as schedule_reload,
        patch.object(hass.config_entries, "async_reload", AsyncMock()) as reload,
    ):
        created = await store.async_create_profile("Anna")
        await hass.async_block_till_done()
        assert hass.states.get("sensor.anna_pasto_attuale") is not None
        assert hass.states.get("sensor.anna_prossimo_pasto") is not None
        await store.async_delete_profile(created["id"])
        await hass.async_block_till_done()
        assert hass.states.get("sensor.anna_pasto_attuale") is None
    schedule_reload.assert_not_called()
    reload.assert_not_called()
    assert entry.state is ConfigEntryState.LOADED
    assert "shared-diet" in hass.data["frontend_panels"]


async def test_deleting_profile_removes_its_entities(hass, freezer):
    freezer.move_to(at(10, 0))
    store, profile_id = await _setup_luca(hass)
    registry = er.async_get(hass)
    assert registry.async_get("sensor.luca_pasto_attuale") is not None
    await store.async_delete_profile(profile_id)
    await hass.async_block_till_done()
    assert registry.async_get("sensor.luca_pasto_attuale") is None
    assert registry.async_get("sensor.luca_prossimo_pasto") is None
    assert hass.states.get("sensor.luca_pasto_attuale") is None


async def test_malformed_profile_does_not_skip_others(hass, freezer, monkeypatch, caplog):
    import custom_components.shared_diet as integration

    real_resolve = integration.resolve_meal

    def flaky_resolve(meal, choice, *args):
        if meal["id"] == "bad":
            raise RuntimeError("corrupt meal")
        return real_resolve(meal, choice, *args)

    monkeypatch.setattr(integration, "resolve_meal", flaky_resolve)
    calls = async_mock_service(hass, "notify", "mobile_app_x")
    freezer.move_to(at(10, 0))
    store = await _setup_entry(hass)
    # The malformed profile is created first so it is iterated before the valid one.
    bad_meal = meal("bad", "Rotto", "13:00", [item("Nulla", 1.0)])
    await _add_profile(hass, store, "Bad", [bad_meal], notify="notify.mobile_app_x")
    await _add_profile(hass, store, "Luca", [COLAZIONE, PRANZO], notify="notify.mobile_app_x")
    freezer.move_to(at(12, 45))
    async_fire_time_changed(hass, at(12, 45))
    await hass.async_block_till_done()
    assert [c.data["title"] for c in calls] == ["Luca: Pranzo alle 13:00"]
    assert "Bad" in caplog.text


async def test_renaming_profile_updates_friendly_name_not_entity_id(hass, freezer):
    freezer.move_to(at(10, 0))
    store, profile_id = await _setup_luca(hass)
    profile = store.profiles[profile_id]
    profile["name"] = "Marco"
    await store.async_save_profile(profile)
    await hass.async_block_till_done()
    state = hass.states.get("sensor.luca_pasto_attuale")
    assert state is not None
    assert state.attributes["friendly_name"] == "Marco pasto attuale"
    assert hass.states.get("sensor.marco_pasto_attuale") is None


async def _setup_pancake(hass, notify=None):
    """Luca eats a Pancake recipe at 13:00; his Farina is overridden to 40 g (default 60 g)."""
    store = await _setup_entry(hass)
    recipe = await store.async_create_recipe("Pancake")
    recipe["ingredients"] = [
        {"id": "farina", "alts": [{"id": "farina", "food": "Farina", "qty": 60.0, "unit": "g"}]},
        {"id": "uova", "alts": [{"id": "uova", "food": "Uova", "qty": 1.0, "unit": "pz"}]},
    ]
    recipe = await store.async_save_recipe(recipe)
    pancake = {
        "id": "pancake",
        "name": "Pancake",
        "time": "13:00",
        "options": [[{"alts": [{"recipe": recipe["id"]}]}]],
    }
    profile_id = await _add_profile(hass, store, "Luca", [COLAZIONE, pancake], notify)
    profile = store.profiles[profile_id]
    profile["recipe_qty"] = {recipe["id"]: {"farina": 40.0}}
    await store.async_save_profile(profile)
    await hass.async_block_till_done()
    return store, recipe


async def test_sensor_items_expand_recipe_with_profile_override(hass, freezer):
    freezer.move_to(at(10, 0))
    await _setup_pancake(hass)
    nxt = hass.states.get("sensor.luca_prossimo_pasto")
    assert nxt.attributes["items"] == ["Pancake: Farina 40 g, Uova 1 pz"]


async def test_recipe_save_updates_sensor_without_time_tick(hass, freezer):
    freezer.move_to(at(10, 0))
    store, recipe = await _setup_pancake(hass)
    assert hass.states.get("sensor.luca_prossimo_pasto").attributes["items"] == [
        "Pancake: Farina 40 g, Uova 1 pz"
    ]
    recipe = store.recipes[recipe["id"]]
    recipe["ingredients"][1]["alts"][0]["qty"] = 2.0  # Uova has no profile override
    await store.async_save_recipe(recipe)
    await hass.async_block_till_done()
    assert hass.states.get("sensor.luca_prossimo_pasto").attributes["items"] == [
        "Pancake: Farina 40 g, Uova 2 pz"
    ]


async def test_sensor_shows_chosen_alternative(hass, freezer):
    freezer.move_to(at(10, 0))
    store = await _setup_entry(hass)
    recipe = await store.async_create_recipe("Pancake")
    recipe["ingredients"] = [
        {"id": "farina", "alts": [{"id": "farina", "food": "Farina", "qty": 60.0, "unit": "g"}]},
        {
            "id": "latte",
            "alts": [
                {"id": "latte", "food": "Latte", "qty": 100.0, "unit": "ml"},
                {"id": "soia", "food": "Soia", "qty": 120.0, "unit": "ml"},
            ],
        },
    ]
    recipe = await store.async_save_recipe(recipe)
    pancake = {"id": "pancake", "name": "Pancake", "time": "13:00", "options": [[{"alts": [{"recipe": recipe["id"]}]}]]}
    profile_id = await _add_profile(hass, store, "Luca", [COLAZIONE, pancake])
    profile = store.profiles[profile_id]
    profile["choices"]["defaults"] = {"pancake": {"option": 0, "lines": {}, "recipes": {recipe["id"]: {"latte": "soia"}}}}
    await store.async_save_profile(profile)
    await hass.async_block_till_done()
    assert hass.states.get("sensor.luca_prossimo_pasto").attributes["items"] == ["Pancake: Farina 60 g, Soia 120 ml"]


async def test_reminder_message_contains_recipe_text(hass, freezer):
    calls = async_mock_service(hass, "notify", "mobile_app_x")
    freezer.move_to(at(10, 0))
    await _setup_pancake(hass, notify="notify.mobile_app_x")
    freezer.move_to(at(12, 45))
    async_fire_time_changed(hass, at(12, 45))
    await hass.async_block_till_done()
    assert len(calls) == 1
    assert calls[0].data["title"] == "Luca: Pancake alle 13:00"
    assert calls[0].data["message"] == "Pancake: Farina 40 g, Uova 1 pz"
