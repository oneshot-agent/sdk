# oneshot-python

Core Python SDK for the [OneShot](https://oneshotagent.com) API. Handles the x402 payment protocol (quote, sign, pay, poll) so your Python code can call any OneShot tool.

This is the foundation package. If you're using LangChain, install [`langchain-oneshot`](https://pypi.org/project/langchain-oneshot/) instead (it includes this package).

## Installation

```bash
pip install oneshot-python
```

## Quick Start

```python
from oneshot import OneShotClient

client = OneShotClient(
    private_key="0x...",
    test_mode=True,  # Base Sepolia testnet (default)
)

# Paid tool — handles 402 -> sign -> pay -> poll automatically
result = client.call_tool("/v1/tools/email/send", {
    "to": "user@example.com",
    "subject": "Hello from Python",
    "body": "Sent via oneshot-python",
})

# Free endpoint
balance = client.call_free_get("/v1/wallet/balance")
```

### Async

```python
import asyncio
from oneshot import OneShotClient

client = OneShotClient(private_key="0x...", test_mode=True)

async def main():
    result = await client.acall_tool("/v1/tools/research", {
        "topic": "AI agent frameworks",
        "depth": "quick",
    })
    print(result)

asyncio.run(main())
```

## How Payments Work

Paid endpoints use the [x402 protocol](https://x402.org):

1. Client POSTs to a tool endpoint
2. API returns `402 Payment Required` with a USDC quote
3. Client signs a `TransferWithAuthorization` (EIP-3009) locally
4. Client re-POSTs with the signed payment in the `x-payment` header
5. API processes the request and returns the result

Your private key never leaves your machine. All signing happens locally via `eth-account`.

## Configuration

```python
# Test mode (default) — Base Sepolia, no real money
client = OneShotClient(private_key="0x...", test_mode=True)

# Production — Base Mainnet, real USDC
client = OneShotClient(private_key="0x...", test_mode=False)

# Debug logging
client = OneShotClient(private_key="0x...", debug=True)

# Custom API URL
client = OneShotClient(private_key="0x...", base_url="https://custom-api.example.com")
```

## API

### Paid tools

- `call_tool(endpoint, payload, *, max_cost=None, timeout_sec=120)` — Blocking
- `acall_tool(endpoint, payload, *, max_cost=None, timeout_sec=120)` — Async

### Free endpoints

- `call_free_get(endpoint, params=None)` / `acall_free_get(...)` — GET
- `call_free_post(endpoint, payload=None)` / `acall_free_post(...)` — POST
- `call_free_patch(endpoint, payload=None)` / `acall_free_patch(...)` — PATCH

## Requirements

- Python 3.10+
- `httpx >= 0.27.0`
- `eth-account >= 0.13.0`

## Links

- [Documentation](https://docs.oneshotagent.com/sdk/installation#install-via-pip-python)
- [LangChain integration](https://pypi.org/project/langchain-oneshot/) — 26 tools as LangChain BaseTool
- [GAME plugin](https://pypi.org/project/game-plugin-oneshot/) — Virtuals Protocol integration
- [TypeScript SDK](https://www.npmjs.com/package/@oneshot-agent/sdk)
- [MCP Server](https://www.npmjs.com/package/@oneshot-agent/mcp-server)
- [GitHub](https://github.com/oneshot-agent/sdk)

## License

MIT
