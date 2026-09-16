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
    id, active: true, gameStartTime: new Date(now + hours * 3600000).toISOString(),
    liquidityNum: 100, outcomes: '["Yes","No"]', outcomePrices: JSON.stringify(prices),
    comboStatus: 'enabled', sportsMarketType: type, question: 'Team A vs. Team B',
    events: [{ id: `event-${id}`, title: `Team A vs. Team B${titleSuffix}`, slug: `abc-a-b-2026-09-16${suffix}`, series: [{ id: 'league-1' }] }],
    tags: [{ id: '100350', slug: 'soccer' }] });
  const markets = [make('at3', 3), make('total', 3, [0.6, 0.4], 'totals', '-more-markets', ' - More Markets'),
    make('before3', 3 - 1 / 3600000), make('at48', 48, [0.3, 0.7]), make('after48', 48 + 1 / 3600000),
    make('started', 0), make('soon', 1), make('no80', 6, [0.2, 0.8]), make('below70', 3, [0.699999, 0.300001]),
    make('at95', 3, [0.95, 0.05]), make('at96', 3, [0.96, 0.04])];
  async function run(input) {
    const mockFetch = async url => ({ ok: true, json: async () => url.endsWith('/tags/slug/sports') ? { id: '1' } : url.endsWith('/sports') ? [{ sport: 'soccer', name: 'ABC League', series: 'league-1' }] : { markets: input } });
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
  assert.deepEqual([...new Set(result.rows.map(r => r.market_id))].sort(), ['at3', 'at48', 'at95', 'below70', 'no80', 'total'].sort());
  assert.equal(result.index.events, 3);
  assert.equal(result.index.filters.min_start_hours, 3);
  assert.equal(result.index.filters.max_start_hours, 48);
  assert.equal(result.selected.markets_count, 0);
  const selectedRows = result.selected.sports.flatMap(s => s.leagues.flatMap(l => l.events.flatMap(e => e.sections.flatMap(s => s.outcomes))));
  assert.deepEqual(selectedRows, []); // Missing token/position mapping fails closed.
  assert.equal(result.rows.find(r => r.market_id === 'no80' && r.outcome === 'No').outcome, 'No');
  assert(!('outcomes' in result.rows[0]));
  assert.equal(result.rows.filter(r => r.market_id === 'no80').length, 2);
  assert.equal(result.rows.filter(r => r.market_id === 'at95').length, 1);
  assert(result.rows.every(r=>r.price>=0.2));
  const noQualifiers = await run([make('middle', 3, [0.6, 0.4])]);
  assert.equal(noQualifiers.rows.length, 2);
  assert.equal(noQualifiers.selected.markets_count, 0);
  assert.deepEqual(noQualifiers.selected.sports, []);
  const empty = await run([]);
  assert.equal(empty.index.markets, 0);
  assert.equal(empty.selected.events_count, 0);
  assert.equal(empty.selected.snapshot_at, new Date(now).toISOString());
  assert.deepEqual(fs.readdirSync(path.join(cwd, 'out', 'events')), []);
  console.log('Scanner integration passed: inclusive 3/48h boundaries, 70% threshold, No outcome, complete records, replacement and empty snapshots.');
}
test().catch(err => { console.error(err); process.exitCode = 1; });
