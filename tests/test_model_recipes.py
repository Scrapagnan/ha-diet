from datetime import date

from custom_components.shared_diet.model import expand_item, format_item, fold_name, shopping_items

MON = date(2026, 11, 9)  # lunedi

RECIPES = {"r1": {"id": "r1", "name": "Pancake", "note": "Mescolare", "rev": 1, "ingredients": [
    {"id": "i1", "food": "Farina", "qty": 60.0, "unit": "g"},
    {"id": "i2", "food": "Uova", "qty": 1.0, "unit": "pz"},
    {"id": "i3", "food": "Sale", "qty": None, "unit": "g"}]}}


def profile(mon=(), recipe_qty=None):
    week = {str(i): [] for i in range(7)}
    week["0"] = list(mon)
    return {
        "id": "p1",
        "name": "Luca",
        "person": None,
        "reminder": {"enabled": False, "minutes": 15, "notify": None},
        "week": week,
        "exceptions": {},
        "choices": {"defaults": {}, "dates": {}},
        "recipe_qty": recipe_qty or {},
        "rev": 1,
    }


def item(food, qty=80.0, unit="g", note=""):
    return {"food": food, "qty": qty, "unit": unit, "note": note}


def lunch(*items):
    """Single-option meal, one line per item."""
    return {"id": "l", "name": "l", "time": "13:00", "options": [[{"alts": [i]} for i in items]]}


def test_expand_uses_profile_override_then_default():
    p = profile(recipe_qty={"r1": {"i1": 40.0, "gone": 5.0}})
    e = expand_item({"recipe": "r1"}, p, RECIPES)
    assert [(i["food"], i["qty"]) for i in e["ingredients"]] == [("Farina", 40.0), ("Uova", 1.0), ("Sale", None)]
    assert e["food"] == "Pancake" and e["note"] == "Mescolare" and e["missing"] is False


def test_override_on_null_default():
    e = expand_item({"recipe": "r1"}, profile(recipe_qty={"r1": {"i3": 2.0}}), RECIPES)
    assert e["ingredients"][2]["qty"] == 2.0


def test_missing_recipe():
    e = expand_item({"recipe": "nope"}, profile(), RECIPES)
    assert e == {"recipe": "nope", "food": "Ricetta mancante", "note": "", "ingredients": [], "missing": True}


def test_format_recipe():
    e = expand_item({"recipe": "r1"}, profile(), RECIPES)
    assert format_item(e) == "Pancake: Farina 60 g, Uova 1 pz, Sale"


def test_shopping_expands_recipe_and_sums_with_plain_food():
    # lunedi: riga 1 = Pancake (override Farina 40), riga 2 = Farina 20 g semplice
    p = profile(mon=[lunch({"recipe": "r1"}, item("Farina", 20.0))], recipe_qty={"r1": {"i1": 40.0}})
    assert "Farina — 60 g" in shopping_items([p], MON, MON, RECIPES)
    assert "Uova — 1 pz" in shopping_items([p], MON, MON, RECIPES)
    assert not any(s.startswith("Pancake") for s in shopping_items([p], MON, MON, RECIPES))


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
