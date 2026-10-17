# Changelog

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
