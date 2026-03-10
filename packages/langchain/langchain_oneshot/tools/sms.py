"""OneShot SMS tool."""

from __future__ import annotations

import json
from typing import Any, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel

from langchain_oneshot._types import SmsInput
from oneshot import OneShotClient


class SmsTool(BaseTool):
    """Send SMS messages via OneShot. Paid tool. per segment."""

    name: str = "oneshot_sms"
    description: str = (
        "Send an SMS message. Provide a message body (max 1600 chars) and "
        "a to_number in E.164 format. Paid tool. per 160-char segment."
    )
    args_schema: Type[BaseModel] = SmsInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool("/v1/tools/sms/send", _strip_none(kwargs))
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool("/v1/tools/sms/send", _strip_none(kwargs))
        return json.dumps(result)


def _strip_none(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}
