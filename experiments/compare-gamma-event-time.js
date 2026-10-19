'use strict';
// READ-ONLY comparison. NEVER writes to data/main or runs CLOB/Combo requests.
// A candidate passes only if every eligible baseline market ID appears in the event-time result.
const fs = require('node:fs');
const GAMMA = 'https://gamma-api.polymarket.com';
const HOUR = 3600000;
const now = new Date();
const begin = Date.now();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const baseWindow = {
  from: new Date(now.getTime() + HOUR),
  to: new Date(now.getTime() + 28 * HOUR)
};
const eventWindow = {
  from: new Date(now.getTime()), // deliberate safety margin
  to: new Date(now.getTime() + 29 * HOUR)
};
async function getJson(url) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {'User-Agent':'bet-x-time-window-experiment/1.0', Accept:'application/json'},
        signal: AbortSignal.timeout(30000)
      });
      if (response.ok) return response.json();
      const body = (await response.text()).slice(0, 180);
      last = new Error('HTTP ' + response.status + ' ' + body);
      if (response.status !== 429 && response.status < 500) throw last;
    } catch (err) { last = err; }
    if (attempt < 3) await sleep(1000 * Math.pow(2, attempt));
  }
  throw last;
}
const inner = new Date(now.getTime() + 90 * 60000).getTime();
const outer = new Date(now.getTime() + 27.5 * HOUR).getTime();
function eligible(m) {
  const event = m.events && m.events[0];
  const start = Date.parse(m.gameStartTime);
  return m.id != null && m.closed !== true && event?.closed !== true &&
    m.active === true && event?.active !== false &&
    m.live !== true && m.ended !== true && event?.live !== true && event?.ended !== true &&
    Number.isFinite(start) && start >= baseWindow.from.getTime() &&
    start <= baseWindow.to.getTime();
}
async function walk(endpoint, params, property, visit) {
  let cursor = null, pages = 0, records = 0;
  const visited = new Set();
  const started = Date.now();
  do {
    const qs = new URLSearchParams(params);
    if (cursor !== null) qs.set('after_cursor', cursor);
    const payload = await getJson(GAMMA + endpoint + '?' + qs.toString());
    const entries = payload[property];
    if (!Array.isArray(entries)) throw new Error(endpoint + ': expected ' + property + ' array; got ' + Object.keys(payload).join(','));
    pages++;
    records += entries.length;
    for (const entry of entries) visit(entry);
    const next = payload.next_cursor ?? null;
    if (next !== null && (typeof next !== 'string' || next === cursor || visited.has(next)))
      throw new Error(endpoint + ': cursor loop or invalid cursor');
    if (next === null && entries.length === 100) throw new Error(endpoint + ': full page but missing cursor');
    if (next !== null && entries.length === 0) throw new Error(endpoint + ': empty page but has cursor');
    if (cursor !== null) visited.add(cursor);
    cursor = next;
    if (pages % 100 === 0) console.log(endpoint, 'pages', pages, 'items', records);
    if (cursor !== null) await sleep(75);
  } while (cursor !== null);
  return {pages, records, seconds: Math.round((Date.now()-started)/1000)};
}
async function main() {
  const tag = await getJson(GAMMA + '/tags/slug/sports');
  if (!tag || !tag.id) throw new Error('Missing /tags/slug/sports.id');
  console.log('Sports tag', tag.id, 'snapshot clock', now.toISOString());
  // Candidate first. It must include all baseline IDs after the baseline finishes too.
  const candidate = new Set(), eventIds = new Set(), candidateMarketSamples = [];
  let eventsWithoutMarkets = 0, candidateDuplicates = 0;
  const events = await walk('/events/keyset', {
    limit:'100', closed:'false', tag_id:String(tag.id),
    related_tags:'true', start_time_min:eventWindow.from.toISOString(),
    start_time_max:eventWindow.to.toISOString()
  }, 'events', event => {
    if (event?.id != null) eventIds.add(String(event.id));
    if (!Array.isArray(event.markets)) { eventsWithoutMarkets++; return; }
    for (const market of event.markets) {
      if (market?.id == null) continue;
      const id = String(market.id);
      if (candidate.has(id)) candidateDuplicates++;
      candidate.add(id);
      if (candidateMarketSamples.length < 3)
        candidateMarketSamples.push({market_id:id, gameStartTime:market.gameStartTime, event_startTime:event.startTime});
    }
  });
  console.log('Candidate events', events);
  const baseline = new Map();
  const markets = await walk('/markets/keyset', {
    limit:'100', closed:'false',tag_id:String(tag.id),
    related_tags:'true',include_tag:'true'
  }, 'markets', market => {
    if (eligible(market) && !baseline.has(String(market.id))) {
      const event = market.events?.[0] || {};
      baseline.set(String(market.id), {
        market_id:String(market.id), gameStartTime:market.gameStartTime,
        event_startTime:event.startTime || null, event_id:event.id || null,
        event_title:event.title || null, type:market.sportsMarketType || null
      });
    }
  });
  let intersection = 0, stableTotal = 0, stableFound = 0;
  const missed = [];
  for (const [id, value] of baseline) {
    const found = candidate.has(id);
    const start = Date.parse(value.gameStartTime);
    const stable = start >= inner && start <= outer;
    if (found) intersection++;
    else missed.push(value);
    if (stable) { stableTotal++; if (found) stableFound++; }
  }
  const report = {
    tested_at: now.toISOString(),
    endpoints: ['/markets/keyset','/events/keyset'],
    event_window_utc:[eventWindow.from.toISOString(),eventWindow.to.toISOString()],
    baseline_window_utc:[baseWindow.from.toISOString(),baseWindow.to.toISOString()],
    old_market_catalog: markets,
    candidate_event_catalog: events,
    baseline_market_ids:baseline.size,
    candidate_unique_market_ids:candidate.size,
    candidate_events:eventIds.size,
    candidate_duplicates:candidateDuplicates,
    events_without_embedded_markets:eventsWithoutMarkets,
    baseline_markets_covered:intersection,
    baseline_markets_missing:missed.length,
    stable_window_baseline:stableTotal,
    stable_window_covered:stableFound,
    stable_window_missing:stableTotal-stableFound,
    missing_samples:missed.slice(0,20),
    candidate_samples:candidateMarketSamples,
    elapsed_seconds:Math.round((Date.now()-begin)/1000),
    outcome:'UNSAFE_IF_MISSING'
  };
  report.outcome = report.stable_window_missing === 0 && report.baseline_markets_missing === 0 &&
    eventsWithoutMarkets === 0 ? 'COVERAGE_MATCHED_IN_ONE_RUN_NOT_PROVEN_SAFE' : 'COVERAGE_GAP_OR_INCOMPLETE';
  fs.writeFileSync('gamma-time-experiment-report.json',JSON.stringify(report,null,2)+'\n');
  console.log('BET-X RESULTS\n' + JSON.stringify(report,null,2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '## Gamma event-time filter experiment (read-only)\n' +
      '- Baseline eligible markets: **' + baseline.size + '**\n' +
      '- Candidate markets: **' + candidate.size + '**\n' +
      '- Missing baseline IDs: **' + missed.length + '**\n' +
      '- Missing away from boundaries: **' + (stableTotal-stableFound) + '**\n' +
      '- Baseline catalog: ' + markets.pages + ' pages, ' + markets.seconds + 's\n' +
      '- Candidate catalog: ' + events.pages + ' pages, ' + events.seconds + 's\n' +
      '- Result: **' + report.outcome + '**\n' +
      '- This is a single observation; a match does not justify switching production.\n');
  }
  // Coverage gaps do not fail workflow: publication is only a diagnostic, no production change.
}
main().catch(err => {console.error('Experiment failed',err);process.exitCode = 1;});
