import pytest

from custom_components.shared_diet.store import ConflictError, DietStore


async def test_create_save_and_reload(hass, hass_storage):
    s = DietStore(hass)
    await s.async_load()
    p = await s.async_create_profile("Luca")
    p["name"] = "Luca S."
    saved = await s.async_save_profile(p)
    assert saved["rev"] == 2
    s2 = DietStore(hass)
    await s2.async_load()
    assert s2.profiles[p["id"]]["name"] == "Luca S."


async def test_stale_rev_raises_conflict(hass):
    s = DietStore(hass)
    await s.async_load()
    p = await s.async_create_profile("Anna")
    a, b = dict(p), dict(p)
    await s.async_save_profile(a)
    with pytest.raises(ConflictError):
        await s.async_save_profile(b)


async def test_listener_called_on_change(hass):
    s = DietStore(hass)
    await s.async_load()
    calls = []
    unsub = s.async_add_listener(lambda: calls.append(1))
    await s.async_create_profile("X")
    unsub()
    await s.async_create_profile("Y")
    assert calls == [1]


async def test_mutating_returned_dict_does_not_touch_store(hass):
    s = DietStore(hass)
    await s.async_load()
    p = await s.async_create_profile("Mia")
    p["rev"] = 99
    p["name"] = "Hacked"
    assert s.profiles[p["id"]]["name"] == "Mia"
    assert s.profiles[p["id"]]["rev"] == 1


async def test_save_unknown_id_raises_key_error(hass):
    s = DietStore(hass)
    await s.async_load()
    with pytest.raises(KeyError):
        await s.async_save_profile({"id": "nope", "rev": 1})


async def test_delete_unknown_is_noop_without_notify(hass):
    s = DietStore(hass)
    await s.async_load()
    calls = []
    s.async_add_listener(lambda: calls.append(1))
    await s.async_delete_profile("nope")
    assert calls == []
    p = await s.async_create_profile("Tom")
    await s.async_delete_profile(p["id"])
    assert s.profiles == {}
    assert calls == [1, 1]


async def test_raising_listener_does_not_block_others_or_fail_save(hass):
    s = DietStore(hass)
    await s.async_load()
    calls = []

    def boom():
        raise RuntimeError("listener broke")

    s.async_add_listener(boom)
    s.async_add_listener(lambda: calls.append(1))
    p = await s.async_create_profile("Ola")
    assert calls == [1]
    assert s.profiles[p["id"]]["name"] == "Ola"
