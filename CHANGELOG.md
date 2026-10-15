# Changelog

## 0.53.0 — breaking release (#1336)

- Renamed `commerceSearch()` → `productFind()`; `CommerceSearchOptions`, `CommerceSearchProduct`, `CommerceSearchResult` → `ProductFindOptions`, `ProductFindProduct`, `ProductFindResult`, without aliases.
- Product discovery now calls `POST /v1/tools/find/product` (price key `find/product`), replacing `POST /v1/tools/commerce/search` (`commerce/search`). Input, results and Purchase compatibility are unchanged.
- Release together with the person/company and other tool renames in #1334 and #1382; publish only with the coordinated server release.
