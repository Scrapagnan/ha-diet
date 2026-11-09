"""Shared Diet integration."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from . import websocket
from .const import DOMAIN
from .model import choice_for, effective_day, format_item, resolve_meal
from .store import DietStore

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
PLATFORMS = [Platform.SENSOR]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    websocket.async_register(hass)
    return True


async def _send_reminders(hass: HomeAssistant, store: DietStore) -> None:
    now = dt_util.now()
    for profile in store.profiles.values():
        reminder = profile["reminder"]
        if not (reminder["enabled"] and reminder["notify"]):
            continue
        target = now + timedelta(minutes=reminder["minutes"])
        hhmm = target.strftime("%H:%M")
        service = reminder["notify"].removeprefix("notify.")
        for meal in effective_day(profile, target.date()):
            if meal["time"] != hhmm:
                continue
            resolved = resolve_meal(meal, choice_for(profile, target.date(), meal["id"]))
            try:
                await hass.services.async_call(
                    "notify",
                    service,
                    {
                        "title": f"{profile['name']}: {meal['name']} alle {hhmm}",
                        "message": ", ".join(format_item(i) for i in resolved["items"]),
                    },
                    blocking=True,
                )
            except Exception:
                _LOGGER.warning("shared_diet reminder failed: notify.%s unavailable", service)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if DOMAIN not in hass.data:
        store = DietStore(hass)
        await store.async_load()
        hass.data[DOMAIN] = store
    store = hass.data[DOMAIN]
    entry.runtime_data = store

    known = set(store.profiles)

    def _profiles_changed() -> None:
        if set(store.profiles) != known:
            hass.config_entries.async_schedule_reload(entry.entry_id)

    entry.async_on_unload(store.async_add_listener(_profiles_changed))

    async def _tick(_now: datetime) -> None:
        await _send_reminders(hass, store)

    # ponytail: tick every minute even when no meal is due; schedule per meal time if idle wakeups matter.
    entry.async_on_unload(async_track_time_change(hass, _tick, second=0))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
