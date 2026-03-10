"""OneShot inbox tools (email + SMS)."""

from __future__ import annotations

import json
from typing import Any, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel

from langchain_oneshot._types import (
    InboxGetInput,
    InboxListInput,
    SmsInboxGetInput,
    SmsInboxListInput,
)
from oneshot import OneShotClient


class InboxListTool(BaseTool):
    """List emails in the agent's inbox. Free."""

    name: str = "oneshot_inbox_list"
    description: str = (
        "List emails in the agent's inbox. Optionally filter by date (since) "
        "or limit the number of results. Free."
    )
    args_schema: Type[BaseModel] = InboxListInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        params = _build_params(kwargs, {"since": "since", "limit": "limit", "include_body": "include_body"})
        result = self.client.call_free_get("/v1/tools/inbox", params or None)
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        params = _build_params(kwargs, {"since": "since", "limit": "limit", "include_body": "include_body"})
        result = await self.client.acall_free_get("/v1/tools/inbox", params or None)
        return json.dumps(result)


class InboxGetTool(BaseTool):
    """Get a specific email by ID. Free."""

    name: str = "oneshot_inbox_get"
    description: str = "Retrieve a specific email by its ID. Returns full email content. Free."
    args_schema: Type[BaseModel] = InboxGetInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, email_id: str, **kwargs: Any) -> str:
        result = self.client.call_free_get(f"/v1/tools/inbox/{email_id}")
        return json.dumps(result)

    async def _arun(self, email_id: str, **kwargs: Any) -> str:
        result = await self.client.acall_free_get(f"/v1/tools/inbox/{email_id}")
        return json.dumps(result)


class SmsInboxListTool(BaseTool):
    """List inbound SMS messages. Free."""

    name: str = "oneshot_sms_inbox_list"
    description: str = (
        "List inbound SMS messages. Optionally filter by date, sender, "
        "or limit results. Free."
    )
    args_schema: Type[BaseModel] = SmsInboxListInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        params = _build_params(kwargs, {"since": "since", "limit": "limit", "from_number": "from"})
        result = self.client.call_free_get("/v1/tools/sms/inbox", params or None)
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        params = _build_params(kwargs, {"since": "since", "limit": "limit", "from_number": "from"})
        result = await self.client.acall_free_get("/v1/tools/sms/inbox", params or None)
        return json.dumps(result)


class SmsInboxGetTool(BaseTool):
    """Get a specific SMS message by ID. Free."""

    name: str = "oneshot_sms_inbox_get"
    description: str = "Retrieve a specific inbound SMS message by its ID. Free."
    args_schema: Type[BaseModel] = SmsInboxGetInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, message_id: str, **kwargs: Any) -> str:
        result = self.client.call_free_get(f"/v1/tools/sms/inbox/{message_id}")
        return json.dumps(result)

    async def _arun(self, message_id: str, **kwargs: Any) -> str:
        result = await self.client.acall_free_get(f"/v1/tools/sms/inbox/{message_id}")
        return json.dumps(result)


def _build_params(
    kwargs: dict[str, Any], mapping: dict[str, str]
) -> dict[str, str]:
    """Build query-string params from kwargs, converting to strings."""
    params: dict[str, str] = {}
    for kwarg_key, param_key in mapping.items():
        val = kwargs.get(kwarg_key)
        if val is not None:
            params[param_key] = str(val).lower() if isinstance(val, bool) else str(val)
    return params
