# BET-X sports scanner

The scanner collects active sports markets from Polymarket Gamma, checks the CLOB book for each outcome priced from 0.05 through 0.95, and publishes outcomes with a valid Ask. The start window is 1–28 hours, inclusive. Liquidity, spread, sport and market type do not exclude an outcome. Unknown market types remain in the catalog as `unclassified`.

The Combo catalog is checked independently for every active market in the time window. `combo_status` describes the exact outcome mapping; `event_combo_status` includes the event's markets even when none of their outcomes pass the price or Ask checks. An `available` status confirms catalog availability, not an executable multi-leg quote. API errors and incomplete Combo coverage result in `unknown` and do not block a valid CLOB snapshot.

The `data` branch contains:

- `markets.jsonl`: one saved outcome per line, with event, market, token, original line and price, CLOB book, classification and Combo status.
- `excluded.jsonl`: compact market and outcome rejection records, including unverified books and API errors.
- `index.json`: counts, timestamps, policy and verification coverage.
- `publication-manifest.json`: file sizes and SHA-256 checksums. Files above GitHub's 100 MiB limit are stored in parts below 80 MiB and can be reconstructed with `download-snapshot.js`.

Node.js 20 or newer:

```sh
node catalog.test.js
node scanner.integration.test.js
node snapshot-publication.test.js
node scanner.js
node validate-catalog.js out
```

The scheduled workflow runs at 09:17 and 17:17 UTC. A failed scan or validation leaves the previous `data` branch snapshot in place. Google Sheets integration is not yet included.

## Google Sheets — TEST LAB synchronization

The scanner's ordinary `markets.jsonl`, `excluded.jsonl` and `index.json` stay unchanged. After the validated snapshot is published, an optional step generates `data/sheets.json`: a compact, 27-column copy of the same saved outcome rows. Failure of this optional export **never blocks the scanner**. This is a transport view for Google Sheets, not an extra source of truth.

One-time TEST LAB setup: open the Google Sheet, go to Extensions > Apps Script, replace the starter code with `google-sheets/BETX_TEST_SYNC.gs`, save, and run `installBETXSync`. Approve Google's requested permissions. This immediately synchronizes DATA and creates an hourly trigger. SEARCH and PICKS are preserved. The source snapshot time and sync status are shown in SEARCH!B14. Use the menu BET-X > Обновить исходы to refresh manually. Do not install the TEST LAB script on the production sheet until testing is complete.

GitHub may publish `sheets.json` a few moments after `markets.jsonl`; until then the existing TEST data remains available. Google Scripts do not guarantee minute-exact trigger timing.
