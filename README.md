# @oneshot-agent/sdk

Autonomous Agent SDK for executing real-world commercial transactions with automatic x402 payments.

## Installation

```bash
npm install @oneshot-agent/sdk
```

### Using with Claude Desktop, Cursor, or Claude Code?

Use the MCP server instead for zero-code integration:

```bash
npx -y @oneshot-agent/mcp-server
```

See the [MCP Server documentation](https://docs.oneshotagent.com/sdk/mcp) for setup instructions.

### Teach your coding agent to use OneShot

Install the OneShot [Agent Skills](https://skills.sh) into Claude Code, Cursor, Codex, and
[70+ other agents](https://github.com/vercel-labs/skills#supported-agents) so they know how to
call the SDK and MCP tools:

```bash
# All OneShot skills
npx skills add oneshot-agent/agent-skills

# Or just what you need (e.g. setup + email)
npx skills add oneshot-agent/agent-skills --skill oneshot --skill oneshot-email
```

Skills available: `oneshot` (setup/auth), `oneshot-email`, `oneshot-messaging`,
`oneshot-research`, `oneshot-enrichment`, `oneshot-commerce`, `oneshot-browser`,
`oneshot-build`, `oneshot-compute`, `soul-markets`. Source:
[oneshot-agent/agent-skills](https://github.com/oneshot-agent/agent-skills).

## Quick Start

```typescript
import { OneShot } from '@oneshot-agent/sdk';

const agent = new OneShot({
  privateKey: process.env.AGENT_PRIVATE_KEY!
});

// Send email
await agent.email({
  to: 'user@example.com',
  subject: 'Hello',
  body: 'Hello World!'
});

// Make a voice call
const call = await agent.voice({
  objective: 'Call the restaurant to make a reservation for 2 at 7pm',
  target_number: '+14155551234'
});
console.log(call.transcript);

// Send SMS
await agent.sms({
  message: 'Your order has shipped!',
  to_number: '+14155551234'
});

// Build a website
const site = await agent.build({
  type: 'saas',
  product: {
    name: 'TaskFlow',
    description: 'AI-powered task management for remote teams'
  }
});
console.log('Live at:', site.production_url);

// Research
const report = await agent.research({ topic: 'AI agents', depth: 'deep' });

// Check balance
const balance = await agent.getBalance(agent.usdcAddress);
```

## Network

The SDK operates on **Base Mainnet** with real USDC. Fund your agent wallet with USDC on Base before making paid tool calls.

```typescript
agent.usdcAddress; // 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
agent.chainId;     // 8453
```

## Available Methods

| Method | Description |
|--------|-------------|
| **Communication** | |
| `email()` | Send emails with attachments |
| `voice()` | Make phone calls |
| `sms()` | Send SMS messages |
| `inboxList()` | List inbound emails |
| `inboxGet()` | Get email by ID |
| `smsInboxList()` | List inbound SMS |
| `smsInboxGet()` | Get SMS by ID |
| `notifications()` | List agent notifications |
| `markNotificationRead()` | Mark notification as read |
| **Domain Pool** | |
| `listDomains()` | List your sending domains with warmup/rotation state |
| `pauseDomain()` | Take a domain out of rotation |
| `resumeDomain()` | Put a paused domain back into rotation |
| **Research & People** | |
| `research()` | Deep web research |
| `peopleSearch()` | Search people by criteria |
| `enrichProfile()` | Enrich from LinkedIn/email |
| `findEmail()` | Find email for a person |
| `verifyEmail()` | Verify email deliverability |
| `deepResearchPerson()` | Full dossier on a person |
| `socialProfiles()` | Find all social accounts |
| `articleSearch()` | Find articles about a person |
| `personNewsfeed()` | Recent social posts with engagement |
| `personInterests()` | Analyze interests across categories |
| `personInteractions()` | Map followers, following, replies |
| **Web & Commerce** | |
| `webSearch()` | Search the web |
| `webRead()` | Read any URL as markdown + screenshot |
| `commerceBuy()` | Purchase products |
| `commerceSearch()` | Search products |
| **Browser** | |
| `browser()` | Autonomous browser — navigate, click, extract |
| `createBrowserProfile()` | Create a persistent browser profile |
| `listBrowserProfiles()` | List saved browser profiles |
| `deleteBrowserProfile()` | Delete a browser profile |
| **Build** | |
| `build()` | Build and deploy production websites |
| `updateBuild()` | Update an existing website |
| **Compute (Agentic Goals)** | |
| `compute()` | Launch autonomous multi-step goal |
| `getComputeGoal()` | Get goal status and progress |
| `getComputeTasks()` | List tasks for a goal |
| `getComputeBudget()` | Check remaining budget for a goal |
| `respondToComputeTask()` | Provide input to a pending task |
| `pauseComputeGoal()` | Pause a running goal |
| `resumeComputeGoal()` | Resume a paused goal |
| `cancelComputeGoal()` | Cancel a goal |
| `fundComputeGoal()` | Add funds to a goal's budget |
| **Analytics & Balance** | |
| `getBalance()` | Check token balance |
| `getUnifiedBalance()` | Get balance across all chains |
| `spendBreakdown()` | Spending breakdown by tool/period |
| `rocs()` | Return on compute stats |
| `receiptsList()` | List payment receipts (`limit`/`offset` or `since`/`until` window) |
| `tagReceiptValue()` | Tag a receipt with business value (by `receipt_id` or `request_id`) |

## Configuration

```typescript
interface OneShotConfig {
  privateKey: string;    // Required
  baseUrl?: string;      // Override API URL
  rpcUrl?: string;       // Override RPC URL
  debug?: boolean;       // Enable logging
  logger?: (msg: string) => void;
}
```

## Tool Options

All methods accept these common options:

```typescript
interface ToolOptions {
  maxCost?: number;      // Max USDC willing to pay (see supported tools below)
  timeout?: number;      // Timeout in seconds
  signal?: AbortSignal;  // Cancel before payment (see Cancellation section)
  wait?: boolean;        // Wait for async jobs (default: true)
  onStatusUpdate?: (status: string, requestId: string) => void;
}
```

### `maxCost` Support

The `maxCost` option is a client-side guard — the SDK compares the quoted price against your limit and throws before signing any payment if it exceeds it. This is supported on tools with variable pricing:

| Method | `maxCost` |
|--------|:---------:|
| `commerceBuy()` | Supported |
| `voice()` | Supported |
| `sms()` | Supported |
| `build()` / `updateBuild()` | Supported |
| `browser()` | Supported |
| All other tools | Not applicable (fixed low-cost pricing) |

## Error Handling

```typescript
import {
  ValidationError,
  ToolError,
  JobError,
  JobTimeoutError,
  ContentBlockedError,
  EmergencyNumberError
} from '@oneshot-agent/sdk';

try {
  await agent.voice({
    objective: 'Make a call',
    target_number: '+14155551234'
  });
} catch (error) {
  if (error instanceof ContentBlockedError) {
    // Content blocked by safety filters
    console.log(`Blocked: ${error.message}`);
    console.log(`Categories: ${error.categories.join(', ')}`);
  } else if (error instanceof EmergencyNumberError) {
    // Attempted to call/SMS emergency number
    console.log(`Emergency number blocked: ${error.blockedNumber}`);
  } else if (error instanceof ValidationError) {
    console.log(`Invalid: ${error.field}`);
  } else if (error instanceof ToolError) {
    console.log(`API error: ${error.statusCode}`);
  } else if (error instanceof JobTimeoutError) {
    console.log(`Timeout: ${error.jobId}`);
  } else if (error instanceof JobError) {
    // An async job failed. `error.code` is a STABLE, machine-readable code —
    // branch on it rather than parsing `error.message`.
    switch (error.code) {
      case 'insufficient_funds':
        console.log('Fund your wallet — do not blind-retry');
        break;
      case 'invalid_input':
        console.log('Fix the request — retrying as-is will not help');
        break;
      case 'rate_limited':
      case 'provider_unavailable':
      case 'internal_error':
        console.log('Transient — safe to retry');
        break;
      default:
        console.log(`Job failed (${error.code}): ${error.message}`);
    }
  }
}
```

### Job error codes

When a `JobError` is thrown, `error.code` is one of:
`insufficient_funds`, `payment_failed`, `invalid_input`, `content_blocked`,
`rate_limited`, `provider_unavailable`, `provider_auth`, `enrichment_exhausted`,
`checkout_failed`, `internal_error`. See the
[Check Job Status](https://docs.oneshotagent.com/api-reference/status#error-codes)
reference for the full meaning and recommended reaction for each.

## Examples

### Build Websites

```typescript
// Build a SaaS landing page
const site = await agent.build({
  type: 'saas',
  product: {
    name: 'TaskFlow',
    description: 'AI-powered task management for remote teams. Automate workflows, track progress, and collaborate seamlessly.',
    industry: 'Productivity',
    pricing: 'Free tier, Pro $12/mo, Team $29/mo'
  },
  lead_capture: { enabled: true },
  brand: {
    primary_color: '#4F46E5',
    tone: 'professional'
  }
});

console.log('Website URL:', site.production_url);
console.log('Preview:', site.preview_url);

// Update existing website
const updated = await agent.updateBuild({
  build_id: site.request_id,
  product: {
    name: 'TaskFlow 2.0',
    description: 'Now with AI automation! Task management reimagined.',
    pricing: 'Free tier, Pro $15/mo, Team $35/mo'
  }
});
```

Build types: `saas`, `portfolio`, `agency`, `personal`, `product`, `funnel`, `restaurant`, `event`

### Voice Calls

```typescript
// Simple call
const call = await agent.voice({
  objective: 'Call to schedule a dentist appointment for next Tuesday',
  target_number: '+14155551234',
  caller_persona: 'A polite assistant scheduling an appointment',
  context: 'Patient prefers morning appointments',
  maxCost: 5
});

console.log('Transcript:', call.transcript);
console.log('Summary:', call.summary);
console.log('Success:', call.success_evaluation);

// Conference call (multiple numbers)
const conference = await agent.voice({
  objective: 'Connect the buyer and seller to negotiate the final price',
  target_number: ['+14155551234', '+14155555678'],
  caller_persona: 'A professional meeting facilitator'
});
```

### SMS

```typescript
// Single recipient
await agent.sms({
  message: 'Your appointment is confirmed for tomorrow at 10am',
  to_number: '+14155551234'
});

// Multiple recipients (up to 10)
await agent.sms({
  message: 'Team meeting moved to 3pm',
  to_number: ['+14155551234', '+14155555678', '+14155559012']
});

// Check SMS inbox
const inbox = await agent.smsInboxList({ limit: 10 });
for (const msg of inbox.messages) {
  console.log(`From ${msg.from}: ${msg.body}`);
}

// Get specific message
const msg = await agent.smsInboxGet('msg_abc123');
```

### Email with Attachments

```typescript
await agent.email({
  to: ['alice@example.com', 'bob@example.com'],
  subject: 'Report',
  body: 'See attached.',
  attachments: [{
    filename: 'report.pdf',
    content: base64Content,
    content_type: 'application/pdf'
  }]
});
```

### Custom Sender (name, mailbox, domain)

```typescript
// Renders as: From: Jane Doe <jane@acme.com>
await agent.email({
  to: 'user@example.com',
  subject: 'Hello',
  body: 'Sent from a custom sender.',
  from_name: 'Jane Doe',    // display name (optional)
  from_mailbox: 'jane',     // local-part, defaults to "agent"
  from_domain: 'acme.com'   // defaults to "oneshotagent.com"
});
```

`from_domain` must be a domain you've provisioned through OneShot. Defaults
produce `agent@oneshotagent.com`.

### Domain Pool & Warmup

OneShot runs a per-agent **domain pool** with server-side warmup so your cold
email lands in the inbox. Understanding pin-vs-rotate is the key concept:

- **Rotate (recommended for cold outreach):** omit both `from_domain` and
  `from_mailbox`. The server picks a warmed, under-cap domain **from your own
  pool**, applies warmup-score and daily-limit gates, and returns the chosen
  address on the quote (`quote.from_address`). This is the only mode that gets
  warmup protection. If you own no eligible domain, the quote returns
  **`400 no_sending_domain`** — there is **no shared fallback sender**; you must
  provision/own a domain to send.
- **Pin:** set `from_domain` (and/or `from_mailbox`) to force an exact sender.
  Rotation is bypassed — **and so are the warmup-score and daily-limit gates.**
  Pinning a still-warming or over-cap domain will hurt deliverability; the send
  still goes out, but the response carries a non-blocking `warning` (see below).

**Reputation is per-domain**, shared by every mailbox on it. Running multiple
mailboxes on one domain (`jane@`, `sales@`, …) does **not** improve
deliverability or raise capacity — they share the same warmup score and the same
`daily_send_limit`.

**Provisioning:** a domain enters your pool the first time you reference it in a
send/quote (auto-provisioned, then `provisioning → verified → warming → active`
once its warmup score crosses the activation threshold). There is no separate
provisioning call today. New domains start in `warming` and aren't rotation-
eligible until they graduate.

**The `warning` field** (non-blocking — the send still happens; read it to defer):

| `warning` | Meaning |
|-----------|---------|
| `pinned_domain_warming` | Your pinned domain is still warming (low warmup score) — poor deliverability likely. |
| `pinned_over_limit` | Your pinned domain is over its `daily_send_limit` for today. |

Pinned sends are never blocked by warmup/limit — branch on `warning` and defer.
(The one hard error is `400 no_sending_domain` on an **un-pinned** send when you
own no eligible domain — provision or pin one.)

```typescript
// Inspect and manage the pool
const { domains } = await agent.listDomains();
// each: { domain, pool_status, warmup_score, daily_send_limit, daily_sent_count, ... }

await agent.pauseDomain('acme.com');   // take out of rotation
await agent.resumeDomain('acme.com');  // put back (only from 'paused')

const res = await agent.email({ to: 'lead@example.com', subject: 'Hi', body: '…' });
if (res.warning) {
  // e.g. 'pinned_domain_warming' — back off and let warmup finish
}
```

### People Search & Enrichment

```typescript
const results = await agent.peopleSearch({
  job_titles: ['CEO', 'CTO'],
  companies: ['Stripe'],
  limit: 10
});

const profile = await agent.enrichProfile({
  linkedin_url: results.results[0].linkedin_url
});
```

### Commerce

```typescript
const order = await agent.commerceBuy({
  product_url: 'https://amazon.com/dp/B07ZPC9QD4',
  shipping_address: {
    first_name: 'John',
    last_name: 'Doe',
    street: '123 Main St',
    city: 'San Francisco',
    state: 'CA',
    zip_code: '94102',
    country: 'US',
    phone: '4155550100'
  },
  maxCost: 100
});
```

### Notifications

```typescript
// List notifications
const notifications = await agent.notifications({ unread: true, limit: 20 });
for (const n of notifications.notifications) {
  console.log(`[${n.type}] ${n.title}: ${n.message}`);
}

// Mark as read
await agent.markNotificationRead('notification-uuid');
```

### Cancellation

Use `AbortSignal` to cancel operations **before payment is made**. Once payment is signed, the operation will execute regardless of cancellation.

```typescript
const controller = new AbortController();

// Cancel after 5 seconds if still in quote phase
setTimeout(() => controller.abort(), 5000);

try {
  await agent.voice({
    objective: 'Make a reservation',
    target_number: '+14155551234',
    signal: controller.signal
  });
} catch (error) {
  if (error.message === 'Operation cancelled before payment') {
    console.log('Cancelled before paying - no charge');
  }
}
```

**Important:** The signal can cancel:
- Quote requests (before receiving price)
- The decision phase (after quote, before payment)

The signal **cannot** cancel:
- Operations after payment is signed (call/SMS will still execute)
- Server-side job execution

## Links

- [Documentation](https://docs.oneshotagent.com)
- [MCP Server](https://www.npmjs.com/package/@oneshot-agent/mcp-server) — Claude Desktop, Cursor, Claude Code
- [Python SDK (LangChain)](https://pypi.org/project/langchain-oneshot/) — 26 tools as LangChain BaseTool
- [Python SDK (Core)](https://pypi.org/project/oneshot-python/) — HTTP client with x402 payments
- [Pricing](https://docs.oneshotagent.com/pricing)
- [GitHub](https://github.com/oneshot-agent/sdk)

## License

MIT
