"""State factory for GAME worker — provides wallet context to the agent."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from oneshot import OneShotClient


def get_state_factory(client: OneShotClient):
    """Return a callable that GAME invokes to get current worker state."""

    def _get_state(function_result: str, current_state: dict) -> dict:
        mode = "testnet" if client.test_mode else "mainnet"
        return {
            "wallet_address": client.address,
            "network": f"Base {'Sepolia' if client.test_mode else 'Mainnet'}",
            "mode": mode,
            "note": "All paid tools deduct USDC from the wallet above. "
                    "Free tools (commerce_search) cost nothing.",
        }

    return _get_state
