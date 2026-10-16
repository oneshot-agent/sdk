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

### Paying with ETH

Set `currency: 'ETH'` and the SDK keeps the wallet funded in USDC for you:

- Before each payment it reads the wallet's USDC and subtracts payments it has
  signed in the last ~90s that may not have settled yet. If that covers the
  charge, no swap happens — the call costs one `eth_call`.
- Otherwise it swaps ETH→USDC on Uniswap V3 (Base mainnet) for
  `swapBufferMultiplier` × the charge (default 10, range 1–1000), so one swap
  covers many calls. If your provider exposes `getBalance` and the wallet's ETH
  cannot cover the buffer, it swaps just the shortfall (a send-only provider
  always gets the buffered amount). Set `swapBufferMultiplier: 1` for
  exact-shortfall swaps.
- Concurrent calls from one instance are serialized around the swap, so a burst
  never double-swaps or races the wallet nonce.

Run one process per wallet in ETH mode: each process keeps its own in-flight
ledger. ETH mode requires a wallet provider with `sendTransaction` and is Base
mainnet only.

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
| `personFind()` | Search people by criteria |
| `personProfile()` | Enrich from LinkedIn/email |
| `personEmail()` | Find email for a person |
| `personEmailStatus()` | Verify email deliverability |
| `companyFind()` | Search companies by name, domain, industry, location, size, funding |
| `companyProfile()` | Enrich a company from domain, name, LinkedIn URL, or ticker |
| `businessFind()` | Discover local businesses (restaurants, contractors, practices) by category × location |
| `businessResolve()` | Business name + address → website domain, phone, status, confidence |
| `recordSolicitationsFind()` | Federal Sources Sought / Presolicitation notices by NAICS with the contracting officer's contact |
| `personDossier()` | Person profile, known social accounts, articles, posts and written summary |
| `personSocialAccounts()` | Find all social accounts |
| `personArticles()` | Find articles about a person |
| `personPosts()` | Recent social posts with engagement |
| `personInterests()` | Analyze interests across categories |
| `personFollowers()` | Map followers, following, replies |
| **Web & Commerce** | |
| `webSearch()` | Search the web |
| `webRead()` | Read any URL as markdown + screenshot |
| `commerceBuy()` | Purchase products |
| `productFind()` | Search products |
| **Browser** | |
| `browser()` | Autonomous browser — navigate, click, extract |
| `createBrowserProfile()` | Create a persistent browser profile |
| `startBrowserProfileSetup(id, loginUrl)` | Start interactive account login / 2FA; returns the single-use `setup_url` |
| `createBrowserProfileSetupLink(id, startUrl?)` | Mint a fresh single-use `setup_url` for an open setup |
| `getBrowserProfileSetup(id)` | Get setup status; `completed_at` once the person pressed Done |
| `finishBrowserProfileSetup(id)` | Save profile and inspect stored cookie metadata |
| `listBrowserProfiles()` | List saved browser profiles |
| `deleteBrowserProfile()` | Delete a browser profile |
| **Build** | |
| `build()` | Build and deploy production websites |
| `updateBuild()` | Update an existing website |
| **Compute (Agentic Goals)** | |
| `compute()` | Launch autonomous multi-step goal |
| `getComputeGoal()` | Get goal status and progress |
| `getComputeTasks()` | List tasks for a goal |
| `getComputeOutputs()` / `getComputeOutput()` | List what a goal's tasks produced, and read one output by key |
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
| **Any route** | |
| `route(method, path, { params, query, body, paid })` | Call a declared route by method and path, with `{name}` path parameters, a query and a JSON body (an object field is sent as it is). A free route is signed like the other free calls (read proof for `GET`, write proof otherwise; the bearer token in an access-token session). `paid: true` (POST) goes through the quote-to-pay flow of `tool()`. The generated MCP route tools use it |

## Configuration

```typescript
interface OneShotConfig {
  privateKey?: string;   // Option A: raw key
  cdp?: boolean;         // Option B: Coinbase CDP server wallet
  walletProvider?: WalletProvider; // Option C: bring your own signer
  accessToken?: string;  // Option D: credits-only session, no key (see Access tokens)
  address?: string;      // With accessToken in the sync constructor; create() resolves it
  defaultHeaders?: Record<string, string>; // Sent on every request
  baseUrl?: string;      // Override API URL
  rpcUrl?: string;       // Override RPC URL
  debug?: boolean;       // Enable logging
  logger?: (msg: string) => void;
  budgets?: {            // Spend budget (see below)
    daily?: number;
    perTransaction?: number;
    alertAt?: number;
    pauseAt?: number;
  };
  alerts?: { email?: string };
}
```

## Spend Budgets

Cap what the agent can spend, so a runaway loop can't drain the wallet overnight.

```typescript
const agent = await OneShot.create({
  cdp: true,
  budgets: {
    daily: 50,           // max USDC per UTC day
    perTransaction: 5,   // max USDC for any single call
    alertAt: 0.8,        // warn at 80% of daily
    pauseAt: 1.0,        // stop paying at 100%
  },
  alerts: { email: 'you@example.com' },
});
```

Unlike `maxCost` (a per-call client-side check), budgets are **enforced server-side**
against your receipt ledger. The config is synced once before your first paid call,
so the daily figure is a true per-agent total — shared across every process, restart,
and serverless invocation using the same wallet, not a per-instance counter.

At `alertAt` you get a notification (in-app via `agent.notifications()`, plus email
if you set one). At `pauseAt` paid calls are rejected with a `BudgetExceededError`
until the window resets at the next UTC midnight:

```typescript
try {
  await agent.research({ topic: '...' });
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.log(`${err.reason} budget hit — $${err.spent} spent, resumes ${err.resetsAt}`);
  }
}
```

Check utilization any time:

```typescript
const b = await agent.budgets();
// { daily_usdc: 50, spent_today_usdc: '41.20', pct_used: 0.824, resets_at: '...' }
```

Omit `budgets` entirely to leave whatever is stored server-side untouched — agents
without a budget are unlimited, which is the default.

The sync **fails closed**: if the budget can't be confirmed with the server (network
error, 5xx, rate limit, rejected config) the paid call throws `BudgetSyncError` and is
not made — proceeding would silently drop the guardrail you asked for. It retries on
the next paid call. An invalid config (`daily: -1`, `alertAt: 2`) throws `ValidationError`
at construction.

## Authentication

Every request identifies you by your wallet address (`X-Agent-ID`). Paid tools additionally settle a signed [x402](https://x402.org) USDC payment.

**Read endpoints** — `inboxList` / `inboxGet`, `smsInboxList` / `smsInboxGet`, `notifications` / `markNotificationRead`, `getUnifiedBalance`, and `createBrowserProfile` / `listBrowserProfiles` / `deleteBrowserProfile` — return private, per-agent data. Since a wallet address is public, the SDK proves you actually control it: on each read it signs a short-lived **EIP-712 read proof** and sends it as the `x-agent-proof` header. The API verifies the signature locally and rejects any request whose proof doesn't match the `X-Agent-ID` wallet, so no one can read your inbox/balance by supplying your address.

This is fully automatic — you don't do anything beyond providing your `privateKey`. **Requires SDK ≥ 0.25.0.** Older SDKs (or raw HTTP callers) will keep working until the API enables enforcement, after which they must send a valid `x-agent-proof`; upgrade to stay ahead of it.

### Access tokens (credits-only sessions)

Some code can't hold your wallet key — a hosted MCP client such as Grok Bot, a cloud
runner, a third-party agent platform. For those, mint an **access token** from a wallet
session and hand it over instead:

```typescript
// From a wallet session (once):
const { token } = await agent.createAccessToken({ name: 'grok-bot' });

// In the hosted environment:
const hosted = await OneShot.create({ accessToken: token }); // resolves the wallet address
await hosted.webSearch({ query: '…' });                        // billed to the agent's credits
```

An access-token session identifies the agent with the token (no `x-agent-proof`), **pays
every call from the agent's prepaid credit balance**, and never signs x402. When credits
can't cover a call it throws `InsufficientCreditsError` (`required`, `balance`,
`shortfall`) — top up from the wallet session with `agent.topUpCredits(amount)` (pays
the same USDC via x402) and retry. Budgets set on the agent still apply, with credit-funded
spend counted; they are **read-only** from a token session (`agent.budgets()` works,
passing `budgets` to the constructor throws). A token cannot mint, list, or revoke
tokens; do that from the wallet session (`listAccessTokens()`, `revokeAccessToken(id)`).
`accessToken` is exclusive with `privateKey` / `cdp` / `walletProvider` and with
`currency: 'ETH'`. **Requires SDK ≥ 0.33.0.**

## Tool Options

All methods accept these common options:

```typescript
interface ToolOptions {
  maxCost?: number;      // Max USDC willing to pay (see supported tools below)
  timeout?: number;      // Client polling wait in seconds; never sent in the API body
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

## Verifying Receipts

Signed receipts use Ed25519 over the canonical public receipt fields, the `revision` counter and a SHA-256 digest of `metadata` — nothing private. The response also carries the `signature`, `digest`, `key_id` and `alg` needed to verify; those are not part of the signed bytes, and neither is the caller-supplied `value_tag`. Unsigned receipts return `malformed_receipt`. `verifyReceipt` works offline after fetching the public keys:

```typescript
import { verifyReceipt, receiptFromWire } from '@oneshot-agent/sdk/receipt';

// `wireReceipt` is whatever GET /v1/analytics/receipts (or the audit export)
// returned for one receipt — snake_case field names.
const receipt = receiptFromWire(wireReceipt);
const jwks = await fetch('https://win.oneshotagent.com/.well-known/oneshot-receipts.json').then(r => r.json());

const result = verifyReceipt(receipt, jwks);
if (result.valid) {
  console.log(`Verified against key ${result.keyId}`);
} else {
  // reason is one of: 'malformed_receipt' | 'key_not_found' | 'digest_mismatch' | 'signature_invalid'
  console.log(`Verification failed (${result.reason}): ${result.message}`);
}
```

`verifyReceipt` recomputes the canonical payload with the same `canonicalizeReceipt` function the API uses to sign — the two can never drift apart because they're literally the same function, imported on both sides. It matches the receipt's `key_id` against the JWKS's `kid`s, so a receipt signed with a rotated-out key still verifies as long as the JWKS retains it (which it does — see `RECEIPT_SIGNING_HISTORICAL_PUBLIC_KEYS`).

There is one canonical payload and no version field. `revision` starts at 1 and increments on every re-sign under the same row lock that protects the signature, so two signed copies of the same receipt order from the signed bytes alone. `metadata_digest` is a key-order-independent SHA-256 of the receipt's `metadata` (`memo`, `decisionContext`, …), stable for `metadata: null`; the metadata value itself is never placed in the signed bytes, so altering it after signing invalidates the signature without embedding unbounded agent-supplied data in the canonical payload. If the format ever changes, OneShot re-signs every stored receipt rather than versioning the payload — see `docs/architecture/receipt-signatures.md`.

### CLI

```bash
npx @oneshot-agent/sdk receipt.json
# or, after installing the package:
oneshot-verify-receipt receipt.json [jwksUrlOrPath]
```

`npx <package> <args...>` runs that package's single bin directly, passing the trailing args straight to it — so the package name itself is never one of `argv`. `receipt.json` is a receipt object as returned by the API. `jwksUrlOrPath` is an http(s) URL (fetched) or a local file path; it defaults to the production well-known path. Exit code `0` on a valid signature (with version and key printed), `1` on a verification failure (with the reason printed), `2` on a usage/IO or input-shape error. The audit export uses separate `receipt_signature*` fields; the adapter distinguishes those from its settlement-proof `signature`.

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
      case 'service_unavailable':
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
`rate_limited`, `service_unavailable`, `service_auth`, `enrichment_exhausted`,
`target_unreachable`, `source_unsupported`, `checkout_failed`,
`internal_error`. See the
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
  from_mailbox: 'jane',     // local-part, defaults to "agent"; requires from_domain
  from_domain: 'acme.com'   // must be a domain you own
});
```

`from_domain` must be a domain you've provisioned through OneShot. Pinning
`from_mailbox` without `from_domain` throws a client-side `ValidationError` —
there is no default domain to fall back to; omit both to rotate instead.

**Dedicated mailboxes:** pass `mailbox_mode: 'mailbox'` when **first provisioning
a new `from_domain`** to give each address a real dedicated mailbox (better
deliverability + per-address warmup) instead of the default `relay` (header-only)
send; it adds a one-time `mailbox_provisioning_fee` to the quote. It only applies
at first setup — an already-provisioned domain keeps the mode it was created with,
and requesting `mailbox` on an existing relay domain returns
`400 mailbox_mode_conflict`.

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
- **Pin:** set the required `from_domain` and optionally `from_mailbox` to select a sender. `from_mailbox` cannot be used alone.
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
const results = await agent.personFind({
  job_titles: ['CEO', 'CTO'],
  companies: ['Stripe'],
  limit: 10
});

const profile = await agent.personProfile({
  linkedin_url: results.results[0].linkedin_url
});
```

**Filters:** `seniority` takes any of `owner`, `founder`, `c_suite`, `partner`, `vp`, `head`, `director`, `manager`, `senior`, `entry`, `intern`.
Common variants (`'Vice President'`, `'C-Level'`, `'executive'`) are accepted;
a value that matches no level fails the search with `invalid_input`. `industry`
is free text (`['fintech', 'software']`).

**Empty vs. failed:** an empty `results` array means the search ran and nobody
matched. If the search could not be run, the call throws a `JobError` with a
retryable upstream code (`service_unavailable`, `service_auth`,
`rate_limited`) instead of returning an empty result.

**Pagination:** `limit` (default 100, max 500) and `offset` (default 0,
0-indexed) page through the result set — `{ limit: 100, offset: 100 }` gets
the second page of 100. Large requests are paginated server-side, so one
response can hold up to `limit` rows. The search runs under a time limit: if it
is reached, you get the rows found so far (possibly fewer than `limit`) and can
continue with `offset`. Rows whose phone lookup did not finish in time are
returned with `_phone_enriched: false` and
`_phone_enrich_reason: 'time_budget_exhausted'` rather than dropped.

```typescript
const page2 = await agent.personFind({
  job_titles: ['CEO'],
  limit: 100,
  offset: 100
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

### Physical mail

`agent.physicalMail` exposes `uploadArtwork`, `validateAddress`, `preview`, `getQuote`, `approve`, `send`, `getOrder`, `recover`, and `cancel` for U.S. letters and 4×6 postcards. Inspect the proof and price before explicitly approving each quote. Persist `idempotencyKey` before `send`; use `recover(key)` after uncertain responses. Approval is never inferred by automatic payment retries. Payment receipts and postal events are separate; delivery does not prove readership. See `docs/physical-mail.md` in the OneShot repository for configuration and examples.

### Account login and 2FA (SDK 0.34.0+; `createBrowserProfileSetupLink` from 0.54.0)

Create a browser profile, then:

1. Start: `startBrowserProfileSetup(profile.id, loginUrl)`.
2. Give the returned `setup_url` to the person whose account it is. It opens once and expires after 10 minutes; `createBrowserProfileSetupLink(profile.id)` mints a fresh one, and with a `startUrl` it also starts a setup when none is open.
3. The person signs in on the page, completes the site's verification, and presses **Done**. **Cancel** ends the setup without marking it complete, so `completed_at` stays `null`.
4. Poll `getBrowserProfileSetup(profile.id)` until `completed_at` is set, or until `status` is `expired`, `no_setup` or `stopped` (the setup ended after Cancel or the 15-minute expiry; `completed_at` stays `null`, so stop polling and start setup again). Once `completed_at` is set, store the profile ID for later `browser({ profile_id, task })` calls.

Done (or `finishBrowserProfileSetup(profile.id)`, when your application saves on the person's behalf) stops the session and inspects cookies in a fresh browser before website navigation. It returns cookie names/domains/paths, never values; a subsequent task must check whether the site accepts the login. Setup expires after 15 minutes and abandoned sessions are closed by the lifecycle sweep. Profiles are retained. Start setup again to reconnect an expired site login.

Treat `setup_url` as a secret: give it only to that person, never open it yourself, and keep it, passwords and codes out of logs and agent prompts. The page is not cached and sends no referrer. `live_url` is deprecated and is removed in the next release.

Browser tasks reject the legacy `secrets` field and `max_steps` below 25 before payment. Use interactive setup or `createBrowserProfile(name, { cookies })` / `{ storage_state }` for authentication. `cost` is the provider cost; `billed_cost` is the final customer charge after reconciliation (null while pending). Failed `JobError`s expose `partialResult` for diagnostics.


### LinkedIn invitations and withdrawal

Available in `@oneshot-agent/sdk` 0.38.0 and later. Both operations require a connected account with the `invite` grant.

```typescript
const invitation = await agent.linkedinInvite({
  accountId,
  profile: 'https://www.linkedin.com/in/jane-doe/',
  note: 'Enjoyed your presentation.',
  idempotencyKey: 'event-jane-invite',
});

// To withdraw that pending invitation later:
await agent.linkedinWithdrawInvitation({
  accountId,
  invitationId: invitation.invitation_id,
  idempotencyKey: 'event-jane-withdraw',
});
```

Use the OneShot `invitation_id`, not the provider invitation ID. Withdrawal can also cancel a queued invitation; it never disconnects an established connection. Invitations default to 25 per account per UTC day, and withdrawing a sent invitation does not restore that day's capacity. Reuse the same idempotency key when retrying an operation.

### Recovering a missing LinkedIn connection

Use `reconnectLinkedInAccount(id)` for an existing upstream connection whose session needs renewal. A deleted upstream account needs a new `linkedinConnect()` intent and fresh human authorization.

Account reads refresh disconnected accounts against the provider. Once an upstream account-read confirms `404`, the old connection is marked `connection_deleted`, its grant is ended, and `reconnect_required` is false. It is omitted from the default active account list; use `includeRevoked: true` or fetch it by ID to inspect its terminal status. Authentication failures, timeouts, and provider outages do not trigger this transition.

```ts
import { LinkedInConnectRequiredError } from '@oneshot-agent/sdk';

try {
  const intent = await agent.reconnectLinkedInAccount(account.id);
  // Show intent.url to the human.
} catch (error) {
  if (error instanceof LinkedInConnectRequiredError) {
    // Show “Connect LinkedIn” and ask the human to choose grants again.
    // On confirmation, call agent.linkedinConnect({ requestedActions: ['read'] }).
  } else {
    throw error;
  }
}
```

The HTTP equivalent is `409` with `error: "connect_required"` and `details.next_action: "connect"`. Existing SDK versions can inspect `ToolError.responseBody` for this contract.
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
- [MCP Server](https://www.npmjs.com/package/@oneshot-agent/mcp-server) — Claude Desktop, Cursor, Claude Code (local), or the hosted endpoint at `https://win.oneshotagent.com/mcp` with an access token
- [Python SDK (LangChain)](https://pypi.org/project/langchain-oneshot/) — 48 tools plus the lookup tools as LangChain BaseTool
- [Python SDK (Core)](https://pypi.org/project/oneshot-python/) — HTTP client with x402 payments
- [Pricing](https://docs.oneshotagent.com/pricing)
- [GitHub](https://github.com/oneshot-agent/sdk)

## License

MIT

## Optional phone lookup

Phone lookup is off by default. Source-returned numbers and published business or record numbers still appear. `includePhone: true` adds the per-person add-on listed on the pricing page × the requested search limit (default 100) for a search, or once for profile/dossier, for up to that many people with no guaranteed hit. Fallbacks and callbacks cost nothing extra. A completed lookup with no phone match is charged; a failed job is refunded.

`maxCost` and per-transaction budgets apply to the full quote before authorization, even when credits cover it. The SDK obtains the quote without execution, retries with its quote ID and payment or credit session, and returns the result and receipt.

```typescript
const people = await agent.personFind({ job_titles: ['CTO'], limit: 3, includePhone: true, maxCost: 1, waitForPhones: true });
const profile = await agent.personProfile({ email: 'jane@example.com', includePhone: true, maxCost: 1, waitForPhones: true });
const dossier = await agent.personDossier({ email: 'jane@example.com', includePhone: true, maxCost: 1, waitForPhones: true, timeout: 600 });
```

`waitForPhones` waits for pending callbacks; it does not purchase phones by itself. On timeout the latest result can still have `phones_pending: true`.
