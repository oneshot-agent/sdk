# @oneshot-agent/mcp-server

MCP (Model Context Protocol) server for [OneShot](https://oneshotagent.com) - enabling AI agents to execute commercial actions.

## Installation

```bash
npm install -g @oneshot-agent/mcp-server
```

## Configuration

The server supports two auth methods: **CDP Wallet** (recommended, no private keys in config) or a raw private key.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CDP_API_KEY_ID` | Option A | Coinbase CDP API key ID |
| `CDP_API_KEY_SECRET` | Option A | Coinbase CDP API key secret |
| `CDP_WALLET_SECRET` | Option A | Coinbase CDP wallet secret |
| `ONESHOT_WALLET_PRIVATE_KEY` | Option B | Raw private key for signing payments |

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "oneshot": {
      "command": "npx",
      "args": ["-y", "@oneshot-agent/mcp-server"],
      "env": {
        "CDP_API_KEY_ID": "your-api-key-id",
        "CDP_API_KEY_SECRET": "your-api-key-secret",
        "CDP_WALLET_SECRET": "your-wallet-secret"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "oneshot": {
      "command": "npx",
      "args": ["-y", "@oneshot-agent/mcp-server"],
      "env": {
        "CDP_API_KEY_ID": "your-api-key-id",
        "CDP_API_KEY_SECRET": "your-api-key-secret",
        "CDP_WALLET_SECRET": "your-wallet-secret"
      }
    }
  }
}
```

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "oneshot": {
      "command": "npx",
      "args": ["-y", "@oneshot-agent/mcp-server"],
      "env": {
        "CDP_API_KEY_ID": "your-api-key-id",
        "CDP_API_KEY_SECRET": "your-api-key-secret",
        "CDP_WALLET_SECRET": "your-wallet-secret"
      }
    }
  }
}
```

Get CDP credentials at [Coinbase Agentic Wallet](https://docs.cdp.coinbase.com/agentic-wallet/welcome). Or use `ONESHOT_WALLET_PRIVATE_KEY` instead of CDP env vars for raw key auth.

## Available Tools

### Communication

| Tool | Description |
|------|-------------|
| `oneshot_email` | Send emails with attachments |
| `oneshot_voice` | Make phone calls |
| `oneshot_sms` | Send SMS messages |

### Inbox

| Tool | Description |
|------|-------------|
| `oneshot_inbox_list` | List received emails |
| `oneshot_inbox_get` | Get a specific email |
| `oneshot_sms_inbox_list` | List received SMS messages |
| `oneshot_sms_inbox_get` | Get a specific SMS message |

### Research & Enrichment

| Tool | Description |
|------|-------------|
| `oneshot_research` | Deep web research with sources |
| `oneshot_people_search` | Search for people by title, company, etc. |
| `oneshot_enrich_profile` | Enrich person profile from LinkedIn/email |
| `oneshot_find_email` | Find someone's email address |
| `oneshot_verify_email` | Verify email deliverability |

### Person Intelligence

| Tool | Description |
|------|-------------|
| `oneshot_deep_research_person` | Full dossier on a person |
| `oneshot_social_profiles` | Find all social accounts for a person |
| `oneshot_article_search` | Find articles about a person |
| `oneshot_person_newsfeed` | Recent social posts with engagement |
| `oneshot_person_interests` | Analyze interests across categories |
| `oneshot_person_interactions` | Map followers, following, replies |

### Web

| Tool | Description |
|------|-------------|
| `oneshot_web_search` | Search the web |
| `oneshot_web_read` | Read any URL as markdown + screenshot |
| `oneshot_browser` | Autonomous browser — navigate, click, extract |

### Commerce

| Tool | Description |
|------|-------------|
| `oneshot_commerce_search` | Search for products |
| `oneshot_commerce_buy` | Purchase products |

### Build

| Tool | Description |
|------|-------------|
| `oneshot_build` | Build and deploy production websites |
| `oneshot_update_build` | Update an existing website |

### Account

| Tool | Description |
|------|-------------|
| `oneshot_notifications` | List agent notifications |
| `oneshot_mark_notification_read` | Mark notification as read |
| `oneshot_get_balance` | Get USDC wallet balance |

All paid tools are priced in USDC via the x402 protocol. See [Pricing](https://docs.oneshotagent.com/pricing) for current rates.

## Tool Examples

### Send an Email

```
Use oneshot_email:
- to: "user@example.com"
- subject: "Hello from AI"
- body: "<h1>Hello!</h1><p>This email was sent by an AI agent.</p>"
```

### Make a Phone Call

```
Use oneshot_voice:
- target_number: "+14155551234"
- objective: "Call the restaurant and make a reservation for 2 people at 7pm tonight"
- caller_persona: "A polite assistant calling on behalf of John"
```

### Send an SMS

```
Use oneshot_sms:
- to_number: "+14155551234"
- message: "Your order has shipped! Track it at: https://example.com/track/123"
```

### Research a Topic

```
Use oneshot_research:
- topic: "What are the latest developments in quantum computing?"
- depth: "deep"
```

### Search for People

```
Use oneshot_people_search:
- job_titles: ["CTO", "VP Engineering"]
- companies: ["Stripe", "Square"]
- location: ["San Francisco"]
- limit: 10
```

### Find Someone's Email

```
Use oneshot_find_email:
- first_name: "John"
- last_name: "Smith"
- company_domain: "example.com"
```

### Check Wallet Balance

```
Use oneshot_get_balance (no parameters needed)
```

### Build a Website

```
Use oneshot_build:
- type: "saas"
- product:
    name: "Acme Analytics"
    description: "Real-time analytics dashboard for modern teams. Track metrics, visualize data, and make better decisions."
    industry: "Software"
- lead_capture:
    enabled: true
- brand:
    primary_color: "#4F46E5"
    tone: "professional"
```

### Read Inbox

```
Use oneshot_inbox_list:
- limit: 10
- include_body: true
```

## Funding Your Agent

Send USDC to your agent's wallet address on Base. The server operates on Base Mainnet (chain 8453).

## Links

- [Documentation](https://docs.oneshotagent.com/sdk/mcp)
- [Pricing](https://docs.oneshotagent.com/pricing)
- [TypeScript SDK](https://www.npmjs.com/package/@oneshot-agent/sdk)
- [Python SDK (LangChain)](https://pypi.org/project/langchain-oneshot/)
- [Python SDK (Core)](https://pypi.org/project/oneshot-python/)
- [GitHub](https://github.com/oneshot-agent/sdk)
