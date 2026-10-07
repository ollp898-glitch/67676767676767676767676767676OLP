# BMR coverage: frozen 2026-10-06 snapshot

Source data commit: a91871176ac7602b918caa3ee55438ab4a94cb00. Snapshot: 2026-10-06T17:29:51.777Z. 218 events / 1,810 Combo 2.0 outcomes. Live public BMR requests were collected on October 6; validation replay used those saved responses. Flashscore discovery and collection were forbidden during the comparison.

| Metric | Flashscore before | Combined after |
|---|---:|---:|
| Outcomes with bookmaker odds | 662 | 671 |
| Outcomes with fair probability | 611 | 620 |

Net gain: 9 bookmaker outcomes (+1.36% relative, +0.50 percentage points coverage); 9 fair outcomes. BMR matched 18 events and supplied exact lines for 30 outcomes (including overlap). No transport errors. Available retained bookmakers: Bovada, BookMaker, BetAnything, JustBet, BetPhoenix, Everygame, William Hill, Heritage Sports, BetOnline, Skybook, Bet105, MyBookie. Same paid is one account, not multiple brands.

| Sport/type | Outcomes | Before | After | Retained BMR |
|---|---:|---:|---:|---:|
| soccer/moneyline | 51 | 25 | 25 | 1 |
| soccer/totals | 112 | 57 | 57 | 1 |
| soccer/soccer_halftime_result | 53 | 26 | 26 | 1 |
| soccer/first_half_totals | 90 | 39 | 39 | 1 |
| tennis/moneyline | 160 | 98 | 101 | 4 |
| baseball/spreads | 12 | 12 | 12 | 4 |
| hockey/totals | 30 | 14 | 15 | 1 |
| hockey/spreads | 13 | 6 | 10 | 8 |
| hockey/moneyline | 4 | 2 | 3 | 3 |
| american-football/moneyline | 1 | 1 | 1 | 1 |
| american-football/totals | 20 | 18 | 18 | 1 |
| baseball/moneyline | 1 | 1 | 1 | 1 |

Event unmatched reasons: 185 absent from the exact feed universe; 9 start-time mismatches; 6 unproven participant structures. Exact matching intentionally does not bridge ambiguous names, doubles, missing periods or unavailable lines. Unsupported BMR market types are not synthesized. Remaining outcome reasons: {"event_not_in_feed":1220,"unsupported_outcome_semantics":246,"no_confirmed_BMR_selection_or_retained_existing_book":207,"start_time_mismatch":83,"unproven_participant_structure":27}.

All eight project test entry points passed, including BMR exact identity, full-market fair, shared-account/cross-source deduplication, negative semantics, transport spacing, saved-snapshot migration and repeat validation tests. Source and combined snapshot validators passed. The regular CLI enables BMR automatically in existing workflows, without changing Scanner or Flashscore code or schedules.
