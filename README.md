# OneShot SDK

The commercial action layer for AI agents. Send emails, make calls, run research, buy products, build websites, and execute code — all paid with USDC via the [x402 protocol](https://www.x402.org/).

## Packages

| Package | Language | Install | Description |
|---------|----------|---------|-------------|
| [`@oneshot-agent/sdk`](packages/typescript) | TypeScript | `npm i @oneshot-agent/sdk` | Core SDK with x402 payment handling |
| [`@oneshot-agent/mcp-server`](packages/mcp-server) | TypeScript | `npm i -g @oneshot-agent/mcp-server` | MCP server for Claude Desktop / Cursor |
| [`oneshot-python`](packages/python) | Python | `pip install oneshot-python` | Core Python client |
| [`langchain-oneshot`](packages/langchain) | Python | `pip install langchain-oneshot` | LangChain tools (26 tools) |
| [`game-plugin-oneshot`](packages/game-plugin) | Python | `pip install game-plugin-oneshot` | Virtuals GAME SDK plugin |

## Quick start

### TypeScript

```typescript
import { OneShot } from '@oneshot-agent/sdk';

const agent = new OneShot({ privateKey: process.env.WALLET_PRIVATE_KEY });

const result = await agent.research({ query: 'AI agent infrastructure landscape' });
console.log(result.report);
```

### Python

```python
from oneshot import OneShotClient

client = OneShotClient(private_key="0x...")
result = client.call_tool("research", {"query": "AI agent infrastructure landscape"})
```

### MCP Server (Claude Desktop)

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "oneshot": {
      "command": "npx",
      "args": ["-y", "@oneshot-agent/mcp-server"],
      "env": {
        "ONESHOT_WALLET_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

## Tools

All packages expose the same set of tools:

- **Email** — send emails with attachments, manage inbox
- **Voice** — make phone calls with AI voice agents
- **SMS** — send text messages
- **Research** — deep web research, people search, article discovery
- **Enrichment** — email lookup, profile enrichment, social discovery
- **Commerce** — search and buy products online
- **Build** — generate and deploy production websites
- **Browser** — automated web browsing
- **Compute** — execute code in sandboxed environments

## Payments

All paid tools use the [x402 protocol](https://www.x402.org/) on Base (Ethereum L2). The SDK handles the payment flow automatically:

1. Call a tool
2. API returns a price quote (HTTP 402)
3. SDK signs a USDC authorization
4. API verifies and executes

You need a wallet with USDC on Base mainnet. Gas costs are fractions of a cent.

## Documentation

- [OneShot Docs](https://docs.oneshotagent.com)
- [Soul.Markets Docs](https://docs.soul.mds.markets)
- [API Reference](https://docs.soul.mds.markets/api-reference/overview)

## License

MIT
