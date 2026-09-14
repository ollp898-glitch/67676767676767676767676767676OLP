const fs = require("fs");
const path = require("path");

const GAMMA = "https://gamma-api.polymarket.com";

const WINDOW_DAYS = 7;
const MIN_LIQUIDITY = 200;
const MAX_PRICE = 0.96;

const PAGE_SIZE = 100;
const MAX_PAGES = 1000;
const PAGE_DELAY_MS = 100;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function parseArray(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

async function fetchJson(url, attempts = 5) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "market-snapshot-scanner/1.0",
          Accept: "application/json",
        },
      });

      if (response.ok) {
        return await response.json();
      }

      const text = await response.text();

      lastError = new Error(
        `HTTP ${response.status}: ${text.slice(0, 500)}`
      );

      if (
        response.status !== 429 &&
        response.status < 500
      ) {
        throw lastError;
      }
    } catch (err) {
      lastError = err;
    }

    if (attempt < attempts) {
      await sleep(1000 * Math.pow(2, attempt - 1));
    }
  }

  throw lastError;
}

function classifySport(market) {
  const type = String(
    market.sportsMarketType || ""
  ).toLowerCase();

  const tags = (market.tags || [])
    .map((tag) =>
      String(tag.slug || tag.label || "").toLowerCase()
    );

  const text = `${type} ${tags.join(" ")}`;

  if (text.includes("soccer")) return "soccer";
  if (text.includes("tennis")) return "tennis";

  if (
    text.includes("american-football") ||
    text.includes("nfl")
  ) return "american-football";

  if (
    text.includes("basketball") ||
    text.includes("nba")
  ) return "basketball";

  if (
    text.includes("hockey") ||
    text.includes("nhl")
  ) return "hockey";

  if (
    text.includes("baseball") ||
    text.includes("mlb")
  ) return "baseball";

  if (
    text.includes("mma") ||
    text.includes("ufc")
  ) return "mma";

  if (
    text.includes("esports") ||
    text.includes("cs2") ||
    text.includes("league-of-legends") ||
    text.includes("dota")
  ) return "esports";

  return "other";
}

async function main() {
  const now = new Date();

  const windowEnd = new Date(
    now.getTime() +
      WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  console.log("Getting sports tag...");

  const sportsTag = await fetchJson(
    `${GAMMA}/tags/slug/sports`
  );

  if (!sportsTag?.id) {
    throw new Error("Could not resolve sports tag");
  }

  console.log(`Sports tag ID: ${sportsTag.id}`);

  const stats = {
    pages: 0,
    scanned_markets: 0,

    duplicates: 0,
    inactive_or_closed: 0,

    no_game_start_time: 0,
    already_started: 0,
    after_7_days: 0,

    exact_score: 0,
    low_odds_market: 0,
    invalid_prices: 0,

    kept_markets: 0,

    combo_enabled: 0,
    combo_pending: 0,
    combo_disabled: 0,
    combo_unknown: 0,

    truncated: false,
  };

  const kept = [];
  const seenMarketIds = new Set();

  let cursor = null;

  for (
    let pageNumber = 0;
    pageNumber < MAX_PAGES;
    pageNumber++
  ) {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      closed: "false",

      // Наш hard-filter по ликвидности.
      liquidity_num_min: String(MIN_LIQUIDITY),

      tag_id: String(sportsTag.id),
      related_tags: "true",
    });

    if (cursor) {
      params.set("after_cursor", cursor);
    }

    const url =
      `${GAMMA}/markets/keyset?${params.toString()}`;

    const data = await fetchJson(url);

    const markets = Array.isArray(data?.markets)
      ? data.markets
      : [];

    stats.pages++;
    stats.scanned_markets += markets.length;

    console.log(
      `Page ${stats.pages}: ${markets.length} markets, total ${stats.scanned_markets}`
    );

    if (markets.length === 0) {
      cursor = null;
      break;
    }

    for (const market of markets) {
      const marketId =
        market.id != null
          ? String(market.id)
          : null;

      if (
        marketId &&
        seenMarketIds.has(marketId)
      ) {
        stats.duplicates++;
        continue;
      }

      if (marketId) {
        seenMarketIds.add(marketId);
      }

      if (
        market.active !== true ||
        market.closed === true
      ) {
        stats.inactive_or_closed++;
        continue;
      }

      /*
       * КРИТИЧЕСКОЕ ПРАВИЛО:
       * live нам вообще не нужен.
       *
       * Поэтому используем именно gameStartTime.
       * Если Polymarket не дал время начала игры,
       * рынок НЕ угадываем по endDate — просто пропускаем.
       */
      const startRaw =
        market.gameStartTime || null;

      if (!startRaw) {
        stats.no_game_start_time++;
        continue;
      }

      const gameStart = new Date(startRaw);

      if (Number.isNaN(gameStart.getTime())) {
        stats.no_game_start_time++;
        continue;
      }

      if (gameStart <= now) {
        stats.already_started++;
        continue;
      }

      if (gameStart > windowEnd) {
        stats.after_7_days++;
        continue;
      }

      const type = String(
        market.sportsMarketType || ""
      ).toLowerCase();

      const question = String(
        market.question || ""
      ).toLowerCase();

      const event =
        market.events?.[0] || {};

      const eventTitle = String(
        event.title || ""
      ).toLowerCase();

      const tags = (market.tags || [])
        .map((tag) => ({
          id: tag.id ?? null,
          slug: tag.slug ?? null,
          label: tag.label ?? null,
        }));

      const tagText = tags
        .map((tag) =>
          `${tag.slug || ""} ${tag.label || ""}`
        )
        .join(" ")
        .toLowerCase();

      const isSoccer =
        type.startsWith("soccer_") ||
        tagText.includes("soccer");

      /*
       * Удаляем literal exact/correct score
       * именно в футболе.
       *
       * Tennis 2:0 / 2:1,
       * CS 2:0 / 2:1,
       * Volleyball 3:1
       * этим фильтром НЕ удаляются.
       */
      const isSoccerExactScore =
        type === "soccer_exact_score" ||
        type === "soccer_first_half_exact_score" ||
        (
          isSoccer &&
          (
            question.includes("exact score") ||
            question.includes("correct score") ||
            eventTitle.includes("exact score") ||
            eventTitle.includes("correct score")
          )
        );

      if (isSoccerExactScore) {
        stats.exact_score++;
        continue;
      }

      const outcomes =
        parseArray(market.outcomes);

      const prices =
        parseArray(market.outcomePrices)
          .map(Number);

      if (
        outcomes.length === 0 ||
        prices.length === 0 ||
        outcomes.length !== prices.length ||
        prices.some(
          (price) =>
            !Number.isFinite(price) ||
            price <= 0 ||
            price >= 1
        )
      ) {
        stats.invalid_prices++;
        continue;
      }

      /*
       * Наше правило "4 процентных пункта".
       *
       * Если хотя бы одна сторона стоит >= 0.96,
       * весь рынок исключаем.
       *
       * Например 0.97 ≈ decimal odds 1.03.
       */
      if (
        prices.some(
          (price) => price >= MAX_PRICE
        )
      ) {
        stats.low_odds_market++;
        continue;
      }

      const liquidity = Number(
        market.liquidityNum ??
        market.liquidity ??
        0
      );

      const pricedOutcomes =
        outcomes.map(
          (outcome, index) => ({
            outcome,
            price: prices[index],
            decimal_odds: Number(
              (1 / prices[index]).toFixed(3)
            ),
          })
        );

      /*
       * Combo.
       *
       * Polymarket возвращает comboStatus.
       * Для нас enabled = можно использовать
       * как кандидат для Combo.
       */
      const comboStatus =
        market.comboStatus ?? null;

      const comboEligible =
        comboStatus === "enabled";

      if (comboStatus === "enabled") {
        stats.combo_enabled++;
      } else if (comboStatus === "pending") {
        stats.combo_pending++;
      } else if (comboStatus === "disabled") {
        stats.combo_disabled++;
      } else {
        stats.combo_unknown++;
      }

      kept.push({
        snapshot_at: now.toISOString(),

        sport: classifySport(market),

        event_id: event.id ?? null,
        event_title: event.title ?? null,
        event_slug: event.slug ?? null,

        market_id: market.id ?? null,
        condition_id:
          market.conditionId ?? null,

        question:
          market.question ?? null,

        market_type:
          market.sportsMarketType ?? null,

        line:
          market.line ?? null,

        game_id:
          market.gameId ?? null,

        game_start_time:
          gameStart.toISOString(),

        outcomes:
          pricedOutcomes,

        liquidity,

        volume:
          market.volumeNum ??
          market.volume ??
          null,

        volume_24h:
          market.volume24hr ?? null,

        best_bid:
          market.bestBid ?? null,

        best_ask:
          market.bestAsk ?? null,

        spread:
          market.spread ?? null,

        accepting_orders:
          market.acceptingOrders ?? null,

        order_book:
          market.enableOrderBook ?? null,

        clob_token_ids:
          parseArray(
            market.clobTokenIds
          ),

        position_ids:
          parseArray(
            market.positionIds
          ),

        combo_status:
          comboStatus,

        combo_eligible:
          comboEligible,

        tags,
      });
    }

    const nextCursor =
      data?.next_cursor || null;

    if (
      !nextCursor ||
      nextCursor === cursor
    ) {
      cursor = null;
      break;
    }

    cursor = nextCursor;

    // Специально не долбим API максимально быстро.
    await sleep(PAGE_DELAY_MS);
  }

  if (cursor) {
    stats.truncated = true;
  }

  stats.kept_markets = kept.length;

  kept.sort(
    (a, b) =>
      new Date(a.game_start_time) -
      new Date(b.game_start_time)
  );

  const outDir =
    path.join(process.cwd(), "out");

  fs.mkdirSync(outDir, {
    recursive: true,
  });

  const marketsJsonl =
    kept
      .map((row) => JSON.stringify(row))
      .join("\n") +
    (kept.length ? "\n" : "");

  fs.writeFileSync(
    path.join(outDir, "markets.jsonl"),
    marketsJsonl,
    "utf8"
  );

  const comboMarkets =
    kept.filter(
      (row) => row.combo_eligible
    );

  fs.writeFileSync(
    path.join(outDir, "combo-markets.jsonl"),
    comboMarkets
      .map((row) => JSON.stringify(row))
      .join("\n") +
      (comboMarkets.length ? "\n" : ""),
    "utf8"
  );

  const bySport = {};

  for (const row of kept) {
    bySport[row.sport] =
      (bySport[row.sport] || 0) + 1;
  }

  const index = {
    snapshot_at:
      now.toISOString(),

    window_end:
      windowEnd.toISOString(),

    filters: {
      pre_match_only: true,
      window_days:
        WINDOW_DAYS,

      min_liquidity_usd:
        MIN_LIQUIDITY,

      exclude_price_gte:
        MAX_PRICE,

      exclude_soccer_exact_score:
        true,
    },

    stats,

    markets:
      kept.length,

    combo_markets:
      comboMarkets.length,

    by_sport:
      bySport,
  };

  fs.writeFileSync(
    path.join(outDir, "index.json"),
    JSON.stringify(index, null, 2),
    "utf8"
  );

  console.log("");
  console.log("===== BET-X SCAN COMPLETE =====");
  console.log(
    `Scanned markets: ${stats.scanned_markets}`
  );
  console.log(
    `Kept markets: ${stats.kept_markets}`
  );
  console.log(
    `Combo enabled: ${stats.combo_enabled}`
  );
  console.log(
    `Pages: ${stats.pages}`
  );
  console.log(
    `Truncated: ${stats.truncated}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
