// Strategy policy is separate from provider eligibility and order-book availability.
const SUPPORTED_SPORTS = new Set(['soccer','baseball','basketball','hockey','tennis','table-tennis','volleyball','american-football','cricket','golf','esports','mma']);
function semanticLabel(row) {
  const raw = String(row.outcome || '').trim(), q = String(row.question || '').trim();
  if (/^(yes|no)$/i.test(raw)) {
    const yes = /^yes$/i.test(raw);
    if (/extra innings/i.test(q)) return yes ? 'Extra Innings' : 'No Extra Innings';
    const inning = q.match(/^(.*?)\s+to win\s+(\d+)(?:st|nd|rd|th)\s+inning\??$/i);
    if (inning) return `${inning[1]} ${yes ? 'выиграют' : 'не выиграют'} ${inning[2]}-й иннинг`;
    return `${q.replace(/\?$/, '')} — ${yes ? 'Да' : 'Нет'}`;
  }
  if (/^(over|under)$/i.test(raw)) {
    const line = row.outcome_line ?? row.line;
    const type = `${row.market_type || ''} ${row.family || ''}`;
    const unit = /corners/.test(type) ? 'corners' : /home_runs/.test(type) ? 'HR' : /strikeouts/.test(type) ? 'strikeouts' :
      /hits_runs_rbis/.test(type) ? 'hits + runs + RBIs' : /hits_allowed/.test(type) ? 'hits allowed' :
      /hits/.test(type) ? 'hits' : /outs/.test(type) ? 'outs' : /games/.test(type) ? 'games' :
      /sets/.test(type) ? 'sets' : /kills/.test(type) ? 'kills' :
      ['soccer','hockey'].includes(row.sport) ? 'goals' : row.sport === 'baseball' ? 'runs' :
      ['basketball','american-football','volleyball'].includes(row.sport) ? 'points' : '';
    return line !== null && line !== undefined && line !== '' ? `${raw} ${line}${unit ? ` ${unit}` : ''} — ${q}` : `${raw} — ${q}`;
  }
  if (/handicap/.test(row.family) && Number.isFinite(row.outcome_line)) return `${raw} ${row.outcome_line >= 0 ? '+' : ''}${row.outcome_line}`;
  return raw;
}
function policyReasons(row) {
  const reasons = [];
  if (row.family === 'other' || row.classification_status !== 'classified') reasons.push('unclassified_market');
  if (!SUPPORTED_SPORTS.has(row.sport) || /power[ -]?slap/i.test(`${row.league_code || ''} ${row.league_name || ''} ${row.match_title || ''} ${row.question || ''}`)) reasons.push('unsupported_sport');
  if (row.market_type === 'baseball_player_home_runs' || (row.sport === 'baseball' && row.family === 'player_home_runs')) reasons.push('player_home_runs_excluded');
  if (/albatross|penta[_ -]?kill|quadra[_ -]?kill|rampage|ultra[_ -]?kill/i.test(`${row.family} ${row.market_type} ${row.question}`)) reasons.push('specialist_prop');
  return reasons;
}
function annotatePolicy(row) {
  row.outcome_label = semanticLabel(row);
  row.combo_exclusion_reasons = policyReasons(row);
  row.quarantined = row.combo_exclusion_reasons.some(r => ['unclassified_market','unsupported_sport'].includes(r));
  row.combo_candidate_universe = row.combo_exclusion_reasons.length === 0;
  return row;
}
const isHighCandidate = row => row.price >= 0.7 && row.combo_candidate_universe === true && row.combo_verified === true;
function checkCompatibility(legs, now = Date.now()) {
  const errors = [], reviews = [];
  if (legs.length < 2) errors.push('at_least_two_legs_required');
  const conditions = new Set(), matches = new Set();
  for (const leg of legs) {
    if (!isHighCandidate(leg)) errors.push(`ineligible_leg:${leg.outcome_id}`);
    if (!leg.condition_id || conditions.has(leg.condition_id)) errors.push(`duplicate_or_opposing_market:${leg.condition_id}`);
    conditions.add(leg.condition_id);
    if (!leg.match_id) errors.push(`missing_match:${leg.outcome_id}`);
    else if (matches.has(leg.match_id)) reviews.push(`same_match_correlation:${leg.match_id}`);
    matches.add(leg.match_id);
    if (!leg.analysis_ready || !(Date.parse(leg.analysis_expires_at) > now)) errors.push(`refresh_required:${leg.outcome_id}`);
  }
  return {local_status:errors.length ? 'rejected' : reviews.length ? 'needs_review' : 'passed',errors:[...new Set(errors)],reviews:[...new Set(reviews)],
    combo_compatible:errors.length ? false : null,provider_verified:false,
    note:'Single-leg eligibility is not confirmation that Polymarket accepts this combination. No combined probability is inferred.'};
}
module.exports = {semanticLabel,policyReasons,annotatePolicy,isHighCandidate,checkCompatibility};
