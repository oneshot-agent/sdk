"""EIP-712 payment signing for x402 protocol (USDC TransferWithAuthorization).

Ports the signing logic from:
- libs/agent-sdk/src/index.ts (L1511-1568)
- apps/api-service/src/services/x402-facilitator.ts (L28-29) for domain names
"""

from __future__ import annotations

import os
import time
from typing import Any, TypedDict

from eth_account import Account
from eth_account.messages import encode_typed_data


class PaymentSignature(TypedDict):
    v: int
    r: str
    s: str


class PaymentAuthorization(TypedDict):
    """Mirrors the TS SDK PaymentAuthorization interface."""

    from_address: str  # 'from' is reserved in Python
    to: str
    value: str
    validAfter: int
    validBefore: int
    nonce: str
    signature: PaymentSignature
    network: str
    token: str


def _get_usdc_domain_name(chain_id: int) -> str:
    """Return the EIP-712 domain name for USDC on the given chain.

    Base Sepolia (84532) uses "USDC", Base Mainnet (8453) uses "USD Coin".
    Source: apps/api-service/src/services/x402-facilitator.ts:28-29
    """
    return "USDC" if chain_id == 84532 else "USD Coin"


def sign_payment_authorization(
    *,
    private_key: str,
    from_address: str,
    to_address: str,
    amount: str,
    token_address: str,
    chain_id: int,
    network: str,
) -> dict[str, Any]:
    """Create an EIP-712 TransferWithAuthorization signature for USDC.

    Args:
        private_key: Hex-encoded private key (with or without 0x prefix).
        from_address: Sender wallet address.
        to_address: Recipient (merchant) address.
        amount: Amount in USDC human-readable units (e.g. "1.50").
        token_address: USDC contract address.
        chain_id: EVM chain ID (84532 for Base Sepolia, 8453 for Base Mainnet).
        network: CAIP-2 network string (e.g. "eip155:84532").

    Returns:
        Payment authorization dict ready to be JSON-serialized as x-payment header.
    """
    # Convert human-readable amount to USDC base units (6 decimals)
    value = _parse_usdc_amount(amount)
    now = int(time.time())
    nonce = "0x" + os.urandom(32).hex()

    domain_data = {
        "name": _get_usdc_domain_name(chain_id),
        "version": "2",
        "chainId": chain_id,
        "verifyingContract": token_address,
    }

    message_types = {
        "TransferWithAuthorization": [
            {"name": "from", "type": "address"},
            {"name": "to", "type": "address"},
            {"name": "value", "type": "uint256"},
            {"name": "validAfter", "type": "uint256"},
            {"name": "validBefore", "type": "uint256"},
            {"name": "nonce", "type": "bytes32"},
        ],
    }

    message_data = {
        "from": from_address,
        "to": to_address,
        "value": value,
        "validAfter": now - 300,
        "validBefore": now + 3600,
        "nonce": bytes.fromhex(nonce[2:]),
    }

    signable = encode_typed_data(
        domain_data=domain_data,
        message_types=message_types,
        message_data=message_data,
    )
    signed = Account.sign_message(signable, private_key=private_key)

    return {
        "from": from_address,
        "to": to_address,
        "value": str(value),
        "validAfter": now - 300,
        "validBefore": now + 3600,
        "nonce": nonce,
        "signature": {
            "v": signed.v,
            "r": hex(signed.r),
            "s": hex(signed.s),
        },
        "network": network,
        "token": token_address,
    }


def _parse_usdc_amount(amount: str) -> int:
    """Convert a human-readable USDC amount to base units (6 decimals).

    Examples:
        "1.50" -> 1500000
        "10"   -> 10000000
        "0.01" -> 10000
    """
    parts = amount.split(".")
    whole = int(parts[0])
    if len(parts) == 1:
        return whole * 1_000_000

    # Pad or truncate fractional part to 6 digits
    frac_str = parts[1][:6].ljust(6, "0")
    return whole * 1_000_000 + int(frac_str)
