"""OneShot research tool."""

from __future__ import annotations

import json
from typing import Any, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel

from langchain_oneshot._types import ResearchInput
from oneshot import OneShotClient


class ResearchTool(BaseTool):
    """Perform deep web research via OneShot. Costs $0.50-$2.00."""

    name: str = "oneshot_research"
    description: str = (
        "Perform deep web research on any topic. Returns a comprehensive report "
        "with sources. Provide a topic string. Costs $0.50-$2.00."
    )
    args_schema: Type[BaseModel] = ResearchInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool("/v1/tools/research", _strip_none(kwargs))
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool("/v1/tools/research", _strip_none(kwargs))
        return json.dumps(result)


def _strip_none(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}
