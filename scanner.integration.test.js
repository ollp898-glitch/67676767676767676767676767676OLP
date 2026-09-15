const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { validateCatalog } = require('./validate-catalog');
async function test() {
  const cwd = path.join(__dirname, 'out', 'integration');
  fs.mkdirSync(cwd, { recursive: true });
  const future = new Date(Date.now() + 3600000).toISOString();
  const make = (id, type, suffix, titleSuffix) => ({ id, active: true, gameStartTime: future,
    liquidityNum: 100, outcomes: '["Yes","No"]', outcomePrices: '["0.6","0.4"]',
    comboStatus: 'enabled', sportsMarketType: type, question: 'Team A vs. Team B',
    events: [{ id: `event-${id}`, title: `Team A vs. Team B${titleSuffix}`, slug: `abc-a-b-2026-09-16${suffix}`, series: [{ id: 'league-1' }] }],
    tags: [{ id: '100350', slug: 'soccer' }] });
  const markets = [make('1', 'moneyline', '', ''), make('2', 'totals', '-more-markets', ' - More Markets')];
  const mockFetch = async url => ({ ok: true, json: async () => url.endsWith('/tags/slug/sports') ? { id: '1' } : url.endsWith('/sports') ? [{ sport: 'soccer', name: 'ABC League', series: 'league-1' }] : { markets } });
  await vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'scanner.js'), 'utf8'), {
    require, fetch: mockFetch, URLSearchParams, setTimeout, console: { log() {}, error: console.error },
    process: { cwd: () => cwd, exit: code => { throw new Error(`Scanner exited ${code}`); } },
  });
  const result = validateCatalog(path.join(cwd, 'out'));
  assert.deepEqual(result, { markets: 2, events: 1 });
  const index = JSON.parse(fs.readFileSync(path.join(cwd, 'out', 'index.json'), 'utf8'));
  assert.equal(index.events, 1);
  assert.equal(index.filters.window_days, 2);
  assert.equal(index.combo_markets, 2);
  console.log('Scanner integration passed: fetch → filters → catalog → index → validation.');
}
test().catch(err => { console.error(err); process.exitCode = 1; });
