"""OneShot people search & enrichment tools."""

from __future__ import annotations

import json
from typing import Any, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel

from langchain_oneshot._types import (
    EnrichProfileInput,
    FindEmailInput,
    PeopleSearchInput,
    VerifyEmailInput,
)
from oneshot import OneShotClient


def _strip_none(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}


class PeopleSearchTool(BaseTool):
    """Search for people by job title, company, location, etc. Paid tool.result."""

    name: str = "oneshot_people_search"
    description: str = (
        "Search for people by job title, company, location, skills, seniority, "
        "or industry. Returns matching profiles. Paid tool. per result."
    )
    args_schema: Type[BaseModel] = PeopleSearchInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool("/v1/tools/research/people", _strip_none(kwargs))
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool("/v1/tools/research/people", _strip_none(kwargs))
        return json.dumps(result)


class EnrichProfileTool(BaseTool):
    """Enrich a person's profile from LinkedIn, email, or name. Paid tool."""

    name: str = "oneshot_enrich_profile"
    description: str = (
        "Enrich a person's profile using their LinkedIn URL, email, or name. "
        "Returns detailed professional information. Paid tool."
    )
    args_schema: Type[BaseModel] = EnrichProfileInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool("/v1/tools/enrich/profile", _strip_none(kwargs))
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool("/v1/tools/enrich/profile", _strip_none(kwargs))
        return json.dumps(result)


class FindEmailTool(BaseTool):
    """Find a person's email address at a company. Paid tool."""

    name: str = "oneshot_find_email"
    description: str = (
        "Find someone's email address given their name and company domain. "
        "Provide company_domain and either full_name or first_name+last_name. Paid tool."
    )
    args_schema: Type[BaseModel] = FindEmailInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool("/v1/tools/enrich/email", _strip_none(kwargs))
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool("/v1/tools/enrich/email", _strip_none(kwargs))
        return json.dumps(result)


class VerifyEmailTool(BaseTool):
    """Verify if an email address is valid and deliverable. Paid tool."""

    name: str = "oneshot_verify_email"
    description: str = (
        "Verify whether an email address is valid and deliverable. "
        "Returns deliverability status. Paid tool."
    )
    args_schema: Type[BaseModel] = VerifyEmailInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool("/v1/tools/verify/email", _strip_none(kwargs))
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool("/v1/tools/verify/email", _strip_none(kwargs))
        return json.dumps(result)
