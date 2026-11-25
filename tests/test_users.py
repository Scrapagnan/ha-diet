"""One profile per HA user: created at start and on user_added, linked through persons, removed with the user."""

import uuid

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.shared_diet.const import DOMAIN, STORAGE_KEY, STORAGE_VERSION
from custom_components.shared_diet.store import _new_profile


def _by_user(hass):
    return {p["user_id"]: p for p in hass.data[DOMAIN].profiles.values()}


async def _setup(hass):
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def test_every_user_gets_a_profile_at_start(hass):
    anna = await hass.auth.async_create_user("Anna", group_ids=["system-users"])
    system = await hass.auth.async_create_system_user("Bot")
    await _setup(hass)
    profiles = _by_user(hass)
    assert profiles[anna.id]["name"] == "Anna"
    assert system.id not in profiles

    await hass.config_entries.async_reload(hass.config_entries.async_entries(DOMAIN)[0].entry_id)
    await hass.async_block_till_done()
    assert _by_user(hass) == profiles  # idempotent: a restart creates nothing new


async def test_user_added_and_removed_without_restart(hass):
    await hass.auth.async_create_user("Owner", group_ids=["system-admin"])  # the first user is the owner, never removable
    await _setup(hass)
    bea = await hass.auth.async_create_user("Bea", group_ids=["system-users"])
    await hass.async_block_till_done()
    store = hass.data[DOMAIN]
    gone = _by_user(hass)[bea.id]

    kept = await store.async_create_profile("Kept")
    kept["week"]["0"] = [{"id": "m", "name": "Pranzo", "time": "12:00", "shared_with": [gone["id"], "x"],
                          "options": [[{"alts": [{"food": "Riso", "qty": 1.0, "unit": "g", "note": ""}]}]]}]
    await store.async_save_profile(kept)

    await hass.auth.async_remove_user(bea)
    await hass.async_block_till_done()
    assert gone["id"] not in store.profiles
    assert store.profiles[kept["id"]]["week"]["0"][0]["shared_with"] == ["x"]


async def test_existing_profiles_are_linked_through_persons(hass, hass_storage):
    carla = await hass.auth.async_create_user("Carla", group_ids=["system-users"])
    dario = await hass.auth.async_create_user("Dario", group_ids=["system-users"])
    hass.states.async_set("person.carla", "home", {"user_id": carla.id})
    hass.states.async_set("person.ospite", "home", {})  # a person without a user
    linked = {**_new_profile("Carla dieta", None), "person": "person.carla"}
    unlinked = {**_new_profile("Ospite", None), "person": "person.ospite"}
    old = {k: v for k, v in _new_profile("Vecchio", None).items() if k != "user_id"}  # stored before user_id existed
    profiles = {p["id"]: p for p in (linked, unlinked, old)}
    hass_storage[STORAGE_KEY] = {"version": STORAGE_VERSION, "key": STORAGE_KEY, "data": {"profiles": profiles, "recipes": {}}}

    await _setup(hass)
    store = hass.data[DOMAIN]
    assert store.profiles[linked["id"]]["user_id"] == carla.id
    assert store.profiles[linked["id"]]["rev"] == 1
    assert store.profiles[unlinked["id"]]["user_id"] is None
    assert store.profiles[old["id"]]["user_id"] is None
    assert _by_user(hass)[dario.id]["name"] == "Dario"
    assert sum(p["user_id"] == carla.id for p in store.profiles.values()) == 1  # no second profile for Carla


async def test_person_of_a_user_with_a_profile_is_not_linked_twice(hass):
    erin = await hass.auth.async_create_user("Erin", group_ids=["system-users"])
    await _setup(hass)
    store = hass.data[DOMAIN]
    extra = await store.async_create_profile(str(uuid.uuid4()))
    extra["person"] = "person.erin"
    await store.async_save_profile(extra)
    hass.states.async_set("person.erin", "home", {"user_id": erin.id})
    await store.async_sync_users({erin.id: "Erin"}, {"person.erin": erin.id})
    assert store.profiles[extra["id"]]["user_id"] is None
