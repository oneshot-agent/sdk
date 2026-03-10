"""OneShot web search tool."""

from __future__ import annotations

import json
from typing import Any, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel

from langchain_oneshot._types import WebSearchInput
from oneshot import OneShotClient


class WebSearchTool(BaseTool):
    """Search the web via OneShot. Paid tool. per search."""

    name: str = "oneshot_web_search"
    description: str = (
        "Search the web for a query. Returns URLs, titles, and descriptions. "
        "Fast and synchronous. Paid tool."
    )
    args_schema: Type[BaseModel] = WebSearchInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool("/v1/tools/search", _strip_none(kwargs))
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool("/v1/tools/search", _strip_none(kwargs))
        return json.dumps(result)


def _strip_none(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}
