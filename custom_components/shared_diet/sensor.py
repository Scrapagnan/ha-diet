"""Current and next meal sensors per family profile."""

from __future__ import annotations

from datetime import datetime

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .model import current_and_next, format_item
from .store import DietStore


class MealSensor(SensorEntity):
    _attr_has_entity_name = False
    _attr_should_poll = False

    def __init__(self, store: DietStore, profile_id: str, name: str, current: bool) -> None:
        self._store = store
        self._profile_id = profile_id
        self._index = 0 if current else 1
        self._attr_name = f"{name} pasto attuale" if current else f"{name} prossimo pasto"
        self._attr_unique_id = f"{profile_id}_{'current' if current else 'next'}"
        self._profile: dict | None = None
        self._meal: dict | None = None

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._store.async_add_listener(self._refresh))
        self.async_on_remove(async_track_time_change(self.hass, self._refresh, second=0))
        self._refresh()

    @callback
    def _refresh(self, _now: datetime | None = None) -> None:
        self._profile = self._store.profiles.get(self._profile_id)
        self._meal = None
        if self._profile is not None:
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
    profiles = store.profiles
    # Entities of deleted profiles would otherwise stay in the registry as orphans.
    registry = er.async_get(hass)
    for reg_entry in er.async_entries_for_config_entry(registry, entry.entry_id):
        if reg_entry.unique_id.rsplit("_", 1)[0] not in profiles:
            registry.async_remove(reg_entry.entity_id)
    async_add_entities(
        entity
        for pid, profile in profiles.items()
        for entity in (MealSensor(store, pid, profile["name"], True), MealSensor(store, pid, profile["name"], False))
    )
