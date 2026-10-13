# Wide Combo — инструкция по чтению каталога

Это инструкция по чтению данных, а не источник прогнозов. Не подменяй недоступный файл поисковой выдачей и не придумывай вероятность, цену, итог или ссылку.

1. Открой [CHAT-START.md на GitHub](https://github.com/ollp898-glitch/67676767676767676767676767676OLP/blob/data/CHAT-START.md) или [raw CHAT-START.md](https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/CHAT-START.md).
2. Затем открой [candidates.csv на GitHub](https://github.com/ollp898-glitch/67676767676767676767676767676OLP/blob/data/wide-combo/candidates.csv) или [raw candidates.csv](https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/wide-combo/candidates.csv). Если файла нет, используй [slim.csv на GitHub](https://github.com/ollp898-glitch/67676767676767676767676767676OLP/blob/data/wide-combo/slim.csv) или [raw slim.csv](https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/wide-combo/slim.csv).
3. Если не открылись ни обычная, ни raw ссылка нужного файла, остановись и укажи обе точные ссылки и текст ошибки. Не объединяй строки разных снимков. Заголовки CSV `snapshot_at`, `snapshot_id`, `source_sha256` должны совпадать с исходным индексом.
4. Первая строка ответа: `snapshot_id`, `snapshot_at`, `source_sha256` из заголовка CSV. Ответ без неё недействителен.
