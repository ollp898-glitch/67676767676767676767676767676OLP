# BET-X Combo 2.0

Independent enrichment of the scanner's saved Combo outcomes with confirmed Flashscore event links and bookmaker odds. **Esports is excluded from Combo 2.0 before discovery, requests, grouping and ranking.** Scanner files and eligibility rules are unchanged. Each retained `polymarket` row is preserved exactly.

## Read the output

On the **data** branch:

- [Combo 2.0 start page](https://github.com/ollp898-glitch/67676767676767676767676767676OLP/blob/data/combo-2/README.md).
- [Separate readable outcome ranking](https://github.com/ollp898-glitch/67676767676767676767676767676OLP/blob/data/combo-2/rankings/market-edge/index.md), with an index and pages of 20 outcomes, linked to event and market records.
- `combo-2/index.json`: event/sport navigation, source checksum, exclusions and coverage.
- `combo-2/rankings/market-edge/index.json`: machine-readable ranking pages with exact unrounded values.

The main `CHAT-START.md` links to both Combo 2.0 and its readable ranking. All output pages are bounded to 60,000 UTF-8 bytes. Page headers identify the snapshot; do not combine different snapshot IDs.

## Per-outcome bookmaker aggregate

Schema version 3 outputs `bookmakers`, `bookmaker_aggregate` and `market_edge_pp`. Betfair is an ordinary entry in `bookmakers`; no dedicated Betfair result, priority or coverage counter is emitted. Only active, valid, exactly matched quotes with identified bookmakers qualify. There is at most one unambiguous quote per bookmaker ID. Ambiguous duplicate selections are excluded.

`bookmaker_aggregate` contains:

| Field | Definition |
|---|---|
| `bookmaker_count` | Number of confirmed bookmakers, equally weighted |
| `median_odds` | Median decimal odds |
| `median_implied_probability_percent` | Median of each bookmaker's `100 / decimal_odds` |
| `min_odds`, `max_odds` | Observed odds range |
| `polymarket_vs_market_median_pp` | Polymarket probability minus median implied probability |
| `market_edge_pp` | Median implied probability minus Polymarket probability |

For an even number of quotes the median averages the two central values. The median of implied probabilities is calculated directly and can differ from `100 / median_odds`. Stored values are unrounded; readable pages show probabilities and differences to one decimal and odds to two decimals. Missing quotes give count zero and null aggregate values, never zero odds/probability.

## Ranking

Sort descending by `market_edge_pp`; equal values use `outcome_id` ascending for stable ordering. Positive values go first, followed by zero and negative values. At least one bookmaker and a finite Polymarket probability are required. Bookmaker count stays visible; no hidden minimum-six-bookmaker filter is imposed. Every ranked row retains match/market/outcome identity, family, period, line and links to full records. Each build replaces the whole ranking, including when empty.

The implied probabilities are raw, without removing bookmaker margin. The ranking compares saved prices and does not establish expected profit, execution availability or identical cancellation settlement.

## Exact event and market matching

Flashscore discovery reads the public configuration and real sport/day feeds, not homepage match links. Event identity uses participants, explicit competition-scoped aliases, sport, scope and UTC time within five minutes. No fuzzy matching. Conflicting feed identities and multiple exact candidates remain unconfirmed. Participant IDs and explicit order mappings prevent home/away inversion.

Odds come from the observed Flashscore event-level `pq_graphql` contract (`_hash=oce`). Schema and event ID must agree. Supported mappings include soccer winners/goals totals/BTTS/half-line handicaps, tennis supported singles winners and explicit games/sets markets, CFB/MLB full-game markets and verified NFL game/first-half markets. Full-game US markets require overtime scope; halves and signs remain distinct. Corners, team/player props and unproven periods/units remain unmatched. Facts and source rules are recorded in test fixtures; fixtures never supply production odds.

## Collection and migration

After each **new scanner snapshot**, collect each unique confirmed event once, sequentially, with a **2,000 ms pause after the previous request completes**. No background refresh or retries. HTTP 429 ends the pass and records skipped events. Re-running the same schema-3 snapshot validates and reuses saved output.

An existing schema-2 snapshot is upgraded locally from its saved bookmaker quotes: remove esports, calculate aggregates, build ranking and reader pages. **Migration performs no discovery or odds requests and preserves the original collection timestamps.** `source_outcomes` counts all input rows; `excluded_outcomes.esports` records exclusions; `layer_outcomes` counts retained rows. Coverage is bookmaker-neutral. Historical Betfair handling remains only in compatibility helpers used to validate old snapshots; it is absent from schema-3 output.

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
