"""Shared Diet integration."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from pathlib import Path

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.panel_custom import async_register_panel
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from . import websocket
from .const import DOMAIN, PANEL_URL, VERSION
from .model import choice_for, effective_day, format_item, resolve_meal
from .store import DietStore

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
PLATFORMS = [Platform.SENSOR]
STATIC_URL = "/shared_diet_static"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    websocket.async_register(hass)
    # Registered once: entry reloads re-run async_setup_entry and aiohttp rejects duplicate routes.
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL, str(Path(__file__).parent / "frontend"), False)]
    )
    return True


async def _send_reminders(hass: HomeAssistant, store: DietStore) -> None:
    now = dt_util.now()
    # store.profiles is a deep copy, so this snapshot is safe to use across the awaits below.
    sends: list[tuple[str, dict]] = []
    recipes = store.recipes
    for profile in store.profiles.values():
        try:
            reminder = profile["reminder"]
            if not (reminder["enabled"] and reminder["notify"]):
                continue
            target = now + timedelta(minutes=reminder["minutes"])
            hhmm = target.strftime("%H:%M")
            service = reminder["notify"].removeprefix("notify.")
            for meal in effective_day(profile, target.date()):
                if meal["time"] != hhmm:
                    continue
                resolved = resolve_meal(meal, choice_for(profile, target.date(), meal["id"]), profile, recipes)
                sends.append(
                    (
                        service,
                        {
                            "title": f"{profile['name']}: {meal['name']} alle {hhmm}",
                            "message": ", ".join(format_item(i) for i in resolved["items"]),
                        },
                    )
                )
        except Exception as err:  # one malformed profile must not skip the others
            _LOGGER.warning("shared_diet reminder skipped for profile %s: %s", profile.get("id"), err)

    async def _send(service: str, data: dict) -> None:
        try:
            await hass.services.async_call("notify", service, data, blocking=True)
        except Exception as err:  # a slow or missing service must not stall or break the others
            _LOGGER.warning("shared_diet reminder failed for notify.%s: %s", service, err)

    await asyncio.gather(*(_send(service, data) for service, data in sends))


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if DOMAIN not in hass.data:
        store = DietStore(hass)
        await store.async_load()
        hass.data[DOMAIN] = store
    store = hass.data[DOMAIN]
    entry.runtime_data = store

    await async_register_panel(
        hass,
        webcomponent_name="shared-diet-panel",
        frontend_url_path=PANEL_URL,
        module_url=f"{STATIC_URL}/shared-diet-panel.js?v={VERSION}",
        sidebar_title="Dieta",
        sidebar_icon="mdi:food-apple",
        require_admin=False,
    )

    async def _tick(_now: datetime) -> None:
        await _send_reminders(hass, store)

    # ponytail: tick every minute even when no meal is due; schedule per meal time if idle wakeups matter.
    entry.async_on_unload(async_track_time_change(hass, _tick, second=0))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    frontend.async_remove_panel(hass, PANEL_URL)
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
