# BET-X Combo 2.0

Independent enrichment of the scanner's saved Combo outcomes with confirmed Flashscore event links and bookmaker odds. **Ordinary Combo excludes tennis and esports via the shared strategy policy. Combo 2.0 consumes all ordinary Combo rows without independent sport filtering; invalid input is rejected before provider requests.** The upstream Combo policy is centralized in `../combo-policy.js`: start 2–28 hours after snapshot, liquidity >= $20, selected probability >=55% and <95%. The ordinary scanner uses 2–28h, liquidity >= $20 and selected probability >=45% and <95%, with partial noise exclusions and separate unclassified outcomes. Layer validation checks the declared source policy. Each retained `polymarket` row is preserved exactly.

## Read the output

On the **data** branch:

- [Combo 2.0 start page](https://github.com/ollp898-glitch/67676767676767676767676767676OLP/blob/data/combo-2/README.md).
- [Separate readable outcome ranking](https://github.com/ollp898-glitch/67676767676767676767676767676OLP/blob/data/combo-2/rankings/market-edge/index.md), with an index and pages of up to 20 outcomes, linked to readable market pages and full records.
- `combo-2/index.json`: event/sport navigation, source checksum, exclusions and coverage.
- `combo-2/rankings/market-edge/index.json`: machine-readable ranking pages with exact unrounded values.

The main `CHAT-START.md` links to both Combo 2.0 and its readable ranking. All output pages are bounded to 60,000 UTF-8 bytes. Page headers identify the snapshot; do not combine different snapshot IDs.

## Per-outcome bookmaker aggregate

Schema version 4 outputs `bookmakers`, `bookmaker_aggregate` and `market_edge_pp`. Betfair is an ordinary entry in `bookmakers`; no dedicated Betfair result, priority or coverage counter is emitted. Only active, valid, exactly matched quotes with identified bookmakers qualify. There is at most one unambiguous quote per bookmaker ID. Ambiguous duplicate selections are excluded. Raw decimal odds are preserved.

Each bookmaker quote includes `fair_probability_percent`, a status and the complete supporting `full_market`. Full-market evidence is captured from the native response before filtering the Polymarket shortlist; opposite outcomes need not pass the shortlist probability threshold. Readable pages show `Bookmaker 1.80 (52.6%)`; unavailable fair probability displays `—`, with a precise status in JSON. Each market part exposes `reader_path`, including unranked outcomes.

Fair probability uses **proportional normalization**, independently per bookmaker: `100 * (1 / selected_odds) / sum(1 / all_market_odds)`. All mutually exclusive outcomes must be active, valid and unambiguous from the same event, bookmaker, period, metric, line and observation. Two-way winners, full 1X2 including draw, BTTS and supported half-line totals/handicaps qualify. Opposite handicap signs and participant IDs are checked. Double-chance selections overlap and are not normalized as a three-outcome market. Push/quarter-line settlement, unsupported markets and missing evidence return null; nothing is reconstructed approximately.

`bookmaker_aggregate` contains:

| Field | Definition |
|---|---|
| `bookmaker_count` | Number of confirmed bookmakers, equally weighted |
| `median_odds` | Median decimal odds |
| `fair_bookmaker_count` | Number of bookmakers with a complete confirmed market |
| `median_fair_probability_percent` | **Median БК**: median of available bookmaker fair probabilities |
| `median_raw_implied_probability_percent` | Separate diagnostic median of `100 / decimal_odds`, never used for fair ranking |
| `min_odds`, `max_odds` | Observed odds range |
| `polymarket_vs_market_median_pp` | Polymarket probability minus median fair probability |
| `market_edge_pp` | Median fair probability minus Polymarket probability |

For an even number of available fair probabilities the median averages the two central values. Incomplete bookmakers are excluded only from the fair median; their raw odds remain available and participate in raw odds statistics. Stored values are unrounded; readable pages show probabilities and differences to one decimal and odds to two decimals. No complete markets means null fair median and edge, never zero probability.

## Ranking

Sort descending by fair `market_edge_pp`; equal values use `outcome_id` ascending for stable ordering. Positive values go first, followed by zero and negative values. At least one bookmaker with complete-market fair probability and a finite Polymarket probability are required. Total and fair bookmaker counts stay visible. Every ranked row retains match/market/outcome identity, family, period, line and links to full records. Each build replaces the whole ranking, including when empty.

The ranking uses margin-adjusted probabilities and compares saved prices; it does not establish expected profit, execution availability or identical cancellation settlement.

## Exact event and market matching

Flashscore discovery reads the public configuration and real sport/day feeds, not homepage match links. Event identity uses participants, explicit competition-scoped aliases, sport, scope and UTC time within five minutes. No fuzzy matching. Conflicting feed identities and multiple exact candidates remain unconfirmed. Participant IDs and explicit order mappings prevent home/away inversion.

Odds come from the observed Flashscore event-level `pq_graphql` contract (`_hash=oce`). Schema and event ID must agree. Supported mappings include soccer winners/goals totals/BTTS/half-line handicaps, tennis supported singles winners and explicit games/sets markets, CFB/MLB full-game markets and verified NFL game/first-half markets. Full-game US markets require overtime scope; halves and signs remain distinct. Corners, team/player props and unproven periods/units remain unmatched. Facts and source rules are recorded in test fixtures; fixtures never supply production odds.

## Collection and migration

After each **new scanner snapshot**, collect each unique confirmed event once, sequentially, with a **2,000 ms pause after the previous request completes**. No background refresh or retries. HTTP 429 ends the pass and records skipped events. Re-running the same schema-4 snapshot validates and reuses saved output.

Existing schema-2/3 snapshots upgrade locally from saved bookmaker quotes. **Migration performs no discovery or odds requests and preserves the original collection timestamps.** If a legacy quote lacks complete-market evidence its fair probability is null and it is excluded from the fair ranking until a new scanner snapshot collects full markets. Raw odds and source rows remain intact. `source_outcomes` equals `layer_outcomes` for current strategy snapshots. `strategy_exclusions` carries the ordinary Combo exclusion counts; legacy exclusion fields remain readable for historical validation. Historical raw-median behavior exists only in `market-summary-v3.js` to validate old snapshots before migration.

Production publication is atomic. Source checksums, exact retained rows, aggregates, ranking order/contents, readable page text and file bounds are validated before replacing the old layer. Failed validation preserves the prior layer.

```sh
node --test combo2/combo2.test.js
node combo2/build.js snapshot
node combo2/validate.js snapshot
node combo2/link-reader.js snapshot
```

The maintenance workflow upgrades/reuses the saved snapshot without scanning Polymarket. The normal scanner workflow publishes the new layer after a successful scan.

## Historical mapping audits

- [Market types and scope evidence](MARKET-TYPES-REVIEW.md).
- [Event aliases and NFL mapping](EVENT-LINKS-REVIEW.md).

These reports describe earlier snapshots and their historical counters, not the current schema-3 ranking.

## Recognition expansion (2026-09-28)

[Controlled before/after and complete market-type audit](RECOGNITION-2026-09-28.md): native football double chance, explicit scoreless-match proposition, WNBA overtime winner, and 45 reviewed event identities. Esports exclusions also check known discipline codes (`exclusion_policy_version: 2`); schema-3 migration reuses saved quotes without network requests. New mappings apply on the next new scanner snapshot.

Computed zero differences are normalized to positive `0`, including the inverse market edge. Complete build/JSON/validation/reuse regression tests cover a zero edge; raw source fields are preserved.


## Additional BMR provider

The CLI collects public BookmakersReview GraphQL odds once per scanner snapshot. BMR supplements saved Flashscore quotes; migration reuses Flashscore data without recollecting it. Scanner policies, Flashscore matching and fair-probability math are unchanged.

Public GET endpoint: https://ms.virginia.us-east-1.bookmakersreview.com/ms-odds-v2/odds-v2-service?query=...

Discovery uses real eventsV2 event IDs; currentLines uses verified mtid, and bettingOptions proves selection semantics. Sport, both participants, league where mapped, start time within five minutes, period, market type and exact signed line must agree. Unsupported or ambiguous semantics remain unmatched; no fuzzy fallback.

Mappings cover selected full-game winner/spread/total markets for MLB, NFL/CFB and NHL; NFL/CFB first-half and first-quarter spreads/totals; singles tennis winner; soccer 1X2, first-half 1X2, full/first-half totals and BTTS. Availability depends on the feed. Unverified BMR team/player totals and corners are not inferred.

Quotes retain raw lines, option labels, event evidence, timestamps and complete-market evidence. Fair probability requires a complete market from the same paid. Shared-account brands count once; explicit cross-source brand aliases are deduplicated. A complete fair market takes precedence; otherwise Flashscore wins. Raw odds remain available. Diagnostics record missing events, time mismatches and provider errors. An unavailable BMR leaves Flashscore data intact. Requests are serial, spaced two seconds, with timeouts and no retries after rate limiting.

See [measured coverage](BMR-COVERAGE-2026-10-06.md).
