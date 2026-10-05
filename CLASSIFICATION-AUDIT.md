# Аудит классификации BET-X — 5 октября 2026

## Сравнение на неизменном исходном наборе

Источник: data commit `3e471145`, snapshot `2026-10-04T15:02:24.617Z`.
Было 1 561 неопознанных исхода / 1 403 рынка. Повторная классификация того же набора: **21 исход / 21 рынок** остаются в карантине; **1 540 исходов / 1 382 рынка** распознаны.

Остаток: American Football `exact_margin` — 10/10; `two_plus_touchdowns` — 11/11 (исходы/рынки). Это намеренно не продвигаемые узкие рынки. Noise-правила не менялись. Для 24 баскетбольных исходов Yes/No использованы дополнительно полученные из Gamma явные правила расчёта тех же market ID; цены и линии старого snapshot не заменялись. Без этих дополнительных описаний такие записи остаются unclassified.

Отдельная проверка более позднего snapshot `474ed67435f17d47dbc4a524fc7fc52d4ccd83eb` (`2026-10-04T21:03:39.500Z`): 628/572 → **13/11**; распознаны 615/561. Остаток — те же два узких типа. Разницу исходных объёмов между snapshot нельзя приписывать классификатору: изменились события и цены.

## Доказательства и ограничения

- Проверены все raw рынки двух snapshot, а не выборочные строки. Offline audit группирует sport, sportsMarketType, question/groupItemTitle, исходный и распознанный period, line и полную структуру outcomes, сохраняет market IDs.
- 53 реальные комбинации sport/type сохранены в `classification-fixtures.json`; каждая проверяется положительным тестом и отрицательными случаями: другой sport, scope, group title, line, дубли исходов, противоречие source fields.
- Yes/No → OVER/UNDER требует явной пары правил для этого игрока, статистики и линии. Проверяются также обратный порядок исходов, неверный игрок/порог/направление и отсутствие правил. Raw outcome/index/token/position и description сохраняются.
- Нормализация не означает равенство правил расчёта с БК: DNP, отмены и overtime остаются в source description. Fair probability и Flashscore matching не изменены.
- Motorsport распознаётся как NASCAR race winner только при согласовании вопроса, driver group, события, slug и бинарных исходов. Motorsport остаётся вне Combo по существующей политике. Esports сохраняет существующее исключение в Combo 2.0.
- В полном интеграционном тесте NFL player total, четвертная фора, half team total и доказанный basketball Yes/No проходят весь Scanner/Combo/validation; неоднозначный Yes/No остаётся в карантине и не попадает в Combo.

## Политики

Scanner: **2–28h, 45%–<95%, liquidity >= $20**.
Combo: **2–28h, 55%–<95%, liquidity >= $20, combo_verified=true**.
Правила noise/exact score, fair probability, Flashscore event matching и расписание workflow сохранены.

## Живой запуск

Полный набор тестов, реальный Scanner, validate-catalog и сборка/валидация Combo 2.0 выполнены в [ручном запуске](https://github.com/ollp898-glitch/67676767676767676767676767676OLP/actions/runs/37241839305), затем повторно в [плановом запуске 5 октября](https://github.com/ollp898-glitch/67676767676767676767676767676OLP/actions/runs/37290742196). Ниже — последний опубликованный snapshot планового запуска. Replay фиксированных snapshot отделён от свежих счётчиков; исходы и цены между сканированиями меняются.

## Распознанные типы на фиксированном baseline

| Sport | sportsMarketType | Рынки | Исходы |
|---|---|---:|---:|
| american-football | first_half_moneyline | 5 | 5 |
| american-football | first_half_team_totals | 78 | 90 |
| american-football | longest_reception | 19 | 19 |
| american-football | passing_attempts | 30 | 33 |
| american-football | passing_completions | 28 | 28 |
| american-football | passing_touchdowns | 34 | 36 |
| american-football | passing_yards | 78 | 87 |
| american-football | q1_both_teams_to_score_points | 5 | 5 |
| american-football | q1_moneyline | 5 | 6 |
| american-football | q1_spreads | 49 | 53 |
| american-football | q1_totals | 30 | 33 |
| american-football | q2_both_teams_to_score_points | 5 | 5 |
| american-football | q2_moneyline | 3 | 3 |
| american-football | q2_spreads | 52 | 57 |
| american-football | q2_totals | 30 | 37 |
| american-football | q3_both_teams_to_score_points | 5 | 7 |
| american-football | q3_moneyline | 1 | 1 |
| american-football | q3_spreads | 47 | 50 |
| american-football | q3_totals | 30 | 31 |
| american-football | q4_both_teams_to_score_points | 5 | 6 |
| american-football | q4_moneyline | 2 | 2 |
| american-football | q4_spreads | 53 | 55 |
| american-football | q4_totals | 30 | 34 |
| american-football | receiving_yards | 260 | 272 |
| american-football | receptions | 171 | 176 |
| american-football | rushing_yards | 136 | 141 |
| american-football | safety | 4 | 4 |
| american-football | second_half_team_totals | 80 | 91 |
| american-football | team_touchdowns | 11 | 14 |
| baseball | baseball_player_earned_runs_allowed | 3 | 6 |
| basketball | assists | 8 | 8 |
| basketball | basketball_odd_even | 2 | 4 |
| basketball | basketball_team_to_score_first | 2 | 4 |
| basketball | first_half_moneyline | 1 | 2 |
| basketball | points | 8 | 10 |
| basketball | q1_moneyline | 1 | 2 |
| basketball | q1_spreads | 1 | 2 |
| basketball | q2_moneyline | 1 | 2 |
| basketball | q2_spreads | 1 | 1 |
| basketball | q3_moneyline | 1 | 2 |
| basketball | q3_spreads | 1 | 1 |
| basketball | q4_moneyline | 1 | 2 |
| basketball | q4_spreads | 1 | 1 |
| basketball | rebounds | 6 | 6 |
| basketball | second_half_moneyline | 1 | 2 |
| esports | first_blood_game | 9 | 18 |
| esports | kill_over_under_game | 12 | 14 |
| motorsport | (отсутствует; NASCAR winner) | 36 | 72 |

При неизменных ценах/времени исторического snapshot классифицированный каталог увеличился бы с 6 467 до 8 007 исходов. Это replay, а не новый live snapshot. Историческую Combo-пригодность задним числом не приписываем: новые типы должны пройти реальную проверку каталога Combo в новом сканировании.

## Результат нового реального запуска

Snapshot: **2026-10-05T09:34:13.686Z**, data commit `9a394d66d7705223c28bbe5f76b185416de30228`.

| Показатель | Значение |
|---|---:|
| Markets | 4002 |
| Outcomes | 5237 |
| Events | 562 |
| Unclassified outcomes / markets | 9 / 9 |
| Combo outcomes | 2686 |
| Combo 2.0 outcomes | 2611 |
| С fair probability БК | 643 |
| Вновь классифицированные outcomes / markets | 325 / 289 |
| Из них прошли verified Combo | 256 |

Combo-каталог проверен полностью: `coverage_complete=true`, `requested_markets_found`, unresolved markets = 0. Unclassified в Combo = 0. Опубликованные строки повторно проверены локально: политики, canonical/raw outcome, исходный token/index, period/family. Поздние защитные уточнения (строгие числовые линии и legacy raw outcomes в объектной форме) не меняют классификацию этих опубликованных строк; весь локальный тестовый набор повторно пройден.

Conservation: **206 572** полученных markets = **4 002** классифицированных + **9** unclassified + **202 561** market rejects. Audit содержит **206 297** записей, включая **3 736** отдельных outcome rejects; они не прибавляются повторно к market rejects.

Публикация в `data` успешна, блокировки размером нет. `unclassified-outcomes.json` — **64 139 байт**; `markets.jsonl` — **21 022 473 байта**; `combo-markets.jsonl` — **12 045 783 байта**. Старый файл с 1 561 исходом — 9 314 881 байт; промежуточный с 628 исходами — 3 952 756 байт. Эти размеры относятся к разным окнам snapshot.

### Новые типы в свежем Scanner и Combo

| Sport / type | Рынки | Scanner исходы | Verified Combo исходы |
|---|---:|---:|---:|
| baseball / baseball_player_earned_runs_allowed | 3 | 3 | 3 |
| basketball / basketball_team_to_score_first | 5 | 10 | 0 |
| basketball / basketball_odd_even | 5 | 10 | 0 |
| basketball / first_half_moneyline | 5 | 10 | 0 |
| american-football / two_point_conversions | 1 | 1 | 1 |
| american-football / safety | 1 | 1 | 1 |
| american-football / team_touchdowns | 2 | 4 | 0 |
| american-football / first_half_team_totals | 16 | 18 | 14 |
| american-football / first_half_moneyline | 1 | 2 | 0 |
| american-football / second_half_team_totals | 16 | 22 | 10 |
| american-football / q1_moneyline | 1 | 2 | 0 |
| american-football / q1_both_teams_to_score_points | 1 | 1 | 1 |
| american-football / q1_totals | 6 | 7 | 5 |
| american-football / q1_spreads | 10 | 10 | 10 |
| american-football / q2_both_teams_to_score_points | 1 | 1 | 1 |
| american-football / q2_totals | 6 | 8 | 5 |
| american-football / q2_spreads | 10 | 10 | 10 |
| american-football / q3_both_teams_to_score_points | 1 | 1 | 1 |
| american-football / q3_totals | 6 | 6 | 6 |
| american-football / q3_spreads | 12 | 12 | 12 |
| american-football / q4_both_teams_to_score_points | 1 | 1 | 1 |
| american-football / q4_totals | 6 | 7 | 5 |
| american-football / q4_spreads | 12 | 12 | 12 |
| american-football / passing_completions | 2 | 2 | 2 |
| american-football / passing_touchdowns | 4 | 4 | 4 |
| american-football / passing_yards | 14 | 15 | 14 |
| american-football / receiving_yards | 61 | 61 | 61 |
| american-football / receptions | 41 | 44 | 39 |
| american-football / rushing_yards | 39 | 40 | 38 |

### Остаток unclassified в новом snapshot

| Sport / type / причина | Рынки | Исходы |
|---|---:|---:|
| american-football / exact_margin / intentionally_not_promoted_narrow_scoring_or_margin | 5 | 5 |
| american-football / two_plus_touchdowns / intentionally_not_promoted_narrow_scoring_or_margin | 4 | 4 |
