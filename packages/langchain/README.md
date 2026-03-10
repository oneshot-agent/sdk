# langchain-oneshot

LangChain tools for [OneShot](https://oneshotagent.com) — commercial actions for AI agents.

Provides 26 tools as LangChain `BaseTool` subclasses with automatic x402 payment handling via USDC on Base.

## Installation

```bash
pip install langchain-oneshot
```

## Quick Start

```python
from langchain_oneshot import OneShotToolkit
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

# Create toolkit (test mode uses Base Sepolia testnet)
toolkit = OneShotToolkit.from_private_key(
    private_key="0x...",
    test_mode=True,
)

# Use all 26 tools with a LangGraph agent
tools = toolkit.get_tools()
llm = ChatOpenAI(model="gpt-4o")
agent = create_react_agent(llm, tools)

result = agent.invoke({
    "messages": [("user", "Research the latest AI agent frameworks")]
})
```

## Individual Tools

```python
from langchain_oneshot import OneShotClient, ResearchTool

client = OneShotClient(private_key="0x...", test_mode=True)
research = ResearchTool(client=client)
result = research.invoke({"topic": "AI agent frameworks 2026"})
```

## Available Tools

| Tool | Description | Cost |
|------|-------------|------|
| `oneshot_email` | Send emails | ~$0.01 |
| `oneshot_voice` | Make phone calls | ~$0.25/min |
| `oneshot_sms` | Send SMS messages | ~$0.035/segment |
| `oneshot_research` | Deep web research | $0.50–$2.00 |
| `oneshot_web_search` | Search the web | ~$0.02 |
| `oneshot_people_search` | Search for people | ~$0.10/result |
| `oneshot_enrich_profile` | Enrich a profile | ~$0.10 |
| `oneshot_find_email` | Find email address | ~$0.10 |
| `oneshot_verify_email` | Verify email | ~$0.01 |
| `oneshot_deep_research_person` | Full dossier on a person | ~$0.50 |
| `oneshot_social_profiles` | Find all social accounts | ~$0.05 |
| `oneshot_article_search` | Find articles about a person | ~$0.10 |
| `oneshot_person_newsfeed` | Recent social posts | ~$0.05 |
| `oneshot_person_interests` | Analyze interests | ~$0.05 |
| `oneshot_person_interactions` | Map followers/following | ~$0.10 |
| `oneshot_commerce_search` | Search products | Free |
| `oneshot_commerce_buy` | Purchase product | Price + fee |
| `oneshot_build` | Build a website | ~$10 base |
| `oneshot_update_build` | Update a website | ~$10 base |
| `oneshot_inbox_list` | List inbox emails | Free |
| `oneshot_inbox_get` | Get email by ID | Free |
| `oneshot_sms_inbox_list` | List SMS inbox | Free |
| `oneshot_sms_inbox_get` | Get SMS by ID | Free |
| `oneshot_notifications` | List notifications | Free |
| `oneshot_mark_notification_read` | Mark read | Free |
| `oneshot_get_balance` | USDC balance | Free |

## How Payments Work

Paid tools use the [x402 protocol](https://x402.org). When a tool requires payment:

1. The client POSTs to the tool endpoint
2. The API returns `402 Payment Required` with a quote
3. The client signs a USDC `TransferWithAuthorization` (EIP-3009) using your private key
4. The client re-POSTs with the signed payment header
5. The API processes the request and returns the result

All payment signing happens locally — your private key never leaves your machine.

## Configuration

```python
# Test mode (Base Sepolia — no real money)
toolkit = OneShotToolkit.from_private_key("0x...", test_mode=True)

# Production (Base Mainnet — real USDC)
toolkit = OneShotToolkit.from_private_key("0x...", test_mode=False)
```

## Requirements

- Python 3.10+
- `langchain-core >= 0.3.0`
- `oneshot-python >= 0.2.0`
- `pydantic >= 2.0`

## Links

- [Documentation](https://docs.oneshotagent.com/sdk/langchain)
- [oneshot-python on PyPI](https://pypi.org/project/oneshot-python/) — Core HTTP client (dependency)
- [TypeScript SDK](https://www.npmjs.com/package/@oneshot-agent/sdk)
- [MCP Server](https://www.npmjs.com/package/@oneshot-agent/mcp-server)
- [GitHub](https://github.com/oneshot-agent/sdk)

## License

MIT
