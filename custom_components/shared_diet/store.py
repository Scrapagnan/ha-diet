"""Persistent diet profiles and shared recipes with optimistic concurrency (rev check on save)."""

from __future__ import annotations

import copy
import logging
import uuid
from collections.abc import Callable, Iterator

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DEFAULT_CATEGORIES, FALLBACK_CATEGORY, STORAGE_KEY, STORAGE_VERSION
from .model import effective_order, fold_name

_LOGGER = logging.getLogger(__name__)

# Cap on a meal's shared_with list. Profiles themselves are one per HA user, so the HA admin bounds their number.
MAX_PROFILES = 100
MAX_CATEGORIES = 50
MAX_FOOD_CATEGORIES = 2000  # food -> category overrides


class ConflictError(Exception):
    """Profile or recipe was saved since it was read."""


class DuplicateNameError(Exception):
    """Another recipe or category already has this name (fold_name comparison)."""


class LimitError(Exception):
    """Too many categories or food overrides."""


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
        "person": None,  # only used to link profiles created before users had one (async_sync_users)
        "disabled": False,  # set by an admin: week and choices frozen, no reminders, left out of today and shopping
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
        self._categories: list[dict] = []  # the house's shopping categories, in list order
        self._food_categories: dict[str, str] = {}  # fold_name(food) -> category id
        self._category_order: dict[str, list[str]] = {}  # HA user id -> saved order; not in the snapshot
        # The family shopping list (todo entity): [{uid, summary, status}]. Not in the snapshot: the entity pushes it.
        self._shopping: list[dict] = []
        self._shopping_listeners: list[Callable[[], None]] = []
        self._listeners: list[Callable[[], None]] = []
        self._snapshot: dict | None = None

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self._profiles = data.get("profiles", {})
        self._recipes = data.get("recipes", {})
        self._categories = data["categories"] if "categories" in data else copy.deepcopy(DEFAULT_CATEGORIES)
        self._food_categories = data.get("food_categories", {})
        self._category_order = data.get("category_order", {})
        self._shopping = data.get("shopping", [])
        for profile in self._profiles.values():
            profile.setdefault("recipe_qty", {})
            profile.setdefault("user_id", None)
            profile.setdefault("disabled", False)
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
            self._snapshot = copy.deepcopy(
                {
                    "profiles": self._profiles,
                    "recipes": self._recipes,
                    "categories": self._categories,
                    "food_categories": self._food_categories,
                }
            )
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
        the user (person entity -> user id), else a new one. Profiles of users that no longer exist (removed while
        the integration was not loaded) are deleted. Idempotent."""
        for profile_id in [pid for pid, p in self._profiles.items() if p["user_id"] and p["user_id"] not in users]:
            await self.async_delete_profile(profile_id)
        owned = {p["user_id"] for p in self._profiles.values()}
        changed = False
        for user_id in [uid for uid in self._category_order if uid not in users]:
            del self._category_order[user_id]
            changed = True
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
        had_order = self._category_order.pop(user_id, None) is not None
        owned = [pid for pid, p in self._profiles.items() if p["user_id"] == user_id]
        for profile_id in owned:
            await self.async_delete_profile(profile_id)
        if had_order and not owned:
            await self._async_save()

    async def async_save_profile(self, profile: dict) -> dict:
        current = self._profiles.get(profile["id"])
        if current is None:
            raise KeyError(profile["id"])
        if profile["rev"] != current["rev"]:
            raise ConflictError(profile["id"])
        saved = copy.deepcopy(profile)
        saved["user_id"] = current["user_id"]  # ownership is not the client's to change
        saved["disabled"] = current["disabled"]  # only async_set_disabled changes it
        if current["disabled"]:  # a disabled profile keeps its week and choices; name and reminder stay editable
            for key in ("week", "exceptions", "choices", "recipe_qty"):
                saved[key] = copy.deepcopy(current[key])
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

    async def async_set_disabled(self, profile_id: str, disabled: bool) -> None:
        profile = self._profiles.get(profile_id)
        if profile is None:
            raise KeyError(profile_id)
        if profile["disabled"] != disabled:
            profile["disabled"] = disabled  # no rev bump: an open draft of it must still save
            await self._async_commit()

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

    # Categories: atomic commands, last write wins (no rev).

    async def async_create_category(self, name: str) -> dict:
        if len(self._categories) >= MAX_CATEGORIES:
            raise LimitError
        self._check_category_name(name, None)
        category = {"id": uuid.uuid4().hex, "name": name}
        self._categories.append(category)
        await self._async_commit()
        return dict(category)

    async def async_rename_category(self, category_id: str, name: str) -> None:
        category = self._category(category_id)
        self._check_category_name(name, category_id)
        category["name"] = name
        await self._async_commit()

    async def async_delete_category(self, category_id: str) -> None:
        """Raises KeyError if missing, ValueError for "altro". Its overrides go: those foods are assigned automatically again."""
        category = self._category(category_id)
        if category_id == FALLBACK_CATEGORY:
            raise ValueError(category_id)
        self._categories.remove(category)
        self._food_categories = {food: cid for food, cid in self._food_categories.items() if cid != category_id}
        for order in self._category_order.values():
            if category_id in order:
                order.remove(category_id)
        await self._async_commit()

    async def async_set_food_category(self, food: str, category_id: str | None) -> None:
        """None removes the override. Raises KeyError for an unknown category, ValueError for a blank food."""
        key = fold_name(food)
        if not key:
            raise ValueError(food)
        if category_id is None:
            if self._food_categories.pop(key, None) is not None:
                await self._async_commit()
            return
        self._category(category_id)
        if key not in self._food_categories and len(self._food_categories) >= MAX_FOOD_CATEGORIES:
            raise LimitError
        self._food_categories[key] = category_id
        await self._async_commit()

    def category_order(self, user_id: str) -> list[str]:
        return effective_order(self._category_order.get(user_id, []), self._categories)

    async def async_set_category_order(self, user_id: str, order: list[str]) -> list[str]:
        """Raises KeyError for an unknown id; duplicates are dropped. Returns the effective order."""
        known = {c["id"] for c in self._categories}
        unknown = [cid for cid in order if cid not in known]
        if unknown:
            raise KeyError(unknown[0])
        self._category_order[user_id] = list(dict.fromkeys(order))
        await self._async_save()  # not in the snapshot: nobody else needs a push
        return self.category_order(user_id)

    # Shopping list: what the todo entity shows. Changes notify only its listeners (no snapshot push).

    @property
    def shopping(self) -> list[dict]:
        return copy.deepcopy(self._shopping)

    async def async_add_shopping(self, texts: list[str]) -> None:
        self._shopping += [{"uid": uuid.uuid4().hex, "summary": t, "status": "needs_action"} for t in texts]
        await self._async_shopping_changed()

    async def async_update_shopping(self, uid: str, summary: str | None, status: str | None) -> None:
        item = self._shopping_item(uid)
        if summary is not None:
            item["summary"] = summary
        if status is not None:
            item["status"] = status
        await self._async_shopping_changed()

    async def async_delete_shopping(self, uids: list[str]) -> None:
        gone = set(uids)
        self._shopping = [i for i in self._shopping if i["uid"] not in gone]
        await self._async_shopping_changed()

    async def async_move_shopping(self, uid: str, previous_uid: str | None) -> None:
        """Puts the item right after previous_uid (first when None)."""
        item = self._shopping_item(uid)
        if previous_uid is not None:
            self._shopping_item(previous_uid)
        self._shopping.remove(item)
        at = 0 if previous_uid is None else next(i for i, x in enumerate(self._shopping) if x["uid"] == previous_uid) + 1
        self._shopping.insert(at, item)
        await self._async_shopping_changed()

    def async_add_shopping_listener(self, cb: Callable[[], None]) -> Callable[[], None]:
        self._shopping_listeners.append(cb)
        return lambda: self._shopping_listeners.remove(cb)

    def _shopping_item(self, uid: str) -> dict:
        item = next((i for i in self._shopping if i["uid"] == uid), None)
        if item is None:
            raise KeyError(uid)
        return item

    async def _async_shopping_changed(self) -> None:
        await self._async_save()
        for cb in list(self._shopping_listeners):
            cb()

    def async_add_listener(self, cb: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(cb)

        def unsub() -> None:
            self._listeners.remove(cb)

        return unsub

    def _check_name(self, name: str, own_id: str | None) -> None:
        key = fold_name(name)
        if any(fold_name(r["name"]) == key for rid, r in self._recipes.items() if rid != own_id):
            raise DuplicateNameError(name)

    def _category(self, category_id: str) -> dict:
        category = next((c for c in self._categories if c["id"] == category_id), None)
        if category is None:
            raise KeyError(category_id)
        return category

    def _check_category_name(self, name: str, own_id: str | None) -> None:
        key = fold_name(name)
        if any(fold_name(c["name"]) == key for c in self._categories if c["id"] != own_id):
            raise DuplicateNameError(name)

    def _alt_ids(self, recipe_id: str) -> set[str]:
        return {a["id"] for i in self._recipes[recipe_id]["ingredients"] for a in i["alts"]}

    async def _async_save(self) -> None:
        await self._store.async_save(
            {
                **self.snapshot(),
                "category_order": copy.deepcopy(self._category_order),
                "shopping": copy.deepcopy(self._shopping),
            }
        )

    async def _async_commit(self) -> None:
        self._snapshot = None
        await self._async_save()
        for cb in list(self._listeners):
            try:
                cb()
            except Exception:  # a broken listener must not fail a saved change
                _LOGGER.exception("shared_diet listener failed")
