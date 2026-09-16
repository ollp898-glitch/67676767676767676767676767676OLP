# BET-X Scanner V3

Sports events starting **3–48 hours from scan start**, both boundaries inclusive. Liquidity >= $30; existing exclusions (including any market with an outcome >= 96%) remain. Every published outcome has probability >= 20%.

## Files on the data branch

- `markets.jsonl`: **one line = one specific outcome**, no nested outcome array. Includes `outcome_id`, original `outcome_index`, `token_id`, `market_id`, `match_id`, sport, league, period, family, line, price, percentage, decimal odds, liquidity, volume and history fields.
- `combo-markets.jsonl` and `high-probability-outcomes.jsonl`: identical **70% + verified Combo single-leg** shortlist. The provider's Gamma enabled flag alone does not qualify a leg.
- `high-probability-markets.json`: self-contained **sport → league → event → section → outcomes** tree for the >= 70% subset. Each scan replaces it, including an empty result. The filename is retained for discoverability; its items are individual outcomes.
- `catalog.json`, `events.json`, `events/match-*.json`: navigation, event summaries and complete grouped outcomes. `events.json` replaces the old event-summary JSONL; every public JSONL now contains only outcomes.
- `line-ladders.json`: ascending numeric lines, separated by match, period, family, market type, exact team/player question scope and outcome side. Includes prices, percentages, odds and history. For verified two-team Spread questions, `outcome_line` reverses the sign for the opposing team; ladder `market_line` retains the provider line. Supported line expressions: explicit O/U and verified two-team Spread questions; other forms remain available in the main catalog.
- `unclassified-outcomes.json`: outcomes whose family is still unknown. They are also retained in the main catalog with `classification_status: unclassified`, the original market type and a reason.
- `candidate-audit.json`: quarantined outcomes, exclusion reasons and Combo catalog verification coverage. An empty shortlist is valid and replaces the previous file.
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
node combo.test.js
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

## Combo shortlist and live analysis

The main catalog retains raw `outcome` values; `outcome_label` adds the proposition, line and unit for reading. Unknown classifications and unsupported sports are quarantined. Baseball player home runs and specialist props (albatross, penta/quadra kill, rampage/ultra kill) are excluded from the Combo universe, while remaining in the main catalog if they pass the scanner's existing base filters.

`combo_verified: true` requires the Gamma enabled flag and an exact market ID, condition ID, outcome/index and **Combo position ID** match in the [public Combo catalog](https://docs.polymarket.com/api-reference/combo-markets/get-combo-markets), with `pending: false`. Missing, pending, mismatched or unverifiable entries fail closed. CLOB token IDs and Combo position IDs are different identifiers. `combo_verification_scope: single_leg` does not confirm a multi-leg combination.

`best_bid`, `best_ask`, `spread`, `book_midpoint` and `depth` come from the [CLOB books endpoint](https://docs.polymarket.com/api-reference/market-data/get-order-books-request-body), matched by `asset_id == token_id` and condition ID. Bids are sorted descending, asks ascending. Missing, malformed, crossed or stale books have null prices and an explicit status. These prices do not replace the Gamma probability. Buy depth scenarios use $10/$50/$100, show partial fills, VWAP and slippage in percentage points, and exclude fees. They estimate individual CLOB legs, not Combo RFQ execution.

Before analysis, refresh the chosen snapshot or selected outcomes:

```sh
node refresh-candidates.js out/high-probability-outcomes.jsonl out/live
```

This rechecks Gamma prices, start times, identity, tradability, liquidity, Combo eligibility, books and history. The scanner saves the opaque Combo catalog page cursor for each confirmed leg; refresh rereads those pages and verifies exact identities. A moved market or a legacy snapshot without this locator requires a new scan. A full scan examines at most 1,000 catalog pages; missing entries after a truncated traversal are unverifiable, not classified as disabled. `out/live/analysis-ready.jsonl` and the grouped `analysis-ready.json` contain only refreshed valid outcomes; every run replaces them, including empty results. Refresh failure clears the earlier ready result. Each row expires no later than **120 seconds** after the oldest relevant observation. Recheck `analysis_expires_at` at analysis time; a long refresh can legitimately expire early rows. Changed market semantics require a fresh scanner run. Refresh covers only input outcomes; run a new scan to discover new markets or outcomes that crossed the original thresholds.

To check an explicitly selected combination (refreshes all selected legs first):

```sh
node check-combo.js out/high-probability-outcomes.jsonl token:ID1 token:ID2
```

Duplicate/opposing legs from one condition are rejected. Legs from the same match require correlation review; different matches can pass local checks. `combo_compatible` remains null and `provider_verified` false until the provider validates the complete combination. No joint probability is inferred and no orders or quotes are submitted.

History cleanup rejects invalid/future points, deduplicates identical timestamps and rejects conflicting prices at a timestamp. A conflict near a requested historical target produces null with `conflicting_points`. Large short-interval jumps are flagged, not smoothed away. Missing data remains null; `price_history_quality` records cleaning counts.
