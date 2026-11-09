"""Shared Diet integration."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # Task 4 stores the DietStore here.
    entry.runtime_data = None
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return True
