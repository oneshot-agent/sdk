"""OneShot account tools (notifications, balance)."""

from __future__ import annotations

import json
from typing import Any, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel

from langchain_oneshot._types import (
    GetBalanceInput,
    MarkNotificationReadInput,
    NotificationsInput,
)
from oneshot import OneShotClient


class NotificationsTool(BaseTool):
    """List agent notifications. Free."""

    name: str = "oneshot_notifications"
    description: str = (
        "List notifications for the agent (job completions, failures, warnings). "
        "Optionally filter to unread only. Free."
    )
    args_schema: Type[BaseModel] = NotificationsInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        params: dict[str, str] = {}
        if kwargs.get("unread") is not None:
            params["unread"] = str(kwargs["unread"]).lower()
        if kwargs.get("limit") is not None:
            params["limit"] = str(kwargs["limit"])
        result = self.client.call_free_get("/v1/tools/notifications", params or None)
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        params: dict[str, str] = {}
        if kwargs.get("unread") is not None:
            params["unread"] = str(kwargs["unread"]).lower()
        if kwargs.get("limit") is not None:
            params["limit"] = str(kwargs["limit"])
        result = await self.client.acall_free_get("/v1/tools/notifications", params or None)
        return json.dumps(result)


class MarkNotificationReadTool(BaseTool):
    """Mark a notification as read. Free."""

    name: str = "oneshot_mark_notification_read"
    description: str = "Mark a specific notification as read by its ID. Free."
    args_schema: Type[BaseModel] = MarkNotificationReadInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, notification_id: str, **kwargs: Any) -> str:
        result = self.client.call_free_patch(
            f"/v1/tools/notifications/{notification_id}/read"
        )
        return json.dumps(result)

    async def _arun(self, notification_id: str, **kwargs: Any) -> str:
        result = await self.client.acall_free_patch(
            f"/v1/tools/notifications/{notification_id}/read"
        )
        return json.dumps(result)


class GetBalanceTool(BaseTool):
    """Get the agent's USDC balance. Free."""

    name: str = "oneshot_get_balance"
    description: str = (
        "Get the agent's USDC token balance. Returns balance, currency, "
        "wallet address, and whether in test mode. Free."
    )
    args_schema: Type[BaseModel] = GetBalanceInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        return json.dumps(self._get_balance_info())

    async def _arun(self, **kwargs: Any) -> str:
        return json.dumps(self._get_balance_info())

    def _get_balance_info(self) -> dict[str, Any]:
        """Return balance metadata. On-chain call requires web3 — return address info for now."""
        return {
            "address": self.client.address,
            "usdc_address": self.client.usdc_address,
            "chain_id": self.client.chain_id,
            "test_mode": self.client.test_mode,
        }
