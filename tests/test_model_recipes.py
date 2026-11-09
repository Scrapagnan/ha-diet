from datetime import date

from custom_components.shared_diet.model import expand_item, format_item, fold_name, resolve_meal, shopping_items

MON = date(2026, 11, 9)  # lunedi

RECIPES = {"r1": {"id": "r1", "name": "Pancake", "note": "Mescolare", "rev": 1, "ingredients": [
    {"id": "i1", "alts": [{"id": "a1", "food": "Farina", "qty": 60.0, "unit": "g"}]},
    {"id": "i2", "alts": [{"id": "a2", "food": "Latte", "qty": 100.0, "unit": "ml"},
                          {"id": "a3", "food": "Soia", "qty": 120.0, "unit": "ml"}]}]},
    "r2": {"id": "r2", "name": "Sale", "note": "", "rev": 1, "ingredients": [
        {"id": "i1", "alts": [{"id": "a9", "food": "Sale", "qty": None, "unit": "g"}]}]}}


def profile(mon=(), recipe_qty=None, choices=None):
    week = {str(i): [] for i in range(7)}
    week["0"] = list(mon)
    return {
        "id": "p1",
        "name": "Luca",
        "person": None,
        "reminder": {"enabled": False, "minutes": 15, "notify": None},
        "week": week,
        "exceptions": {},
        "choices": {"defaults": choices or {}, "dates": {}},
        "recipe_qty": recipe_qty or {},
        "rev": 1,
    }


def item(food, qty=80.0, unit="g", note=""):
    return {"food": food, "qty": qty, "unit": unit, "note": note}


def lunch(*items):
    """Single-option meal, one line per item."""
    return {"id": "l", "name": "l", "time": "13:00", "options": [[{"alts": [i]} for i in items]]}


def recipe_meal(meal_id):
    return {"id": meal_id, "name": meal_id, "time": "13:00", "options": [[{"alts": [{"recipe": "r1"}]}]]}


def test_expand_uses_profile_override_then_default():
    p = profile(recipe_qty={"r1": {"a1": 40.0, "gone": 5.0}})
    e = expand_item({"recipe": "r1"}, p, RECIPES)
    assert [(i["food"], i["qty"]) for i in e["ingredients"]] == [("Farina", 40.0), ("Latte", 100.0)]
    assert e["food"] == "Pancake" and e["note"] == "Mescolare" and e["missing"] is False


def test_override_on_null_default():
    e = expand_item({"recipe": "r2"}, profile(recipe_qty={"r2": {"a9": 2.0}}), RECIPES)
    assert e["ingredients"][0]["qty"] == 2.0


def test_missing_recipe():
    e = expand_item({"recipe": "nope"}, profile(), RECIPES)
    assert e == {"recipe": "nope", "food": "Ricetta mancante", "note": "", "ingredients": [], "missing": True,
                 "choices": []}


def test_format_recipe_without_choice_uses_first_alt():
    e = expand_item({"recipe": "r1"}, profile(), RECIPES)
    assert format_item(e) == "Pancake: Farina 60 g, Latte 100 ml"


def test_recipe_choice_selects_alt():
    e = expand_item({"recipe": "r1"}, profile(), RECIPES, {"i2": "a3"})
    assert format_item(e) == "Pancake: Farina 60 g, Soia 120 ml"


def test_recipe_choice_unknown_alt_falls_back_to_first():
    e = expand_item({"recipe": "r1"}, profile(), RECIPES, {"i2": "nope"})
    assert format_item(e) == "Pancake: Farina 60 g, Latte 100 ml"


def test_override_applies_to_chosen_alt_only():
    p = profile(recipe_qty={"r1": {"a3": 90.0}})
    e = expand_item({"recipe": "r1"}, p, RECIPES, {"i2": "a3"})
    assert format_item(e) == "Pancake: Farina 60 g, Soia 90 ml"
    p = profile(recipe_qty={"r1": {"a2": 90.0}})
    e = expand_item({"recipe": "r1"}, p, RECIPES, {"i2": "a3"})
    assert format_item(e) == "Pancake: Farina 60 g, Soia 120 ml"


def test_choices_only_for_ingredients_with_several_alts():
    e = expand_item({"recipe": "r1"}, profile(recipe_qty={"r1": {"a3": 90.0}}), RECIPES, {"i2": "a3"})
    assert e["choices"] == [{"ingredient_id": "i2",
                             "alts": [{"id": "a2", "food": "Latte", "qty": 100.0, "unit": "ml"},
                                      {"id": "a3", "food": "Soia", "qty": 90.0, "unit": "ml"}],
                             "chosen": "a3"}]


def test_choices_chosen_defaults_to_first_alt():
    e = expand_item({"recipe": "r1"}, profile(), RECIPES)
    assert e["choices"][0]["chosen"] == "a2"


def test_shopping_expands_recipe_and_sums_with_plain_food():
    # lunedi: riga 1 = Pancake (override Farina 40), riga 2 = Farina 20 g semplice
    p = profile(mon=[lunch({"recipe": "r1"}, item("Farina", 20.0))], recipe_qty={"r1": {"a1": 40.0}})
    items = shopping_items([p], MON, MON, RECIPES)
    assert "Farina — 60 g" in items
    assert "Latte — 100 ml" in items
    assert not any(s.startswith("Pancake") for s in items)


def test_shopping_uses_chosen_alt_from_meal_choice():
    p = profile(mon=[recipe_meal("l")], choices={"l": {"option": 0, "lines": {}, "recipes": {"r1": {"i2": "a3"}}}})
    items = shopping_items([p], MON, MON, RECIPES)
    assert "Soia — 120 ml" in items
    assert not any(s.startswith("Latte") for s in items)


def test_shopping_same_recipe_two_meals_different_choices_sums():
    p = profile(mon=[recipe_meal("a"), recipe_meal("b")],
                choices={"b": {"option": 0, "lines": {}, "recipes": {"r1": {"i2": "a3"}}}})
    items = shopping_items([p], MON, MON, RECIPES)
    assert "Latte — 100 ml" in items and "Soia — 120 ml" in items
    assert "Farina — 120 g" in items


def test_resolve_meal_passes_recipe_choice():
    p = profile(choices={"l": {"option": 0, "lines": {}, "recipes": {"r1": {"i2": "a3"}}}})
    meal = resolve_meal(recipe_meal("l"), p["choices"]["defaults"]["l"], p, RECIPES)
    assert format_item(meal["items"][0]) == "Pancake: Farina 60 g, Soia 120 ml"


def test_shopping_recipe_as_unchosen_alternative_is_ignored():
    # riga con alts [Yogurt 150 g, {recipe r1}], scelta default alt 0
    p = profile(mon=[{"id": "l", "name": "l", "time": "13:00",
                      "options": [[{"alts": [item("Yogurt", 150.0), {"recipe": "r1"}]}]]}])
    items = shopping_items([p], MON, MON, RECIPES)
    assert "Yogurt — 150 g" in items and not any(i.startswith("Farina") for i in items)


def test_shopping_missing_recipe_skipped():
    p_with_missing_ref = profile(mon=[lunch({"recipe": "nope"})])
    assert shopping_items([p_with_missing_ref], MON, MON, RECIPES) == []


def test_fold_name():
    assert fold_name("  Caffè   Latte ") == fold_name("caffe latte") == "caffe latte"
