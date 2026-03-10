"""OneShot email tool."""

from __future__ import annotations

import asyncio
import json
from typing import Any, Optional, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel

from langchain_oneshot._types import EmailInput
from oneshot import OneShotClient


class EmailTool(BaseTool):
    """Send emails via OneShot. Costs ~$0.01 per email."""

    name: str = "oneshot_email"
    description: str = (
        "Send an email to one or more recipients. "
        "Provide to (email address), subject, and body. Costs ~$0.01."
    )
    args_schema: Type[BaseModel] = EmailInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool("/v1/tools/email/send", _strip_none(kwargs))
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool("/v1/tools/email/send", _strip_none(kwargs))
        return json.dumps(result)


def _strip_none(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}
