# game-plugin-oneshot

GAME SDK plugin that gives Virtuals Protocol agents access to OneShot real-world tools.

## Install

```bash
pip install game-plugin-oneshot
```

## Quick Start

```python
import os
from game_sdk.game.agent import Agent
from game_plugin_oneshot import OneShotPlugin

plugin = OneShotPlugin(
    private_key=os.environ["WALLET_PRIVATE_KEY"],
    test_mode=True,  # Use Base Sepolia testnet
)

agent = Agent(
    api_key=os.environ["GAME_API_KEY"],
    name="my-agent",
    agent_description="An agent that can interact with the real world",
)

agent.add_worker(plugin.get_worker())
agent.run()
```

## Tools

| Tool | Description | Cost (USDC) |
|------|-------------|-------------|
| `oneshot_email` | Send emails to real recipients | ~$0.01 |
| `oneshot_sms` | Send SMS text messages | ~$0.035 |
| `oneshot_voice` | Make phone calls with AI voice | ~$0.25/min |
| `oneshot_research` | Deep research reports | $0.50-$2.00 |
| `oneshot_commerce_search` | Search for products | Free |
| `oneshot_commerce_buy` | Purchase products online | Product price |
| `oneshot_build` | Generate and deploy websites | ~$10+ |

## Payment

All paid tools use the [x402 payment protocol](https://www.x402.org/) to deduct USDC from your wallet on Base (or Base Sepolia in test mode). Fund your wallet with USDC before using paid tools.

## Complex Arguments

GAME `Argument` only supports scalar types. For tools that need structured input (`commerce_buy`, `build`), pass JSON strings:

```python
# The agent will generate these automatically, but for manual testing:
import json

shipping = json.dumps({
    "first_name": "John",
    "last_name": "Doe",
    "street": "123 Main St",
    "city": "Austin",
    "state": "TX",
    "zip_code": "78701",
    "phone": "+15551234567",
})

product = json.dumps({
    "name": "Acme SaaS",
    "description": "Project management for teams",
})
```

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `private_key` | (required) | Hex-encoded Ethereum private key |
| `test_mode` | `True` | Use Base Sepolia testnet |
| `base_url` | auto | Custom API URL |

## Requirements

- Python >= 3.10
- `game-sdk >= 0.1.5`
- `langchain-oneshot >= 0.2.0`

## Links

- [Documentation](https://docs.oneshotagent.com/sdk/virtuals)
- [langchain-oneshot on PyPI](https://pypi.org/project/langchain-oneshot/) — Full 26-tool LangChain integration
- [oneshot-python on PyPI](https://pypi.org/project/oneshot-python/) — Core HTTP client
- [TypeScript SDK](https://www.npmjs.com/package/@oneshot-agent/sdk)
- [MCP Server](https://www.npmjs.com/package/@oneshot-agent/mcp-server)
- [GitHub](https://github.com/oneshot-agent/sdk)

## License

MIT
