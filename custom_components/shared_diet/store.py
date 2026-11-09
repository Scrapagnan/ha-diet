"""Persistent diet profiles with optimistic concurrency (rev check on save)."""

from __future__ import annotations

import copy
import logging
import uuid
from collections.abc import Callable

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION

_LOGGER = logging.getLogger(__name__)


class ConflictError(Exception):
    """Profile was saved since it was read."""


def _new_profile(name: str) -> dict:
    return {
        "id": uuid.uuid4().hex,
        "name": name,
        "person": None,
        "reminder": {"enabled": False, "minutes": 15, "notify": None},
        "week": {str(day): [] for day in range(7)},
        "exceptions": {},
        "choices": {"defaults": {}, "dates": {}},
        "rev": 1,
    }


class DietStore:
    # ponytail: revisione per profilo intero; granularità per pasto se i conflitti diventano frequenti.
    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._profiles: dict[str, dict] = {}
        self._listeners: list[Callable[[], None]] = []

    async def async_load(self) -> None:
        data = await self._store.async_load()
        self._profiles = (data or {}).get("profiles", {})

    @property
    def profiles(self) -> dict[str, dict]:
        return copy.deepcopy(self._profiles)

    async def async_create_profile(self, name: str) -> dict:
        profile = _new_profile(name)
        self._profiles[profile["id"]] = profile
        await self._async_commit()
        return copy.deepcopy(profile)

    async def async_save_profile(self, profile: dict) -> dict:
        current = self._profiles.get(profile["id"])
        if current is None:
            raise KeyError(profile["id"])
        if profile["rev"] != current["rev"]:
            raise ConflictError(profile["id"])
        saved = copy.deepcopy(profile)
        saved["rev"] += 1
        self._profiles[saved["id"]] = saved
        await self._async_commit()
        return copy.deepcopy(saved)

    async def async_delete_profile(self, profile_id: str) -> None:
        if self._profiles.pop(profile_id, None) is None:
            return
        await self._async_commit()

    def async_add_listener(self, cb: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(cb)

        def unsub() -> None:
            self._listeners.remove(cb)

        return unsub

    async def _async_commit(self) -> None:
        await self._store.async_save({"profiles": copy.deepcopy(self._profiles)})
        for cb in list(self._listeners):
            try:
                cb()
            except Exception:  # a broken listener must not fail a saved change
                _LOGGER.exception("shared_diet listener failed")
