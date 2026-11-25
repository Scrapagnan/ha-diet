"""The family shopping list todo entity, driven through HA's own todo services."""

from custom_components.shared_diet.store import DietStore
from test_websocket import setup_entry  # noqa: F401

ENTITY = "todo.lista_della_spesa"


async def _items(hass):
    resp = await hass.services.async_call("todo", "get_items", {"entity_id": ENTITY}, blocking=True, return_response=True)
    return [(i["summary"], i["status"]) for i in resp[ENTITY]["items"]]


async def test_todo_services_edit_the_family_list(hass, hass_storage, setup_entry):  # noqa: F811
    store = hass.data["shared_diet"]
    await store.async_add_shopping(["Pane - 2 pz", "Mele - 1 pz"])
    await hass.async_block_till_done()
    assert hass.states.get(ENTITY).state == "2"

    await hass.services.async_call("todo", "add_item", {"entity_id": ENTITY, "item": "Detersivo"}, blocking=True)
    await hass.services.async_call(
        "todo", "update_item", {"entity_id": ENTITY, "item": "Pane - 2 pz", "status": "completed"}, blocking=True
    )
    await hass.services.async_call("todo", "update_item", {"entity_id": ENTITY, "item": "Mele - 1 pz", "rename": "Mele - 3 pz"}, blocking=True)
    assert await _items(hass) == [("Pane - 2 pz", "completed"), ("Mele - 3 pz", "needs_action"), ("Detersivo", "needs_action")]
    assert hass.states.get(ENTITY).state == "2"

    uid = {i["summary"]: i["uid"] for i in store.shopping}
    await store.async_move_shopping(uid["Detersivo"], None)
    await store.async_move_shopping(uid["Pane - 2 pz"], uid["Mele - 3 pz"])
    assert [i["summary"] for i in store.shopping] == ["Detersivo", "Mele - 3 pz", "Pane - 2 pz"]

    await hass.services.async_call("todo", "remove_completed_items", {"entity_id": ENTITY}, blocking=True)
    assert await _items(hass) == [("Detersivo", "needs_action"), ("Mele - 3 pz", "needs_action")]

    reloaded = DietStore(hass)  # persisted
    await reloaded.async_load()
    assert [i["summary"] for i in reloaded.shopping] == ["Detersivo", "Mele - 3 pz"]
