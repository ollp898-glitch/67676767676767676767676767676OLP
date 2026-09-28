# Расширение распознавания Combo 2.0 — 28 сентября 2026

## Контрольное сравнение

Источник: `data@4f237199f07a40cb8dc53eeed6942afb8e6717cd`. До: `main@50dce42208507f88cd0247c5bef8191654e848dd`. Обе версии проверены на одинаковых сохранённых ответах реального Flashscore feed. Ответы собраны последовательно, по одному запросу на событие, с паузой 2 секунды. Это исследовательский replay, не повторное обновление опубликованного снимка.

Всего входных строк: 1763. В сравнении: **1691 исход**, **193 событий**. Исключены 72 киберспортивных исхода, включая 6 MLBB, ошибочно размеченных источником как baseball.

| Показатель | До | После |
|---|---:|---:|
| События с подтверждённым Flashscore ID | 67 | 112 |
| Исходы с реальными коэффициентами БК | 313 | 807 |
| Доля исходов с кэфами БК | 18.5% | 47.7% |

## Что добавлено

- Футбол: бинарные «Нет» на победу команды и ничью сопоставляются с **нативным DOUBLE_CHANCE**, отдельно для матча, первого и второго таймов. HOME ID = 1X, null = 12, AWAY ID = X2; значения подтверждены текущим интерфейсным контрактом Flashscore. Коэффициенты не вычисляются из соседних исходов.
- Футбол: явное «Neither team to score first?» означает 0:0 в основное время по правилам Polymarket. Только этот конкретный предикат сопоставляется с реальной линией голов 0.5: Yes → Under, No → Over. Обычная ставка «какая команда забьёт первой» не преобразуется. Исходное семейство и все поля Polymarket сохраняются. Сравнение относится к сыгранному матчу; правила отмены/void у платформ могут различаться.
- WNBA: победитель матча, включая овертайм; подтверждено на трёх исторических матчах с реальными ответами. Текущий снимок WNBA не содержит, поэтому эти три проверки не добавлены к приросту выше.
- События: 45 дополнительных точных подтверждений через проверенные имена команд/турниров: английская National League, Колумбия, CONCACAF, Czechia/Czech Republic, Eagles/Bears, Tokyo/Beijing с сохранением Qualification, MLB Wild Card.
- Защита от киберспорта теперь учитывает явные коды дисциплин, даже если поле sport ошибочно. Старый schema-3 снимок мигрирует из сохранённых кэфов, без повторных запросов и с прежними временами наблюдений.

Нечёткое сопоставление не используется. Допуск времени остаётся 5 минут. Квалификация, номер турнира, участники, период, единицы и знак форы проверяются отдельно.

## Разбивка по типам

Все числа — количество исходов, а не букмекеров или рынков.

| Спорт / market_type / family | Всего | До | После |
|---|---:|---:|---:|
| `american-football / first_half_spreads / handicap` | 22 | 0 | 1 |
| `american-football / first_half_totals / totals` | 3 | 0 | 2 |
| `american-football / second_half_totals / totals` | 1 | 0 | 0 |
| `american-football / spreads / handicap` | 27 | 0 | 13 |
| `american-football / team_totals / team_totals` | 16 | 0 | 0 |
| `american-football / totals / totals` | 32 | 0 | 28 |
| `baseball / baseball_game_extra_innings / extra_innings` | 2 | 0 | 0 |
| `baseball / baseball_team_first_five_spread / handicap` | 6 | 0 | 0 |
| `baseball / baseball_team_first_five_total / totals` | 12 | 0 | 0 |
| `baseball / baseball_team_first_five_winner / winner` | 7 | 0 | 0 |
| `baseball / spreads / handicap` | 12 | 0 | 5 |
| `baseball / team_totals / team_totals` | 6 | 0 | 0 |
| `baseball / totals / totals` | 1 | 0 | 1 |
| `cricket / moneyline / winner` | 2 | 0 | 0 |
| `mma / moneyline / winner` | 3 | 0 | 0 |
| `mma / ufc_go_the_distance / distance` | 1 | 0 | 0 |
| `mma / ufc_method_of_victory / victory_method` | 2 | 0 | 0 |
| `soccer / both_teams_to_score_first_half / both_score` | 32 | 15 | 29 |
| `soccer / both_teams_to_score_second_half / both_score` | 10 | 7 | 9 |
| `soccer / both_teams_to_score / both_score` | 2 | 1 | 2 |
| `soccer / first_half_totals / totals` | 118 | 53 | 90 |
| `soccer / moneyline / winner` | 93 | 6 | 77 |
| `soccer / second_half_totals / totals` | 6 | 5 | 6 |
| `soccer / soccer_first_half_team_totals / team_totals` | 86 | 0 | 0 |
| `soccer / soccer_first_half_total_corners / corners_totals` | 5 | 0 | 0 |
| `soccer / soccer_first_to_score / first_score` | 51 | 0 | 22 |
| `soccer / soccer_halftime_result / winner` | 59 | 2 | 51 |
| `soccer / soccer_second_half_result / winner` | 22 | 0 | 20 |
| `soccer / soccer_second_half_team_totals / team_totals` | 1 | 0 | 0 |
| `soccer / soccer_second_half_total_corners / corners_totals` | 1 | 0 | 0 |
| `soccer / soccer_team_total_corners / corners_team_totals` | 53 | 0 | 0 |
| `soccer / soccer_team_totals / team_totals` | 262 | 0 | 0 |
| `soccer / spreads / handicap` | 139 | 39 | 90 |
| `soccer / total_corners / corners_totals` | 54 | 0 | 0 |
| `soccer / totals / totals` | 212 | 77 | 171 |
| `tennis / moneyline / winner` | 102 | 25 | 38 |
| `tennis / tennis_completed_match / completed_match` | 1 | 0 | 0 |
| `tennis / tennis_first_set_totals / games_totals` | 62 | 20 | 46 |
| `tennis / tennis_first_set_winner / winner` | 44 | 19 | 30 |
| `tennis / tennis_match_totals / games_totals` | 10 | 2 | 9 |
| `tennis / tennis_set_handicap / sets_handicap` | 56 | 24 | 35 |
| `tennis / tennis_set_totals / sets_totals` | 30 | 8 | 13 |
| `tennis / tennis_set_winner / winner` | 25 | 10 | 19 |

## Что остаётся без подтверждения

- 304 исхода: событие не подтверждено (в том числе несовпадающее время, неполные имена парного тенниса, различие турнира/квалификации или отсутствие события в feed).
- 467 исходов: нет подтверждённой семантики рынка в полученном feed.
- 113 исходов: тип поддерживается, но нужная активная котировка/линия отсутствует.

Командные тоталы, угловые, первые пять иннингов, extra innings и большинство first-scorer props не подменяются обычными тоталами/победителями. В сохранённых ответах нет нужных подтверждённых котировок. MMA и парный теннис требуют отдельного доказанного контракта идентичности/семантики.

## Проверка и применение

- 48 тестов: реальные fixtures, двойной шанс с перемешанными элементами, пропуски/дубликаты ID, чужие команды и периоды, квалификация, WNBA overtime, миграция MLBB без сети.
- Полная сборка и валидация 1691 исхода из сохранённых ответов; повторная сборка того же снимка не делает внешних запросов.
- Scanner, его пороги и окно не изменены. Агрегаты и читаемый рейтинг остаются внутри Combo 2.0.
- Новые соответствия и кэфы применяются при следующем новом снимке сканера. Технический запуск для существующего снимка только удаляет ошибочно пропущенный киберспорт; кэфы не пересобираются.

Fixtures: [recognition-expansion.json](fixtures/recognition-expansion.json). Контракт двойного шанса: [официальный Flashscore bundle](https://static.flashscore.com/res/_fs/build/detail.df3aeb1.js). В fixture сохранены исходные вопросы, правила Gamma и фрагменты реальных odds responses.
