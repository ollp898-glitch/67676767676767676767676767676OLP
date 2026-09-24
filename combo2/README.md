# Combo Layer 2.0 Beta

Additive output from **only `combo-markets.jsonl`**. No scanner imports or Polymarket requests. Each source row is preserved exactly under `outcomes[].polymarket`; no sibling outcomes or new eligibility rules are added.

## Commands

```sh
node combo2/build.js out
node combo2/validate.js out
node combo2/link-reader.js out
node combo2/combo2.test.js
# Run on a persistent host, separately from GitHub Actions:
FLASHSCORE_ODDS_POLL_INTERVAL_MS=2000 FLASHSCORE_ODDS_CONCURRENCY=2 node combo2/collector.js out/combo-2
# Read current comparisons, without network calls:
node combo2/view-event.js out/combo-2 MATCH_ID
```

`build.js SOURCE_DIR [OUTPUT_DIR] --offline` creates the same complete source structure with unavailable external values. `BETX_ANALYTICS_CATALOG=/path/catalog.json` optionally supplies independently verified event records using the adapter record schema. It is trusted local configuration, not a fuzzy search result; include source URL, observed time, participants, competition, UTC time, discipline, scope and BO evidence. Matching still validates all these event attributes. The normal build attempts provider discovery once.

## Files

```text
combo-2/index.json                        counts, source hash, coverage, snapshot ID
  sports/SPORT/index.json                 small event lists
  sports/esports/index.json               discipline indexes
  sports/esports/DISCIPLINE/index.json
  events/HASH/index.json                  event analytics once + parent markets
  events/HASH/markets/PARENT-PART.json     complete original outcomes + comparisons
  registry/index.json                     confirmed Flashscore event registry
  diagnostics/index.json                 real discovery/odds failures
  runtime/health.json                     standalone collector health (when running)
  runtime/current/EVENT/index.json        current or stale odds, timestamp, small parts
  runtime/history/EVENT.jsonl             changes only, bounded rolling history
```

JSON documents are capped at 60,000 bytes. Outcome parts contain at most eight outcomes and split earlier by size. Source hash identifies every file's immutable Polymarket snapshot. External receipt times are separate. The reader link helper changes navigation and its manifest checksums only; it does not rebuild reader outcomes.

## Exact matching and honest coverage

Analytics: normal sports → Flashscore. Esports → HLTV (CS2), VLR (Valorant), GOL (LoL), Dotabuff/OpenDota (Dota2), SiegeGG (Rainbow Six), Liquipedia (other supported disciplines and fallbacks). Unknown discipline has no fabricated URL. Competition, UTC time within five minutes, discipline, series/game scope and BO must agree. Participant order is explicit: US sports and tennis can have reversed source ordering, and quotes resolve by participant identity. Multiple candidates remain ambiguous.

### Flashscore event discovery

`flashscore-events.js` reads the site's public configuration asset, then requests real sport/day feeds: `/PROJECT/x/feed/f_SPORT_DAY_0_LANG_TYPE`, with the public `x-fsign` configuration value. This follows Flashscore's `Feed_Request` and `FeedFetcher` contract, observed in `core-js.32de2a3.js` on 2026-09-23. There is no homepage match-link scraping or hardcoded match seed. Configuration is bootstrapped from the observed versioned asset `core_2_2315000000.js`; an incompatible/removed asset is reported explicitly and may require a bootstrap-version update.

Each distinct sport/day is requested once (three concurrent requests maximum), including adjacent calendar days for timezone boundaries. All source events are attempted, within the site's seven-day feed range. Feed failures and rate limits are recorded; 429 stops scheduling more feed requests. `AA` supplies event ID, `AD` UTC start, `AE/AF` participants, `JA/JB` event-participant IDs, and the league header supplies competition. URLs use the site's indexed-detail format and feed slugs/hashes. Overlapping feeds are deduplicated; conflicting identity records cannot become confirmed matches.

Competition-scoped aliases handle observed football naming differences without globally removing gender/age qualifiers. Tennis singles require full-name tokens from participant slugs plus the tournament and time; surname/initial matching alone is insufficient. Tennis doubles and esports without proven BO/competition remain unmatched. `coverage.flashscore_events` reports total/matched/unmatched/ambiguous counts for each sport; every event includes its own evidence or failure reason. Obtaining a match ID does not imply that its market type or a Betfair quote is available.

Real verification on the 2026-09-23 09:26 UTC Combo snapshot: 73 of 211 event records matched (72 unique Flashscore IDs); 72 odds requests succeeded, 52 returned active Betfair quotes. Exact supported outcome comparisons: 149 Betfair and 189 any-bookmaker, preserving all 1,428 Polymarket rows. These are historical verification counts, not guaranteed live coverage. Example confirmed IDs: Aruba–Antigua and Barbuda `YuxOfKT0`, Andorra–Malta `hAfMDh4C`, Seattle Sounders–Real Salt Lake `8pS1ig5t`. Fixtures contain factual subsets of the responses and are never used as live fallbacks.

**Beta limitation:** routing is implemented, but source-specific esports HTML parsers are not yet complete. The generic structured-event parser deliberately leaves discipline/scope unconfirmed and therefore cannot mark those records matched. Direct discovery observed HTTP 403 from HLTV and Liquipedia. Verified local catalogs can provide complete records. Unsupported pages remain unmatched, with diagnostics. This is not broad production mapping coverage.

Flashscore's observed event-level odds contract is implemented from its own site code (`detail.a9e1f46.js`, observed 2026-09-22): `GET https://global.ds.lsapp.eu/odds/pq_graphql` with `_hash=oce`, `eventId`, `projectId`, `geoIpCode`, `geoIpSubdivisionCode`. The FSDS client uses no `x-fsign`; the separate legacy feed does. Empty geo values are the site's fallback. Schema/event identity changes fail closed. Fixture provenance records the actual event URL; fixture prices are for tests only and never substituted into live builds.

Supported quote semantics: soccer match/half winners and goals totals; soccer BTTS using the feed's explicit boolean; tennis match/set winners, game totals and set totals with explicit `GAMES`/`SETS` metrics; soccer goal handicaps and tennis set handicaps on half-unit lines only. The selected team's signed handicap is required (soccer `outcome_line`, tennis the two explicitly named signed lines in the question). Missing signs, whole/quarter handicaps, metric/period mismatches and contradictory labels fail closed. Tennis totals currently accept half-unit lines only to avoid unproven push rules. The observed football `OVER_UNDER`/`ASIAN_HANDICAP` tabs with handicap type `UNKNOWN` are interpreted as goals, based on the site's tab contract. Corners, player/team totals and unproven overtime/settlement scopes deliberately remain unmatched. A binary winner `No` is not replaced by invented double-chance odds; BTTS `No` is a directly supported selection. Betfair is identified by exact bookmaker name and never substituted by another bookmaker.

### Coverage expansion (2026-09-24)

Event matching now recognizes reviewed tournament names (`Chengdu Open`, `Hangzhou Open`, `Singapore Open`, `Korea Open`, `Genoa 2`), an omitted ITF edition when level/city agree, birth-year suffixes in full-name tennis slugs, scoped WNBA/NFL/NCAA and football team aliases, and the competition prefix in cricket titles. Explicit tournament editions, qualification stages, age/gender qualifiers, opponent identity and the five-minute time limit remain checked. Tennis doubles, missing esports BO, abbreviated identities without sufficient evidence, and changed opponents remain unconfirmed.

A controlled comparison used the same 1,525 saved Combo rows, identical event-feed responses, and identical fresh odds responses for both code versions: event records matched **59 → 104**; exact Betfair outcome comparisons **119 → 199**; any-bookmaker outcome comparisons **131 → 401**. All 103 unique confirmed event odds requests succeeded. These are captured verification results, not fixed future coverage. The earlier published 120 Betfair comparisons differ from the controlled baseline's 119 because prices/active selections changed between captures. The `coverage-expansion.json` fixture preserves factual samples of new identities and market types; no fixture is used by production discovery or pricing.

Implied probability is `100 / decimal_odds`; difference is `Polymarket % - Betfair implied %`. No margin removal, EV/value assessment or recommendation. Source quote timestamps were absent in the observed feed and stay null; `external_odds_observed_at` is receipt time, not an invented source timestamp.

## Collector and deployment

One event request per due cycle regardless of the number of outcomes. Default target is 2,000 ms, concurrency two (configurable 1–8). Slow requests reduce achieved cadence. In-flight guards and a process lock prevent duplicate workers. It only calls Flashscore odds; no scanner, analytics discovery or Git operations exist in the loop. Successful state swaps atomically with timestamped quote parts; the previous generation is retained for readers. Errors keep the previous good state and mark it stale. HTTP 429 respects Retry-After (including date form); transient errors back off exponentially to five minutes. Authentication/access/schema failures park that event until restart. Stop signals abort requests and release the lock. A changed source snapshot requires restarting against the new registry.

History appends only on quote-set changes and rotates at 5 MiB, retaining one previous file. Runtime data belongs on a persistent volume; it is not committed every two seconds. Use `view-event.js` to read updated comparisons against unchanged Polymarket rows. Data-branch JSON contains build-time odds until a later publication.

**No persistent service is deployed by these workflows.** GitHub Actions runs a finite build and publishes a snapshot. To run continuously, start the separate collector on an existing persistent server with Node 20+, persistent storage, and supervision. Do not report the public GitHub files as realtime.

The scanner workflow builds this layer after existing outputs. Layer errors do not fail the old scanner. `update-combo-layer.yml` builds from branch `data` without any Polymarket scan, checks source byte hashes, validates the full catalog, and publishes only the additive layer plus navigation.
