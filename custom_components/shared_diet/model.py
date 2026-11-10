"""Pure day/meal logic for shared_diet. No homeassistant imports."""

import unicodedata
from datetime import date, datetime, timedelta


def fold_name(s: str) -> str:
    """Recipe/food name key: lowercase, no accents, collapsed spaces."""
    decomposed = unicodedata.normalize("NFD", s)
    plain = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return " ".join(plain.casefold().split())


def expand_item(item: dict, profile: dict, recipes: dict, recipe_choice: dict | None = None) -> dict:
    """Simple items unchanged; recipe items expanded to the chosen alternative per ingredient, grams from profile overrides."""
    if "recipe" not in item:
        return item
    rid = item["recipe"]
    recipe = recipes.get(rid)
    if recipe is None:
        return {"recipe": rid, "food": "Ricetta mancante", "note": "", "ingredients": [], "missing": True}
    overrides = profile.get("recipe_qty", {}).get(rid, {})
    chosen_ids = recipe_choice or {}
    ingredients = []
    for ing in recipe["ingredients"]:
        alts = ing["alts"]
        alt = next((a for a in alts if a["id"] == chosen_ids.get(ing["id"])), alts[0])
        ingredients.append({"food": alt["food"], "qty": overrides.get(alt["id"], alt["qty"]), "unit": alt["unit"], "note": ""})
    return {"recipe": rid, "food": recipe["name"], "note": recipe["note"], "ingredients": ingredients, "missing": False}


def effective_day(profile: dict, day: date) -> list[dict]:
    """Meals for a day: exception for that date if present, else the weekly schema."""
    exceptions = profile["exceptions"]
    if day.isoformat() in exceptions:
        return exceptions[day.isoformat()]
    return profile["week"][str(day.weekday())]


def choice_for(profile: dict, day: date, meal_id: str) -> dict:
    """Choice priority: per-date override > per-meal default > first option."""
    by_date = profile["choices"]["dates"].get(day.isoformat(), {})
    if meal_id in by_date:
        return by_date[meal_id]
    if meal_id in profile["choices"]["defaults"]:
        return profile["choices"]["defaults"][meal_id]
    return {"option": 0, "lines": {}}


def resolve_meal(meal: dict, choice: dict, profile: dict | None = None, recipes: dict | None = None) -> dict:
    """Pick the chosen option and one alternative per line; invalid indexes fall back to 0."""
    options = meal["options"]
    opt = choice["option"] if 0 <= choice["option"] < len(options) else 0
    items = []
    for i, line in enumerate(options[opt]):
        alt = choice["lines"].get(str(i), 0)
        if not 0 <= alt < len(line["alts"]):
            alt = 0
        picked = line["alts"][alt]
        recipe_choice = choice.get("recipes", {}).get(picked.get("recipe"), {})
        items.append(expand_item(picked, profile or {}, recipes or {}, recipe_choice))
    return {
        "id": meal["id"],
        "name": meal["name"],
        "time": meal["time"],
        "option": opt,
        "items": items,
        "all_options": options,
    }


def _timed(meals: list[dict]) -> list[dict]:
    """Meals with a time, sorted by HH:MM. Untimed meals are never current or next."""
    return sorted((m for m in meals if m["time"]), key=lambda m: m["time"])


def current_and_next(
    profile: dict, now: datetime, recipes: dict | None = None
) -> tuple[dict | None, dict | None]:
    """Resolved current meal (today, last one at or before now) and next meal (today, else up to 7 days ahead)."""
    today = now.date()
    hm = now.strftime("%H:%M")
    todays = _timed(effective_day(profile, today))
    past = [m for m in todays if m["time"] <= hm]
    upcoming = [m for m in todays if m["time"] > hm]

    cur = past[-1] if past else None
    cur_day = today
    nxt, nxt_day = (upcoming[0], today) if upcoming else (None, today)
    if nxt is None:
        for offset in range(1, 8):
            day = today + timedelta(days=offset)
            timed = _timed(effective_day(profile, day))
            if timed:
                nxt, nxt_day = timed[0], day
                break

    cur_r = resolve_meal(cur, choice_for(profile, cur_day, cur["id"]), profile, recipes) if cur else None
    nxt_r = resolve_meal(nxt, choice_for(profile, nxt_day, nxt["id"]), profile, recipes) if nxt else None
    return cur_r, nxt_r


def shopping_items(profiles: list[dict], start: date, end: date, recipes: dict | None = None) -> list[str]:
    """Aggregated shopping list over [start, end] (inclusive), sorted by normalized food name then unit."""
    totals: dict[tuple[str, str], tuple[str, float]] = {}  # (food, unit) -> (first spelling, sum)
    untimed: dict[str, tuple[str, str]] = {}  # food -> (first spelling, note)
    day = start
    while day <= end:
        for p in profiles:
            for meal in effective_day(p, day):
                for resolved in resolve_meal(meal, choice_for(p, day, meal["id"]), p, recipes)["items"]:
                    for item in resolved.get("ingredients", [resolved]):  # recipe -> its ingredients
                        food = " ".join(item["food"].split())
                        norm = food.casefold()
                        if item["qty"] is None:
                            untimed.setdefault(norm, (food, item["note"].strip()))
                        else:
                            key = (norm, item["unit"].strip().casefold())
                            name, qty = totals.get(key, (food, 0.0))
                            totals[key] = (name, qty + item["qty"])
        day += timedelta(days=1)
    numeric_foods = {norm for norm, _ in totals}
    rows = [(norm, unit, f"{name} — {qty:g} {unit}") for (norm, unit), (name, qty) in totals.items()]
    rows += [
        (norm, "", f"{name} ({note})" if note else name)
        for norm, (name, note) in untimed.items()
        if norm not in numeric_foods
    ]
    return [text for _, _, text in sorted(rows)]


def format_item(item: dict) -> str:
    """Display text for a meal item: "Nome 80 g", "Nome (q.b.)", "Nome" or "Ricetta: ingredienti"."""
    if "recipe" in item:
        if not item["ingredients"]:
            return item["food"]
        return f"{item['food']}: " + ", ".join(format_item(i) for i in item["ingredients"])
    if item["qty"] is not None:
        return f"{item['food']} {item['qty']:g} {item['unit']}"
    if item["note"]:
        return f"{item['food']} ({item['note']})"
    return item["food"]
