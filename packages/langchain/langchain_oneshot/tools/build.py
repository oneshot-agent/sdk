"""OneShot website build tools."""

from __future__ import annotations

import json
from typing import Any, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel

from langchain_oneshot._types import BuildInput, UpdateBuildInput
from oneshot import OneShotClient


def _strip_none(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}


def _prepare_build_payload(kwargs: dict[str, Any]) -> dict[str, Any]:
    """Serialize nested Pydantic models in the build payload."""
    payload: dict[str, Any] = {}
    for key, val in kwargs.items():
        if val is None:
            continue
        if isinstance(val, BaseModel):
            payload[key] = val.model_dump(exclude_none=True)
        else:
            payload[key] = val
    return payload


class BuildTool(BaseTool):
    """Build and deploy a production website via OneShot. Base price ~$10."""

    name: str = "oneshot_build"
    description: str = (
        "Build and deploy a production website. Supports SaaS landing pages, "
        "portfolios, agency sites, restaurants, events, and more. "
        "Requires product info (name + description). Base price ~$10 for 3 sections."
    )
    args_schema: Type[BaseModel] = BuildInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        payload = _prepare_build_payload(kwargs)
        result = self.client.call_tool(
            "/v1/tools/build", payload, timeout_sec=600
        )
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        payload = _prepare_build_payload(kwargs)
        result = await self.client.acall_tool(
            "/v1/tools/build", payload, timeout_sec=600
        )
        return json.dumps(result)


class UpdateBuildTool(BaseTool):
    """Update an existing website build via OneShot."""

    name: str = "oneshot_update_build"
    description: str = (
        "Update an existing website with new content or configuration. "
        "Requires build_id and updated product info."
    )
    args_schema: Type[BaseModel] = UpdateBuildInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        payload = _prepare_build_payload(kwargs)
        result = self.client.call_tool(
            "/v1/tools/build", payload, timeout_sec=600
        )
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        payload = _prepare_build_payload(kwargs)
        result = await self.client.acall_tool(
            "/v1/tools/build", payload, timeout_sec=600
        )
        return json.dumps(result)
