## Scanner и Combo: политика октября 2026

Ordinary Scanner: **2–28h включительно от snapshot, 55% <= price < 95%, liquidity >= $20**. Только активные незакрытые спортивные pre-match рынки; начавшиеся события исключены. Структура событие → период/семейство → рынок → исход и исходные token/index сохранены.

Частичный noise-фильтр исключает exact/correct score, exact winning margin, узкие player scorer/assist/goal-or-assist/TD/try/HR/first-basket/first-kill props и точную минуту или интервалы скоринга до 10 минут. Обычные количественные player points/shots/rebounds/assists O/U не исключаются из-за принадлежности игроку. Основные матчевые рынки и периоды сохраняются при соблюдении базовых порогов.

Неопознанные исходы после базовых фильтров сохраняются отдельно в `unclassified-outcomes.json` с raw-полями, идентификаторами события/рынка/исхода и причиной неизвестной классификации. Они не входят в основной классифицированный каталог или Combo.

`scanner-audit/index.json` содержит точные причины и ссылки на части raw-журнала. `ordinary` — полностью отклонённые входные markets; `ordinary_outcome` — исключённые отдельные исходы с исходным индексом и ценой. Сохранённые основные + отдельно неопознанные markets + `ordinary` rejects = все полученные records. Частичный отсев outcomes не прибавляется к market rejects. `no_qualifying_outcomes` означает, что все исходы рынка отклонены; их точные причины есть в `ordinary_outcome`. Обход sports feed продолжается до конца; ошибки/циклы не публикуются. Feed запрашивается с `closed=false`; закрытые записи, если источник всё же вернул их, фиксируются в audit.

Combo: **2–28h, liquidity >= $20, 55% <= price < 95%, combo_verified=true**. Единый источник — `combo-policy.js`. Прежние исключения Combo, точная проверка идентификаторов, исключение esports в Combo 2.0, однократный сбор БК и fair probability только по полному рынку одной БК сохранены. Вычисленные нули нормализуются до обычного `0` для JSON round trip.

# BET-X Scanner V3

**Для чатов: [откройте CHAT-START.md](https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/CHAT-START.md).** Это стартовая страница со счётчиками и ссылками на небольшие страницы данных. Не начинайте чтение с больших JSONL-файлов.


## Files on the data branch

- `markets.jsonl`: **one line = one specific outcome**, no nested outcome array. Includes `outcome_id`, original `outcome_index`, `token_id`, `market_id`, `match_id`, sport, league, period, family, line, price, percentage, decimal odds, liquidity, volume and history fields.
- `combo-markets.jsonl` and `high-probability-outcomes.jsonl`: identical **55% + verified Combo single-leg** shortlist. The provider's Gamma enabled flag alone does not qualify a leg.
- `high-probability-markets.json`: self-contained **sport → league → event → section → outcomes** tree for the >= 55% subset. Each scan replaces it, including an empty result. The filename is retained for discoverability; its items are individual outcomes.
- `catalog.json`, `events.json`, `events/match-*.json`: navigation, event summaries and complete grouped outcomes. `events.json` replaces the old event-summary JSONL; each market-export JSONL contains one outcome per line; scanner-audit JSONL files contain rejected source records.
- `line-ladders.json`: ascending numeric lines, separated by match, period, family, market type, exact team/player question scope and outcome side. Includes prices, percentages, odds and history. For verified two-team Spread questions, `outcome_line` reverses the sign for the opposing team; ladder `market_line` retains the provider line. Supported line expressions: explicit O/U and verified two-team Spread questions; other forms remain available in the main catalog.
- `unclassified-outcomes.json`: outcomes whose family is still unknown. They are kept separately from the main catalog with `classification_status: unclassified`, the original market type and a reason.
- `candidate-audit.json`: quarantined outcomes, exclusion reasons and Combo catalog verification coverage. An empty shortlist is valid and replaces the previous file.
- `index.json`: `schema_version: 3`, separate market/outcome/event counts, history coverage and filters. `starts_before_window` and `after_window` count exclusions before 2h and after 28h. Old 7-day naming is removed.

**Migration:** consumers of `markets.jsonl` must read `outcome`, `price` and `token_id` directly instead of iterating `outcomes`. Sibling outcomes can be joined on `market_id`; only qualifying sibling outcomes are retained; original indexes remain unchanged. Original token indexes are preserved. `market_best_bid`, `market_best_ask`, `market_spread`, volume and liquidity describe the parent market, not an individual outcome order book. Do not sum parent-market volume across outcome rows.

## Price history and market deltas

Each outcome has `price_1h_ago`, `price_6h_ago`, `price_24h_ago`, matching `*_at` timestamps and `*_status`. History comes from the [official CLOB batch history endpoint](https://docs.polymarket.com/api-reference/markets/get-batch-prices-history), in batches of at most 20 token IDs with 5-minute fidelity. Each target is relative to that market's `price_observed_at`. Use the last point **at or before** the target, at most 15 minutes old. Never use a future point or invent missing data. Missing, stale or failed history is `null` with a status. `price_change_6h_pp` and corresponding 1h/24h fields are changes in percentage points. Current Gamma outcome price and sampled CLOB historical price can have source/sampling differences.

`volume_delta` and `liquidity_delta` compare the same parent market with the **previous successful scan**, not necessarily 6 hours ago. `delta_since`, `delta_hours` and `delta_scope: market` make the interval explicit. The workflow downloads the previous data before replacing it. First observations/missing fields yield `null`; decreases in cumulative volume are marked `source_counter_decreased`. These are market activity changes, not net cash inflows. Schedule remains twice daily; 1h/6h/24h prices come from historical API data, not that schedule.

## Classification and grouping

The October 5 audit adds evidence-based NFL quantitative player totals, quarter spreads/totals/winners, half team totals/winners, team touchdowns, two-point conversions and safety; basketball player points/assists/rebounds, periods and team props; baseball earned runs allowed; map kill totals/team first blood; explicit NASCAR race winner propositions and starting lineups. Each new rule requires agreement between sport, provider type, complete question/group title, line and the complete raw outcome structure. Player/team names and per-outcome handicap signs are retained. Unsupported or conflicting records remain quarantined with a specific reason.

`outcome_canonical` gives the semantic side (`OVER`, `UNDER`, `TEAM_COVERS`, etc.). Proven Yes/No totals display `outcome: Over/Under`, with `raw_outcome`, original index/token/position and `raw_market` retained. A title saying O/U is insufficient: Yes/No conversion requires the exact paired resolution clauses for the same player/statistic/half-point threshold. The original description, including inactivity/cancellation/overtime rules, stays available; normalization does not assert bookmaker settlement equivalence. Combo verification compares raw names. Refresh rejects changed resolution rules. The validator recomputes these semantics from raw evidence.

`node audit-classification.js unclassified-outcomes.json [gamma-evidence.json]` groups **all** input records by sport, provider type, question/group formats, period, line and outcome structure, retaining market IDs for review. Optional evidence adds descriptions only after source identity checks. `classification-fixtures.json` contains 53 real sport/type fixtures; `catalog.test.js` runs their positive, negative and Yes/No regression tests. See [CLASSIFICATION-AUDIT.md](CLASSIFICATION-AUDIT.md) for fixed-baseline and live-run results.

The 67 previously unknown markets were: pitcher hits allowed (20 markets), pitcher outs (2), hits + runs + RBIs (23), team totals (10), MMA round of finish (4), MMA method of finish (3), tennis completed match (1), tennis set games totals (3), golf albatross (1). All are mapped. Golf has no provider type; its narrow question-and-slug fallback records its source. Future unknown types remain explicit.

Provider split events merge only for supported soccer/baseball suffixes when sport, league, participant title, exact start time and dated base event slug agree. No fuzzy team matching. Other events keep their provider event ID. Original event IDs/slugs remain available. `match_id` is a deterministic grouping hash; rescheduling can change it. Tournaments without individual fixtures remain tournament events.

## Run and verify

```sh
node catalog.test.js
node analytics.test.js
node combo.test.js
node scanner-fixes.test.js
node scanner.integration.test.js
node scanner.js
node validate-catalog.js out
```

Node.js 20+. For local deltas the previous `out/markets.jsonl` is read before replacement; `BETX_PREVIOUS_FILE` may specify another baseline. Failed runs are not published to `data`.

The complete validated snapshot remains a workflow artifact. Structured Combo and ladder files use compact JSON without dropping fields. Before publishing to `data`, `snapshot-publication.js` splits any file above GitHub's 100 MiB limit into exact byte parts below 80 MiB. `publication-manifest.json` records the logical filenames, lengths, SHA-256 checksums and part names. **A split file has no direct raw URL under its original filename; each part is only a byte fragment, not valid JSON or JSONL on its own.** Files below the limit retain their original paths. Download any logical file with `node download-snapshot.js markets.jsonl ./markets.jsonl` (or substitute another filename); the downloader checks the manifest, every part and the final SHA-256. A missing part, changed snapshot or mismatched checksum fails without writing a partial output. The next Scanner run reconstructs `markets.jsonl` for price and liquidity deltas; the separate Chat Reader and Combo 2.0 update workflows materialize and repack split files. Older data-branch snapshots without a manifest remain readable through their original files; the downloader requires a manifest, so use the saved artifact or a Git checkout for such legacy snapshots.

To migrate a saved **legacy** snapshot into a separate V3 output directory (requests historical prices; not fresh market prices):

```sh
node build-catalog.js legacy-markets.jsonl out/rebuilt
node validate-catalog.js out/rebuilt
```

The tracked root `markets.jsonl` on `main` is an old fixture. Use the `data` branch for current results.

## Combo shortlist and live analysis

The main catalog retains source names in `raw_outcome` for new evidence-based classifications; `outcome` becomes Over/Under only when that meaning is proven. `outcome_label` adds the proposition, line and unit for reading. Unknown classifications and unsupported sports are quarantined. Baseball player home runs and specialist props (albatross, penta/quadra kill, rampage/ultra kill) are excluded from the Combo universe, while ordinary quantitative markets remain subject to the 2–28h / $20 / 55%–<95% policy.

`combo_verified: true` requires the Gamma enabled flag and an exact market ID, condition ID, outcome/index and **Combo position ID** match in the [public Combo catalog](https://docs.polymarket.com/api-reference/combo-markets/get-combo-markets), with `pending: false`. Missing, pending, mismatched or unverifiable entries fail closed. CLOB token IDs and Combo position IDs are different identifiers. `combo_verification_scope: single_leg` does not confirm a multi-leg combination.

`best_bid`, `best_ask`, `spread`, `book_midpoint` and `depth` come from the [CLOB books endpoint](https://docs.polymarket.com/api-reference/market-data/get-order-books-request-body), matched by `asset_id == token_id` and condition ID. Bids are sorted descending, asks ascending. Missing, malformed, crossed or stale books have null prices and an explicit status. These prices do not replace the Gamma probability. Buy depth scenarios use $10/$50/$100, show partial fills, VWAP and slippage in percentage points, and exclude fees. They estimate individual CLOB legs, not Combo RFQ execution.

Before analysis, refresh the chosen snapshot or selected outcomes:

```sh
node refresh-candidates.js out/high-probability-outcomes.jsonl out/live
```

This rechecks Gamma prices, start times, identity, tradability, liquidity, Combo eligibility, books and history. The scanner saves the opaque Combo catalog page cursor for each confirmed leg; refresh rereads those pages and verifies exact identities. A moved market or a legacy snapshot without this locator requires a new scan. A full scan follows pagination until all requested markets are found or the catalog ends, with a 15-minute safety budget instead of a 1,000-page cutoff. A budget expiry or API error is explicitly reported with incomplete coverage and unresolved market counts; missing entries in that case are not classified as disabled. `out/live/analysis-ready.jsonl` and the grouped `analysis-ready.json` contain only refreshed valid outcomes; every run replaces them, including empty results. Refresh failure clears the earlier ready result. Each row expires no later than **120 seconds** after the oldest relevant observation. Recheck `analysis_expires_at` at analysis time; a long refresh can legitimately expire early rows. Changed market semantics require a fresh scanner run. Refresh covers only input outcomes; run a new scan to discover new markets or outcomes that crossed the original thresholds.

To check an explicitly selected combination (refreshes all selected legs first):

```sh
node check-combo.js out/high-probability-outcomes.jsonl token:ID1 token:ID2
```

Duplicate/opposing legs from one condition are rejected. Legs from the same match require correlation review; different matches can pass local checks. `combo_compatible` remains null and `provider_verified` false until the provider validates the complete combination. No joint probability is inferred and no orders or quotes are submitted.

History cleanup rejects invalid/future points, deduplicates identical timestamps and rejects conflicting prices at a timestamp. A conflict near a requested historical target produces null with `conflicting_points`. Large short-interval jumps are flagged, not smoothed away. Missing data remains null; `price_history_quality` records cleaning counts.


## Fast counts: read this before downloading large catalogs

Use the `data` branch, not the legacy fixture on `main`.

1. Read `combo-summary.json` for exact counts, `snapshot_at`, coverage and source checksum.
2. For “how many corner outcomes?”, answer `corners.outcomes`. The grouped counts include match and half totals and team totals. Also report snapshot time; do not present snapshot counts as a live inventory.
3. For the actual corner rows, read `combo-corners.jsonl`.
4. Only download `combo-markets.jsonl` in full for other row-level analysis. Do not count search snippets or truncated tool output. Verify its byte length and SHA-256 against the summary from the same commit.

`combo-markets.jsonl` and `high-probability-outcomes.jsonl` remain identical for backward compatibility: **strategy-filtered, verified individual outcomes priced 55% to below 95%**, not all provider Combo markets. `combo-summary.json` makes this scope explicit and `index.json.combo_summary` points to it. An outcome is one JSONL row; market and match counts are separate.

The exporter regenerates the summary and corner subset on every scan, including empty scans. Validation recomputes counts and checksum from the source snapshot before publication. No network requests are required for these counts.

Book status is evaluated at receipt of each batch. `book_observed_at` is the receipt time; `book_timestamp` is the source timestamp, retained even when too old, with `book_age_ms_at_observation` for diagnosis. An available historical book is not a current execution quote. Live refresh and expiry checks are still required. Invalid and duplicate books fail closed.

## Bounded chat reader

Every scan publishes `CHAT-START.md` and the same entry as the data-branch `README.md`. Follow scope → sport → family → page index → page. Markdown pages contain at most eight outcomes, with a link to their full JSON records. Pages and navigation files are limited to 60,000 UTF-8 bytes; the machine validation manifest is not a chat entry. Both all saved outcomes and the verified Combo shortlist are available. Counts and records are validated before publication.

URLs under `chat/<snapshot_id>/` identify the exact source dataset. If an old link disappears after publication, reopen CHAT-START.md; do not combine different snapshot IDs. Large legacy exports remain available for programmatic downloads.

## Combo Layer 2.0 Beta

Independent grouped output from existing Combo rows, external bookmaker odds and conservative event mapping: [architecture, limitations and one-time odds collection](combo2/README.md). Build from the current data snapshot using the **Publish Combo Layer 2.0 from existing snapshot** workflow. Odds are collected once after each scanner update, with a two-second pause between event requests, and remain saved until the next scanner snapshot.

## Combo strategy sports

Tennis and esports (including known esports league codes on mislabeled rows) remain in General Scanner but are excluded from ordinary Combo with `sport_not_in_combo_strategy`. `combo-summary.json` and `candidate-audit.json` record excluded outcome counts by sport, scoped to all saved scanner outcomes. Live refresh rejects these sports too. Combo 2.0 consumes the ordinary Combo shortlist as its sole input and rejects stale, unfiltered input rather than independently dropping rows. The existing Combo-only publication workflow can reapply these sport exclusions to verified saved rows, preserving General Scanner files and all original prices/timestamps. Numeric policies and workflow schedules are unchanged.
