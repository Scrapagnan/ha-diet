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


async def test_frontend_url_follows_file_content(hass):
    """Panel, card and core share one URL prefix with the hash of every frontend file: browsers never mix versions."""
    from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL

    from custom_components.shared_diet import STATIC_KEY, STATIC_URL, _frontend_digest

    await _setup(hass)
    base = f"{STATIC_URL}/{_frontend_digest()}"
    assert hass.data[STATIC_KEY] == base
    url = hass.data["frontend_panels"]["shared-diet"].config["_panel_custom"]["module_url"]
    assert url == f"{base}/shared-diet-panel.js"
    # The dashboard card is loaded on every page, with no resource to add by hand.
    assert f"{base}/shared-diet-card.js" in hass.data[DATA_EXTRA_MODULE_URL].urls


def test_frontend_digest_covers_every_file(tmp_path, monkeypatch):
    import custom_components.shared_diet as integration

    monkeypatch.setattr(integration, "FRONTEND_DIR", tmp_path)
    (tmp_path / "shared-diet-panel.js").write_text("a")
    (tmp_path / "shared-diet-core.js").write_text("b")
    before = integration._frontend_digest()
    (tmp_path / "shared-diet-core.js").write_text("c")
    assert integration._frontend_digest() != before
