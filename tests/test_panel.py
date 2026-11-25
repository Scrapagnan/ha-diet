"""Sidebar panel registration and reload safety."""

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.shared_diet.const import DOMAIN


async def _setup(hass) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_panel_registered_for_all_users(hass):
    await _setup(hass)
    panel = hass.data["frontend_panels"]["shared-diet"]
    assert panel.require_admin is False
    assert panel.sidebar_title == "Dieta"


async def test_panel_survives_entry_reload(hass):
    entry = await _setup(hass)
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert hass.data["frontend_panels"]["shared-diet"].require_admin is False


async def test_panel_url_follows_file_content(hass):
    """An updated panel file gets a new URL, so browsers never run an old panel against a newer server."""
    import hashlib

    from custom_components.shared_diet import PANEL_JS

    await _setup(hass)
    url = hass.data["frontend_panels"]["shared-diet"].config["_panel_custom"]["module_url"]
    assert url.endswith("?v=" + hashlib.sha256(PANEL_JS.read_bytes()).hexdigest()[:12])
