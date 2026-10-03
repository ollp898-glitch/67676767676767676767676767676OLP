const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { validateCatalog } = require('./validate-catalog');
async function test() {
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
  const markets = [make('at2', 2), make('total', 3, [0.6, 0.4], 'totals', '-more-markets', ' - More Markets'),
    {...make('lowLiquidity', 6),liquidityNum:99.99},
    make('before2', 2 - 1 / 3600000), make('at30', 30, [0.3, 0.7]), make('after30', 30 + 1 / 3600000), make('at32',32),
    make('started', 0), make('soon', 1), make('no80', 6, [0.2, 0.8]), make('below70', 3, [0.699999, 0.300001]),
    make('at95', 3, [0.95, 0.05]), make('at96', 3, [0.96, 0.04]), make('zero',3,[0,1]), make('exact',3,[.6,.4],'soccer_exact_score'), make('unknown',3,[.6,.4],'future_unknown'), make('badPrices',3,[1.5,-.5]), {...make('at50',3),liquidityNum:50}, {...make('below50',3),liquidityNum:49.999},make('at55',3,[.55,.45]),make('below55',3,[.549999,.450001]),make('below95',3,[.949999,.050001])];
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
      selected: JSON.parse(fs.readFileSync(path.join(out, 'high-probability-markets.json'), 'utf8')),
      rows: fs.readFileSync(path.join(out, 'markets.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse) };
  }
  const result = await run(markets);
  assert.deepEqual([...new Set(result.rows.map(r => r.market_id))].sort(), ['at2', 'at30', 'at95', 'at96', 'below70', 'lowLiquidity', 'no80', 'total','zero','exact','unknown','at50','below50','at55','below55','below95'].sort());
  assert(result.index.events>=3);
  assert.equal(result.index.filters.min_start_hours, 2);
  assert.equal(result.index.filters.max_start_hours, 30);
  assert.equal(result.index.filters.min_liquidity_usd,null);
  assert.equal(result.index.filters.minimum_probability,null);
  assert.equal(result.index.stats.below_min_liquidity,0);
  assert.equal(result.selected.markets_count, 9);
  const selectedRows = result.selected.sports.flatMap(s => s.leagues.flatMap(l => l.events.flatMap(e => e.sections.flatMap(s => s.outcomes))));
  assert.deepEqual(selectedRows.map(r=>r.market_id).sort(),['at2','at30','total','lowLiquidity','below70','no80','at50','at55','below95'].sort()); // Combo boundaries and ordinary catalog are independent.
  assert(!selectedRows.some(r=>r.market_id==='at32'));assert(!result.rows.some(r=>r.market_id==='at32'));
  assert.equal(result.rows.find(r => r.market_id === 'no80' && r.outcome === 'No').outcome, 'No');
  assert(!('outcomes' in result.rows[0]));
  assert.equal(result.rows.filter(r => r.market_id === 'no80').length, 2);
  assert.equal(result.rows.filter(r => r.market_id === 'at95').length, 2);
  assert(result.rows.some(r=>r.price===0));assert.equal(result.rows.find(r=>r.price===0).decimal_odds,null);
  const audit=JSON.parse(fs.readFileSync(path.join(cwd,'out/scanner-audit/index.json'),'utf8'));
  assert.equal(audit.counts['ordinary:invalid_outcomes_or_prices'],1);
  assert.equal(audit.counts['ordinary:starts_after_30_hours'],2);
  assert.equal(audit.counts['ordinary:starts_before_2_hours'],2);
  assert(result.rows.some(r=>r.classification_status==='unclassified'));
  assert(result.rows.filter(r=>['at95','at96','below50','below55','exact','zero'].includes(r.market_id)).every(r=>r.combo_verification_status==='outside_combo_input_policy'));
  const noQualifiers = await run([make('middle', 3, [0.6, 0.4])]);
  assert.equal(noQualifiers.rows.length, 2);
  assert.equal(noQualifiers.selected.markets_count, 1);
  assert.equal(noQualifiers.selected.sports.length,1);
  const empty = await run([]);
  assert.equal(empty.index.markets, 0);
  assert.equal(empty.selected.events_count, 0);
  assert.equal(empty.selected.snapshot_at, new Date(now).toISOString());
  assert.deepEqual(fs.readdirSync(path.join(cwd, 'out', 'events')), []);
  console.log('Scanner integration passed: inclusive 2/30h boundaries, unfiltered prices/liquidity, audit, 55%–<95% threshold, $50 floor, No outcome, complete records, replacement and empty snapshots.');
}
test().catch(err => { console.error(err); process.exitCode = 1; });
