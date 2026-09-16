# BET-X Scanner V3

Sports events starting **3–48 hours from scan start**, both boundaries inclusive. Liquidity >= $30; existing exclusions (including any market with an outcome >= 96%) remain. Every published outcome has probability >= 20%.

## Files on the data branch

- `markets.jsonl`: **one line = one specific outcome**, no nested outcome array. Includes `outcome_id`, original `outcome_index`, `token_id`, `market_id`, `match_id`, sport, league, period, family, line, price, percentage, decimal odds, liquidity, volume and history fields.
- `combo-markets.jsonl`: same schema, Combo-enabled outcomes only.
- `high-probability-outcomes.jsonl`: same schema, outcomes >= 70% only.
- `high-probability-markets.json`: self-contained **sport → league → event → section → outcomes** tree for the >= 70% subset. Each scan replaces it, including an empty result. The filename is retained for discoverability; its items are individual outcomes.
- `catalog.json`, `events.json`, `events/match-*.json`: navigation, event summaries and complete grouped outcomes. `events.json` replaces the old event-summary JSONL; every public JSONL now contains only outcomes.
- `line-ladders.json`: ascending numeric lines, separated by match, period, family, market type, exact team/player question scope and outcome side. Includes prices, percentages, odds and history. Supported line expressions: explicit O/U and parenthesized spreads/handicaps; other forms remain available in the main catalog.
- `unclassified-outcomes.json`: outcomes whose family is still unknown. They are also retained in the main catalog with `classification_status: unclassified`, the original market type and a reason.
- `index.json`: `schema_version: 3`, separate market/outcome/event counts, history coverage and filters. `starts_before_window` and `after_window` count exclusions before 3h and after 48h. Old 7-day naming is removed.

**Migration:** consumers of `markets.jsonl` must read `outcome`, `price` and `token_id` directly instead of iterating `outcomes`. Sibling outcomes can be joined on `market_id`; intentionally filtered outcomes are absent. Original token indexes are preserved. `market_best_bid`, `market_best_ask`, `market_spread`, volume and liquidity describe the parent market, not an individual outcome order book. Do not sum parent-market volume across outcome rows.

## Price history and market deltas

Each outcome has `price_1h_ago`, `price_6h_ago`, `price_24h_ago`, matching `*_at` timestamps and `*_status`. History comes from the [official CLOB batch history endpoint](https://docs.polymarket.com/api-reference/markets/get-batch-prices-history), in batches of at most 20 token IDs with 5-minute fidelity. Each target is relative to that market's `price_observed_at`. Use the last point **at or before** the target, at most 15 minutes old. Never use a future point or invent missing data. Missing, stale or failed history is `null` with a status. `price_change_6h_pp` and corresponding 1h/24h fields are changes in percentage points. Current Gamma outcome price and sampled CLOB historical price can have source/sampling differences.

`volume_delta` and `liquidity_delta` compare the same parent market with the **previous successful scan**, not necessarily 6 hours ago. `delta_since`, `delta_hours` and `delta_scope: market` make the interval explicit. The workflow downloads the previous data before replacing it. First observations/missing fields yield `null`; decreases in cumulative volume are marked `source_counter_decreased`. These are market activity changes, not net cash inflows. Schedule remains twice daily; 1h/6h/24h prices come from historical API data, not that schedule.

## Classification and grouping

The 67 previously unknown markets were: pitcher hits allowed (20 markets), pitcher outs (2), hits + runs + RBIs (23), team totals (10), MMA round of finish (4), MMA method of finish (3), tennis completed match (1), tennis set games totals (3), golf albatross (1). All are mapped. Golf has no provider type; its narrow question-and-slug fallback records its source. Future unknown types remain explicit.

Provider split events merge only for supported soccer/baseball suffixes when sport, league, participant title, exact start time and dated base event slug agree. No fuzzy team matching. Other events keep their provider event ID. Original event IDs/slugs remain available. `match_id` is a deterministic grouping hash; rescheduling can change it. Tournaments without individual fixtures remain tournament events.

## Run and verify

```sh
node catalog.test.js
node analytics.test.js
node scanner.integration.test.js
node scanner.js
node validate-catalog.js out
```

Node.js 20+. For local deltas the previous `out/markets.jsonl` is read before replacement; `BETX_PREVIOUS_FILE` may specify another baseline. Failed runs are not published to `data`.

To migrate a saved **legacy** snapshot into a separate V3 output directory (requests historical prices; not fresh market prices):

```sh
node build-catalog.js legacy-markets.jsonl out/rebuilt
node validate-catalog.js out/rebuilt
```

The tracked root `markets.jsonl` on `main` is an old fixture. Use the `data` branch for current results.
