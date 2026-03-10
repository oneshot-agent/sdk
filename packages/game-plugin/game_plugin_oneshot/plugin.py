"""OneShotPlugin — exposes OneShot tools as a GAME worker.

Usage::

    from game_plugin_oneshot import OneShotPlugin
    from game_sdk import Agent

    plugin = OneShotPlugin(private_key="0x...")
    agent = Agent(api_key="...", name="my-agent")
    agent.add_worker(plugin.get_worker())
    agent.run()
"""

from __future__ import annotations

from game_sdk.game.agent import WorkerConfig
from game_sdk.game.custom_types import Function
from oneshot import OneShotClient

from game_plugin_oneshot._state import get_state_factory
from game_plugin_oneshot.tools import (
    make_build_function,
    make_commerce_buy_function,
    make_commerce_search_function,
    make_email_function,
    make_research_function,
    make_sms_function,
    make_voice_function,
)


class OneShotPlugin:
    """GAME SDK plugin that provides 7 OneShot real-world action tools.

    Args:
        private_key: Hex-encoded Ethereum private key for x402 USDC payments.
        test_mode: Use Base Sepolia testnet (True) or Base mainnet (False).
        base_url: Optional custom API base URL.
    """

    def __init__(
        self,
        private_key: str,
        *,
        test_mode: bool = False,
        base_url: str | None = None,
    ) -> None:
        self.client = OneShotClient(
            private_key,
            test_mode=test_mode,
            **({"base_url": base_url} if base_url else {}),
        )

    def get_worker(self, data: str | None = None) -> WorkerConfig:
        """Return a GAME WorkerConfig with all 7 OneShot tool functions.

        Pass this to ``agent.add_worker(plugin.get_worker())``.
        """
        functions: list[Function] = [
            make_email_function(self.client),
            make_sms_function(self.client),
            make_voice_function(self.client),
            make_research_function(self.client),
            make_commerce_search_function(self.client),
            make_commerce_buy_function(self.client),
            make_build_function(self.client),
        ]

        return WorkerConfig(
            id="oneshot_worker",
            worker_description=(
                "OneShot real-world action worker. Provides tools to send emails, "
                "SMS messages, make phone calls, run deep research, search and buy "
                "products online, and generate live websites. All paid actions deduct "
                "USDC from the configured wallet via x402 payment protocol."
            ),
            action_space=functions,
            get_state_fn=get_state_factory(self.client),
        )
