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

# Cap on a meal's shared_with list. Profiles themselves are one per HA user, so the HA admin bounds their number.
MAX_PROFILES = 100


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


def _new_profile(name: str, user_id: str | None) -> dict:
    return {
        "id": uuid.uuid4().hex,
        "name": name,
        "user_id": user_id,  # owning HA user; None for profiles created before users had one
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
            profile.setdefault("user_id", None)
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

    async def async_create_profile(self, name: str, user_id: str | None = None) -> dict:
        profile = _new_profile(name, user_id)
        self._profiles[profile["id"]] = profile
        await self._async_commit()
        return copy.deepcopy(profile)

    async def async_sync_users(self, users: dict[str, str], person_users: dict[str, str]) -> None:
        """Gives every user (id -> name) a profile: first by linking an unowned profile whose person belongs to
        the user (person entity -> user id), else a new one. Idempotent."""
        owned = {p["user_id"] for p in self._profiles.values()}
        changed = False
        for profile in self._profiles.values():
            user_id = person_users.get(profile["person"] or "")
            if profile["user_id"] is None and user_id in users and user_id not in owned:
                profile["user_id"] = user_id  # no rev bump: an open draft of it must still save
                owned.add(user_id)
                changed = True
        for user_id, name in users.items():
            if user_id not in owned:
                profile = _new_profile(name, user_id)
                self._profiles[profile["id"]] = profile
                changed = True
        if changed:
            await self._async_commit()

    async def async_delete_user_profile(self, user_id: str) -> None:
        for profile_id, profile in list(self._profiles.items()):
            if profile["user_id"] == user_id:
                await self.async_delete_profile(profile_id)

    async def async_save_profile(self, profile: dict) -> dict:
        current = self._profiles.get(profile["id"])
        if current is None:
            raise KeyError(profile["id"])
        if profile["rev"] != current["rev"]:
            raise ConflictError(profile["id"])
        saved = copy.deepcopy(profile)
        saved["user_id"] = current["user_id"]  # ownership is not the client's to change
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
        # No rev bump: open drafts of other profiles must not conflict over it. A draft may save the id back; readers ignore it.
        for profile in self._profiles.values():
            for meals in [*profile["week"].values(), *profile["exceptions"].values()]:
                for meal in meals:
                    if profile_id in (meal.get("shared_with") or []):
                        meal["shared_with"] = [pid for pid in meal["shared_with"] if pid != profile_id]
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
