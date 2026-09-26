# Market-type coverage audit — 2026-09-26

## Dataset and comparison

Source data commit `bdb40e3029e72ac078bdb06089b5bd4a76243631`, snapshot `ba99f5306c2231152cfa`: 6,314 outcomes. Published baseline: bookmaker_outcomes 313, betfair_matched 170, unmatched bookmaker outcomes 6,001. Of those, 3,878 have no confirmed event; 2,123 have a confirmed event but no exact available quote. Event matching is unchanged.

Controlled comparison runs the old and new parser AND matcher on identical source rows, the same 103 previously confirmed event identities and the same freshly captured responses. All 103 requests succeeded. bookmaker_outcomes **321 → 890 (+569)**; betfair_matched **171 → 200 (+29)**. The published baseline differs because available quotes changed between collection times. These are observations, not a promise of future coverage. The saved production snapshot is not refreshed again: new mappings apply to the next scanner snapshot.

## Confirmed additions

- College football (`sport=american-football`, `league_code=cfb`): full-game winner, half-unit points totals and signed handicaps, first-half points totals and signed handicaps.
- MLB (`sport=baseball`, `league_code=mlb`): full-game winner, half-unit runs totals and signed run handicaps.
- Soccer halftime `Yes` with an exact named-team proposition.

Whole-game CFB/MLB uses `FULL_TIME_OVER_TIME`, never `FULL_TIME`. First-half CFB uses only `FIRST_HALF`. Feed `UNKNOWN` units are interpreted as points/runs only inside these explicit sports; source game scopes and resolution text are recorded in the factual fixture. This compares the normal completed game's selection, period, units and line; it does not certify identical bookmaker cancellation/abandonment policies. Half-unit limits avoid push ambiguity. Signed handicaps require the exact named team, question line and any supplied outcome_line to agree. No fuzzy matching, odds synthesis or fixture fallback.

## Deliberately unmatched

- Corners and team totals: none of the 103 responses carries an explicit corners metric or participant-scoped OVER_UNDER total. No substitution of goals for corners or match totals for team totals.
- Baseball first-five/individual innings: no explicit matching inning scope in the captured contract. FULL_TIME is not interpreted as first five innings.
- CFB second-half markets: no confirmed second-half settlement equivalence; no substitution of overtime scopes.
- Tennis: existing winner/set winner/game total/set total/set handicap mappings remain. Unsupported completed-match props, missing lines/quotes and unconfirmed events remain unmatched. No newly proven tennis type in this snapshot.
- Nine source rows labeled baseball actually belong to `mlbb` (Mobile Legends); the MLB league guard rejects them without changing scanner classification.
- Winner No is not converted to another team's win, and no double-chance odds are invented.

## Every market_type/family

Unmatched and no-event columns refer to the published baseline. Comparison columns use the same captured responses for both code versions.

| Sport | market_type | family | Total | Published unmatched | Of these: no event | Bookmakers before → after | Betfair before → after |
|---|---|---|---:|---:|---:|---:|---:|
| american-football | spreads | handicap | 1053 | 1053 | 459 | 0 → 96 | 0 → 0 |
| american-football | totals | totals | 768 | 768 | 307 | 0 → 394 | 0 → 0 |
| soccer | soccer_team_totals | team_totals | 687 | 687 | 555 | 0 → 0 | 0 → 0 |
| soccer | totals | totals | 740 | 635 | 630 | 105 → 105 | 96 → 96 |
| soccer | spreads | handicap | 605 | 545 | 514 | 60 → 60 | 0 → 0 |
| soccer | moneyline | winner | 293 | 287 | 239 | 6 → 6 | 6 → 6 |
| soccer | first_half_totals | totals | 291 | 231 | 231 | 60 → 60 | 57 → 57 |
| soccer | soccer_halftime_result | winner | 208 | 208 | 167 | 0 → 1 | 0 → 1 |
| soccer | soccer_first_half_team_totals | team_totals | 172 | 172 | 119 | 0 → 0 | 0 → 0 |
| soccer | soccer_first_to_score | first_score | 128 | 128 | 93 | 0 → 0 | 0 → 0 |
| mma | ufc_round_of_victory | victory_round | 74 | 74 | 74 | 0 → 0 | 0 → 0 |
| soccer | both_teams_to_score_first_half | both_score | 95 | 73 | 73 | 22 → 22 | 0 → 0 |
| american-football | team_totals | team_totals | 71 | 71 | 21 | 0 → 0 | 0 → 0 |
| baseball | team_totals | team_totals | 70 | 70 | 0 | 0 → 0 | 0 → 0 |
| american-football | moneyline | winner | 68 | 68 | 43 | 0 → 25 | 0 → 25 |
| baseball | baseball_player_total_bases | player_total_bases | 65 | 65 | 0 | 0 → 0 | 0 → 0 |
| baseball | baseball_team_first_five_total | totals | 41 | 41 | 0 | 0 → 0 | 0 → 0 |
| mma | ufc_method_of_victory | victory_method | 40 | 40 | 40 | 0 → 0 | 0 → 0 |
| baseball | spreads | handicap | 40 | 40 | 0 | 0 → 35 | 0 → 0 |
| american-football | first_half_totals | totals | 35 | 35 | 11 | 0 → 1 | 0 → 0 |
| esports | moneyline | winner | 33 | 33 | 33 | 0 → 0 | 0 → 0 |
| soccer | total_corners | corners_totals | 32 | 32 | 19 | 0 → 0 | 0 → 0 |
| soccer | soccer_second_half_result | winner | 30 | 30 | 19 | 0 → 0 | 0 → 0 |
| baseball | baseball_team_inning9_winner | winner | 30 | 30 | 0 | 0 → 0 | 0 → 0 |
| baseball | baseball_team_inning1_winner | winner | 29 | 29 | 0 | 0 → 0 | 0 → 0 |
| baseball | baseball_team_inning2_winner | winner | 26 | 26 | 0 | 0 → 0 | 0 → 0 |
| baseball | baseball_team_inning3_winner | winner | 26 | 26 | 0 | 0 → 0 | 0 → 0 |
| baseball | baseball_team_inning4_winner | winner | 26 | 26 | 0 | 0 → 0 | 0 → 0 |
| baseball | baseball_team_inning5_winner | winner | 26 | 26 | 0 | 0 → 0 | 0 → 0 |
| baseball | baseball_team_inning6_winner | winner | 26 | 26 | 0 | 0 → 0 | 0 → 0 |
| baseball | baseball_team_inning7_winner | winner | 26 | 26 | 0 | 0 → 0 | 0 → 0 |
| baseball | baseball_team_inning8_winner | winner | 26 | 26 | 0 | 0 → 0 | 0 → 0 |
| mma | totals | rounds_totals | 22 | 22 | 22 | 0 → 0 | 0 → 0 |
| baseball | baseball_team_first_five_spread | handicap | 22 | 22 | 0 | 0 → 0 | 0 → 0 |
| american-football | first_half_spreads | handicap | 20 | 20 | 6 | 0 → 10 | 0 → 0 |
| baseball | baseball_team_first_five_winner | winner | 19 | 19 | 0 | 0 → 0 | 0 → 0 |
| american-football | second_half_spreads | handicap | 18 | 18 | 4 | 0 → 0 | 0 → 0 |
| soccer | second_half_totals | totals | 33 | 18 | 18 | 15 → 15 | 0 → 0 |
| soccer | soccer_first_half_total_corners | corners_totals | 18 | 18 | 13 | 0 → 0 | 0 → 0 |
| soccer | soccer_team_total_corners | corners_team_totals | 18 | 18 | 13 | 0 → 0 | 0 → 0 |
| mma | ufc_round_of_finish | finish_round | 17 | 17 | 17 | 0 → 0 | 0 → 0 |
| baseball | baseball_player_strikeouts | player_strikeouts | 17 | 17 | 0 | 0 → 0 | 0 → 0 |
| soccer | soccer_second_half_total_corners | corners_totals | 15 | 15 | 11 | 0 → 0 | 0 → 0 |
| tennis | tennis_set_handicap | sets_handicap | 23 | 14 | 6 | 16 → 16 | 0 → 0 |
| baseball | baseball_game_extra_innings | extra_innings | 14 | 14 | 0 | 0 → 0 | 0 → 0 |
| soccer | both_teams_to_score_second_half | both_score | 16 | 12 | 12 | 4 → 4 | 0 → 0 |
| american-football | second_half_totals | totals | 11 | 11 | 3 | 0 → 0 | 0 → 0 |
| soccer | both_teams_to_score | both_score | 13 | 11 | 11 | 2 → 2 | 2 → 2 |
| soccer | soccer_second_half_team_totals | team_totals | 10 | 10 | 9 | 0 → 0 | 0 → 0 |
| esports | child_moneyline | winner | 10 | 10 | 10 | 0 → 0 | 0 → 0 |
| tennis | moneyline | winner | 18 | 9 | 8 | 10 → 10 | 4 → 4 |
| baseball | moneyline | winner | 8 | 8 | 5 | 0 → 3 | 0 → 3 |
| esports | map_handicap | maps_handicap | 8 | 8 | 8 | 0 → 0 | 0 → 0 |
| tennis | tennis_first_set_totals | games_totals | 19 | 7 | 7 | 12 → 12 | 0 → 0 |
| baseball | totals | totals | 6 | 6 | 2 | 0 → 4 | 0 → 0 |
| mma | moneyline | winner | 6 | 6 | 6 | 0 → 0 | 0 → 0 |
| soccer | soccer_first_half_first_to_score | first_score | 6 | 6 | 6 | 0 → 0 | 0 → 0 |
| soccer | soccer_second_half_first_to_score | first_score | 6 | 6 | 6 | 0 → 0 | 0 → 0 |
| esports | totals | maps_totals | 6 | 6 | 6 | 0 → 0 | 0 → 0 |
| cricket | moneyline | winner | 5 | 5 | 3 | 0 → 0 | 0 → 0 |
| mma | ufc_go_the_distance | distance | 4 | 4 | 4 | 0 → 0 | 0 → 0 |
| mma | ufc_method_of_finish | victory_method | 4 | 4 | 4 | 0 → 0 | 0 → 0 |
| soccer | first_half_spreads | handicap | 4 | 4 | 4 | 0 → 0 | 0 → 0 |
| tennis | tennis_match_totals | games_totals | 2 | 2 | 1 | 0 → 0 | 0 → 0 |
| baseball | map_handicap | maps_handicap | 2 | 2 | 2 | 0 → 0 | 0 → 0 |
| tennis | tennis_first_set_winner | winner | 6 | 2 | 2 | 4 → 4 | 3 → 3 |
| tennis | tennis_set_winner | winner | 4 | 1 | 1 | 3 → 3 | 3 → 3 |
| tennis | tennis_completed_match | completed_match | 1 | 1 | 0 | 0 → 0 | 0 → 0 |
| tennis | tennis_set_totals | sets_totals | 3 | 1 | 1 | 2 → 2 | 0 → 0 |

## Validation

35 tests cover factual fixtures, overtime versus regulation, half/inning separation, participant reversal, line/sign conflicts, unknown units, wrong leagues, unsupported props and preservation of source rows. Scanner, event discovery, grouping, storage and one-pass/two-second collection architecture are unchanged.

Full captured-response build and deep validation preserved all 6,314 original rows and reproduced 890 bookmaker / 200 Betfair outcomes. The validator accepts the historical unsupported reason on older unmatched rows when the new mapping recognizes the type; it still rejects invented odds and changed source fields.
