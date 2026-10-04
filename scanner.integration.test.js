const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { validateCatalog } = require('./validate-catalog');
async function test() {
  const {getExclusionReason}=require('./scanner');
  const event={title:'Team A vs. Team B'};
  assert.equal(getExclusionReason('basketball',{question:'Stephen Curry: First basket?',sportsMarketType:'basketball_first_basket'},event),'basketball_player_first_score');
  assert.equal(getExclusionReason('esports',{question:'Faker: First blood?',sportsMarketType:'esports_first_blood'},event),'esports_player_first_kill');
  assert.equal(getExclusionReason('basketball',{question:'Team A: First basket?',sportsMarketType:'basketball_first_basket'},event),null);
  const cwd = path.join(__dirname, 'out', 'integration');
  fs.mkdirSync(cwd, { recursive: true });
  const now = Date.parse('2026-09-16T00:00:00.000Z');
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const make = (id, hours, prices = [0.7, 0.3], type = 'moneyline', suffix = '', titleSuffix = '') => ({
    id, conditionId:'condition-'+id,clobTokenIds:[id+'-yes',id+'-no'],positionIds:[id+'-p0',id+'-p1'], active: true, gameStartTime: new Date(now + hours * 3600000).toISOString(),
    liquidityNum: 100, outcomes: '["Yes","No"]', outcomePrices: JSON.stringify(prices),
    comboStatus: 'enabled', sportsMarketType: type, question: 'Team A vs. Team B',
    events: [{ id: `event-${id}`, title: `Team A vs. Team B${titleSuffix}`, slug: `abc-a-b-2026-09-16${suffix}`, series: [{ id: 'league-1' }] }],
    tags: [{ id: '100350', slug: 'soccer' }] });
  const q=(id,question,type='moneyline',sport='soccer')=>({...make(id,3,[.6,.4],type),question,tags:[{id:'test-'+sport,slug:sport}],events:[{id:'e-'+id,title:'Team A vs. Team B',slug:'test-'+id}]});
  const markets = [make('at2',2),make('at28',28),make('before2',2-1/3600000),make('after28',28+1/3600000),make('started',0),
    {...make('at20',3),liquidityNum:20},{...make('below20',3),liquidityNum:19.999},
    make('at45pct',3,[.45,.55]),make('below45pct',3,[.449999,.550001]),make('at95',3,[.95,.05]),make('below95',3,[.949999,.050001]),make('zero',3,[0,1]),
    make('at55',3,[.55,.45]),make('below55',3,[.549999,.450001]),make('unknown',3,[.8,.2],'future_unknown'),make('badPrices',3,[1.5,-.5]),
    {...make('inactive',3),active:false},{...make('closed',3),closed:true},{...make('live',3),live:true},
    q('exact','Correct score 2-1','soccer_exact_score'),q('halfExact','First half exact score 1-0','soccer_first_half_exact_score'),
    q('margin','Team A to win by exactly 2'),q('goal','Will Player A score a goal?'),q('assist','Will Player A record an assist?'),q('goalAssist','Player A goal or assist'),
    q('td','Player A anytime TD','american_football_player_touchdowns','american-football'),
    q('try','Will Player A score a try?','rugby_player_try','rugby'),q('hr','Will Player A hit a home run?','baseball_player_home_runs','baseball'),
    q('firstBasket','Will Player A score the first basket?','basketball_first_basket','basketball'),
    q('firstBlood','Will Player A get first blood?','esports_player_first_kill','esports'),
    q('minute','Goal in the first 10 minutes?'),q('interval','Goal between 11 and 20 minutes?'),
    q('points','Player A: O/U 20.5 Points','basketball_player_points','basketball'),q('shots','Player A: O/U 2.5 Shots','soccer_player_shots'),
    q('rebounds','Player A: O/U 8.5 Rebounds','basketball_player_rebounds','basketball'),q('assists','Player A: O/U 1.5 Assists','soccer_player_assists'),
    q('totals','Team A vs Team B: O/U 2.5','totals'),q('teamTotals','Team A: O/U 1.5','soccer_team_totals'),
    q('spread','Spread: Team A (-1.5)','spreads'),q('btts','Both teams to score?','both_teams_to_score'),q('corners','O/U 9.5 Corners','total_corners'),
    q('cards','O/U 4.5 Cards','soccer_total_cards'),q('half','First half winner','soccer_first_half_moneyline')];
  async function run(input) {
    const mockFetch = async url => {assert(!url.includes('liquidity_num_min'));return {ok:true,json:async()=>{
      if(url.endsWith('/tags/slug/sports'))return {id:'1'};
      if(url.endsWith('/sports'))return [{sport:'soccer',name:'ABC League',series:'league-1'}];
      if(url.includes('combo-markets'))return {markets:input.map(m=>({id:m.id,condition_id:m.conditionId,outcomes:JSON.parse(m.outcomes),position_ids:m.positionIds,pending:false}))};
      if(url.endsWith('/batch-prices-history'))return {history:{}};
      if(url.endsWith('/books'))return [];
      return {markets:input};
    }};};
    await vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'scanner.js'), 'utf8'), {
      require, fetch: mockFetch, URLSearchParams, setTimeout, Date: FixedDate, console: { log() {}, error: console.error },
      process: { cwd: () => cwd, exit: code => { throw new Error(`Scanner exited ${code}`); } },
    });
    const out = path.join(cwd, 'out');
    validateCatalog(out);
    return { index: JSON.parse(fs.readFileSync(path.join(out, 'index.json'), 'utf8')),
      unknown: JSON.parse(fs.readFileSync(path.join(out,'unclassified-outcomes.json'),'utf8')).outcomes,
      selected: JSON.parse(fs.readFileSync(path.join(out, 'high-probability-markets.json'), 'utf8')),
      rows: fs.readFileSync(path.join(out, 'markets.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse) };
  }
  const result = await run(markets);
  const saved=[...result.rows,...result.unknown],savedIds=new Set(saved.map(r=>r.market_id));
  const expected=['at2','at28','at20','at45pct','below45pct','below95','at55','below55','unknown','points','shots','rebounds','assists','totals','teamTotals','spread','btts','corners','cards','half'];
  assert.deepEqual([...savedIds].sort(),expected.sort());
  assert.deepEqual(result.index.filters,require('./combo-policy').SCANNER_POLICY);
  assert(result.rows.every(r=>r.classification_status==='classified'));
  assert(result.unknown.every(r=>r.classification_status==='unclassified'&&r.raw_market));
  assert(saved.every(r=>r.price>=.45&&r.price<.95&&r.liquidity>=20));
  assert.equal(saved.filter(r=>r.market_id==='below45pct').length,1);
  const no=saved.find(r=>r.market_id==='below45pct');assert.equal(no.outcome_index,1);assert.equal(no.token_id,'below45pct-no');
  assert.equal(saved.filter(r=>r.market_id==='unknown').length,1);
  const selectedRows=result.selected.sports.flatMap(s=>s.leagues.flatMap(l=>l.events.flatMap(e=>e.sections.flatMap(s=>s.outcomes))));
  for(const id of ['at2','at28','at20','at45pct','below45pct','below95','at55'])assert(selectedRows.some(r=>r.market_id===id),id);
  assert(selectedRows.every(r=>r.combo_verified&&r.price>=.55&&r.price<.95&&r.liquidity>=20));
  assert(!selectedRows.some(r=>['below55','unknown','exact','goal','hr'].includes(r.market_id)));
  const audit=JSON.parse(fs.readFileSync(path.join(cwd,'out/scanner-audit/index.json'),'utf8'));
  for(const reason of ['invalid_outcomes_or_prices','starts_after_28_hours','starts_before_2_hours','below_min_liquidity','already_started','not_pre_match','no_qualifying_outcomes'])assert(audit.counts['ordinary:'+reason]>0,reason);
  assert.equal(audit.counts['ordinary:exact_score'],2);assert.equal(audit.counts['ordinary:inactive_or_closed'],2);
  assert(audit.counts['ordinary_outcome:below_min_probability']>0);assert(audit.counts['ordinary_outcome:at_or_above_max_probability']>0);
  assert.equal(result.index.stats.scanned_markets,new Set(saved.map(r=>r.market_id)).size+Object.entries(audit.counts).filter(([k])=>k.startsWith('ordinary:')).reduce((n,[,v])=>n+v,0));
  // Missing audit records and out-of-policy saved outcomes are rejected.
  const out=path.join(cwd,'out'),auditFile=path.join(out,'scanner-audit/index.json'),auditText=fs.readFileSync(auditFile,'utf8');
  fs.writeFileSync(auditFile,JSON.stringify({...audit,counts:{}}));assert.throws(()=>validateCatalog(out));fs.writeFileSync(auditFile,auditText);
  const noQualifiers = await run([make('middle', 3, [0.6, 0.4])]);
  assert.equal(noQualifiers.rows.length, 1);
  assert.equal(noQualifiers.selected.markets_count, 1);
  assert.equal(noQualifiers.selected.sports.length,1);
  const empty = await run([]);
  assert.equal(empty.index.markets, 0);
  assert.equal(empty.selected.events_count, 0);
  assert.equal(empty.selected.snapshot_at, new Date(now).toISOString());
  assert.deepEqual(fs.readdirSync(path.join(cwd, 'out', 'events')), []);
  console.log('Scanner integration passed: 2–28h, $20, 45%–<95%, partial noise, player totals, separate unknowns, outcome identity, conservation, Combo 55%–<95%, replacement and empty snapshots.');
}
test().catch(err => { console.error(err); process.exitCode = 1; });
