# BET-X Scanner

Collects pre-match Polymarket sports markets in the next 48 hours. Run with Node.js 20 or later:

```sh
node catalog.test.js
node scanner.js
node validate-catalog.js out
```

## Match catalog (V2)

The existing market exports and filters are preserved. New additive outputs:

- `catalog.json`: sport → league → match summaries and paths to details.
- `events.jsonl`: one compact record per grouped match/event, including section counts.
- `events/match-<id>.json`: one match with sections by period and market family. Each section contains complete original market records, including outcomes, prices, IDs, liquidity and Combo status.
- `index.json`: adds `events` and `event_catalog` counts and paths.

Examples of sections: full-match result, handicaps, totals, team totals, corners; first/second half; tennis sets; esports maps; baseball innings. A binary Yes/No market remains one market with two outcomes. Separate lines remain separate markets. Unknown market types go to `other`, retaining all source data.

### Grouping rules and limits

Polymarket `event_id` does not always identify an entire match: soccer corners/halves and baseball inning markets can have separate event IDs. For soccer/baseball, merge only when the sport, league, exact normalized participant title, start timestamp and base event slug match. Remove only explicitly supported provider suffixes (`more-markets`, `total-corners`, `halftime-result`, etc.). Dates, unknown suffixes and game-number suffixes are preserved. No fuzzy matching of team names.

When scanner league metadata is absent, a single tag matching the slug's league prefix can provide the catalog league; its provenance is recorded. Original market records are never rewritten. Otherwise use source event ID (or source slug/market ID fallback). `game_id` is not a match key: esports maps can have their own game IDs. Unsupported split-event conventions are deliberately kept separate. Tournaments without individual fixtures remain tournament events.

`match_id` is a deterministic hash of the grouping key, not a Polymarket ID. A rescheduled start can change the match ID. All source event IDs/slugs are retained for traceability. Conflicting start times or fallback identities are marked `needs_review`. Catalog counts cover the filtered snapshot, not all markets offered by Polymarket.

### Rebuild from an existing snapshot

```sh
node build-catalog.js path/to/markets.jsonl out
```

This generates only the catalog files and does not request fresh prices or overwrite `index.json`. To validate, place the same source `markets.jsonl` in `out/` and run `node validate-catalog.js out`.

GitHub Actions publishes the catalog alongside the original exports on the `data` branch. The root `markets.jsonl` in `main` is a legacy file; use `data` for current snapshots.
