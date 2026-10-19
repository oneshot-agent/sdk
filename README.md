# @oneshot-agent/sdk

Your agent can think. This lets it act: send email, make calls, research,
buy, build sites. It pays per action, gets a signed receipt, and spends
nothing you did not allow.

## Install

```bash
npm install @oneshot-agent/sdk
```

No code? Use the MCP server in Claude, Cursor or Claude Code:
`npx -y @oneshot-agent/mcp-server` ([setup](https://docs.oneshotagent.com/sdk/mcp)).
Teach your coding agent the tools: `npx skills add oneshot-agent/agent-skills`
([skills](https://github.com/oneshot-agent/agent-skills)).

## Start

```typescript
import { OneShot } from '@oneshot-agent/sdk';

const agent = new OneShot({ privateKey: process.env.AGENT_PRIVATE_KEY! });

await agent.email({ to: 'user@example.com', subject: 'Hello', body: 'Hello world.' });
const report = await agent.research({ topic: 'AI agents', depth: 'deep' });
const usdc = await agent.getBalance(agent.usdcAddress);
```

Paid calls quote, pay and wait for the result. You write one line.

## What it does

| Area | Methods |
|------|---------|
| [Talk](https://docs.oneshotagent.com/api-reference/email/send) | `email` `voice` `sms` `inboxList` `inboxGet` `smsInboxList` `smsInboxGet` `notifications` `markNotificationRead` |
| [Send from your domains](https://docs.oneshotagent.com/api-reference/email/domains) | `listDomains` `pauseDomain` `resumeDomain` |
| [Find people and companies](https://docs.oneshotagent.com/api-reference/research/person-find) | `personFind` `personProfile` `personEmail` `personEmailStatus` `personDossier` `personSocialAccounts` `personArticles` `personPosts` `personInterests` `personFollowers` `companyFind` `companyProfile` `businessFind` `businessResolve` `recordSolicitationsFind` |
| [Think](https://docs.oneshotagent.com/api-reference/research) | `research` `predict` `solve` |
| [Web and buying](https://docs.oneshotagent.com/api-reference/web-search) | `webSearch` `webRead` `productFind` `commerceBuy` `physicalMail` |
| [Browser](https://docs.oneshotagent.com/api-reference/browser/create) | `browser` `createBrowserProfile` `startBrowserProfileSetup` `createBrowserProfileSetupLink` `getBrowserProfileSetup` `finishBrowserProfileSetup` `listBrowserProfiles` `deleteBrowserProfile` |
| [Connected systems](https://docs.oneshotagent.com/api-reference/connections/overview) | `listConnections`, then `route('POST', '/v1/tools/ledger/invoices', { paid: true, body: { connection_id } })` for each read |
| [LinkedIn](https://docs.oneshotagent.com/api-reference/linkedin/overview) | `linkedinConnect` `linkedinInvite` `linkedinWithdrawInvitation` `linkedinMessage` `linkedinReply` `reconnectLinkedInAccount` and more |
| [Build](https://docs.oneshotagent.com/api-reference/build/create) | `build` `updateBuild` |
| [Goals](https://docs.oneshotagent.com/api-reference/compute/create) | `compute` `waitForComputeGoal` `getComputeGoal` `getComputeTasks` `getComputeOutputs` `respondToComputeTask` `pauseComputeGoal` `resumeComputeGoal` `cancelComputeGoal` `fundComputeGoal` |
| [Money and receipts](https://docs.oneshotagent.com/api-reference/analytics/overview) | `getBalance` `getUnifiedBalance` `budgets` `topUpCredits` `spendBreakdown` `rocs` `receiptsList` `tagReceiptValue` |
| Anything else | `tool(name, input)` for any tool, `route(method, path, { params, query, body, paid })` for any declared route |

## Money

- It pays in USDC on Base mainnet (`agent.chainId` is `8453`). Fund the wallet first.
- A call costs what the quote says, or it does not run.
- `maxCost` sets your ceiling. Above it, the SDK refuses to sign.
- `currency: 'ETH'` pays from ETH. The SDK swaps into USDC only when the wallet
  is short, buys `swapBufferMultiplier` × the charge (default 10) so one swap
  covers many calls. Calls in one process never double-swap. Run one process
  per wallet. Not with `cdp`.

**Budgets** cap what a runaway loop can spend.

```typescript
const agent = await OneShot.create({
  cdp: true,
  budgets: { daily: 50, perTransaction: 5, alertAt: 0.8, pauseAt: 1.0 },
  alerts: { email: 'you@example.com' },
});
```

- Budgets live on the server. Every process using the wallet shares them.
- If the server cannot confirm them, nothing is paid: `BudgetSyncError`.
- At `pauseAt`, paid calls throw `BudgetExceededError` until UTC midnight.
- Omit `budgets` and the stored ones stay as they are. No budget means no limit.

**Access tokens** are for code that must not hold the key: a hosted MCP client,
a cloud runner, someone else's platform.

```typescript
const { token } = await agent.createAccessToken({ name: 'grok-bot' }); // from the wallet session
const hosted = await OneShot.create({ accessToken: token });
await hosted.webSearch({ query: '…' }); // paid from credits
```

- A token spends prepaid credits only. It never signs a payment.
- Short of credits, it throws `InsufficientCreditsError` (`required`, `balance`,
  `shortfall`). Top up from the wallet session with `topUpCredits(amount)`.
- A token reads budgets but cannot change them, and cannot mint or revoke tokens.

## Trust

Every paid call returns a receipt, signed with Ed25519. Check it offline:

```typescript
import { verifyReceipt, receiptFromWire } from '@oneshot-agent/sdk/receipt';

const jwks = await fetch('https://win.oneshotagent.com/.well-known/oneshot-receipts.json').then(r => r.json());
const result = verifyReceipt(receiptFromWire(wireReceipt), jwks);
// result.valid, or result.reason: 'malformed_receipt' | 'key_not_found' | 'digest_mismatch' | 'signature_invalid'
```

Or from a shell: `npx @oneshot-agent/sdk receipt.json` (exit `0` valid, `1` invalid, `2` bad input).
Old keys stay in the key set, so old receipts keep verifying.

Reads of private data (inbox, notifications, balances, browser profiles) carry a
signed proof that you hold the wallet. A wallet address is public; your inbox is not.
The SDK signs it for you. If the server says your clock is off, it corrects once and retries.

## Failure

```typescript
import { JobError, JobTimeoutError, ToolError, ValidationError, ContentBlockedError } from '@oneshot-agent/sdk';

try {
  await agent.voice({ objective: 'Book a table for 2 at 7pm', target_number: '+14155551234' });
} catch (error) {
  if (error instanceof JobError) {
    // Branch on error.code, never on the message.
    if (['rate_limited', 'service_unavailable', 'internal_error'].includes(error.code)) { /* retry */ }
    else { /* fix the input or the funding; retrying as is will not help */ }
  } else if (error instanceof ToolError && error.statusCode === 429) {
    // error.retryAfterMs is the server's hint. The SDK never retries for you.
  }
  throw error;
}
```

- `JobError.code` is one of `insufficient_funds` `payment_failed` `invalid_input`
  `content_blocked` `rate_limited` `service_unavailable` `service_auth`
  `enrichment_exhausted` `target_unreachable` `source_unsupported`
  `checkout_failed` `internal_error`. [What each means](https://docs.oneshotagent.com/api-reference/status#error-codes).
- Input the SDK can check throws `ValidationError` before anything is paid.
- Emergency numbers are refused: `EmergencyNumberError`.

## Waiting and stopping

- Paid calls wait by default. `wait: false` returns the `request_id`;
  `waitForResult(requestId)` picks the result up later.
- An `AbortSignal` stops the call **before payment** and nothing is charged.
  After payment, the work happens and is billed. Aborting only stops your wait.
- An abort rejects with `OneShotError('Operation cancelled')` for `commerceBuy`,
  `voice`, `sms`, `build`, `refineBuild`, `updateBuild` and `browser`; the other
  calls reject with the signal's `reason`. Handle both.
- `timeout` is how long you wait, in seconds. It never limits the job.
- Goals run longer than calls. Watch one with `waitForComputeGoal`:

```typescript
const goal = await agent.compute({ objective: 'Research battery recycling', budget_usdc: 5 });
const done = await agent.waitForComputeGoal(goal.goal_id, {
  timeout: 300,
  onStatusUpdate: (status) => console.log(status),
});
```

- It resolves on `completed` and throws `JobError` on `failed` or `cancelled`
  (`code` is the `end_reason`). `awaiting_confirmation` and `paused` wait for you;
  they do not end the wait.
- A goal that failed with `budget_exhausted` comes back after `fundComputeGoal`.
  Call `waitForComputeGoal` again; the old wait does not resume.
- Timeout defaults to 120 seconds and throws `JobTimeoutError`. It stops your
  polling, not the goal. Stop the goal with `cancelComputeGoal`.

## Tool notes

- **Email.** Omit `from_domain` and the server rotates across your warmed
  domains. Pin one and you skip the warmup gates; the send goes out with a
  `warning`. Own no eligible domain and the quote fails with `no_sending_domain`.
  There is no shared sender. `mailbox_mode: 'mailbox'` applies only when a domain
  is first set up. [Details](https://docs.oneshotagent.com/api-reference/email/send).
- **People search.** An empty result means nobody matched. A failed search
  throws; it never pretends to be empty. Page with `limit` (default 100, max 500)
  and `offset`. A search that hits its time limit returns what it found; rows
  whose phone lookup ran out of time say `_phone_enrich_reason: 'time_budget_exhausted'`.
  [Details](https://docs.oneshotagent.com/api-reference/research/person-find).
- **Phone lookup** is off by default. `includePhone: true` is charged for each person
  you ask for (the search `limit`), found or not; a failed job is refunded. `waitForPhones: true` waits
  for numbers still arriving. It never buys any. Check `phones_pending`.
  [Price](https://docs.oneshotagent.com/pricing).
- **Account login.** `startBrowserProfileSetup` returns a `setup_url`. It opens
  once and expires in 10 minutes. Give it only to the account's owner, never open
  it yourself, keep it out of logs and prompts. Poll `getBrowserProfileSetup`
  until `completed_at` is set. You get cookie names back, never values.
  [Details](https://docs.oneshotagent.com/api-reference/browser/profiles).
- **LinkedIn.** Invitations are capped at 25 per account per UTC day;
  withdrawing one does not give the slot back. Use OneShot's `invitation_id`.
  A session that expired comes back with `reconnectLinkedInAccount`; a deleted
  account throws `LinkedInConnectRequiredError` and needs `linkedinConnect` again.
  Reuse your idempotency key on retries. [Details](https://docs.oneshotagent.com/api-reference/linkedin/overview).
- **Connected systems.** The reads of your accounting, CRM, tax, shipping and spend
  systems have no typed method: call them with `route('POST', <path>, { paid: true, body })`.
  Each takes `connection_id`; `listConnections()` lists the agent's connections, pick one by
  `system` and `account_label`. Another agent's connection is refused before payment.
  [Details](https://docs.oneshotagent.com/api-reference/connections/overview).
- **Physical mail.** U.S. letters and postcards. Look at the proof and the price,
  then approve each quote yourself. Nothing approves it for you. Persist the
  `idempotencyKey` before `send`. [Details](https://docs.oneshotagent.com/api-reference/physical-mail/overview).

## Links

- [Documentation](https://docs.oneshotagent.com)
- [MCP Server](https://www.npmjs.com/package/@oneshot-agent/mcp-server): local, or hosted at `https://win.oneshotagent.com/mcp` with an access token
- [Python SDK (LangChain)](https://pypi.org/project/langchain-oneshot/): 54 tools plus the lookup tools as LangChain BaseTool
- [Python SDK (Core)](https://pypi.org/project/oneshot-python/)
- [Pricing](https://docs.oneshotagent.com/pricing)
- [GitHub](https://github.com/oneshot-agent/sdk)

## Discover tools

`await agent.discoverTools({ query: "send a printed letter" })` searches the public
catalog for free. Omit options for category counts, or pass `{ category: "email" }`
to browse five tools at a time. Pass `nextCursor` as `cursor` with the same query
and category. Results use MCP names and include purposes and required inputs;
your token grants filter the catalog before search.

## License

MIT
