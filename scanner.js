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


/* =========================================================
   HELPERS
========================================================= */

function parseArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      return Array.isArray(parsed)
        ? parsed
        : [];
    } catch {
      return [];
    }
  }

  return [];
}


function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/[-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


async function fetchJson(url, attempts = 5) {
  let lastError;

  for (
    let attempt = 1;
    attempt <= attempts;
    attempt++
  ) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "market-snapshot-scanner/2.0",

          Accept:
            "application/json",
        },
      });

      if (response.ok) {
        return await response.json();
      }

      const text =
        await response.text();

      lastError =
        new Error(
          `HTTP ${response.status}: ${text.slice(0, 500)}`
        );

      // 4xx кроме 429 повторять бессмысленно
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
      await sleep(
        1000 *
        Math.pow(2, attempt - 1)
      );
    }
  }

  throw lastError;
}


/* =========================================================
   SPORT CLASSIFICATION
========================================================= */

function classifySport(market, event = {}) {
  const marketTags =
    (market.tags || [])
      .map((tag) =>
        `${tag?.slug || ""} ${tag?.label || ""}`
      )
      .join(" ");

  const eventTags =
    (event.tags || [])
      .map((tag) =>
        `${tag?.slug || ""} ${tag?.label || ""}`
      )
      .join(" ");

  const series =
    (event.series || [])
      .map((item) =>
        `${item?.slug || ""} ${item?.title || ""}`
      )
      .join(" ");

  const text =
    normalizeText([
      market.sportsMarketType,
      market.category,
      market.slug,
      market.groupItemTitle,

      event.title,
      event.slug,

      market.question,

      marketTags,
      eventTags,
      series,
    ].join(" "));


  /*
   * ВАЖНО:
   * более специфичные виды спорта идут раньше
   * общих, чтобы table tennis не стал tennis,
   * а NFL не попал в soccer.
   */


  // TABLE TENNIS
  if (
    text.includes("table tennis") ||
    text.includes("ping pong")
  ) {
    return "table-tennis";
  }


  // AMERICAN FOOTBALL
  if (
    /\bnfl\b/.test(text) ||
    /\bncaaf\b/.test(text) ||
    /\bcfb\b/.test(text) ||
    text.includes("american football") ||
    text.includes("college football") ||
    text.includes("ncaa football")
  ) {
    return "american-football";
  }


  // BASKETBALL
  if (
    /\bnba\b/.test(text) ||
    /\bwnba\b/.test(text) ||
    /\bncaab\b/.test(text) ||
    text.includes("basketball") ||
    text.includes("euroleague") ||
    text.includes("eurocup") ||
    text.includes("fiba")
  ) {
    return "basketball";
  }


  // ICE HOCKEY
  if (
    /\bnhl\b/.test(text) ||
    /\bkhl\b/.test(text) ||
    /\bahl\b/.test(text) ||
    text.includes("ice hockey") ||
    text.includes("hockey")
  ) {
    return "hockey";
  }


  // BASEBALL
  if (
    /\bmlb\b/.test(text) ||
    /\bnpb\b/.test(text) ||
    /\bkbo\b/.test(text) ||
    text.includes("baseball")
  ) {
    return "baseball";
  }


  // ESPORTS
  if (
    text.includes("esports") ||
    text.includes("esport") ||
    text.includes("counter strike") ||
    text.includes("counter-strike") ||
    /\bcs2\b/.test(text) ||
    /\bcsgo\b/.test(text) ||
    text.includes("dota 2") ||
    text.includes("dota2") ||
    text.includes("league of legends") ||
    text.includes("valorant") ||
    text.includes("rainbow six") ||
    text.includes("rocket league") ||
    text.includes("overwatch")
  ) {
    return "esports";
  }


  // MMA
  if (
    /\bufc\b/.test(text) ||
    text.includes("mixed martial arts") ||
    /\bmma\b/.test(text) ||
    text.includes("bellator") ||
    text.includes("professional fighters league")
  ) {
    return "mma";
  }


  // BOXING
  if (
    text.includes("boxing")
  ) {
    return "boxing";
  }


  // TENNIS
  if (
    text.includes("tennis") ||
    /\batp\b/.test(text) ||
    /\bwta\b/.test(text) ||
    text.includes("wimbledon") ||
    text.includes("roland garros") ||
    text.includes("french open") ||
    text.includes("australian open") ||
    text.includes("us open tennis")
  ) {
    return "tennis";
  }


  // SOCCER / ASSOCIATION FOOTBALL
  if (
    text.includes("soccer") ||
    /\bufa\b/.test(text) ||
    text.includes("uefa") ||
    text.includes("fifa") ||
    text.includes("champions league") ||
    text.includes("europa league") ||
    text.includes("conference league") ||
    text.includes("premier league") ||
    text.includes("la liga") ||
    text.includes("bundesliga") ||
    text.includes("serie a") ||
    text.includes("ligue 1") ||
    text.includes("eredivisie") ||
    text.includes("copa libertadores") ||
    text.includes("copa sudamericana") ||
    /\bmls\b/.test(text) ||
    typeStartsWithSoccer(market)
  ) {
    return "soccer";
  }


  // VOLLEYBALL
  if (
    text.includes("volleyball")
  ) {
    return "volleyball";
  }


  // HANDBALL
  if (
    text.includes("handball")
  ) {
    return "handball";
  }


  // BADMINTON
  if (
    text.includes("badminton")
  ) {
    return "badminton";
  }


  // RUGBY
  if (
    text.includes("rugby") ||
    text.includes("six nations")
  ) {
    return "rugby";
  }


  // CRICKET
  if (
    text.includes("cricket") ||
    text.includes("indian premier league") ||
    /\bipl cricket\b/.test(text)
  ) {
    return "cricket";
  }


  // GOLF
  if (
    text.includes("golf") ||
    /\bpga\b/.test(text) ||
    text.includes("ryder cup")
  ) {
    return "golf";
  }


  // MOTORSPORT
  if (
    text.includes("formula 1") ||
    text.includes("formula one") ||
    /\bf1\b/.test(text) ||
    text.includes("motogp") ||
    text.includes("nascar") ||
    text.includes("indycar")
  ) {
    return "motorsport";
  }


  // DARTS
  if (
    text.includes("darts")
  ) {
    return "darts";
  }


  // SNOOKER
  if (
    text.includes("snooker")
  ) {
    return "snooker";
  }


  // CYCLING
  if (
    text.includes("cycling") ||
    text.includes("tour de france")
  ) {
    return "cycling";
  }


  // WRESTLING
  if (
    text.includes("wrestling") ||
    /\bwwe\b/.test(text)
  ) {
    return "wrestling";
  }


  return "other";
}


function typeStartsWithSoccer(market) {
  return normalizeText(
    market.sportsMarketType
  ).startsWith("soccer");
}


/* =========================================================
   MAIN SCANNER
========================================================= */

async function main() {
  const now =
    new Date();

  const snapshotAt =
    now.toISOString();

  const windowEnd =
    new Date(
      now.getTime() +
      WINDOW_DAYS *
      24 *
      60 *
      60 *
      1000
    );


  console.log(
    "Getting Polymarket sports tag..."
  );


  const sportsTag =
    await fetchJson(
      `${GAMMA}/tags/slug/sports`
    );


  if (!sportsTag?.id) {
    throw new Error(
      "Could not resolve sports tag"
    );
  }


  console.log(
    `Sports tag ID: ${sportsTag.id}`
  );


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

  const seenMarketIds =
    new Set();

  let cursor = null;


  for (
    let pageNumber = 0;
    pageNumber < MAX_PAGES;
    pageNumber++
  ) {

    const params =
      new URLSearchParams({
        limit:
          String(PAGE_SIZE),

        closed:
          "false",

        liquidity_num_min:
          String(MIN_LIQUIDITY),

        tag_id:
          String(sportsTag.id),

        related_tags:
          "true",
      });


    if (cursor) {
      params.set(
        "after_cursor",
        cursor
      );
    }


    const url =
      `${GAMMA}/markets/keyset?${params.toString()}`;


    const data =
      await fetchJson(url);


    const markets =
      Array.isArray(data?.markets)
        ? data.markets
        : [];


    stats.pages++;

    stats.scanned_markets +=
      markets.length;


    console.log(
      `Page ${stats.pages}: ` +
      `${markets.length} markets, ` +
      `total ${stats.scanned_markets}`
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


      /* ---------- DUPLICATES ---------- */

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


      /* ---------- ACTIVE ---------- */

      if (
        market.active !== true ||
        market.closed === true
      ) {
        stats.inactive_or_closed++;
        continue;
      }


      /*
       * ONLY PRE-MATCH.
       *
       * Мы специально НЕ используем endDate
       * как замену начала матча.
       */

      const startRaw =
        market.gameStartTime || null;


      if (!startRaw) {
        stats.no_game_start_time++;
        continue;
      }


      const gameStart =
        new Date(startRaw);


      if (
        Number.isNaN(
          gameStart.getTime()
        )
      ) {
        stats.no_game_start_time++;
        continue;
      }


      /* ---------- NO LIVE ---------- */

      if (gameStart <= now) {
        stats.already_started++;
        continue;
      }


      /* ---------- 7 DAYS ---------- */

      if (gameStart > windowEnd) {
        stats.after_7_days++;
        continue;
      }


      const event =
        market.events?.[0] || {};


      const sport =
        classifySport(
          market,
          event
        );


      const type =
        normalizeText(
          market.sportsMarketType
        );


      const question =
        normalizeText(
          market.question
        );


      const eventTitle =
        normalizeText(
          event.title
        );


      /* =====================================================
         EXACT SCORE FILTER
      ===================================================== */

      const isSoccerExactScore =
        sport === "soccer" &&
        (
          type ===
            "soccer exact score" ||

          type ===
            "soccer first half exact score" ||

          question.includes(
            "exact score"
          ) ||

          question.includes(
            "correct score"
          ) ||

          eventTitle.includes(
            "exact score"
          ) ||

          eventTitle.includes(
            "correct score"
          )
        );


      if (isSoccerExactScore) {
        stats.exact_score++;
        continue;
      }


      /* =====================================================
         OUTCOMES + PRICES
      ===================================================== */

      const outcomes =
        parseArray(
          market.outcomes
        );


      const prices =
        parseArray(
          market.outcomePrices
        ).map(Number);


      if (
        outcomes.length === 0 ||
        prices.length === 0 ||
        outcomes.length !==
          prices.length ||

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
       * LOW ODDS FILTER
       *
       * Если хотя бы одна сторона >= 0.96,
       * весь рынок исключается.
       *
       * 0.97 ~= decimal odds 1.03
       */

      if (
        prices.some(
          (price) =>
            price >= MAX_PRICE
        )
      ) {
        stats.low_odds_market++;
        continue;
      }


      /* =====================================================
         MARKET DATA
      ===================================================== */

      const liquidity =
        Number(
          market.liquidityNum ??
          market.liquidity ??
          0
        );


      const pricedOutcomes =
        outcomes.map(
          (outcome, index) => ({
            outcome,

            price:
              prices[index],

            decimal_odds:
              Number(
                (
                  1 /
                  prices[index]
                ).toFixed(3)
              ),
          })
        );


      /* =====================================================
         COMBO
      ===================================================== */

      const comboStatus =
        market.comboStatus ??
        null;


      const comboEligible =
        comboStatus ===
        "enabled";


      if (
        comboStatus ===
        "enabled"
      ) {
        stats.combo_enabled++;

      } else if (
        comboStatus ===
        "pending"
      ) {
        stats.combo_pending++;

      } else if (
        comboStatus ===
        "disabled"
      ) {
        stats.combo_disabled++;

      } else {
        stats.combo_unknown++;
      }


      /* =====================================================
         TAGS
      ===================================================== */

      const tags =
        (market.tags || [])
          .map((tag) => ({
            id:
              tag.id ?? null,

            slug:
              tag.slug ?? null,

            label:
              tag.label ?? null,
          }));


      /* =====================================================
         SAVE MARKET
      ===================================================== */

      kept.push({
        snapshot_at:
          snapshotAt,

        sport,

        event_id:
          event.id ?? null,

        event_title:
          event.title ?? null,

        event_slug:
          event.slug ?? null,

        market_id:
          market.id ?? null,

        market_slug:
          market.slug ?? null,

        condition_id:
          market.conditionId ??
          null,

        question:
          market.question ??
          null,

        group_item_title:
          market.groupItemTitle ??
          null,

        category:
          market.category ??
          null,

        market_type:
          market.sportsMarketType ??
          null,

        line:
          market.line ??
          null,

        game_id:
          market.gameId ??
          null,

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
          market.volume24hr ??
          null,

        best_bid:
          market.bestBid ??
          null,

        best_ask:
          market.bestAsk ??
          null,

        spread:
          market.spread ??
          null,

        accepting_orders:
          market.acceptingOrders ??
          null,

        order_book:
          market.enableOrderBook ??
          null,

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


    /* =====================================================
       PAGINATION
    ===================================================== */

    const nextCursor =
      data?.next_cursor ||
      null;


    if (
      !nextCursor ||
      nextCursor === cursor
    ) {
      cursor = null;
      break;
    }


    cursor =
      nextCursor;


    await sleep(
      PAGE_DELAY_MS
    );
  }


  if (cursor) {
    stats.truncated =
      true;
  }


  stats.kept_markets =
    kept.length;


  /* =========================================================
     SORT BY START TIME
  ========================================================= */

  kept.sort(
    (a, b) =>
      new Date(
        a.game_start_time
      ) -
      new Date(
        b.game_start_time
      )
  );


  /* =========================================================
     OUTPUT DIRECTORY
  ========================================================= */

  const outDir =
    path.join(
      process.cwd(),
      "out"
    );


  fs.mkdirSync(
    outDir,
    {
      recursive: true,
    }
  );


  /* =========================================================
     ALL MARKETS
  ========================================================= */

  const marketsJsonl =
    kept
      .map(
        (row) =>
          JSON.stringify(row)
      )
      .join("\n") +
    (
      kept.length
        ? "\n"
        : ""
    );


  fs.writeFileSync(
    path.join(
      outDir,
      "markets.jsonl"
    ),

    marketsJsonl,

    "utf8"
  );


  /* =========================================================
     COMBO MARKETS
  ========================================================= */

  const comboMarkets =
    kept.filter(
      (row) =>
        row.combo_eligible
    );


  fs.writeFileSync(
    path.join(
      outDir,
      "combo-markets.jsonl"
    ),

    comboMarkets
      .map(
        (row) =>
          JSON.stringify(row)
      )
      .join("\n") +
    (
      comboMarkets.length
        ? "\n"
        : ""
    ),

    "utf8"
  );


  /* =========================================================
     SPORT COUNTS
  ========================================================= */

  const bySport = {};


  for (const row of kept) {
    bySport[row.sport] =
      (
        bySport[row.sport] ||
        0
      ) + 1;
  }


  const sortedBySport =
    Object.fromEntries(
      Object.entries(bySport)
        .sort(
          (a, b) =>
            b[1] - a[1]
        )
    );


  /* =========================================================
     INDEX
  ========================================================= */

  const index = {
    snapshot_at:
      snapshotAt,

    window_end:
      windowEnd.toISOString(),

    filters: {
      pre_match_only:
        true,

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
      sortedBySport,
  };


  fs.writeFileSync(
    path.join(
      outDir,
      "index.json"
    ),

    JSON.stringify(
      index,
      null,
      2
    ),

    "utf8"
  );


  /* =========================================================
     CONSOLE RESULT
  ========================================================= */

  console.log("");

  console.log(
    "===== BET-X SCAN COMPLETE ====="
  );

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
    `Combo disabled: ${stats.combo_disabled}`
  );

  console.log(
    `Pages: ${stats.pages}`
  );

  console.log(
    `Truncated: ${stats.truncated}`
  );

  console.log("");

  console.log(
    "Markets by sport:"
  );

  for (
    const [sport, count]
    of Object.entries(
      sortedBySport
    )
  ) {
    console.log(
      `  ${sport}: ${count}`
    );
  }
}


/* =========================================================
   START
========================================================= */

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
