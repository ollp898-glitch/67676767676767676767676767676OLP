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

/* =========================================================
   SPORT CLASSIFICATION
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

function classifyLeagueMeta(meta) {
  if (!meta) {
    return "other";
  }

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
module.exports={buildSportsMetadataIndex,classifySport,resolveLeagueMeta};
