# Changelog

## Unreleased

- `compute()` sends `budget_usdc: 0` instead of dropping it, so the API refuses it and the call throws `ValidationError` before any payment. It used to be left out, and the goal was quoted and paid at OneShot's estimate. A positive budget is sent as before, and an omitted one is still estimated (#4121).
- `subscribeToTask` recovers from clock skew like other reads do: a clock-window proof refusal before the stream opens (A2A returns it inside the JSON-RPC error's `data`) corrects the signing clock from `server_time` and opens once more with a fresh nonce, inside the same deadline and abort signal. Token sessions, other refusals and errors after the stream starts are thrown as before (#4118).
- `createTaskPushNotificationConfig`, `getTaskPushNotificationConfig`, `listTaskPushNotificationConfigs` and `deleteTaskPushNotificationConfig` manage the callback URLs on a compute goal you own; its terminal status is POSTed to each. Create and delete send a write proof, get and list a read proof, and an access token works for all four. `TaskPushNotificationConfig`, `PushNotificationAuthentication`, `CreateTaskPushNotificationConfigOptions`, `ListTaskPushNotificationConfigsOptions` and `TaskPushNotificationConfigList` are exported (#4082).

## 0.65.0

- `personFind` sends `limit: 25` when none is given, not 100. The server prices a search per person in its limit, so older releases pay for 100 people on a call with no limit.

## 0.64.0

- `compute()` takes `purchase_limit_usdc`, the most per purchase, all in. The quote funds it and `price.purchases` shows what it adds; a live total above it waits for your approval. Without it, purchases are not funded and the goal pauses at one it can't afford. `ComputeGoalScope` accepts the same field, and warnings gain `purchase_limit_over_budget`.
- `quoteDomain(name, { mailbox_mode, addresses })` picks the domain's mode (`relay` by default, or `mailbox`) and its addresses (1 to 10, default `['agent']`). Quoting a domain you already have with new addresses prices adding them (`setup: 'domain_addresses'`); `buyDomain` buys either quote. `email()` drops `mailbox_mode`: a send never sets up a domain or an address. When the email quote answers `no_sending_domain` or `address_not_set_up`, `email()` returns the setup quote as `confirmation_required`, or `setup_required` / `setup_pending` with `requirements`, and sends nothing. `from_domain` alone sends from the domain's main address. `DomainWarmupState` gains `not_warmed` (relay domains and addresses, which are never warmed) (#3604).
- #3482: `ComputeEndReason` gains `runner_retired`: a goal left on the retired planner runner was ended with its unused budget credited, and can be started again as a new goal.
- #3174: Goal status includes `tool_requests` with each request's need, status and optional live tool name.
- A paid call answered `500 settlement_ambiguous` throws `SettlementAmbiguousError` with `settlementId` instead of a generic `ToolError(500)`. The payment may have gone through: don't pay again for the call; if it landed and the call did not run, it is credited to your account. It is not a `ToolError`, so a retry-on-5xx wrapper no longer signs a second payment, and an ETH-mode balance reservation is kept for it (#3489).

## 0.63.0

- Add `quoteDomain` and `buyDomain` for separate account setup. New-domain email confirmation buys the exact setup quote without sending; send separately after verification. Setup responses expose price and billing terms (#3387).

## 0.62.0

- Add `continueComputeGoalWithoutTool(goalId, { message })` to release a goal held in `awaiting_tool` without the tool it requested; the goal resumes with the message. `GoalStatus` gains `awaiting_tool` and `ComputeEndReason` gains `tool_timeout` (#3173).

## 0.61.0

- Add `disputeComputeGoal(goalId, { reason })` to dispute a goal that ended `impossible_unverified`; the dispute is recorded on the goal and its receipt and refunds nothing. `ComputeEndReason` gains `impossible` and `impossible_unverified` (#2705).
- Every person, company and business method takes `fresh: true` to bypass OneShot's shared store of earlier lookups and refresh it; their results carry `cached` and `fetched_at` (#2593).

## 0.60.0

- Deliver each signed proof once. Every send that carries `x-agent-proof` now asks for a connection of its own (`Connection: close`, `keepalive: false`), so in Bun the fetch has no pooled socket to re-send it on. A browser's fetch drops `Connection` as a forbidden request header and reads `keepalive` differently, so in a browser the HTTP stack's own pooling and retry rules still apply and the replayed-read recovery below is the SDK's only defence. Bun 1.3.13's fetch re-sent a request byte for byte on a fresh connection when the pooled socket it chose closed after the server had read it; the API spent the nonce on the first copy and rejected the second as a replay. With this change that socket death surfaces as a network error to the caller instead. The signed-send paths of 0.53.1 and 0.58.0 each sign their own proof per send; the duplicate came from below the SDK, and SDKs before this change keep producing it (#2517).
- Recover a read that still reached the API twice (a retrying proxy, a wrapper re-sending a captured header): when the API refuses a read's proof as already used (`proof_required`, nonce replay), sign a fresh proof and read once more. Writes are never repeated (#2517).

## 0.59.0

- Support access-token expiry and approval context for Identity Verification.
- Sign Identity Verification payment requests so retries retain the caller identity.

## 0.58.0

- Add public tool discovery and connected-system reads across SDK and framework adapters.
- Add connections listing, vehicle fuel economy and compound hazard lookup tools.
- Allow email replies to reference an agent-owned sent email.

## 0.57.0

- Add caller identity and shared voice-stack options to voice calls.
- Return call outcomes, recordings, and transcripts in voice results.
- Wait for calls to finish by default, with duration-aware polling timeouts.

## 0.56.0

- Add Predict simulation and forecast models across the SDK and adapters.
- Add compute polling cancellation, status callbacks, and retry timing; refresh expired agent proofs.
- Support unified person identity inputs and new protein lookup tools.

## 0.55.0

- Add typed Solve requests and results for routing, allocation, packing, and scheduling.
- Update lookup surfaces and person-profile inputs.

## 0.54.0

- Add single-use browser profile setup links and completion status for account sign-in.
- Clarify pending phone lookups when a reveal has no definite response yet.

## 0.53.1

- Allow five minutes for person dossier polling by default, while preserving caller timeouts.
- Describe phone lookup outcomes and the current per-person pricing contract.

## 0.53.0 — breaking release (#1336)

- Renamed `commerceSearch()` → `productFind()`; `CommerceSearchOptions`, `CommerceSearchProduct`, `CommerceSearchResult` → `ProductFindOptions`, `ProductFindProduct`, `ProductFindResult`, without aliases.
- Product discovery now calls `POST /v1/tools/find/product` (price key `find/product`), replacing `POST /v1/tools/commerce/search` (`commerce/search`). Input, results and Purchase compatibility are unchanged.
- Release together with the person/company and other tool renames in #1334 and #1382; publish only with the coordinated server release.
