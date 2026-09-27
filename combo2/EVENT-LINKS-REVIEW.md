# Exact event links and NFL odds — 2026-09-27

## Controlled comparison

Source: data commit a6e96ef5812bc84cffb6290c74442e9af3dbd735, 5,902 unchanged outcomes across 263 event groups. SHA-256 of combo-markets.jsonl: `d8b89751805a6958878794b1030d11e569392a2e08724a13f277560071f366e3`. Baseline code: main 58bb68bb9eeb91bc1da7b27e8a5656e3bef54744. Both versions use the same 4,429 captured sport-feed candidates and the same captured odds responses. This isolates mapping changes from price changes. These are research replay counts, not a promise of future coverage or a replacement of the saved production snapshot.

| Metric | Before | After | Gain |
|---|---:|---:|---:|
| Confirmed Flashscore event groups | 81 | 170 | 89 |
| bookmaker_outcomes | 748 | 2116 | 1368 |
| betfair_matched | 218 | 610 | 392 |

No previously matched outcome lost its bookmaker or Betfair match. All 170 unique event requests succeeded; requests were sequential with a two-second pause. Odds were captured once per event and reused for every outcome and both comparison versions.

## Changes

154 literal team aliases, each restricted to one of 19 reviewed competitions. The fixture records 89 newly confirmed source/feed pairs with URLs, participant IDs, UTC times and original sport-feed evidence. Expanded football links cover MLS/USL, Latin American leagues, Korea, Spain, the Netherlands, Portugal and Morocco; American sports include NCAA, NFL and WNBA. Existing competition, sport, opponent, scope and five-minute start checks are unchanged. Soccer home/away order is still strict; US sports use explicit participant order mapping. No fuzzy matching or global stripping of age/gender suffixes.

NFL adds moneyline, match totals/spreads and first-half totals/spreads. Full games require FULL_TIME_OVER_TIME; first halves require FIRST_HALF. Totals/handicaps require half-unit lines, exact selected teams and consistent signed lines. Reversing title order never reverses the selected team's handicap. Five factual odds fixtures retain the corresponding Polymarket resolution descriptions. These comparisons concern normal completed-game selections; cancellation/tie settlement can differ between providers and is not asserted to be identical.

NFL gains: 5 moneylines (all Betfair), 340 match totals, 168 match handicaps, 19 first-half totals and 81 first-half handicaps. The available feed did not provide matching Betfair totals/handicap selections for these rows; other bookmakers are never relabelled Betfair. WNBA gains event links only, without unproven basketball quote mapping.

## Remaining gaps

93 event groups remain unconfirmed:

- Participants not confirmed in sport feeds: 86
- Scheduled start differs by more than 5 minutes: 5
- Competition not confirmed: 2

Corners, team totals and unproven periods/units remain unmatched. A confirmed event URL does not imply every market or a Betfair price is available. No new baseball/tennis rules were needed for this snapshot.

## Verification and rollout

38 tests pass, including all 89 literal identities, wrong opponent/competition/age/time/scope, ambiguity, five NFL market types, period/units/sign errors, reversed participant order, source conservation and one-pass reuse. A full captured-response replay is validated against all 5,902 original source rows. Scanner, eligibility, architecture, schedule and provider request implementation are unchanged. Production adopts new mappings on the next new scanner snapshot; maintenance reuses existing saved odds without a second collection.

## Market-type breakdown (all types, including unchanged/unmatched)

| Type | Source outcomes | Bookmakers before | After | Betfair before | After |
|---|---:|---:|---:|---:|---:|
| american-football / first_half_spreads / handicap | 233 | 8 | 92 | 0 | 0 |
| american-football / first_half_totals / totals | 50 | 5 | 26 | 0 | 0 |
| american-football / moneyline / winner | 39 | 13 | 23 | 13 | 23 |
| american-football / second_half_spreads / handicap | 188 | 0 | 0 | 0 | 0 |
| american-football / second_half_totals / totals | 16 | 0 | 0 | 0 | 0 |
| american-football / spreads / handicap | 992 | 66 | 251 | 0 | 0 |
| american-football / team_totals / team_totals | 158 | 0 | 0 | 0 | 0 |
| american-football / totals / totals | 851 | 265 | 716 | 0 | 0 |
| baseball / baseball_game_extra_innings / extra_innings | 7 | 0 | 0 | 0 | 0 |
| baseball / baseball_player_strikeouts / player_strikeouts | 24 | 0 | 0 | 0 | 0 |
| baseball / baseball_player_total_bases / player_total_bases | 34 | 0 | 0 | 0 | 0 |
| baseball / baseball_team_first_five_spread / handicap | 10 | 0 | 0 | 0 | 0 |
| baseball / baseball_team_first_five_total / totals | 17 | 0 | 0 | 0 | 0 |
| baseball / baseball_team_first_five_winner / winner | 10 | 0 | 0 | 0 | 0 |
| baseball / baseball_team_inning1_winner / winner | 14 | 0 | 0 | 0 | 0 |
| baseball / baseball_team_inning2_winner / winner | 11 | 0 | 0 | 0 | 0 |
| baseball / baseball_team_inning3_winner / winner | 12 | 0 | 0 | 0 | 0 |
| baseball / baseball_team_inning4_winner / winner | 12 | 0 | 0 | 0 | 0 |
| baseball / baseball_team_inning5_winner / winner | 12 | 0 | 0 | 0 | 0 |
| baseball / baseball_team_inning6_winner / winner | 12 | 0 | 0 | 0 | 0 |
| baseball / baseball_team_inning7_winner / winner | 12 | 0 | 0 | 0 | 0 |
| baseball / baseball_team_inning8_winner / winner | 12 | 0 | 0 | 0 | 0 |
| baseball / baseball_team_inning9_winner / winner | 2 | 0 | 0 | 0 | 0 |
| baseball / map_handicap / maps_handicap | 1 | 0 | 0 | 0 | 0 |
| baseball / moneyline / winner | 4 | 3 | 3 | 3 | 3 |
| baseball / spreads / handicap | 19 | 18 | 18 | 0 | 0 |
| baseball / team_totals / team_totals | 24 | 0 | 0 | 0 | 0 |
| baseball / totals / totals | 5 | 1 | 1 | 0 | 0 |
| basketball / moneyline / winner | 3 | 0 | 0 | 0 | 0 |
| cricket / moneyline / winner | 8 | 0 | 0 | 0 | 0 |
| esports / child_moneyline / winner | 13 | 0 | 0 | 0 | 0 |
| esports / map_handicap / maps_handicap | 4 | 0 | 0 | 0 | 0 |
| esports / moneyline / winner | 18 | 0 | 0 | 0 | 0 |
| esports / round_handicap_game_1 / rounds_handicap | 1 | 0 | 0 | 0 | 0 |
| esports / totals / maps_totals | 13 | 0 | 0 | 0 | 0 |
| mma / moneyline / winner | 1 | 0 | 0 | 0 | 0 |
| mma / totals / rounds_totals | 1 | 0 | 0 | 0 | 0 |
| mma / ufc_go_the_distance / distance | 1 | 0 | 0 | 0 | 0 |
| soccer / both_teams_to_score / both_score | 11 | 6 | 10 | 6 | 10 |
| soccer / both_teams_to_score_first_half / both_score | 63 | 21 | 49 | 0 | 0 |
| soccer / both_teams_to_score_second_half / both_score | 17 | 6 | 13 | 0 | 0 |
| soccer / first_half_spreads / handicap | 20 | 0 | 0 | 0 | 0 |
| soccer / first_half_totals / totals | 270 | 67 | 190 | 65 | 183 |
| soccer / moneyline / winner | 244 | 9 | 12 | 9 | 12 |
| soccer / second_half_spreads / handicap | 2 | 0 | 0 | 0 | 0 |
| soccer / second_half_totals / totals | 48 | 13 | 43 | 0 | 0 |
| soccer / soccer_first_half_first_to_score / first_score | 49 | 0 | 0 | 0 | 0 |
| soccer / soccer_first_half_team_totals / team_totals | 172 | 0 | 0 | 0 | 0 |
| soccer / soccer_first_half_total_corners / corners_totals | 28 | 0 | 0 | 0 | 0 |
| soccer / soccer_first_to_score / first_score | 79 | 0 | 0 | 0 | 0 |
| soccer / soccer_halftime_result / winner | 176 | 2 | 2 | 2 | 2 |
| soccer / soccer_second_half_first_to_score / first_score | 20 | 0 | 0 | 0 | 0 |
| soccer / soccer_second_half_result / winner | 29 | 0 | 0 | 0 | 0 |
| soccer / soccer_second_half_team_totals / team_totals | 22 | 0 | 0 | 0 | 0 |
| soccer / soccer_second_half_total_corners / corners_totals | 26 | 0 | 0 | 0 | 0 |
| soccer / soccer_team_total_corners / corners_team_totals | 12 | 0 | 0 | 0 | 0 |
| soccer / soccer_team_totals / team_totals | 498 | 0 | 0 | 0 | 0 |
| soccer / spreads / handicap | 542 | 67 | 215 | 0 | 0 |
| soccer / total_corners / corners_totals | 38 | 0 | 0 | 0 | 0 |
| soccer / totals / totals | 632 | 133 | 407 | 112 | 369 |
| tennis / moneyline / winner | 10 | 9 | 9 | 3 | 3 |
| tennis / tennis_first_set_totals / games_totals | 20 | 14 | 14 | 0 | 0 |
| tennis / tennis_first_set_winner / winner | 6 | 5 | 5 | 2 | 2 |
| tennis / tennis_set_handicap / sets_handicap | 15 | 13 | 13 | 0 | 0 |
| tennis / tennis_set_totals / sets_totals | 6 | 1 | 1 | 0 | 0 |
| tennis / tennis_set_winner / winner | 3 | 3 | 3 | 3 | 3 |

## League breakdown

| Type | Source outcomes | Bookmakers before | After | Betfair before | After |
|---|---:|---:|---:|---:|---:|
| american-football / cfb | 1194 | 357 | 495 | 13 | 18 |
| american-football / nfl | 1333 | 0 | 613 | 0 | 5 |
| baseball / mlb | 249 | 22 | 22 | 3 | 3 |
| baseball / mlbb | 5 | 0 | 0 | 0 | 0 |
| basketball / wnba | 3 | 0 | 0 | 0 | 0 |
| cricket / crickcct20 | 1 | 0 | 0 | 0 | 0 |
| cricket / crint | 7 | 0 | 0 | 0 | 0 |
| esports / cs2 | 20 | 0 | 0 | 0 | 0 |
| esports / dota2 | 1 | 0 | 0 | 0 | 0 |
| esports / hok | 1 | 0 | 0 | 0 | 0 |
| esports / lol | 15 | 0 | 0 | 0 | 0 |
| esports / r6siege | 7 | 0 | 0 | 0 | 0 |
| esports / val | 5 | 0 | 0 | 0 | 0 |
| mma / ufc | 3 | 0 | 0 | 0 | 0 |
| soccer / argcopa | 16 | 0 | 9 | 0 | 6 |
| soccer / argpn | 218 | 0 | 77 | 0 | 47 |
| soccer / bra2 | 96 | 0 | 0 | 0 | 0 |
| soccer / bra3 | 40 | 0 | 0 | 0 | 0 |
| soccer / canpl | 44 | 9 | 22 | 4 | 13 |
| soccer / chi2 | 13 | 0 | 0 | 0 | 0 |
| soccer / col1 | 119 | 0 | 48 | 0 | 29 |
| soccer / col2 | 49 | 0 | 24 | 0 | 17 |
| soccer / conl | 77 | 37 | 47 | 20 | 27 |
| soccer / es2 | 172 | 0 | 63 | 0 | 38 |
| soccer / fif | 176 | 58 | 58 | 37 | 37 |
| soccer / gtm | 73 | 0 | 42 | 0 | 35 |
| soccer / idn2 | 3 | 0 | 0 | 0 | 0 |
| soccer / kor | 39 | 0 | 11 | 0 | 5 |
| soccer / mar1 | 47 | 0 | 17 | 0 | 11 |
| soccer / mex | 242 | 0 | 83 | 0 | 46 |
| soccer / mls | 658 | 96 | 185 | 54 | 104 |
| soccer / ned2 | 32 | 0 | 15 | 0 | 9 |
| soccer / nwsl | 72 | 0 | 0 | 0 | 0 |
| soccer / ptc | 6 | 0 | 4 | 0 | 4 |
| soccer / u20wwc | 20 | 10 | 10 | 6 | 6 |
| soccer / unl | 227 | 93 | 93 | 62 | 62 |
| soccer / uru1 | 119 | 0 | 0 | 0 | 0 |
| soccer / usl1 | 57 | 9 | 29 | 6 | 19 |
| soccer / uslc | 259 | 12 | 104 | 5 | 61 |
| soccer / wsl | 124 | 0 | 0 | 0 | 0 |
| tennis / atp | 27 | 22 | 22 | 8 | 8 |
| tennis / itf | 26 | 19 | 19 | 0 | 0 |
| tennis / wta | 7 | 4 | 4 | 0 | 0 |
