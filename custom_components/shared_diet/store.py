"""Persistent diet profiles and shared recipes with optimistic concurrency (rev check on save)."""

from __future__ import annotations

import copy
import logging
import uuid
from collections.abc import Callable, Iterator

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION
from .model import fold_name

_LOGGER = logging.getLogger(__name__)

# Each profile adds two sensors that re-resolve its meals every minute.
MAX_PROFILES = 30


class LimitError(Exception):
    """Too many profiles."""


class ConflictError(Exception):
    """Profile or recipe was saved since it was read."""


class DuplicateNameError(Exception):
    """Another recipe already has this name (fold_name comparison)."""


class UnknownRecipeError(ValueError):
    """A meal references a recipe that no longer exists."""


class InUseError(Exception):
    """Recipe is referenced by meals of these profiles."""

    def __init__(self, profile_names: list[str]) -> None:
        self.profile_names = profile_names
        super().__init__("Ricetta usata da: " + ", ".join(profile_names))


def _new_profile(name: str) -> dict:
    return {
        "id": uuid.uuid4().hex,
        "name": name,
        "person": None,
        "reminder": {"enabled": False, "minutes": 15, "notify": None},
        "week": {str(day): [] for day in range(7)},
        "exceptions": {},
        "choices": {"defaults": {}, "dates": {}},
        "recipe_qty": {},
        "rev": 1,
    }


def _alts(profile: dict) -> Iterator[dict]:
    for meals in [*profile["week"].values(), *profile["exceptions"].values()]:
        for meal in meals:
            for option in meal["options"]:
                for line in option:
                    yield from line["alts"]


class DietStore:
    # ponytail: revisione per profilo intero; granularità per pasto se i conflitti diventano frequenti.
    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._profiles: dict[str, dict] = {}
        self._recipes: dict[str, dict] = {}
        self._listeners: list[Callable[[], None]] = []
        self._snapshot: dict | None = None

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self._profiles = data.get("profiles", {})
        self._recipes = data.get("recipes", {})
        for profile in self._profiles.values():
            profile.setdefault("recipe_qty", {})
        for recipe in self._recipes.values():
            for ing in recipe["ingredients"]:
                if "food" in ing and "alts" not in ing:  # pre-alternatives flat ingredient
                    flat = {k: ing.pop(k) for k in ("food", "qty", "unit")}
                    ing["alts"] = [{"id": ing["id"], **flat}]

    @property
    def profiles(self) -> dict[str, dict]:
        return copy.deepcopy(self._profiles)

    @property
    def recipes(self) -> dict[str, dict]:
        return copy.deepcopy(self._recipes)

    def snapshot(self) -> dict:
        """One copy of all data per commit, shared by every reader. Read-only: never mutate it."""
        if self._snapshot is None:
            self._snapshot = {"profiles": copy.deepcopy(self._profiles), "recipes": copy.deepcopy(self._recipes)}
        return self._snapshot

    def profile(self, profile_id: str) -> dict | None:
        profile = self._profiles.get(profile_id)
        return copy.deepcopy(profile) if profile is not None else None

    async def async_create_profile(self, name: str) -> dict:
        if len(self._profiles) >= MAX_PROFILES:
            raise LimitError(MAX_PROFILES)
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
        for alt in _alts(saved):
            if "recipe" in alt and alt["recipe"] not in self._recipes:
                raise UnknownRecipeError(alt["recipe"])
        recipe_qty = {}
        for rid, overrides in saved.get("recipe_qty", {}).items():
            if rid in self._recipes:
                valid = self._alt_ids(rid)
                recipe_qty[rid] = {aid: qty for aid, qty in overrides.items() if aid in valid}
        saved["recipe_qty"] = recipe_qty
        saved["rev"] += 1
        self._profiles[saved["id"]] = saved
        await self._async_commit()
        return copy.deepcopy(saved)

    async def async_delete_profile(self, profile_id: str) -> None:
        if self._profiles.pop(profile_id, None) is None:
            return
        await self._async_commit()

    async def async_create_recipe(self, name: str) -> dict:
        self._check_name(name, None)
        recipe = {"id": uuid.uuid4().hex, "name": name, "note": "", "ingredients": [], "rev": 1}
        self._recipes[recipe["id"]] = recipe
        await self._async_commit()
        return copy.deepcopy(recipe)

    async def async_save_recipe(self, recipe: dict) -> dict:
        current = self._recipes.get(recipe["id"])
        if current is None:
            raise KeyError(recipe["id"])
        if recipe["rev"] != current["rev"]:
            raise ConflictError(recipe["id"])
        self._check_name(recipe["name"], recipe["id"])
        saved = copy.deepcopy(recipe)
        saved["rev"] += 1
        self._recipes[saved["id"]] = saved
        await self._async_commit()
        return copy.deepcopy(saved)

    async def async_delete_recipe(self, recipe_id: str) -> None:
        if recipe_id not in self._recipes:
            return
        users = sorted(
            p["name"]
            for p in self._profiles.values()
            if any(alt.get("recipe") == recipe_id for alt in _alts(p))
        )
        if users:
            raise InUseError(users)
        del self._recipes[recipe_id]
        await self._async_commit()

    def async_add_listener(self, cb: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(cb)

        def unsub() -> None:
            self._listeners.remove(cb)

        return unsub

    def _check_name(self, name: str, own_id: str | None) -> None:
        key = fold_name(name)
        if any(fold_name(r["name"]) == key for rid, r in self._recipes.items() if rid != own_id):
            raise DuplicateNameError(name)

    def _alt_ids(self, recipe_id: str) -> set[str]:
        return {a["id"] for i in self._recipes[recipe_id]["ingredients"] for a in i["alts"]}

    async def _async_commit(self) -> None:
        self._snapshot = None
        await self._store.async_save(self.snapshot())
        for cb in list(self._listeners):
            try:
                cb()
            except Exception:  # a broken listener must not fail a saved change
                _LOGGER.exception("shared_diet listener failed")
