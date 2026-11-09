from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.shared_diet.const import DOMAIN


async def test_user_flow_creates_entry(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] == "create_entry"
    assert result["title"] == "Shared Diet"


async def test_second_flow_aborts(hass):
    MockConfigEntry(domain=DOMAIN).add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] == "abort"
    assert result["reason"] == "single_instance_allowed"
