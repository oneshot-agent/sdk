# Changelog

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
