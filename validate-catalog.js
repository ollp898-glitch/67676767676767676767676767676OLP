const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
function validateCatalog(dir) {
  const jsonl = name => fs.readFileSync(path.join(dir, name), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const rows = jsonl('markets.jsonl');
  const summaries = jsonl('events.jsonl');
  const nav = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
  const originals = new Map(rows.map(r => [String(r.market_id), r]));
  const seen = new Set();
  assert.equal(originals.size, rows.length, 'Duplicate source market IDs');
  assert.equal(nav.events_count, summaries.length);
  assert.equal(nav.markets_count, rows.length);
  assert.deepEqual(nav.sports.flatMap(s => s.leagues.flatMap(l => l.events.map(e => e.match_id))).sort(), summaries.map(e => e.match_id).sort());
  for (const summary of summaries) {
    assert.match(summary.file, /^events\/match-[a-f0-9]{24}\.json$/);
    const event = JSON.parse(fs.readFileSync(path.join(dir, summary.file), 'utf8'));
    assert.equal(event.match_id, summary.match_id);
    const markets = event.sections.flatMap(s => s.markets);
    assert.equal(markets.length, summary.markets_count);
    assert.equal(markets.length, event.markets_count);
    assert.equal(markets.filter(r => r.combo_eligible).length, event.combo_markets_count);
    assert.deepEqual(event.sections.map(({ markets, ...s }) => ({ ...s, markets_count: markets.length })), summary.sections);
    for (const row of markets) {
      const id = String(row.market_id);
      assert(!seen.has(id), `Market ${id} occurs in more than one section`);
      assert.deepEqual(row, originals.get(id), `Market ${id} was changed`);
      seen.add(id);
    }
  }
  assert.equal(seen.size, rows.length, 'Markets lost during grouping');
  return { markets: seen.size, events: summaries.length };
}
if (require.main === module) console.log(validateCatalog(process.argv[2] || 'out'));
module.exports = { validateCatalog };
