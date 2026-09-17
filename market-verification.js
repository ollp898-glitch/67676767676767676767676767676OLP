const {annotatePolicy} = require('./candidate-policy');
const COMBO_URL = 'https://combos-rfq-api.polymarket.com/v1/rfq/combo-markets';
const BOOK_TTL_MS = 120000;
async function requestJson(url, options = {}, fetchImpl = fetch) {
  let error;
  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetchImpl(url, {...options,signal:AbortSignal.timeout(20000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) { error = err; if (i < 2) await new Promise(r => setTimeout(r,250 * (i + 1))); }
  }
  throw error;
}
async function fetchComboCatalog(rows, fetchImpl = fetch, maxPages = Infinity, maxDurationMs = 15 * 60 * 1000) {
  const wanted = new Set(rows.map(r => String(r.market_id))), entries = new Map(), observed = new Map(), locators = new Map(), cursors = new Set();
  let cursor = null, complete = !wanted.size, status = 'complete', pages = 0, error = null;
  const started = Date.now();
  try {
    while (wanted.size && pages < maxPages) {
      if (Date.now() - started >= maxDurationMs) { status = 'time_budget_exceeded'; break; }
      const url = new URL(COMBO_URL); url.searchParams.set('limit','100');
      if (cursor) url.searchParams.set('cursor',cursor);
      const data = await requestJson(url.href,{},fetchImpl); pages++;
      if (!Array.isArray(data.markets)) throw new Error('Invalid Combo catalog');
      for (const market of data.markets) if (wanted.has(String(market.id))) {
        const id = String(market.id);
        const old=entries.get(id);
        if (old && (old.condition_id !== market.condition_id || JSON.stringify(old.position_ids) !== JSON.stringify(market.position_ids) || JSON.stringify(old.outcomes) !== JSON.stringify(market.outcomes))) throw new Error('Conflicting Combo market identity');
        entries.set(id,market); observed.set(id,new Date().toISOString()); locators.set(id,cursor);
      }
      if (!data.next_cursor) { complete = true; break; }
      if ([...wanted].every(id => entries.has(id))) { status = 'requested_markets_found'; break; }
      if (typeof data.next_cursor !== 'string' || cursors.has(data.next_cursor)) throw new Error('Invalid Combo cursor');
      cursor = data.next_cursor; cursors.add(cursor);
    }
    if (!complete && status === 'complete') status = 'truncated';
  } catch (err) { status = 'api_error'; error = err.message; }
  return {entries,observed,locators,complete,status,pages,error,requested_markets:wanted.size,
    found_markets:entries.size,missing_markets:[...wanted].filter(id=>!entries.has(id)),
    coverage_complete:complete || status === 'requested_markets_found',
    next_cursor:complete || status === 'requested_markets_found' ? null : cursor,
    checked_at:new Date().toISOString()};
}
async function refreshComboCatalog(rows, fetchImpl = fetch) {
  const entries=new Map(), observed=new Map(), locators=new Map();
  const cursors=[...new Set(rows.filter(r=>Object.hasOwn(r,'combo_catalog_cursor')).map(r=>r.combo_catalog_cursor))];
  let pages=0, status='page_changed_or_locator_missing_rescan_required';
  for (const cursor of cursors) {
    if (cursor !== null && typeof cursor !== 'string') continue;
    const url=new URL(COMBO_URL);url.searchParams.set('limit','100');if(cursor)url.searchParams.set('cursor',cursor);
    try {
      const data=await requestJson(url.href,{},fetchImpl);pages++;
      if(!Array.isArray(data.markets))throw new Error('Invalid Combo catalog page');
      for(const market of data.markets) if(rows.some(r=>String(r.market_id)===String(market.id))) {
        entries.set(String(market.id),market);observed.set(String(market.id),new Date().toISOString());locators.set(String(market.id),cursor);
      }
    } catch { status='api_error'; }
  }
  if (status !== 'api_error' && rows.every(r=>entries.has(String(r.market_id)))) status='requested_markets_found';
  return {entries,observed,locators,complete:false,status,pages,checked_at:new Date().toISOString()};
}
function verifyCombo(row, catalog) {
  const market = catalog.entries.get(String(row.market_id));
  let status = 'verified';
  if (row.combo_eligible !== true) status = 'gamma_not_enabled';
  else if (!market) status = catalog.complete ? 'not_listed' : catalog.status;
  else if (catalog.status === 'api_error') status = 'api_error';
  else if (!row.condition_id || String(market.condition_id).toLowerCase() !== String(row.condition_id).toLowerCase()) status = 'condition_mismatch';
  else if (market.pending !== false) status = market.pending === true ? 'pending' : 'pending_status_unknown';
  else if (!Array.isArray(market.outcomes) || !Array.isArray(market.position_ids) || market.outcomes.length !== market.position_ids.length || market.outcomes[row.outcome_index] !== row.outcome) status = 'outcome_mapping_mismatch';
  else if (!row.position_id || String(market.position_ids[row.outcome_index]) !== String(row.position_id)) status = 'position_mapping_mismatch';
  else if (!row.token_id) status = 'missing_clob_token';
  return {combo_verified:status === 'verified',combo_verification_status:status,combo_verified_at:catalog.observed?.get(String(row.market_id)) || catalog.checked_at,
    ...(catalog.locators?.has(String(row.market_id)) ? {combo_catalog_cursor:catalog.locators.get(String(row.market_id))} : {}),
    combo_verification_scope:'single_leg',combo_verification_source:COMBO_URL};
}
function buyDepth(asks, budget) {
  let remaining = budget, shares = 0, spent = 0, worst = null;
  for (const level of asks) {
    const dollars = Math.min(remaining,level.price * level.size);
    shares += dollars / level.price; spent += dollars; remaining -= dollars;
    if (dollars > 0) worst = level.price;
    if (remaining < 1e-8) break;
  }
  const vwap = shares ? spent / shares : null;
  return {requested_usd:budget,filled_usd:spent,unfilled_usd:Math.max(0,remaining),shares,
    fully_fillable:remaining < 1e-8,vwap,worst_price:worst,
    slippage_pp:vwap === null ? null : (vwap - asks[0].price) * 100,
    fees_included:false,venue:'CLOB single leg; not a Combo RFQ quote'};
}
function parseBook(row, book, now = Date.now()) {
  const empty = {best_bid:null,best_ask:null,spread:null,book_midpoint:null,book_status:'missing_book',book_observed_at:new Date(now).toISOString(),book_timestamp:null,depth:null};
  if (!book) return empty;
  const fail = status => ({...empty,book_status:status});
  if (String(book.asset_id) !== String(row.token_id) || !row.condition_id || String(book.market).toLowerCase() !== String(row.condition_id).toLowerCase()) return fail('token_or_condition_mismatch');
  const timestamp = Number(book.timestamp);
  if (Number.isFinite(timestamp) && timestamp > 0 && timestamp <= 8640000000000000) {
    empty.book_timestamp = new Date(timestamp).toISOString();
    empty.book_age_ms_at_observation = now - timestamp;
  }
  if (!empty.book_timestamp || timestamp > now + 5000 || now - timestamp > BOOK_TTL_MS) return fail('stale_or_invalid_timestamp');
  if (!Array.isArray(book.bids) || !Array.isArray(book.asks)) return fail('invalid_levels');
  const convert = levels => levels.map(l => ({price:Number(l.price),size:Number(l.size)}));
  const bids = convert(book.bids), asks = convert(book.asks);
  if ([...bids,...asks].some(l => !Number.isFinite(l.price) || l.price <= 0 || l.price >= 1 || !Number.isFinite(l.size) || l.size <= 0)) return fail('invalid_levels');
  bids.sort((a,b)=>b.price-a.price); asks.sort((a,b)=>a.price-b.price);
  if (!bids.length || !asks.length) return fail('empty_side');
  if (bids[0].price >= asks[0].price) return fail('crossed_book');
  return {...empty,book_status:'available',book_timestamp:new Date(timestamp).toISOString(),
    best_bid:bids[0].price,best_ask:asks[0].price,spread:asks[0].price-bids[0].price,book_midpoint:(bids[0].price+asks[0].price)/2,
    min_order_size:book.min_order_size ?? null,tick_size:book.tick_size ?? null,
    depth:{bid_shares:bids.reduce((a,l)=>a+l.size,0),ask_shares:asks.reduce((a,l)=>a+l.size,0),
      ask_notional_usd:asks.reduce((a,l)=>a+l.size*l.price,0),buy_scenarios:[10,50,100].map(n=>buyDepth(asks,n))}};
}
async function enrichBooks(rows, fetchImpl = fetch) {
  const byToken = new Map();
  for (const row of rows) {
    Object.assign(row,parseBook(row,null));
    if (!row.token_id) continue;
    if (!byToken.has(row.token_id)) byToken.set(row.token_id,[]);
    byToken.get(row.token_id).push(row);
  }
  const ids = [...byToken.keys()];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i,i+50);
    try {
      const data = await requestJson('https://clob.polymarket.com/books',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(batch.map(token_id=>({token_id})))},fetchImpl);
      if (!Array.isArray(data)) throw new Error('Invalid books');
      const observedAt = Date.now(), books = new Map(), failed = new Set();
      for (const book of data) if (batch.includes(String(book.asset_id))) {
        const id = String(book.asset_id);
        if (books.has(id)) { failed.add(id); books.delete(id); } else if (!failed.has(id)) books.set(id,book);
      }
      // Validate at receipt, not after all subsequent batches have completed.
      for (const id of batch) for (const row of byToken.get(id)) Object.assign(row,
        failed.has(id) ? {...parseBook(row,null,observedAt),book_status:'duplicate_book'} : parseBook(row,books.get(id),observedAt));
    } catch (err) {
      for (const id of batch) for (const row of byToken.get(id)) Object.assign(row,
        {...parseBook(row,null),book_status:'api_error',book_error:err.message});
    }
  }
}
async function verifyRows(rows, fetchImpl = fetch, prefetchedCatalog = null) {
  rows.forEach(annotatePolicy);
  const universe = rows.filter(r=>r.combo_candidate_universe && r.price >= 0.7 && r.combo_eligible === true);
  const catalog = prefetchedCatalog || await fetchComboCatalog(universe,fetchImpl);
  for (const row of rows) Object.assign(row,row.combo_candidate_universe && row.price >= 0.7 && row.combo_eligible === true ? verifyCombo(row,catalog) :
    {combo_verified:false,combo_verification_status:'outside_shortlist_policy',combo_verification_scope:'single_leg'});
  await enrichBooks(rows,fetchImpl);
  for (const row of rows) { row.analysis_ready = false; row.analysis_status = 'live_refresh_required'; }
  return {status:catalog.status,pages:catalog.pages,verified_legs:rows.filter(r=>r.combo_verified).length,
    coverage_complete:catalog.coverage_complete ?? catalog.status === 'requested_markets_found',
    requested_markets:catalog.requested_markets ?? new Set(universe.map(r=>String(r.market_id))).size,
    found_markets:catalog.entries.size,
    unresolved_markets:catalog.complete ? 0 : (catalog.missing_markets?.length ?? new Set(universe.filter(r=>!catalog.entries.has(String(r.market_id))).map(r=>String(r.market_id))).size),
    error:catalog.error ?? null};
}
module.exports = {requestJson,fetchComboCatalog,refreshComboCatalog,verifyCombo,buyDepth,parseBook,enrichBooks,verifyRows,BOOK_TTL_MS};
