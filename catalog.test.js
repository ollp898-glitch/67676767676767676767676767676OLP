const assert = require('node:assert/strict');
const { buildCatalog, classifyMarket } = require('./event-catalog');
const row = (id, overrides = {}) => ({ market_id: String(id), event_id: 'e1', sport: 'soccer', league_series_id: 'l1', league_name: 'League',
  event_slug: 'abc-team1-team2-2026-09-16', event_title: 'Team 1 vs. Team 2', game_start_time: '2026-09-16T18:00:00Z', market_type: 'moneyline', outcomes: [{ outcome: 'Yes', price: 0.6 }, { outcome: 'No', price: 0.4 }], ...overrides });
const base = row(1);
const extra = row(2, { event_id: 'e2', event_slug: base.event_slug + '-more-markets', event_title: base.event_title + ' - More Markets', market_type: 'totals', line: 2.5 });
const corner = row(3, { event_id: 'e3', event_slug: base.event_slug + '-total-corners', event_title: base.event_title + ' - Total Corners', market_type: 'soccer_first_half_total_corners', line: 3.5 });
const catalog = buildCatalog([base, extra, corner]);
assert.equal(catalog.events.length, 1);
assert.equal(catalog.events[0].source_event_ids.length, 3);
assert.equal(catalog.events[0].markets_count, 3);
assert.equal(classifyMarket(corner).id, 'half_1/corners_totals');
assert.deepEqual(buildCatalog([corner, extra, base]), catalog, 'Input order must not change the catalog');
for (const overrides of [
  { game_start_time: '2026-09-16T21:00:00Z' }, { league_series_id: 'another' }, { sport: 'baseball' },
  { event_slug: base.event_slug + '-game-2' }, { event_title: 'Team 1 vs. Team 3' },
  { event_slug: 'abc-team1-team2-2026-09-17' }, { event_slug: base.event_slug + '-unknown-suffix' },
]) assert.equal(buildCatalog([base, { ...extra, ...overrides }]).events.length, 2, JSON.stringify(overrides));
const unknown = row(5, { market_type: 'future_new_type' });
assert.equal(classifyMarket(unknown).family, 'other');
assert.equal(buildCatalog([unknown]).events[0].sections[0].markets.length, 1);
assert.equal(classifyMarket(row(6, { sport: 'tennis', market_type: 'tennis_set_winner', question: 'Set 2 Winner: A vs B' })).id, 'set_2/winner');
assert.equal(classifyMarket(row(7, { sport: 'esports', market_type: 'round_over_under_game_2' })).id, 'map_2/rounds_totals');
assert.equal(classifyMarket(row(8, { sport: 'baseball', market_type: 'baseball_team_inning9_winner' })).id, 'inning_9/winner');
const esport = row(9, { sport: 'esports', game_id: '100' });
assert.equal(buildCatalog([esport, { ...esport, market_id: '10', game_id: '200', market_type: 'child_moneyline', question: 'Game 1 Winner' }]).events.length, 1);
assert.equal(buildCatalog([row(11, { event_id: null, event_slug: null }), row(12, { event_id: null, event_slug: null })]).events.length, 2);
assert.throws(() => buildCatalog([base, base]), /duplicate/);
assert.equal(buildCatalog([]).events.length, 0);
assert.equal(base.outcomes.length, 2);
const noLeague = { league_series_id: null, league_name: null, tags: [{ id: 'tag1', slug: 'abc-cup', label: 'ABC Cup' }] };
assert.equal(buildCatalog([{ ...base, ...noLeague }, { ...extra, ...noLeague }]).events.length, 1);
assert.equal(buildCatalog([{ ...base, ...noLeague }]).events[0].league_name, 'ABC Cup');
console.log('Catalog tests passed: cross-event merge, collision guards, periods, unknowns, conservation and stable ordering.');
