// Evidence-based additions to the legacy catalog. No inference from a lone keyword.
const norm = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const number = value => (typeof value === 'number' || typeof value === 'string' && /^[+-]?\d+(?:\.\d+)?$/.test(value.trim())) && Number.isFinite(Number(value)) ? Number(value) : null;
const escape = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NUM = '([+-]?\\d+(?:\\.\\d+)?)';
const PLAYER_TYPES = {
  receiving_yards: ['american-football', 'Receiving Yards'],
  receptions: ['american-football', 'Receptions'],
  rushing_yards: ['american-football', 'Rushing Yards'],
  passing_yards: ['american-football', 'Passing Yards'],
  passing_touchdowns: ['american-football', 'Passing Touchdowns'],
  passing_attempts: ['american-football', 'Passing Attempts'],
  passing_completions: ['american-football', 'Passing Completions'],
  longest_reception: ['american-football', 'Longest Reception'],
  points: ['basketball', 'Points'], assists: ['basketball', 'Assists'], rebounds: ['basketball', 'Rebounds'],
  baseball_player_earned_runs_allowed: ['baseball', 'Earned Runs Allowed'],
};
const pair = (names, a, b) => names.length === 2 && new Set(names.map(norm)).size === 2 && names.some(n => norm(n) === norm(a)) && names.some(n => norm(n) === norm(b));
function participants(row) {
  const title = String(row.event_title || '').replace(/ - Player Props$/i, '');
  const parts = title.split(/\s+vs\.?\s+/i);
  return parts.length === 2 && parts.every(Boolean) ? parts : [];
}

function classifySupportedMarket(row) {
  const t = String(row.market_type || '').toLowerCase(), q = String(row.question || '').trim();
  const g = String(row.group_item_title || '').trim(), line = number(row.line);
  const raw = row.source_market || row.raw_market || {};
  const values = row.outcomes || raw.outcomes || [];
  const names = Array.isArray(values) ? values.map(o => typeof o === 'string' ? o : o?.outcome) : [];
  const yn = pair(names, 'Yes', 'No'), ou = pair(names, 'Over', 'Under');
  const teams = participants(row);
  const fail = reason => ({family:'other', classification_source:'unclassified', classification_note:reason});
  const done = (family, extra = {}) => ({family, period:'match', classification_source:'sport_type_question_line_outcomes',
    classification_note:null, ...extra});
  const agrees = expected => !g || norm(g) === norm(expected);
  const sameTeams = () => teams.length === 2 && pair(names, ...teams);
  // Reject conflicting source fields before using the normalized view.
  const conflict = () => (row.line != null && row.line !== '' && line === null) || (raw.sportsMarketType != null && norm(raw.sportsMarketType) !== t) ||
    (raw.question != null && norm(raw.question) !== norm(q)) ||
    (raw.groupItemTitle != null && norm(raw.groupItemTitle) !== norm(g)) ||
    (raw.line != null && number(raw.line) !== line) ||
    (Array.isArray(raw.outcomes) && JSON.stringify(raw.outcomes.map(o=>norm(typeof o==='string'?o:o?.outcome))) !== JSON.stringify(names.map(norm)));
  const total = (family, textLine, extra = {}) => {
    if (line === null || line < 0 || number(textLine) !== line) return fail('line_missing_or_conflicts_with_question');
    if (!ou) return fail('over_under_semantics_not_proven');
    return done(family, {line, canonical_outcomes:names.map(n => norm(n).toUpperCase()), ...extra});
  };

  if (Object.hasOwn(PLAYER_TYPES, t)) {
    const [sport, metric] = PLAYER_TYPES[t];
    if (row.sport !== sport || conflict()) return fail('sport_or_source_conflict');
    const m = q.match(new RegExp(`^([^:]+): ${escape(metric)} O/U ${NUM}$`, 'i'));
    if (!m || !agrees(q) || line === null || line < 0 || number(m[2]) !== line || /\b(?:half|quarter|period|first|last)\b/i.test(m[1])) return fail('player_total_fields_not_consistent');
    let canonical, evidence = 'explicit_over_under_outcomes';
    if (ou) canonical = names.map(n => norm(n).toUpperCase());
    else if (yn) {
      // O/U in a title is insufficient. Accept only the observed explicit pair of
      // resolution clauses, bound to the same player, statistic and threshold.
      const description = String(raw.description || '').replace(/\s+/g, ' ').trim();
      const verb = metric === 'Points' ? 'scores' : 'records';
      const yes = `This market will resolve to "Yes" if ${m[1]} ${verb} more than ${m[2]} ${metric === 'Rebounds' ? 'total rebounds' : metric.toLowerCase()} during the game.`;
      const no = `This market will resolve to "No" if ${m[1]} ${verb} ${m[2]} ${metric.toLowerCase()} or fewer during the game.`;
      const clauses = description.match(/This market will resolve to "(?:Yes|No)" if .*? during the game\./gi) || [];
      if ((description.match(/This market will resolve to "(?:Yes|No)" if /gi)||[]).length !== 2 || clauses.length !== 2 || !clauses.some(c => norm(c) === norm(yes)) || !clauses.some(c => norm(c) === norm(no)) || !Number.isInteger(line * 2) || Number.isInteger(line)) return fail('yes_no_resolution_rules_missing_or_ambiguous');
      canonical = names.map(n => norm(n) === 'yes' ? 'OVER' : 'UNDER'); evidence = 'explicit_yes_no_resolution_clauses';
    } else return fail('player_total_outcomes_not_binary_over_under');
    const metricKey = t.replace(/^baseball_player_/, '');
    return done(`player_${metricKey}`, {line, player_name:m[1], metric:metricKey, canonical_outcomes:canonical,
      classification_source:`sport_type_question_line_outcomes:${evidence}`, semantic_evidence:evidence});
  }

  const p = t.match(/^(q[1-4]|first_half|second_half)_(spreads|totals|team_totals|moneyline|both_teams_to_score_points)$/);
  if (p) {
    // Already-supported legacy half spread/total types retain their existing path.
    if (/half/.test(p[1]) && ['spreads','totals'].includes(p[2])) return null;
    if (!['american-football','basketball'].includes(row.sport) || conflict()) return fail('sport_or_source_conflict');
    const period = p[1][0] === 'q' ? `quarter_${p[1][1]}` : p[1] === 'first_half' ? 'half_1' : 'half_2';
    const label = p[1][0] === 'q' ? `${p[1][1]}Q` : p[1] === 'first_half' ? '1H' : '2H';
    const title = teams.join(' vs. ');
    const matchQuestion = suffix => teams.length === 2 && norm(q) === norm(`${title}: ${suffix}`) && agrees(suffix);
    if (p[2] === 'moneyline') return matchQuestion(`${label} Moneyline`) && sameTeams() && line === null ?
      done('winner', {period, outcome_subjects:names, canonical_outcomes:names.map(() => 'TEAM_WIN')}) : fail('period_winner_fields_not_consistent');
    if (p[2] === 'both_teams_to_score_points') return row.sport === 'american-football' && matchQuestion(`Both Teams to Score Points - ${label}`) && yn && line === null ?
      done('both_score', {period, metric:'points', canonical_outcomes:names.map(n => norm(n) === 'yes' ? 'BOTH_TEAMS_SCORE' : 'NOT_BOTH_TEAMS_SCORE')}) : fail('period_both_score_fields_not_consistent');
    if (p[2] === 'spreads') {
      const m = q.match(new RegExp(`^${label} Spread: (.+) \\(${NUM}\\)$`, 'i'));
      if (!m || !sameTeams() || !teams.some(n => norm(n) === norm(m[1])) || line === null || number(m[2]) !== line || !agrees(`${label} Spread ${m[2]}`)) return fail('period_handicap_fields_not_consistent');
      return done('handicap', {period, team_name:m[1], canonical_outcomes:names.map(() => 'TEAM_COVERS'), outcome_subjects:names,
        outcome_lines:names.map(n => (norm(n) === norm(m[1]) ? line : -line) || 0)});
    }
    if (p[2] === 'totals') {
      const m = q.match(new RegExp(`^(.+): ${label} O/U ${NUM}$`, 'i'));
      return m && norm(m[1]) === norm(title) && teams.length === 2 && agrees(`${label} O/U ${m[2]}`) ? total('totals', m[2], {period, metric:'points'}) : fail('period_total_fields_not_consistent');
    }
    const m = q.match(new RegExp(`^(.+) ${label} Team Total: O/U ${NUM}$`, 'i'));
    return m && teams.some(n => norm(n) === norm(m[1])) && agrees(`${m[1]} ${label} O/U ${m[2]}`) ?
      total('team_totals', m[2], {period, team_name:m[1], metric:'points'}) : fail('period_team_total_fields_not_consistent');
  }
  if (t === 'team_touchdowns' || t === 'two_point_conversions') {
    if (row.sport !== 'american-football' || conflict()) return fail('sport_or_source_conflict');
    const m = q.match(new RegExp(t === 'team_touchdowns' ? `^(.+) Total Touchdowns: O/U ${NUM}$` : `^(.+): Total Two-Point Conversions O/U ${NUM}$`, 'i'));
    if (!m || !(t === 'team_touchdowns' ? teams.some(n => norm(n) === norm(m[1])) : norm(m[1]) === norm(teams.join(' vs. ')) && teams.length === 2) || !(agrees(q) || t === 'two_point_conversions' && agrees(`Total Two-Point Conversions O/U ${m[2]}`))) return fail('team_statistic_fields_not_consistent');
    return total(t, m[2], {metric:t === 'team_touchdowns' ? 'touchdowns' : 'two_point_conversions', ...(t === 'team_touchdowns' ? {team_name:m[1]} : {})});
  }
  if (t === 'safety') return row.sport === 'american-football' && !conflict() && teams.length === 2 && norm(q) === norm(`${teams.join(' vs. ')}: Safety?`) && agrees('Safety?') && yn && line === null ?
    done('safety', {canonical_outcomes:names.map(n => norm(n) === 'yes' ? 'SAFETY' : 'NO_SAFETY')}) : fail('safety_fields_not_consistent');
  if (['basketball_odd_even','basketball_team_to_score_first'].includes(t)) {
    const odd = t === 'basketball_odd_even', suffix = odd ? 'Odd/Even Score' : 'Team to Score First';
    if (row.sport !== 'basketball' || conflict() || teams.length !== 2 || norm(q) !== norm(`${teams.join(' vs. ')}: ${suffix}`) || !agrees(suffix) || line !== null || !(odd ? pair(names,'Odd','Even') : sameTeams())) return fail('basketball_match_prop_fields_not_consistent');
    return done(odd ? 'points_odd_even' : 'first_score', {metric:'points', canonical_outcomes:odd ? names.map(n => norm(n).toUpperCase()) : names.map(() => 'TEAM_SCORES_FIRST'), ...(!odd ? {outcome_subjects:names} : {})});
  }
  if (t === 'kill_over_under_game') {
    const m = q.match(new RegExp(`^Total Kills Over/Under ${NUM} in Game ([1-9]\\d*)\\?$`, 'i'));
    return row.sport === 'esports' && !conflict() && m && agrees(q) ? total('kills_totals', m[1], {period:`map_${m[2]}`, metric:'kills'}) : fail('map_kills_total_fields_not_consistent');
  }
  // Team first blood is distinct from a player first-kill prop. Bind names to the
  // exact named event, never to arbitrary non-Yes/No outcomes.
  if (t === 'first_blood_game') {
    const m = q.match(/^First Blood in Game ([1-9]\d*)\?$/i);
    const e = String(row.event_title || '').match(/^(?:LoL|Dota 2): (.+) vs\.? (.+) \(BO\d+\)(?: - .+)?$/);
    return row.sport === 'esports' && !conflict() && m && e && agrees(q) && line === null && pair(names,e[1],e[2]) ?
      done('first_score', {period:`map_${m[1]}`, metric:'kills', outcome_subjects:names, canonical_outcomes:names.map(() => 'TEAM_FIRST_BLOOD')}) : fail('team_first_blood_not_proven');
  }
  if (row.sport === 'motorsport' && !t) {
    const m = q.match(/^Will (.+) win the (\d{4}) NASCAR Cup Series (.+)\?$/);
    const slug = value => norm(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    return !conflict() && m && g === m[1] && norm(row.event_title) === norm(`NASCAR: ${m[3]} Winner`) && String(row.market_slug || '').startsWith(`nascar-${slug(m[3])}-winner-${slug(m[1])}-${m[2]}-`) && yn && line === null ?
      done('race_winner', {player_name:m[1], canonical_outcomes:names.map(n => norm(n) === 'yes' ? 'DRIVER_WINS' : 'DRIVER_DOES_NOT_WIN'), classification_source:'sport_question_group_event_slug_outcomes'}) : fail('race_winner_identity_not_proven');
  }
  if (t === 'soccer_starting_eleven') {
    const m = q.match(/^Will (.+) be in (.+)'s Starting 11\?$/);
    return row.sport === 'soccer' && !conflict() && m && g === m[1] && String(row.event_title || '').endsWith(` - ${m[2]} Starting 11`) && yn && line === null ?
      done('starting_lineup', {player_name:m[1], team_name:m[2], canonical_outcomes:names.map(n => norm(n) === 'yes' ? 'STARTS' : 'DOES_NOT_START')}) : fail('starting_lineup_identity_not_proven');
  }
  if (['exact_margin','two_plus_touchdowns'].includes(t)) return fail('intentionally_not_promoted_narrow_scoring_or_margin');
  return null;
}
module.exports = {classifySupportedMarket, PLAYER_TYPES};
