"""OneShot voice call tool."""

from __future__ import annotations

import json
from typing import Any, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel

from langchain_oneshot._types import VoiceInput
from oneshot import OneShotClient


class VoiceTool(BaseTool):
    """Make an autonomous phone call via OneShot. Paid tool.minute."""

    name: str = "oneshot_voice"
    description: str = (
        "Make a phone call with an AI agent. Provide an objective describing what "
        "the call should accomplish, and a target_number in E.164 format. Paid tool.min."
    )
    args_schema: Type[BaseModel] = VoiceInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool(
            "/v1/tools/voice/call", _strip_none(kwargs), timeout_sec=300
        )
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool(
            "/v1/tools/voice/call", _strip_none(kwargs), timeout_sec=300
        )
        return json.dumps(result)


def _strip_none(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}
