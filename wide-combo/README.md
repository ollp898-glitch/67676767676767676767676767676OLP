# Wide Combo 1.0

Wide Combo is a separate read-only analytical view of verified single outcomes in `combo-markets.jsonl`. It includes each outcome with `0.80 <= price < 0.95`. It inherits Combo's sport, start-time, liquidity and verification decisions; it does not call Polymarket or require bookmaker quotes.

The published entry point is [`wide-combo/index.json`](https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/wide-combo/index.json). Open its `sports` entries, then a sport's `families` entries, then the referenced small outcome pages. Each page has at most eight complete rows and is at most 60 KB. `events.pages` gives the event catalog; `liquidity_ranking.pages` lists every outcome in descending liquidity order. Every page carries `snapshot_at`, `snapshot_id` and `source_sha256`; use only files with the same values.

For short AI requests, [`slim.csv`](https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/wide-combo/slim.csv) contains one compact row per outcome. Its first five comment lines identify the snapshot and source hash. `num` (`W001`...) and `match_num` (`M01`...) are assigned deterministically within that snapshot, ordered by start time, match ID, family, market type, exact line and outcome index. They are not permanent IDs across snapshots. `start_utc` is a Unix timestamp in seconds (UTC). `book_status` uses `A` for `available`, `S` for `stale_or_invalid_timestamp`, and `E` for `empty_side`; any other status is written verbatim. Empty CSV cells mean missing data, not zero. `fill100` and `slip100_pp` describe the $100 buy scenario when available. [`id-map.json`](https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/wide-combo/id-map.json) resolves each short number to the original outcome and token IDs, market URL, and a small page with the complete original fields. Check that the snapshot metadata agrees across files before combining them.

Examples for ChatGPT:

- “Покажи все исходы Wide Combo 80–95%”: traverse all sport and family pages from the index.
- “Покажи только футбольные форы”: open `sports/soccer/handicap/index.json` and its pages.
- “Покажи тоталы с вероятностью выше 90%”: traverse the `totals`, `team_totals`, `corners_totals` and `corners_team_totals` families and filter by `price > 0.90`. Other total families remain available in the index.
- “Выбери 20 исходов с наибольшей ликвидностью”: read the first three `liquidity_ranking.pages` and take the first 20 rows.

All source fields are preserved. `model_provider`, `model_probability`, `model_observed_at`, `model_market_match`, `probability_difference_pp`, `estimated_ev` and `analysis_notes` are `null` until a real model is connected. `model_status` is `not_connected`. A future model adapter should populate these fields only after confirming the exact match, market, period, side and line. No model probability or EV is invented here.

Build and check locally with `node wide-combo/build.js SNAPSHOT_DIR` and `node wide-combo/validate.js SNAPSHOT_DIR`. The builder reads only `combo-markets.jsonl` and `index.json` from that directory. The scanner workflow builds it after its Combo export, and the existing snapshot publication mechanism carries the output to `data`.
