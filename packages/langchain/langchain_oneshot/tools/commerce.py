"""OneShot commerce tools."""

from __future__ import annotations

import json
from typing import Any, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel

from langchain_oneshot._types import CommerceBuyInput, CommerceSearchInput
from oneshot import OneShotClient


def _strip_none(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}


class CommerceSearchTool(BaseTool):
    """Search for products to purchase. Free to search."""

    name: str = "oneshot_commerce_search"
    description: str = (
        "Search for products available for purchase. Provide a search query. "
        "Free to search — you only pay when buying."
    )
    args_schema: Type[BaseModel] = CommerceSearchInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool("/v1/tools/commerce/search", _strip_none(kwargs))
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool(
            "/v1/tools/commerce/search", _strip_none(kwargs)
        )
        return json.dumps(result)


class CommerceBuyTool(BaseTool):
    """Purchase a product via OneShot. Product price + service fee."""

    name: str = "oneshot_commerce_buy"
    description: str = (
        "Purchase a product. Requires a product_url and a shipping_address "
        "with first_name, last_name, street, city, state, zip_code, and phone. "
        "Cost is product price plus a service fee."
    )
    args_schema: Type[BaseModel] = CommerceBuyInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        payload = _prepare_buy_payload(kwargs)
        result = self.client.call_tool(
            "/v1/tools/commerce/buy", payload, timeout_sec=180
        )
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        payload = _prepare_buy_payload(kwargs)
        result = await self.client.acall_tool(
            "/v1/tools/commerce/buy", payload, timeout_sec=180
        )
        return json.dumps(result)


def _prepare_buy_payload(kwargs: dict[str, Any]) -> dict[str, Any]:
    """Convert Pydantic-parsed args to the API payload shape."""
    payload: dict[str, Any] = {
        "product_url": kwargs["product_url"],
        "shipping_address": kwargs["shipping_address"],
    }
    if isinstance(payload["shipping_address"], BaseModel):
        payload["shipping_address"] = payload["shipping_address"].model_dump(exclude_none=True)
    if kwargs.get("quantity") is not None:
        payload["quantity"] = kwargs["quantity"]
    if kwargs.get("variant_id") is not None:
        payload["variant_id"] = kwargs["variant_id"]
    return payload
