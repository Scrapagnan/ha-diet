from datetime import date, timedelta

from custom_components.shared_diet.model import shopping_items

MON = date(2026, 11, 9)  # lunedi


def profile(mon=(), tue=(), exceptions=None, defaults=None):
    week = {str(i): [] for i in range(7)}
    week["0"] = list(mon)
    week["1"] = list(tue)
    return {
        "id": "p1",
        "name": "Luca",
        "person": None,
        "reminder": {"enabled": False, "minutes": 15, "notify": None},
        "week": week,
        "exceptions": exceptions or {},
        "choices": {"defaults": defaults or {}, "dates": {}},
        "rev": 1,
    }


def meal(id, options, time="13:00"):
    return {"id": id, "name": id, "time": time, "options": options}


def item(food, qty=80.0, unit="g", note=""):
    return {"food": food, "qty": qty, "unit": unit, "note": note}


def line(*alts):
    return {"alts": list(alts)}


def lunch(*items):
    """Single-option meal, one line per item."""
    return meal("l", [[line(i) for i in items]])


luca = profile(mon=[lunch(item("Pasta integrale", 80.0))], tue=[lunch(item("Pasta integrale", 80.0))])
anna = profile(mon=[lunch(item(" pasta integrale ", 100.0))])

p_latte_ml_and_pz = profile(mon=[lunch(item("Latte", 200.0, "ml"), item("Latte", 1.0, "pz"))])

p_sale_twice = profile(mon=[lunch(item("Sale", None, "", "q.b."), item("Sale", None, "", "q.b."))])

p_olio_qb_and_10ml = profile(mon=[lunch(item("Olio", None, "", "q.b."), item("Olio", 10.0, "ml"))])

p_olio_2_5_x3 = profile(mon=[lunch(item("Olio", 2.5, "ml"), item("Olio", 2.5, "ml"), item("Olio", 2.5, "ml"))])

# Monday schema: Pasta or Riso; default picks Riso (alt 1).
# Tuesday exception keeps the same meal id, with only Pizza: default alt 1 is invalid there, falls back to 0.
_pranzo_mon = meal("pranzo", [[line(item("Pasta integrale", 80.0), item("Riso", 80.0))]])
_pranzo_tue = meal("pranzo", [[line(item("Pizza", 1.0, "pz"))]])
p_with_choice_and_exception = profile(
    mon=[_pranzo_mon],
    exceptions={"2026-11-10": [_pranzo_tue]},
    defaults={"pranzo": {"option": 0, "lines": {"0": 1}}},
)


def test_sums_same_food_normalized_across_profiles_and_days():
    # Luca: Pasta integrale 80 g lun+mar; Anna: " pasta integrale " 100 g lun
    assert "Pasta integrale - 260 g" in shopping_items([luca, anna], MON, MON + timedelta(1))


def test_different_units_stay_separate():
    assert set(shopping_items([p_latte_ml_and_pz], MON, MON)) >= {"Latte - 200 ml", "Latte - 1 pz"}


def test_no_qty_listed_once_without_total():
    assert shopping_items([p_sale_twice], MON, MON).count("Sale (q.b.)") == 1


def test_no_qty_dropped_when_same_food_has_numeric_qty():
    assert shopping_items([p_olio_qb_and_10ml], MON, MON) == ["Olio - 10 ml"]


def test_uses_chosen_alternative_and_exception():
    items = shopping_items([p_with_choice_and_exception], MON, MON + timedelta(1))
    assert "Riso - 80 g" in items and "Pizza - 1 pz" in items and not any(i.startswith("Pasta") for i in items)


def test_decimal_qty_formatting():
    assert "Olio - 7.5 ml" in shopping_items([p_olio_2_5_x3], MON, MON)


def test_food_whitespace_collapsed_before_summing():
    p = profile(mon=[lunch(item("Pasta  integrale", 80.0)), lunch(item("pasta integrale", 20.0))])
    assert shopping_items([p], MON, MON) == ["Pasta integrale - 100 g"]


def test_units_compared_case_insensitively():
    p = profile(mon=[lunch(item("Burro", 10.0, "G"), item("Burro", 5.0, "g"))])
    assert shopping_items([p], MON, MON) == ["Burro - 15 g"]
