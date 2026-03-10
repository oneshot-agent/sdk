"""OneShotToolkit — LangChain BaseToolkit that bundles all 26 OneShot tools."""

from __future__ import annotations

from pydantic import ConfigDict
from langchain_core.tools import BaseTool, BaseToolkit

from oneshot import OneShotClient
from langchain_oneshot.tools import (
    ArticleSearchTool,
    BuildTool,
    CommerceBuyTool,
    CommerceSearchTool,
    DeepResearchPersonTool,
    EmailTool,
    EnrichProfileTool,
    FindEmailTool,
    GetBalanceTool,
    InboxGetTool,
    InboxListTool,
    MarkNotificationReadTool,
    NotificationsTool,
    PeopleSearchTool,
    PersonInteractionsTool,
    PersonInterestsTool,
    PersonNewsfeedTool,
    ResearchTool,
    SmsInboxGetTool,
    SmsInboxListTool,
    SmsTool,
    SocialProfilesTool,
    UpdateBuildTool,
    VerifyEmailTool,
    VoiceTool,
    WebSearchTool,
)


class OneShotToolkit(BaseToolkit):
    """LangChain toolkit providing all 26 OneShot tools.

    Example::

        toolkit = OneShotToolkit.from_private_key("0x...", test_mode=True)
        tools = toolkit.get_tools()
        agent = create_react_agent(llm, tools)
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    client: OneShotClient

    @classmethod
    def from_private_key(
        cls,
        private_key: str,
        *,
        test_mode: bool = False,
        base_url: str | None = None,
        debug: bool = False,
    ) -> OneShotToolkit:
        """Create a toolkit from a raw private key."""
        client = OneShotClient(
            private_key=private_key,
            test_mode=test_mode,
            base_url=base_url,
            debug=debug,
        )
        return cls(client=client)

    def get_tools(self) -> list[BaseTool]:
        """Return all 26 OneShot tools, each sharing the same client."""
        return [
            # Communication
            EmailTool(client=self.client),
            VoiceTool(client=self.client),
            SmsTool(client=self.client),
            # Research & Enrichment
            ResearchTool(client=self.client),
            WebSearchTool(client=self.client),
            PeopleSearchTool(client=self.client),
            EnrichProfileTool(client=self.client),
            FindEmailTool(client=self.client),
            VerifyEmailTool(client=self.client),
            # Person Intelligence
            DeepResearchPersonTool(client=self.client),
            SocialProfilesTool(client=self.client),
            ArticleSearchTool(client=self.client),
            PersonNewsfeedTool(client=self.client),
            PersonInterestsTool(client=self.client),
            PersonInteractionsTool(client=self.client),
            # Commerce
            CommerceSearchTool(client=self.client),
            CommerceBuyTool(client=self.client),
            # Build
            BuildTool(client=self.client),
            UpdateBuildTool(client=self.client),
            # Inbox
            InboxListTool(client=self.client),
            InboxGetTool(client=self.client),
            SmsInboxListTool(client=self.client),
            SmsInboxGetTool(client=self.client),
            # Account
            NotificationsTool(client=self.client),
            MarkNotificationReadTool(client=self.client),
            GetBalanceTool(client=self.client),
        ]
