# BET-X — вход для чтения сканера

Снимок: 2026-10-15T20:22:15.669Z. ID: 329d6a23b5889742945b.

Ordinary Scanner: 2–28h, 55%–<95%, liquidity >= $20. Combo: 2–28h, 55%–<95%, liquidity >= $20, combo_verified=true.

Все сохранённые исходы: **4349**. Отбор Combo 55%+: **3608**. Угловые в этом отборе: **94**.

Полнота проверки Combo: **подтверждена для запрошенного набора** (complete).

- [Неопознанные исходы — отдельный карантин](https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/unclassified-outcomes.json)
- [Сводка: количества и разбивка](https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/combo-summary.json)
- [Читать Combo 55%+ по спорту и типу рынка](https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/chat/329d6a23b5889742945b/combo/index.json)
- [Читать все сохранённые исходы](https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/chat/329d6a23b5889742945b/all/index.json)

## Как читать

Для количества используй числа выше или сводку; скачивать большой JSONL не нужно. Для списка выбери спорт, затем family и нужные страницы. Каждая страница содержит не более 8 исходов и ссылку на их полные записи. Никакие поля в полных записях не удалены.

Для угловых в soccer нужны обе группы: corners_totals и corners_team_totals. Итог группы указан в индексе; не считай только первую страницу.

Сверяй snapshot_at и snapshot_id между файлами. Если ссылка старого снимка вернула 404, заново открой эту стартовую страницу: данные обновились. Не смешивай снимки и не подменяй недоступный файл поисковой выдачей. При отказе инструмента укажи конкретную ссылку и ошибку.

## Границы данных

Combo — только подтверждённые отдельные исходы 55%–<95%, прошедшие правила стратегии, а не все рынки площадки. Снимок не является текущей ценой покупки; подтверждение отдельных исходов не означает совместимость экспресса.

## Wide Combo — каталог

[Правила чтения файлов](https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/wide-combo/PROMPT.md). Начни с этой страницы, затем открой candidates.csv или slim.csv из того же снимка.

## Combo Layer 2.0 Beta

[Open grouped Combo outcomes and external odds](https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/combo-2/index.json). External odds are collected once after each scanner update, with a two-second pause between event requests.

### Combo 2.0 — рейтинг исходов

[Открыть Combo 2.0](https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/combo-2/README.md) · [Читать отдельный рейтинг по market_edge_pp](https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/combo-2/rankings/market-edge/index.md). Сортировка по убыванию: медианная вероятность БК минус Polymarket. У каждого исхода — число БК, медианы и диапазон кэфов. Теннис и киберспорт исключены в обычном Combo strategy layer.
