"""The family shopping list as a todo entity: the Spesa tab fills it, the Lista tab shows it by category."""

from __future__ import annotations

from homeassistant.components.todo import TodoItem, TodoItemStatus, TodoListEntity, TodoListEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .store import DietStore

ENTITY_ID = "todo.lista_della_spesa"  # suggested; the panel looks the entity up by its unique id
UNIQUE_ID = "shared_diet_shopping"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    async_add_entities([ShoppingList(entry.runtime_data)])


class ShoppingList(TodoListEntity):
    _attr_has_entity_name = False
    _attr_name = "Lista della spesa"
    _attr_unique_id = UNIQUE_ID
    _attr_should_poll = False
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
        | TodoListEntityFeature.MOVE_TODO_ITEM
    )

    def __init__(self, store: DietStore) -> None:
        self._store = store
        self.entity_id = ENTITY_ID

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._store.async_add_shopping_listener(self.async_write_ha_state))

    @property
    def todo_items(self) -> list[TodoItem]:
        return [
            TodoItem(uid=i["uid"], summary=i["summary"], status=TodoItemStatus(i["status"]))
            for i in self._store.shopping
        ]

    async def async_create_todo_item(self, item: TodoItem) -> None:
        await self._store.async_add_shopping([item.summary or ""])

    async def async_update_todo_item(self, item: TodoItem) -> None:
        status = str(item.status) if item.status else None  # TodoItemStatus is a StrEnum; HA may pass a plain str
        await self._store.async_update_shopping(item.uid or "", item.summary, status)

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        await self._store.async_delete_shopping(uids)

    async def async_move_todo_item(self, uid: str, previous_uid: str | None = None) -> None:
        await self._store.async_move_shopping(uid, previous_uid)
