from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from homeassistant.util import dt as dt_util

from custom_components.shared_diet.model import (
    choice_for,
    current_and_next,
    effective_day,
    nearest_meal,
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
    cur, nxt = current_and_next(p, datetime(2026, 11, 9, 10, 30, tzinfo=tz))
    assert cur["id"] == "c" and nxt["id"] == "p"
    cur, nxt = current_and_next(p, datetime(2026, 11, 9, 13, 20, tzinfo=tz))
    assert cur["id"] == "p" and nxt["id"] == "p"  # current and next may coincide
    cur, nxt = current_and_next(p, datetime(2026, 11, 9, 23, 0, tzinfo=tz))
    assert cur["id"] == "p" and nxt["id"] == "c2"


def test_nearest_meal():
    tz = dt_util.DEFAULT_TIME_ZONE
    at = lambda d, h, m: datetime(2026, 11, d, h, m, tzinfo=tz)  # noqa: E731
    p = profile(
        week={
            **{str(i): [] for i in range(7)},
            "0": [meal("pranzo", "13:00", []), meal("merenda", "16:30", []), meal("sera", "18:00", [])],
            "1": [meal("colazione", "07:00", [])],
        },
        exceptions={"2026-11-16": [meal("libero", None, [])]},  # next Monday: only an untimed meal
    )
    pick = lambda now: (lambda r: (r[0] and r[0]["id"], r[1]))(nearest_meal(p, now))  # noqa: E731
    assert pick(at(9, 8, 0)) == ("pranzo", MON)  # before the first meal
    assert pick(at(9, 13, 20)) == ("pranzo", MON)  # 20 min past beats 3h10 ahead
    assert pick(at(9, 15, 0)) == ("merenda", MON)  # past the midpoint
    assert pick(at(9, 14, 45)) == ("merenda", MON)  # exact tie: the future one wins
    assert pick(at(9, 23, 0)) == ("sera", MON)  # 5h past vs 8h ahead
    # 00:10: yesterday's sera (6h10 ago) would be nearer, but yesterday never counts.
    assert pick(at(10, 0, 10)) == ("colazione", MON + timedelta(days=1))
    assert pick(at(10, 23, 0)) == ("colazione", MON + timedelta(days=1))  # 16h past beats a week ahead
    # Wednesday: no meals today nor Thu-Sun, Monday 16 only untimed: next is Tuesday 17.
    assert pick(at(11, 12, 0)) == ("colazione", date(2026, 11, 17))
    assert pick(at(16, 12, 0)) == ("colazione", date(2026, 11, 17))  # today has no timed meal
    assert nearest_meal(profile(), at(9, 12, 0)) == (None, MON)  # nothing within 7 days


def test_nearest_meal_counts_real_time_across_dst():
    # 2026-10-25, Europe/Rome falls back 03:00 -> 02:00. At 04:00 the 01:30 meal is 2h30 ago on the wall clock
    # but 3h30 in real time, so the 07:00 meal (3h ahead) is the nearest.
    rome = ZoneInfo("Europe/Rome")
    p = profile(exceptions={"2026-10-25": [meal("notte", "01:30", []), meal("colazione", "07:00", [])]})
    nxt, day = nearest_meal(p, datetime(2026, 10, 25, 4, 0, tzinfo=rome))
    assert nxt["id"] == "colazione" and day == date(2026, 10, 25)
