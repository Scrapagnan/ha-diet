from datetime import date, datetime, timedelta

from homeassistant.util import dt as dt_util

from custom_components.shared_diet.model import (
    choice_for,
    current_and_next,
    effective_day,
    resolve_meal,
)

MON = date(2026, 11, 9)  # lunedi


def profile(**kw):
    base = {
        "id": "p1",
        "name": "Luca",
        "person": None,
        "reminder": {"enabled": False, "minutes": 15, "notify": None},
        "week": {str(i): [] for i in range(7)},
        "exceptions": {},
        "choices": {"defaults": {}, "dates": {}},
        "rev": 1,
    }
    base.update(kw)
    return base


def meal(id, time, options):
    return {"id": id, "name": id, "time": time, "options": options}


def line(*foods):
    return {"alts": [{"food": f, "qty": 80.0, "unit": "g", "note": ""} for f in foods]}


def test_exception_replaces_schema_day():
    p = profile(
        week={"0": [meal("a", "08:00", [[line("Pane")]])]},
        exceptions={"2026-11-09": [meal("x", "20:00", [[line("Pizza")]])]},
    )
    assert [m["id"] for m in effective_day(p, MON)] == ["x"]
    assert [m["id"] for m in effective_day(p, MON + timedelta(7))] == ["a"]


def test_choice_priority_date_over_default_over_first():
    p = profile(
        choices={
            "defaults": {"a": {"option": 1, "lines": {}}},
            "dates": {"2026-11-09": {"a": {"option": 2, "lines": {}}}},
        }
    )
    assert choice_for(p, MON, "a")["option"] == 2
    assert choice_for(p, MON + timedelta(7), "a")["option"] == 1
    assert choice_for(p, MON, "zzz") == {"option": 0, "lines": {}}


def test_resolve_meal_picks_option_and_line_alt():
    m = meal("a", "13:00", [[line("Pasta", "Riso"), line("Verdure")], [line("Legumi")]])
    r = resolve_meal(m, {"option": 0, "lines": {"0": 1}})
    assert [i["food"] for i in r["items"]] == ["Riso", "Verdure"]


def test_resolve_meal_out_of_range_falls_back_to_zero():
    m = meal("a", "13:00", [[line("Pasta", "Riso")]])
    r = resolve_meal(m, {"option": 5, "lines": {"0": 9, "7": 1}})
    assert r["option"] == 0 and [i["food"] for i in r["items"]] == ["Pasta"]


def test_current_and_next():
    p = profile(
        week={
            "0": [
                meal("c", "07:30", [[line("Latte")]]),
                meal("s", None, [[line("Mela")]]),
                meal("p", "13:00", [[line("Pasta")]]),
            ],
            "1": [meal("c2", "07:00", [[line("Yogurt")]])],
        }
    )
    tz = dt_util.DEFAULT_TIME_ZONE
    cur, nxt = current_and_next(p, datetime(2026, 11, 9, 7, 0, tzinfo=tz))
    assert cur is None and nxt["id"] == "c"
    cur, nxt = current_and_next(p, datetime(2026, 11, 9, 10, 0, tzinfo=tz))
    assert cur["id"] == "c" and nxt["id"] == "p"
    cur, nxt = current_and_next(p, datetime(2026, 11, 9, 23, 0, tzinfo=tz))
    assert cur["id"] == "p" and nxt["id"] == "c2"
