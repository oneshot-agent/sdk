"""OneShot person intelligence tools."""

from __future__ import annotations

import json
from typing import Any, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel

from langchain_oneshot._types import (
    ArticleSearchInput,
    DeepResearchPersonInput,
    PersonInteractionsInput,
    PersonInterestsInput,
    PersonNewsfeedInput,
    SocialProfilesInput,
)
from oneshot import OneShotClient


def _strip_none(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}


class DeepResearchPersonTool(BaseTool):
    """Get a full background report on a person. Takes 2-5 minutes. Costs ~$0.50."""

    name: str = "oneshot_deep_research_person"
    description: str = (
        "Deep research on a person — returns career history, social presence, "
        "interests, and connections. Provide at least one of email, social_media_url, "
        "or name. Takes 2-5 minutes. Costs ~$0.50."
    )
    args_schema: Type[BaseModel] = DeepResearchPersonInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool("/v1/tools/research/person", _strip_none(kwargs), timeout_sec=600)
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool("/v1/tools/research/person", _strip_none(kwargs), timeout_sec=600)
        return json.dumps(result)


class SocialProfilesTool(BaseTool):
    """Find someone's accounts across platforms. Costs ~$0.05."""

    name: str = "oneshot_social_profiles"
    description: str = (
        "Find a person's social media profiles across platforms (LinkedIn, Twitter, "
        "GitHub, YouTube, etc). Provide email or a known social URL. Costs ~$0.05."
    )
    args_schema: Type[BaseModel] = SocialProfilesInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool("/v1/tools/research/social", _strip_none(kwargs))
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool("/v1/tools/research/social", _strip_none(kwargs))
        return json.dumps(result)


class ArticleSearchTool(BaseTool):
    """Find articles and interviews about a person. Costs ~$0.10."""

    name: str = "oneshot_article_search"
    description: str = (
        "Find articles, publications, and interviews mentioning a person. "
        "Requires name and company. Costs ~$0.10."
    )
    args_schema: Type[BaseModel] = ArticleSearchInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool("/v1/tools/research/articles", _strip_none(kwargs))
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool("/v1/tools/research/articles", _strip_none(kwargs))
        return json.dumps(result)


class PersonNewsfeedTool(BaseTool):
    """Get a person's recent social posts with likes, replies, and shares. Costs ~$0.05."""

    name: str = "oneshot_person_newsfeed"
    description: str = (
        "Pull someone's recent social media posts with likes, replies, "
        "and shares. Requires a social profile URL. Costs ~$0.05."
    )
    args_schema: Type[BaseModel] = PersonNewsfeedInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool("/v1/tools/research/newsfeed", _strip_none(kwargs))
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool("/v1/tools/research/newsfeed", _strip_none(kwargs))
        return json.dumps(result)


class PersonInterestsTool(BaseTool):
    """Figure out what someone cares about. Costs ~$0.05."""

    name: str = "oneshot_person_interests"
    description: str = (
        "Analyze what a person cares about — sports, politics, tech, entertainment, etc. "
        "Provide at least one of email, phone, or social_media_url. Costs ~$0.05."
    )
    args_schema: Type[BaseModel] = PersonInterestsInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool("/v1/tools/research/interests", _strip_none(kwargs))
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool("/v1/tools/research/interests", _strip_none(kwargs))
        return json.dumps(result)


class PersonInteractionsTool(BaseTool):
    """Map a person's followers, following, and replies. Costs ~$0.10."""

    name: str = "oneshot_person_interactions"
    description: str = (
        "See who someone follows, who follows them, and who they reply to. "
        "Requires a social profile URL (Twitter/X or Instagram). Costs ~$0.10."
    )
    args_schema: Type[BaseModel] = PersonInteractionsInput
    handle_tool_error: bool = True

    client: OneShotClient

    def _run(self, **kwargs: Any) -> str:
        result = self.client.call_tool("/v1/tools/research/interactions", _strip_none(kwargs))
        return json.dumps(result)

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.client.acall_tool("/v1/tools/research/interactions", _strip_none(kwargs))
        return json.dumps(result)
