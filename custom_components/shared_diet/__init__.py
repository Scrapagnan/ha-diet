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
from homeassistant.core import Event, HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.start import async_at_started
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
    # The snapshot is replaced, never mutated, on commit: safe to read across the awaits below.
    sends: list[tuple[str, dict]] = []
    data = store.snapshot()
    recipes = data["recipes"]
    for profile in data["profiles"].values():
        try:
            reminder = profile["reminder"]
            if not (reminder["enabled"] and reminder["notify"]):
                continue
            target = now + timedelta(minutes=reminder["minutes"])
            hhmm = target.strftime("%H:%M")
            service = reminder["notify"].removeprefix("notify.")
            for meal in effective_day(profile, target.date()):
                if meal["time"] != hhmm or meal.get("remind") is False:
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


async def _sync_users(hass: HomeAssistant, store: DietStore) -> None:
    """One profile per non-system HA user; existing profiles are matched through their person's user."""
    users = {u.id: u.name or "Utente" for u in await hass.auth.async_get_users() if not u.system_generated}
    person_users = {
        s.entity_id: s.attributes["user_id"] for s in hass.states.async_all("person") if s.attributes.get("user_id")
    }
    await store.async_sync_users(users, person_users)


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

    # After start: person states, used to match existing profiles to users, are loaded by then.
    async def _started(_hass: HomeAssistant) -> None:
        await _sync_users(hass, store)

    async def _user_added(_event: Event) -> None:
        await _sync_users(hass, store)

    async def _user_removed(event: Event) -> None:
        await store.async_delete_user_profile(event.data["user_id"])

    entry.async_on_unload(async_at_started(hass, _started))
    entry.async_on_unload(hass.bus.async_listen("user_added", _user_added))
    entry.async_on_unload(hass.bus.async_listen("user_removed", _user_removed))

    # ponytail: tick every minute even when no meal is due; schedule per meal time if idle wakeups matter.
    entry.async_on_unload(async_track_time_change(hass, _tick, second=0))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    frontend.async_remove_panel(hass, PANEL_URL)
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        # The websocket commands stay registered; without the store they answer "not_loaded".
        # Setup reloads the data from disk.
        hass.data.pop(DOMAIN, None)
    return unloaded
