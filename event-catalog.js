const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const SPORT_NAMES = { soccer: 'Футбол', tennis: 'Теннис', baseball: 'Бейсбол', basketball: 'Баскетбол', hockey: 'Хоккей', esports: 'Киберспорт', mma: 'MMA', cricket: 'Крикет', golf: 'Гольф', 'table-tennis': 'Настольный теннис', volleyball: 'Волейбол', 'american-football': 'Американский футбол' };
const FAMILIES = {
  winner: 'Исход', handicap: 'Форы', totals: 'Тоталы', team_totals: 'Индивидуальные тоталы',
  both_score: 'Обе забьют', first_score: 'Кто забьёт первым', corners_totals: 'Угловые — тоталы',
  corners_team_totals: 'Угловые — индивидуальные тоталы', corners_handicap: 'Угловые — форы', first_corner: 'Первый угловой',
  games_handicap: 'Форы по геймам', sets_handicap: 'Форы по сетам', games_totals: 'Тоталы геймов', sets_totals: 'Тоталы сетов',
  maps_handicap: 'Форы по картам / играм', maps_totals: 'Тоталы карт / игр', rounds_handicap: 'Форы по раундам', rounds_totals: 'Тоталы раундов',
  run_scored: 'Будет ли ран', extra_innings: 'Дополнительные иннинги', player_home_runs: 'Игроки — хоум-раны',
  player_strikeouts: 'Игроки — страйкауты', player_total_bases: 'Игроки — тотал баз', player_hits: 'Игроки — хиты',
  player_hits_allowed: 'Питчеры — допущенные хиты', player_outs: 'Питчеры — ауты', player_hits_runs_rbis: 'Игроки — хиты + раны + RBI',
  completed_match: 'Завершение матча', finish_round: 'Раунд завершения боя', albatross: 'Альбатрос',
  distance: 'Полная дистанция', victory_method: 'Способ победы', victory_round: 'Раунд победы', toss: 'Победитель жеребьёвки',
  baron: 'Барон Нашор', dragon: 'Драконы', inhibitors: 'Ингибиторы', roshan: 'Рошан', barracks: 'Бараки',
  penta_kill: 'Пентакилл', quadra_kill: 'Квадракилл', ultra_kill: 'Ультракилл', rampage: 'Рэмпейдж',
  kills_odd_even: 'Убийства — чёт / нечёт', daytime: 'Завершение в дневное время', other: 'Прочее / не определено',
};

// Only observed provider suffixes are removed. In particular, never strip arbitrary
// text after a date: doubleheaders, legs and replays can be distinct matches.
const SOCCER_SUFFIX = /-(?:halftime-result|second-half-result|first-to-score|first-half-first-to-score|second-half-first-to-score|total-corners|more-markets)$/;
const BASEBALL_SUFFIX = /-(?:first-five-winner|inning-[1-9]-winner|player-props)$/;
const TITLE_SUFFIX = / - (?:Halftime Result|Second Half Result|First Team to Score|[12](?:st|nd) Half First Team to Score|Total Corners|More Markets|First 5 Innings Winner|[1-9](?:st|nd|rd|th) Inning Winner|Player Props)$/i;
const normalized = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const unique = values => [...new Set(values.filter(v => v !== null && v !== undefined && v !== '').map(String))].sort();
const digest = value => createHash('sha256').update(value).digest('hex').slice(0, 24);

function leagueInfo(row) {
  if (row.league_series_id || row.league_code || row.league_name) return {
    key: String(row.league_series_id || row.league_code || row.league_name),
    code: row.league_code || null, name: row.league_name || null, source: 'scanner_metadata' };
  const prefix = String(row.event_slug || '').split('-')[0];
  const tags = (row.tags || []).filter(t => prefix && (t.slug === prefix || t.slug?.startsWith(prefix + '-')) && !['sports', 'games'].includes(t.slug));
  if (tags.length === 1) return { key: `tag:${tags[0].id ?? tags[0].slug}`, code: tags[0].slug, name: tags[0].label || tags[0].slug, source: 'event_slug_matching_tag' };
  return { key: null, code: null, name: null, source: 'unknown' };
}

function matchIdentity(row) {
  const sport = row.sport || 'other';
  const slug = String(row.event_slug || '');
  const cleanSlug = sport === 'soccer' ? slug.replace(SOCCER_SUFFIX, '') : sport === 'baseball' ? slug.replace(BASEBALL_SUFFIX, '') : slug;
  const title = String(row.event_title || '').replace(TITLE_SUFFIX, '');
  const league = leagueInfo(row).key;
  const time = Date.parse(row.game_start_time);
  // Cross-event grouping is deliberately limited to the two observed split sports.
  if (['soccer', 'baseball'].includes(sport) && league && Number.isFinite(time) &&
      /^[a-z0-9-]+-\d{4}-\d{2}-\d{2}$/.test(cleanSlug) && /\s(?:vs\.?|v\.?|@)\s/i.test(title)) {
    return { key: JSON.stringify([sport, String(league), cleanSlug, time, normalized(title)]), title,
      source: 'verified_slug_time_title', canonical_slug: cleanSlug };
  }
  // game_id is not used: in the observed esports data individual maps and the
  // whole series have different game IDs, while sharing one event ID.
  const id = row.event_id ?? row.event_slug ?? row.market_id;
  if (id === null || id === undefined || id === '') throw new Error('Market has no usable identity');
  return { key: JSON.stringify([sport, row.event_id != null ? 'event' : row.event_slug ? 'slug' : 'market', String(id)]),
    title: row.event_title || row.question || String(id), source: row.event_id != null ? 'source_event_id' : 'fallback_identity', canonical_slug: row.event_slug || null };
}

function classifyMarket(row) {
  const t = String(row.market_type || '').toLowerCase();
  let period = 'match', periodTitle = 'Весь матч / событие';
  const set = t.startsWith('tennis_') && (row.question || '').match(/\bSet\s+(\d+)\b/i);
  const map = row.sport === 'esports' && ((t.match(/_game_(\d+)$/) || (row.question || '').match(/\b(?:Game|Map)\s+(\d+)\b/i)));
  const inning = t.match(/_inning(\d+)_/);
  if (/first_half|halftime/.test(t)) { period = 'half_1'; periodTitle = 'Первый тайм'; }
  else if (/second_half/.test(t)) { period = 'half_2'; periodTitle = 'Второй тайм'; }
  else if (t.includes('first_set')) { period = 'set_1'; periodTitle = 'Сет 1'; }
  else if (set) { period = `set_${set[1]}`; periodTitle = `Сет ${set[1]}`; }
  else if (map) { period = `map_${map[1]}`; periodTitle = `Карта / игра ${map[1]}`; }
  else if (t.includes('first_five')) { period = 'innings_1_5'; periodTitle = 'Первые 5 иннингов'; }
  else if (inning) { period = `inning_${inning[1]}`; periodTitle = `Иннинг ${inning[1]}`; }
  else if (t === 'nrfi') { period = 'inning_1'; periodTitle = 'Иннинг 1'; }

  const exact = {
    moneyline: 'winner', child_moneyline: 'winner', spreads: 'handicap', totals: 'totals', team_totals: 'team_totals',
    baseball_player_hits_allowed: 'player_hits_allowed', baseball_player_outs: 'player_outs', baseball_player_hits_runs_rbis: 'player_hits_runs_rbis',
    tennis_completed_match: 'completed_match', tennis_set_games_totals: 'games_totals',
    ufc_round_of_finish: 'finish_round', ufc_method_of_finish: 'victory_method',
    first_half_spreads: 'handicap', second_half_spreads: 'handicap', first_half_totals: 'totals', second_half_totals: 'totals',
    soccer_halftime_result: 'winner', soccer_second_half_result: 'winner', soccer_first_to_score: 'first_score',
    soccer_first_half_first_to_score: 'first_score', soccer_second_half_first_to_score: 'first_score',
    both_teams_to_score: 'both_score', both_teams_to_score_first_half: 'both_score', both_teams_to_score_second_half: 'both_score',
    soccer_team_totals: 'team_totals', soccer_first_half_team_totals: 'team_totals', soccer_second_half_team_totals: 'team_totals',
    total_corners: 'corners_totals', soccer_first_half_total_corners: 'corners_totals', soccer_second_half_total_corners: 'corners_totals',
    soccer_team_total_corners: 'corners_team_totals', soccer_first_corner: 'first_corner',
    tennis_game_handicap: 'games_handicap', tennis_set_handicap: 'sets_handicap', tennis_set_totals: 'sets_totals',
    tennis_match_totals: 'games_totals', tennis_first_set_totals: 'games_totals', tennis_first_set_winner: 'winner', tennis_set_winner: 'winner',
    map_handicap: 'maps_handicap', nrfi: 'run_scored', baseball_game_extra_innings: 'extra_innings',
    baseball_team_first_five_spread: 'handicap', baseball_team_first_five_total: 'totals', baseball_team_first_five_winner: 'winner',
    baseball_player_home_runs: 'player_home_runs', baseball_player_strikeouts: 'player_strikeouts', baseball_player_total_bases: 'player_total_bases', baseball_player_hits: 'player_hits',
    ufc_go_the_distance: 'distance', ufc_method_of_victory: 'victory_method', ufc_round_of_victory: 'victory_round', cricket_toss_winner: 'toss',
    lol_both_teams_baron: 'baron', lol_both_teams_dragon: 'dragon', lol_both_teams_inhibitors: 'inhibitors',
    lol_penta_kill: 'penta_kill', lol_quadra_kill: 'quadra_kill', lol_odd_even_total_kills: 'kills_odd_even',
    dota2_game_ends_daytime: 'daytime', dota2_both_teams_roshan: 'roshan', dota2_both_teams_barracks: 'barracks', dota2_ultra_kill: 'ultra_kill', dota2_rampage: 'rampage',
  };
  let family = exact[t];
  if (/^baseball_team_inning\d+_winner$/.test(t)) family = 'winner';
  if (/^round_over_under_game_\d+$/.test(t)) family = 'rounds_totals';
  if (/^round_handicap_game_\d+$/.test(t)) family = 'rounds_handicap';
  if (t === 'totals' && row.sport === 'esports') family = 'maps_totals';
  if (t === 'totals' && row.sport === 'mma') family = 'rounds_totals';
  let classificationSource = 'market_type';
  // Provider omits sportsMarketType on this observed golf market. Require both
  // its question and slug to identify the specific prop; no broad fuzzy fallback.
  if (!t && row.sport === 'golf' && /\bAlbatross\?$/i.test(row.question || '') && /-albatross$/.test(row.market_slug || '')) {
    family = 'albatross'; classificationSource = 'question_and_slug';
  }
  family ||= 'other';
  // Unknown types remain visible and retain their exact original label.
  return { id: `${period}/${family}`, period, period_title: periodTitle, family, title: FAMILIES[family], classification_source: family === 'other' ? 'unclassified' : classificationSource };
}

function buildCatalog(rows) {
  const groups = new Map();
  const seen = new Set();
  for (const row of rows) {
    if (row.market_id == null || seen.has(String(row.market_id))) throw new Error(`Missing or duplicate market_id: ${row.market_id}`);
    seen.add(String(row.market_id));
    const identity = matchIdentity(row);
    if (!groups.has(identity.key)) groups.set(identity.key, { identity, rows: [] });
    groups.get(identity.key).rows.push(row);
  }
  const events = [...groups.values()].map(({ identity, rows: markets }) => {
    const sections = new Map();
    for (const row of markets) {
      const section = classifyMarket(row);
      if (!sections.has(section.id)) sections.set(section.id, { ...section, markets: [] });
      sections.get(section.id).markets.push(row);
    }
    const sortedSections = [...sections.values()].sort((a, b) => (a.period === b.period ? 0 : a.period === 'match' ? -1 : b.period === 'match' ? 1 : a.period.localeCompare(b.period, 'en', { numeric: true })) || a.title.localeCompare(b.title, 'ru'));
    for (const s of sortedSections) {
      s.markets.sort((a, b) => String(a.market_type).localeCompare(String(b.market_type)) || (Number(a.line) - Number(b.line)) || String(a.question).localeCompare(String(b.question)) || String(a.market_id).localeCompare(String(b.market_id)));
    }
    const first = markets[0];
    const league = leagueInfo(first);
    const starts = unique(markets.map(r => r.game_start_time));
    return { match_id: `match-${digest(identity.key)}`, title: identity.title, canonical_slug: identity.canonical_slug,
      sport: first.sport || 'other', league_code: league.code, league_name: league.name, league_source: league.source,
      league_series_id: first.league_series_id || null, snapshot_at: first.snapshot_at,
      game_start_time: starts[0] || null, source_start_times: starts,
      source_event_ids: unique(markets.map(r => r.event_id)), source_event_slugs: unique(markets.map(r => r.event_slug)),
      grouping_method: identity.source, needs_review: starts.length > 1 || identity.source === 'fallback_identity',
      markets_count: markets.length, combo_markets_count: markets.filter(r => r.combo_eligible).length, sections: sortedSections };
  }).sort((a, b) => String(a.game_start_time).localeCompare(String(b.game_start_time)) || a.match_id.localeCompare(b.match_id));
  const summaries = events.map(({ sections, ...e }) => ({ ...e, file: `events/${e.match_id}.json`,
    sections: sections.map(({ markets, ...s }) => ({ ...s, markets_count: markets.length })) }));
  const sports = new Map();
  for (const e of summaries) {
    if (!sports.has(e.sport)) sports.set(e.sport, new Map());
    const leagues = sports.get(e.sport);
    const key = String(e.league_series_id || e.league_code || e.league_name || 'unknown');
    if (!leagues.has(key)) leagues.set(key, { league_id: key, league_code: e.league_code, title: e.league_name || e.league_code || 'Лига не определена', events: [] });
    leagues.get(key).events.push({ match_id: e.match_id, title: e.title, game_start_time: e.game_start_time, markets_count: e.markets_count, file: e.file });
  }
  return { events, summaries, navigation: { schema_version: 1,
    snapshot_at: rows[0]?.snapshot_at || null, events_count: events.length, markets_count: rows.length,
    sports: [...sports].sort(([a], [b]) => a.localeCompare(b)).map(([sport, leagues]) => ({ sport, title: SPORT_NAMES[sport] || sport, leagues: [...leagues.values()].sort((a, b) => a.title.localeCompare(b.title)) })) } };
}

function writeCatalog(rows, outDir) {
  const catalog = buildCatalog(rows);
  const eventsDir = path.join(outDir, 'events');
  fs.mkdirSync(eventsDir, { recursive: true });
  // Remove only files generated by this module on earlier runs.
  for (const name of fs.readdirSync(eventsDir)) if (/^match-[a-f0-9]{24}\.json$/.test(name)) fs.unlinkSync(path.join(eventsDir, name));
  for (const e of catalog.events) fs.writeFileSync(path.join(eventsDir, `${e.match_id}.json`), JSON.stringify(e, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'events.jsonl'), catalog.summaries.map(e => JSON.stringify(e)).join('\n') + (catalog.events.length ? '\n' : ''));
  fs.writeFileSync(path.join(outDir, 'catalog.json'), JSON.stringify(catalog.navigation, null, 2) + '\n');
  return { events: catalog.events.length, source_events: unique(rows.map(r => r.event_id)).length,
    merged_matches: catalog.events.filter(e => e.source_event_ids.length > 1).length,
    review_matches: catalog.events.filter(e => e.needs_review).length,
    unclassified_markets: rows.filter(r => classifyMarket(r).family === 'other').length,
    files: { events: 'events.jsonl', navigation: 'catalog.json', event_details: 'events/' } };
}

module.exports = { buildCatalog, writeCatalog, classifyMarket, matchIdentity, SPORT_NAMES };
