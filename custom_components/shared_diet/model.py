"""Pure day/meal logic for shared_diet. No homeassistant imports."""

import re
import unicodedata
from datetime import date, datetime, time, timedelta

from .const import DEFAULT_CATEGORIES, FALLBACK_CATEGORY, FOOD_KEYWORDS, QUALIFIER_CATEGORIES


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


def nearest_meal(profile: dict, now: datetime, todays: list[dict] | None = None) -> tuple[dict | None, date]:
    """Timed meal nearest to now (before or after) and its day.

    Candidates: every timed meal of today plus the first timed meal of the first later day that has one
    (up to 7 days ahead). Never yesterday's. Ties go to the future meal.
    `todays`: today's timed meals when the caller already has them.
    """
    today = now.date()
    if todays is None:
        todays = _timed(effective_day(profile, today))
    cands = [(today, m) for m in todays]
    for offset in range(1, 8):
        day = today + timedelta(days=offset)
        timed = _timed(effective_day(profile, day))
        if timed:
            cands.append((day, timed[0]))
            break
    if not cands:
        return None, today

    def key(c: tuple[date, dict]) -> tuple[float, bool]:
        at = datetime.combine(c[0], time.fromisoformat(c[1]["time"]), now.tzinfo)
        delta = at.timestamp() - now.timestamp()  # real elapsed seconds, DST-safe
        return abs(delta), delta < 0  # nearest first, then future over past

    day, meal = min(cands, key=key)
    return meal, day


def current_and_next(
    profile: dict, now: datetime, recipes: dict | None = None
) -> tuple[dict | None, dict | None]:
    """Resolved current meal (today, last one at or before now) and next meal (the nearest one, see nearest_meal)."""
    today = now.date()
    hm = now.strftime("%H:%M")
    todays = _timed(effective_day(profile, today))
    past = [m for m in todays if m["time"] <= hm]
    cur = past[-1] if past else None
    cur_day = today
    nxt, nxt_day = nearest_meal(profile, now, todays)

    cur_r = resolve_meal(cur, choice_for(profile, cur_day, cur["id"]), profile, recipes) if cur else None
    nxt_r = resolve_meal(nxt, choice_for(profile, nxt_day, nxt["id"]), profile, recipes) if nxt else None
    return cur_r, nxt_r


def category_for(food: str, categories: list[dict], overrides: dict[str, str], keywords: dict[str, str] = FOOD_KEYWORDS) -> str:
    """Category id of a food: its override, else the keyword found (as whole words in the folded name) that comes first in
    the name, longest on a tie ("Yogurt alla fragola" -> yogurt, "Latte di soia" -> latte di soia), else "altro".
    A qualifier keyword ("surgelati") wins wherever it is. A category that no longer exists counts as no match."""
    ids = {c["id"] for c in categories}
    key = fold_name(food)
    if overrides.get(key) in ids:
        return overrides[key]
    words = " " + " ".join(re.findall(r"\w+", key)) + " "  # punctuation-free, so "d'avena" matches "d avena"
    hits = [kw for kw in keywords if f" {kw} " in words]
    rank = lambda kw: (keywords[kw] in QUALIFIER_CATEGORIES, -words.index(f" {kw} "), len(kw))  # noqa: E731
    guess = keywords[max(hits, key=rank)] if hits else None
    return guess if guess in ids else FALLBACK_CATEGORY


_QTY_SUFFIX = re.compile(r" - \d[\d.,e+-]*(?: .*)?$")
_NOTE_SUFFIX = re.compile(r" \([^()]*\)$")


def food_of(text: str) -> str:
    """Food name of a shopping row text ("Pollo - 300 g", "Sale (q.b.)", "Pane"); other text is returned unchanged."""
    text = " ".join(text.split())
    return _NOTE_SUFFIX.sub("", _QTY_SUFFIX.sub("", text)) or text


def effective_order(saved: list[str], categories: list[dict]) -> list[str]:
    """A user's category order: their saved order on existing categories, then the others in list order."""
    ids = [c["id"] for c in categories]
    known = set(ids)
    order = [cid for cid in dict.fromkeys(saved) if cid in known]
    return order + [cid for cid in ids if cid not in order]


def shopping_items(
    profiles: list[dict],
    start: date,
    end: date,
    recipes: dict | None = None,
    categories: list[dict] | None = None,
    overrides: dict[str, str] | None = None,
) -> list[dict]:
    """Aggregated shopping rows {text, food, qty, unit, category, manual} over [start, end] (inclusive), sorted by
    normalized food name then unit. `qty` is None (unit "") for rows without a quantity ("Sale (q.b.)").
    `manual`: the category is the food's override, not a guess from its name."""
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
    rows = [(norm, unit, name, shopping_text(name, qty, unit), qty) for (norm, unit), (name, qty) in totals.items()]
    rows += [
        (norm, "", name, f"{name} ({note})" if note else name, None)
        for norm, (name, note) in untimed.items()
        if norm not in numeric_foods
    ]
    categories = DEFAULT_CATEGORIES if categories is None else categories
    overrides = overrides or {}
    ids = {c["id"] for c in categories}
    return [
        {
            "text": text,
            "food": name,
            "qty": qty,
            "unit": unit,
            "category": category_for(name, categories, overrides),
            "manual": overrides.get(fold_name(name)) in ids,
        }
        for _, unit, name, text, qty in sorted(rows, key=lambda r: r[:4])
    ]


def shopping_text(food: str, qty: float, unit: str) -> str:
    """Text of a shopping row with a quantity: "Pollo - 300 g"; over 1000 g in kg. Decimal comma: "Pollo - 1,05 kg"."""
    if unit == "g" and qty > 1000:
        qty, unit = qty / 1000, "kg"
    return f"{food} - {f'{qty:g}'.replace('.', ',')} {unit}"


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
