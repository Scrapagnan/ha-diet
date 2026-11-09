"""Meal sensors, minute tick and reminders for shared_diet."""

import copy
from datetime import datetime
from zoneinfo import ZoneInfo

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


async def _setup_luca(hass, notify=None):
    """Set up the entry, then create profile "Luca" with two meals a day and the given reminder."""
    await hass.config.async_set_time_zone("Europe/Rome")
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    store = hass.data[DOMAIN]
    created = await store.async_create_profile("Luca")
    await hass.async_block_till_done()
    profile = store.profiles[created["id"]]
    profile["week"] = {str(d): copy.deepcopy([COLAZIONE, PRANZO]) for d in range(7)}
    profile["reminder"] = {"enabled": notify is not None, "minutes": 15, "notify": notify}
    await store.async_save_profile(profile)
    await hass.async_block_till_done()
    return store, created["id"]


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


async def test_adding_profile_creates_entities(hass, freezer):
    freezer.move_to(at(10, 0))
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    await hass.data[DOMAIN].async_create_profile("Anna")
    await hass.async_block_till_done()
    assert hass.states.get("sensor.anna_pasto_attuale") is not None
    assert hass.states.get("sensor.anna_prossimo_pasto") is not None


async def test_deleting_profile_removes_its_entities(hass, freezer):
    freezer.move_to(at(10, 0))
    store, profile_id = await _setup_luca(hass)
    registry = er.async_get(hass)
    assert registry.async_get("sensor.luca_pasto_attuale") is not None
    await store.async_delete_profile(profile_id)
    await hass.async_block_till_done()
    assert registry.async_get("sensor.luca_pasto_attuale") is None
    assert registry.async_get("sensor.luca_prossimo_pasto") is None
