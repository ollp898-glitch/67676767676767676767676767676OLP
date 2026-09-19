const fs = require('node:fs');
const path = require('node:path');
const {requestJson,verifyRows,refreshComboCatalog,BOOK_TTL_MS} = require('./market-verification');
const {annotatePolicy,isHighCandidate,checkCompatibility} = require('./candidate-policy');
const {enrichHistory} = require('./price-history');
const array = value => { try { const a = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(a) ? a : []; } catch { return []; } };
const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
function refreshRow(row, market, now) {
  if (!market) return {reason:'market_missing'};
  if (market.active !== true || market.closed !== false || market.acceptingOrders !== true || market.enableOrderBook !== true) return {reason:'market_not_tradable'};
  const tokens = array(market.clobTokenIds), outcomes = array(market.outcomes), prices = array(market.outcomePrices), positions = array(market.positionIds);
  const i = row.outcome_index;
  if (!row.token_id || String(market.id) !== String(row.market_id) || market.conditionId !== row.condition_id || String(tokens[i]) !== row.token_id || outcomes[i] !== row.outcome || !positions[i] || String(positions[i]) !== String(row.position_id)) return {reason:'identity_changed'};
  if (market.question !== row.question || market.sportsMarketType !== row.market_type || number(market.line) !== number(row.line) || Date.parse(market.gameStartTime) !== Date.parse(row.game_start_time)) return {reason:'market_metadata_changed_rescan_required'};
  const start = Date.parse(market.gameStartTime), price = number(prices[i]);
  if (!(start >= now + 3*3600000 && start <= now + 32*3600000)) return {reason:'outside_event_window'};
  if (price === null || price < 0.65 || prices.some(p=>number(p) === null || number(p) >= 0.96)) return {reason:'probability_outside_policy'};
  const liquidity = number(market.liquidityNum ?? market.liquidity);
  if (liquidity === null || liquidity < 100) return {reason:'low_or_missing_liquidity'};
  const refreshed = {...row,snapshot_price:row.price,price,probability_percent:Number((price*100).toFixed(6)),decimal_odds:Number((1/price).toFixed(3)),
    price_observed_at:new Date(now).toISOString(),live_refreshed_at:new Date(now).toISOString(),liquidity,volume:number(market.volumeNum ?? market.volume),
    combo_status:market.comboStatus,combo_eligible:market.comboStatus === 'enabled',analysis_ready:false};
  annotatePolicy(refreshed);
  return refreshed.combo_candidate_universe ? {row:refreshed} : {reason:'policy_excluded'};
}
function groupRows(rows) {
  const sports = new Map();
  for (const r of rows) {
    if (!sports.has(r.sport)) sports.set(r.sport,new Map());
    const leagues = sports.get(r.sport), league = r.league_code || r.league_id || 'unknown';
    if (!leagues.has(league)) leagues.set(league,new Map());
    const events = leagues.get(league);
    if (!events.has(r.match_id)) events.set(r.match_id,{match_id:r.match_id,title:r.match_title,sections:new Map()});
    const sections = events.get(r.match_id).sections;
    if (!sections.has(r.section_id)) sections.set(r.section_id,{id:r.section_id,period:r.period,family:r.family,family_title:r.family_title,outcomes:[]});
    sections.get(r.section_id).outcomes.push(r);
  }
  return [...sports].map(([sport,leagues])=>({sport,leagues:[...leagues].map(([league_code,events])=>({league_code,events:[...events.values()].map(e=>({...e,sections:[...e.sections.values()]}))}))}));
}
async function refreshCandidates(input, fetchImpl = fetch) {
  const source = input.map(r=>annotatePolicy({...r})).filter(r=>r.combo_candidate_universe), ids = [...new Set(source.map(r=>String(r.market_id)))];
  const markets = new Map(), rejected = [], rows = [];
  // Revalidate saved page locators instead of paging the whole catalog before every analysis.
  const catalog = await refreshComboCatalog(source,fetchImpl);
  for (let i=0;i<ids.length;i+=50) {
    const url = new URL('https://gamma-api.polymarket.com/markets');url.searchParams.set('limit','100');
    ids.slice(i,i+50).forEach(id=>url.searchParams.append('id',id));
    const data = await requestJson(url.href,{},fetchImpl);
    if (!Array.isArray(data)) throw new Error('Invalid live market response');
    for (const m of data) {
      if (markets.has(String(m.id))) throw new Error('Duplicate live market response');
      markets.set(String(m.id),{market:m,at:Date.now()});
    }
  }
  for (const row of source) {
    const entry=markets.get(String(row.market_id)), result = refreshRow(row,entry?.market,entry?.at ?? Date.now());
    if (result.row) rows.push(result.row); else rejected.push({outcome_id:row.outcome_id,reason:result.reason});
  }
  const verification = await verifyRows(rows,fetchImpl,catalog);
  const verified = rows.filter(isHighCandidate);
  await enrichHistory(verified,new Map(input.map(r=>[String(r.market_id),r])),fetchImpl,()=>{});
  const now = Date.now();
  for (const row of rows) {
    const expires = Math.min(Date.parse(row.live_refreshed_at),Date.parse(row.combo_verified_at),Date.parse(row.book_timestamp)) + BOOK_TTL_MS;
    row.analysis_ready = isHighCandidate(row) && row.book_status === 'available' && expires > now && Date.parse(row.game_start_time) >= now + 3*3600000;
    row.analysis_expires_at = Number.isFinite(expires) ? new Date(expires).toISOString() : null;
    row.analysis_status = row.analysis_ready ? 'ready_for_single_leg_analysis' : 'verification_or_freshness_failed';
    if (!row.analysis_ready) rejected.push({outcome_id:row.outcome_id,reason:row.analysis_status,combo_status:row.combo_verification_status,book_status:row.book_status});
  }
  const ready = rows.filter(r=>r.analysis_ready);
  return {generated_at:new Date(now).toISOString(),verification,outcomes:ready,sports:groupRows(ready),rejected,
    input_outcomes:input.length,policy_excluded:input.length-source.length,compatibility_check:'Run check-combo.js for explicitly selected legs; a shortlist is not a proposed combination.'};
}
async function main() {
  const [input,dir] = process.argv.slice(2);
  if (!input || !dir) throw new Error('Usage: node refresh-candidates.js INPUT.jsonl OUTPUT_DIR');
  const rows = fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  fs.mkdirSync(dir,{recursive:true});
  // Invalidate an earlier ready file before network work, including on API failure.
  fs.writeFileSync(path.join(dir,'analysis-ready.jsonl'),'');
  fs.writeFileSync(path.join(dir,'analysis-ready.json'),JSON.stringify({status:'refresh_in_progress',sports:[]}));
  try {
    const result = await refreshCandidates(rows);
    fs.writeFileSync(path.join(dir,'analysis-ready.jsonl'),result.outcomes.map(r=>JSON.stringify(r)).join('\n')+(result.outcomes.length?'\n':''));
    const {outcomes,...grouped} = result;
    fs.writeFileSync(path.join(dir,'analysis-ready.json'),JSON.stringify({...grouped,outcomes_count:outcomes.length},null,2)+'\n');
    console.log(JSON.stringify({ready:outcomes.length,rejected:result.rejected.length,generated_at:result.generated_at}));
  } catch (error) {
    fs.writeFileSync(path.join(dir,'analysis-ready.json'),JSON.stringify({status:'refresh_failed',sports:[],error:error.message}));
    throw error;
  }
}
if (require.main === module) main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports = {refreshRow,refreshCandidates,groupRows};
