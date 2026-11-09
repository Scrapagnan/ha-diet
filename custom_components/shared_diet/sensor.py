"""Current and next meal sensors per family profile."""

from __future__ import annotations

from datetime import datetime

from homeassistant.components.sensor import DOMAIN as SENSOR_DOMAIN, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .model import current_and_next, format_item
from .store import DietStore


class MealSensor(SensorEntity):
    _attr_has_entity_name = False
    _attr_should_poll = False

    def __init__(self, store: DietStore, profile_id: str, name: str, current: bool) -> None:
        self._store = store
        self._profile_id = profile_id
        self._index = 0 if current else 1
        self._current = current
        self._attr_name = self._label(name)
        self._attr_unique_id = f"{profile_id}_{'current' if current else 'next'}"
        self._profile: dict | None = None
        self._meal: dict | None = None

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._store.async_add_listener(self._refresh))
        self.async_on_remove(async_track_time_change(self.hass, self._refresh, second=0))
        self._refresh()

    def _label(self, name: str) -> str:
        return f"{name} pasto attuale" if self._current else f"{name} prossimo pasto"

    @callback
    def _refresh(self, _now: datetime | None = None) -> None:
        self._profile = self._store.profiles.get(self._profile_id)
        self._meal = None
        if self._profile is not None:
            self._attr_name = self._label(self._profile["name"])
            self._meal = current_and_next(self._profile, dt_util.now())[self._index]
        self.async_write_ha_state()

    @property
    def native_value(self) -> str | None:
        return self._meal["name"] if self._meal else None

    @property
    def extra_state_attributes(self) -> dict:
        meal = self._meal
        return {
            "time": meal["time"] if meal else None,
            "items": [format_item(i) for i in meal["items"]] if meal else [],
            "option": meal["option"] if meal else None,
            "profile_id": self._profile_id,
            "person": self._profile["person"] if self._profile else None,
        }


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    store: DietStore = entry.runtime_data
    registry = er.async_get(hass)
    # Entities of deleted profiles would otherwise stay in the registry as orphans.
    for reg_entry in er.async_entries_for_config_entry(registry, entry.entry_id):
        if reg_entry.unique_id.rsplit("_", 1)[0] not in store.profiles:
            registry.async_remove(reg_entry.entity_id)

    sensors: dict[str, tuple[MealSensor, MealSensor]] = {}

    @callback
    def _sync_profiles() -> None:
        profiles = store.profiles
        for pid in set(sensors) - set(profiles):
            for sensor in sensors.pop(pid):
                entity_id = registry.async_get_entity_id(SENSOR_DOMAIN, DOMAIN, sensor.unique_id)
                if entity_id is not None:
                    registry.async_remove(entity_id)
                hass.async_create_task(sensor.async_remove(force_remove=True))
        added = []
        for pid in set(profiles) - set(sensors):
            name = profiles[pid]["name"]
            sensors[pid] = (MealSensor(store, pid, name, True), MealSensor(store, pid, name, False))
            added.extend(sensors[pid])
        if added:
            async_add_entities(added)

    _sync_profiles()
    entry.async_on_unload(store.async_add_listener(_sync_profiles))
