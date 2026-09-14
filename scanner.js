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

function csvIds(value) {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
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

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "market-snapshot-scanner/4.0",
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
      await sleep(
        1000 * Math.pow(2, attempt - 1)
      );
    }
  }

  throw lastError;
}

/* =========================================================
   TEXT FALLBACK
========================================================= */

function classifyText(textValue) {
  const text = normalizeText(textValue);

  if (text.includes("chess")) {
    return "chess";
  }

  if (
    /\bafl\b/.test(text) ||
    /\baflw\b/.test(text) ||
    text.includes("australian football") ||
    text.includes("australian rules")
  ) {
    return "australian-football";
  }

  if (
    text.includes("table tennis") ||
    text.includes("ping pong")
  ) {
    return "table-tennis";
  }

  if (
    /\bnfl\b/.test(text) ||
    /\bncaaf\b/.test(text) ||
    /\bcfb\b/.test(text) ||
    text.includes("american football") ||
    text.includes("college football")
  ) {
    return "american-football";
  }

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

  if (
    /\bnhl\b/.test(text) ||
    /\bkhl\b/.test(text) ||
    /\bahl\b/.test(text) ||
    text.includes("ice hockey") ||
    text.includes("hockey")
  ) {
    return "hockey";
  }

  if (
    /\bmlb\b/.test(text) ||
    /\bnpb\b/.test(text) ||
    /\bkbo\b/.test(text) ||
    text.includes("baseball")
  ) {
    return "baseball";
  }

  if (
    text.includes("esports") ||
    text.includes("esport") ||
    text.includes("counter strike") ||
    /\bcs2\b/.test(text) ||
    /\bcsgo\b/.test(text) ||
    text.includes("dota") ||
    text.includes("league of legends") ||
    text.includes("valorant") ||
    text.includes("rainbow six") ||
    text.includes("rocket league") ||
    text.includes("overwatch")
  ) {
    return "esports";
  }

  if (
    /\bufc\b/.test(text) ||
    /\bmma\b/.test(text) ||
    text.includes("mixed martial arts") ||
    text.includes("bellator") ||
    text.includes("professional fighters league")
  ) {
    return "mma";
  }

  if (text.includes("boxing")) {
    return "boxing";
  }

  if (
    text.includes("tennis") ||
    /\batp\b/.test(text) ||
    /\bwta\b/.test(text) ||
    text.includes("wimbledon") ||
    text.includes("roland garros") ||
    text.includes("french open") ||
    text.includes("australian open")
  ) {
    return "tennis";
  }

  if (
    text.includes("soccer") ||
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
    /\bmls\b/.test(text)
  ) {
    return "soccer";
  }

  if (
    text.includes("volleyball") ||
    /^vb[a-z0-9]/.test(text)
  ) {
    return "volleyball";
  }

  if (text.includes("handball")) {
    return "handball";
  }

  if (text.includes("badminton")) {
    return "badminton";
  }

  if (
    text.includes("rugby") ||
    text.includes("six nations")
  ) {
    return "rugby";
  }

  if (
    text.includes("cricket") ||
    /^cric[a-z0-9]/.test(text) ||
    text.includes("indian premier league")
  ) {
    return "cricket";
  }

  if (
    text.includes("golf") ||
    /\bpga\b/.test(text) ||
    text.includes("ryder cup") ||
    text.includes("korn ferry") ||
    text.includes("dp world tour")
  ) {
    return "golf";
  }

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

  if (text.includes("darts")) {
    return "darts";
  }

  if (text.includes("snooker")) {
    return "snooker";
  }

  if (
    text.includes("cycling") ||
    text.includes("tour de france")
  ) {
    return "cycling";
  }

  if (
    text.includes("wrestling") ||
    /\bwwe\b/.test(text)
  ) {
    return "wrestling";
  }

  return "other";
}

/* =========================================================
   SPORTS METADATA
========================================================= */

function classifyLeagueMeta(meta) {
  if (!meta) return "other";

  const code = normalizeText(meta.sport);
  const name = normalizeText(meta.name);
  const resolution = normalizeText(meta.resolution);

  const text =
    `${code} ${name} ${resolution}`;

  if (
    code === "chess" ||
    text.includes("chess")
  ) {
    return "chess";
  }

  if (
    code === "afl" ||
    code === "aflw" ||
    text.includes("australian football") ||
    text.includes("australian rules")
  ) {
    return "australian-football";
  }

  if (/^bk[a-z0-9]/.test(code)) {
    return "basketball";
  }

  if (/^cric[a-z0-9]/.test(code)) {
    return "cricket";
  }

  if (/^vb[a-z0-9]/.test(code)) {
    return "volleyball";
  }

  if (/^(atp|wta)/.test(code)) {
    return "tennis";
  }

  if (/^(nfl|ncaaf|cfb)/.test(code)) {
    return "american-football";
  }

  if (/^(mlb|npb|kbo)/.test(code)) {
    return "baseball";
  }

  if (/^(ufc|mma|pfl)/.test(code)) {
    return "mma";
  }

  return classifyText(text);
}

function buildSportsMetadataIndex(rows) {
  const bySeries = new Map();
  const byPrimaryTag = new Map();
  const tagVotes = new Map();

  for (
    const meta of
    Array.isArray(rows)
      ? rows
      : []
  ) {
    if (meta?.series != null) {
      bySeries.set(
        String(meta.series),
        meta
      );
    }

    if (meta?.primaryTagId != null) {
      byPrimaryTag.set(
        String(meta.primaryTagId),
        meta
      );
    }

    const sport =
      classifyLeagueMeta(meta);

    if (sport === "other") {
      continue;
    }

    for (
      const tagId
      of csvIds(meta.tags)
    ) {
      if (!tagVotes.has(tagId)) {
        tagVotes.set(
          tagId,
          new Map()
        );
      }

      const votes =
        tagVotes.get(tagId);

      votes.set(
        sport,
        (votes.get(sport) || 0) + 1
      );
    }
  }

  const broadTagToSport =
    new Map();

  for (
    const [tagId, votes]
    of tagVotes
  ) {
    const sorted =
      [...votes.entries()]
        .sort(
          (a, b) =>
            b[1] - a[1]
        );

    const total =
      sorted.reduce(
        (sum, [, n]) =>
          sum + n,
        0
      );

    const [
      winner,
      winnerCount
    ] =
      sorted[0] || [];

    if (
      winner &&
      total >= 2 &&
      winnerCount / total >= 0.95
    ) {
      broadTagToSport.set(
        tagId,
        winner
      );
    }
  }

  const known = {
    "28": "basketball",
    "517": "cricket",
    "100088": "hockey",
    "100219": "golf",
    "100350": "soccer",
    "102883": "volleyball",
  };

  for (
    const [tagId, sport]
    of Object.entries(known)
  ) {
    broadTagToSport.set(
      tagId,
      sport
    );
  }

  return {
    bySeries,
    byPrimaryTag,
    broadTagToSport,
  };
}

function resolveLeagueMeta(
  market,
  event,
  index
) {
  const series =
    Array.isArray(event?.series)
      ? event.series
      : [];

  for (
    const item
    of series
  ) {
    const id =
      item?.id != null
        ? String(item.id)
        : null;

    if (
      id &&
      index.bySeries.has(id)
    ) {
      return {
        meta:
          index.bySeries.get(id),

        source:
          "series",
      };
    }
  }

  const tags =
    Array.isArray(market?.tags)
      ? market.tags
      : [];

  for (
    const tag
    of tags
  ) {
    const id =
      tag?.id != null
        ? String(tag.id)
        : null;

    if (
      id &&
      index.byPrimaryTag.has(id)
    ) {
      return {
        meta:
          index.byPrimaryTag.get(id),

        source:
          "primary_tag",
      };
    }
  }

  return {
    meta: null,
    source: null,
  };
}

/* =========================================================
   FINAL SPORT CLASSIFICATION
========================================================= */

function classifySport(
  market,
  event,
  metaIndex
) {
  const marketTags =
    Array.isArray(market?.tags)
      ? market.tags
      : [];

  for (
    const tag
    of marketTags
  ) {
    const id =
      tag?.id != null
        ? String(tag.id)
        : null;

    if (
      id &&
      metaIndex
        .broadTagToSport
        .has(id)
    ) {
      return {
        sport:
          metaIndex
            .broadTagToSport
            .get(id),

        source:
          "sports_metadata_tag",

        league: null,
      };
    }
  }

  const resolved =
    resolveLeagueMeta(
      market,
      event,
      metaIndex
    );

  if (resolved.meta) {
    const sport =
      classifyLeagueMeta(
        resolved.meta
      );

    if (sport !== "other") {
      return {
        sport,

        source:
          `sports_metadata_${resolved.source}`,

        league:
          resolved.meta,
      };
    }
  }

  const tagText =
    marketTags
      .map(
        (tag) =>
          `${tag?.slug || ""} ${tag?.label || ""}`
      )
      .join(" ");

  const seriesText =
    (event?.series || [])
      .map(
        (s) =>
          `${s?.slug || ""} ${s?.title || ""} ${s?.ticker || ""}`
      )
      .join(" ");

  const text = [
    market?.sportsMarketType,
    market?.category,
    market?.slug,
    market?.groupItemTitle,
    market?.question,

    event?.title,
    event?.slug,

    tagText,
    seriesText,
  ].join(" ");

  const sport =
    classifyText(text);

  return {
    sport,

    source:
      sport === "other"
        ? "unclassified"
        : "text_fallback",

    league:
      resolved.meta,
  };
}

/* =========================================================
   MAIN
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
    "Loading Polymarket sports metadata..."
  );

  const [
    sportsTag,
    sportsMetadata
  ] =
    await Promise.all([
      fetchJson(
        `${GAMMA}/tags/slug/sports`
      ),

      fetchJson(
        `${GAMMA}/sports`
      ),
    ]);

  if (!sportsTag?.id) {
    throw new Error(
      "Could not resolve sports tag"
    );
  }

  const metaIndex =
    buildSportsMetadataIndex(
      sportsMetadata
    );

  console.log(
    `Sports tag ID: ${sportsTag.id}`
  );

  console.log(
    `Sports metadata rows: ${
      Array.isArray(sportsMetadata)
        ? sportsMetadata.length
        : 0
    }`
  );

  console.log(
    `Derived broad sport tags: ${
      metaIndex
        .broadTagToSport
        .size
    }`
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

        include_tag:
          "true",
      });

    if (cursor) {
      params.set(
        "after_cursor",
        cursor
      );
    }

    const data =
      await fetchJson(
        `${GAMMA}/markets/keyset?${params.toString()}`
      );

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

    if (
      markets.length === 0
    ) {
      cursor = null;
      break;
    }

    for (
      const market
      of markets
    ) {
      const marketId =
        market.id != null
          ? String(market.id)
          : null;

      if (
        marketId &&
        seenMarketIds
          .has(marketId)
      ) {
        stats.duplicates++;
        continue;
      }

      if (marketId) {
        seenMarketIds.add(
          marketId
        );
      }

      if (
        market.active !== true ||
        market.closed === true
      ) {
        stats
          .inactive_or_closed++;

        continue;
      }

      const startRaw =
        market.gameStartTime ||
        null;

      if (!startRaw) {
        stats
          .no_game_start_time++;

        continue;
      }

      const gameStart =
        new Date(startRaw);

      if (
        Number.isNaN(
          gameStart.getTime()
        )
      ) {
        stats
          .no_game_start_time++;

        continue;
      }

      if (
        gameStart <= now
      ) {
        stats
          .already_started++;

        continue;
      }

      if (
        gameStart >
        windowEnd
      ) {
        stats
          .after_7_days++;

        continue;
      }

      const event =
        market.events?.[0] ||
        {};

      const classification =
        classifySport(
          market,
          event,
          metaIndex
        );

      const sport =
        classification.sport;

      const secondResolve =
        resolveLeagueMeta(
          market,
          event,
          metaIndex
        );

      const leagueMeta =
        classification.league ||
        secondResolve.meta;

      const type =
        normalizeText(
          market
            .sportsMarketType
        );

      const question =
        normalizeText(
          market.question
        );

      const eventTitle =
        normalizeText(
          event.title
        );

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

      if (
        isSoccerExactScore
      ) {
        stats.exact_score++;
        continue;
      }

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
            !Number.isFinite(
              price
            ) ||
            price <= 0 ||
            price >= 1
        )
      ) {
        stats.invalid_prices++;
        continue;
      }

      if (
        prices.some(
          (price) =>
            price >= MAX_PRICE
        )
      ) {
        stats.low_odds_market++;
        continue;
      }

      const liquidity =
        Number(
          market.liquidityNum ??
          market.liquidity ??
          0
        );

      const pricedOutcomes =
        outcomes.map(
          (
            outcome,
            index
          ) => ({
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

      const tags =
        (
          market.tags ||
          []
        ).map(
          (tag) => ({
            id:
              tag.id ?? null,

            slug:
              tag.slug ?? null,

            label:
              tag.label ?? null,
          })
        );

      kept.push({
        snapshot_at:
          snapshotAt,

        sport,

        sport_source:
          classification.source,

        league_code:
          leagueMeta?.sport ??
          null,

        league_name:
          leagueMeta?.name ??
          null,

        league_series_id:
          leagueMeta?.series ??
          null,

        league_primary_tag_id:
          leagueMeta?.primaryTagId ??
          null,

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
          gameStart
            .toISOString(),

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

  kept.sort(
    (a, b) =>
      new Date(
        a.game_start_time
      ) -
      new Date(
        b.game_start_time
      )
  );

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

  const toJsonl =
    (rows) =>
      rows
        .map(
          (row) =>
            JSON.stringify(row)
        )
        .join("\n") +
      (
        rows.length
          ? "\n"
          : ""
      );

  fs.writeFileSync(
    path.join(
      outDir,
      "markets.jsonl"
    ),

    toJsonl(kept),

    "utf8"
  );

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

    toJsonl(
      comboMarkets
    ),

    "utf8"
  );

  const bySport = {};
  const byLeague = {};
  const bySportSource = {};

  for (
    const row
    of kept
  ) {
    bySport[row.sport] =
      (
        bySport[row.sport] ||
        0
      ) + 1;

    bySportSource[
      row.sport_source
    ] =
      (
        bySportSource[
          row.sport_source
        ] ||
        0
      ) + 1;

    const leagueKey =
      row.league_code ||
      row.league_name;

    if (leagueKey) {
      byLeague[leagueKey] =
        (
          byLeague[
            leagueKey
          ] ||
          0
        ) + 1;
    }
  }

  const sortCounts =
    (obj) =>
      Object.fromEntries(
        Object
          .entries(obj)
          .sort(
            (a, b) =>
              b[1] - a[1]
          )
      );

  const otherExamples =
    kept
      .filter(
        (row) =>
          row.sport ===
          "other"
      )
      .slice(0, 100)
      .map(
        (row) => ({
          event_title:
            row.event_title,

          question:
            row.question,

          market_type:
            row.market_type,

          market_slug:
            row.market_slug,

          league_code:
            row.league_code,

          league_name:
            row.league_name,

          tags:
            row.tags,
        })
      );

  const index = {
    snapshot_at:
      snapshotAt,

    window_end:
      windowEnd
        .toISOString(),

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
      sortCounts(
        bySport
      ),

    by_sport_source:
      sortCounts(
        bySportSource
      ),

    by_league:
      sortCounts(
        byLeague
      ),

    other_examples:
      otherExamples,
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
      sortCounts(
        bySport
      )
    )
  ) {
    console.log(
      `  ${sport}: ${count}`
    );
  }

  console.log("");

  console.log(
    "Classification sources:"
  );

  for (
    const [source, count]
    of Object.entries(
      sortCounts(
        bySportSource
      )
    )
  ) {
    console.log(
      `  ${source}: ${count}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
