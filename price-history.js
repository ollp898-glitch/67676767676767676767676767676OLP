const fs = require('node:fs');
const path = require('node:path');
const HOURS = [1, 6, 24];
const MAX_AGE_SECONDS = 15 * 60;
const number = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
function historicalFields(points, at, status = 'available') {
  const byTime = new Map(), conflicts = new Set();
  const quality = {invalid_points:0,future_points:0,duplicate_points:0,conflicting_timestamps:0,large_jumps:0};
  for (const point of Array.isArray(points) ? points : []) {
    if (!point || !Number.isFinite(point.t) || point.t <= 0 || !Number.isFinite(point.p) || point.p < 0 || point.p > 1) { quality.invalid_points++; continue; }
    if (point.t > Date.parse(at)/1000) { quality.future_points++; continue; }
    if (byTime.has(point.t)) {
      if (byTime.get(point.t).p === point.p) quality.duplicate_points++;
      else conflicts.add(point.t);
    } else byTime.set(point.t,point);
  }
  quality.conflicting_timestamps = conflicts.size;
  const valid = [...byTime.values()].filter(p=>!conflicts.has(p.t)).sort((a,b)=>a.t-b.t);
  for (let i=1;i<valid.length;i++) if (valid[i].t-valid[i-1].t <= 900 && Math.abs(valid[i].p-valid[i-1].p) >= 0.2) quality.large_jumps++;
  const result = { price_history_source: 'Polymarket CLOB prices-history', price_history_reference_at: at, price_history_status: status,
    price_history_quality:quality,price_history_cleaning:'Reject invalid/future points and conflicting timestamps; deduplicate identical points. Flag large jumps without smoothing.' };
  let available = 0;
  for (const hours of HOURS) {
    const target = Date.parse(at) / 1000 - hours * 3600;
    const point = valid.findLast(x => x.t <= target);
    const conflict = [...conflicts].some(t=>t<=target && target-t<=MAX_AGE_SECONDS && (!point || t>=point.t));
    const fresh = point && target-point.t <= MAX_AGE_SECONDS && !conflict;
    result[`price_${hours}h_ago`] = fresh ? point.p : null;
    result[`price_${hours}h_ago_at`] = fresh ? new Date(point.t*1000).toISOString() : null;
    result[`price_${hours}h_ago_status`] = fresh ? 'available' : status !== 'available' ? status : conflict ? 'conflicting_points' : point ? 'stale' : 'no_data';
    available += fresh ? 1 : 0;
  }
  if (status === 'available') result.price_history_status = available === 3 ? 'complete' : available ? 'partial' : 'no_data';
  return result;
}
function loadPrevious(file) {
  if (!fs.existsSync(file)) return new Map();
  const rows = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  return new Map(rows.map(r => [String(r.market_id), r])); // Supports V2 markets and V3 outcome rows.
}
function deltaFields(row, previous) {
  const old = previous.get(String(row.market_id));
  const at = row.price_observed_at || row.snapshot_at;
  const oldAt = old?.price_observed_at || old?.snapshot_at;
  const valid = old && Date.parse(oldAt) < Date.parse(at) && old.condition_id === row.condition_id;
  const delta = key => valid && number(row[key]) !== null && number(old[key]) !== null ? Number((number(row[key])-number(old[key])).toFixed(6)) : null;
  return { volume_delta: delta('volume'), liquidity_delta: delta('liquidity'),
    delta_since: valid ? oldAt : null, delta_hours: valid ? (Date.parse(at)-Date.parse(oldAt))/3600000 : null,
    delta_scope: 'market', delta_status: valid ? 'compared_previous_scan' : 'no_previous_observation',
    volume_delta_status: delta('volume') === null ? 'missing_data' : delta('volume') < 0 ? 'source_counter_decreased' : 'available' };
}
async function enrichHistory(rows, previous, fetchImpl = fetch, log = console.log) {
  const ids = [...new Set(rows.map(r => r.token_id).filter(Boolean))];
  const history = new Map();
  const times = rows.map(r => Date.parse(r.price_observed_at || r.snapshot_at) / 1000);
  const start = Math.floor(Math.min(...times) - 24*3600 - MAX_AGE_SECONDS - 300);
  const end = Math.ceil(Math.max(...times));
  const batches = [];
  for (let i=0; i<ids.length; i+=20) batches.push(ids.slice(i,i+20));
  let cursor=0, failed=0, completed=0;
  await Promise.all(Array.from({length: Math.min(4,batches.length)}, async () => {
    while (cursor < batches.length) {
      const batch = batches[cursor++]; let response, error;
      for (let attempt=0; attempt<3; attempt++) {
        try {
          const res = await fetchImpl('https://clob.polymarket.com/batch-prices-history', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({markets:batch,start_ts:start,end_ts:end,fidelity:5}), signal:AbortSignal.timeout(20000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          response = await res.json();
          if (!response.history || typeof response.history !== 'object' || Array.isArray(response.history)) throw new Error('Invalid history response');
          error=null; break;
        } catch(err) { error=err; if(attempt<2) await new Promise(r=>setTimeout(r,500*(attempt+1))); }
      }
      for (const id of batch) history.set(id, error ? {status:'api_error',points:[]} : {status:'available',points:Array.isArray(response.history[id])?response.history[id]:[]});
      if(error) failed += batch.length;
      completed++;
      if(completed%25===0 || completed===batches.length) log(`Price history: ${completed}/${batches.length} batches, ${failed} tokens failed`);
    }
  }));
  if (ids.length && failed === ids.length) throw new Error("All price-history requests failed; previous published snapshot must be preserved");
  for (const row of rows) {
    const item=history.get(row.token_id) || {points:[],status:'missing_token'};
    Object.assign(row, historicalFields(item.points,row.price_observed_at || row.snapshot_at,item.status),deltaFields(row,previous));
    for(const h of HOURS) row[`price_change_${h}h_pp`] = row[`price_${h}h_ago`] === null ? null : Number(((row.price-row[`price_${h}h_ago`])*100).toFixed(6));
  }
  return {tokens_requested:ids.length,tokens_failed:failed,complete:rows.filter(r=>r.price_history_status==='complete').length,
    partial:rows.filter(r=>r.price_history_status==='partial').length,no_data:rows.filter(r=>r.price_history_status==='no_data').length,
    missing_token:rows.filter(r=>r.price_history_status==='missing_token').length,max_point_age_minutes:15,fidelity_minutes:5};
}
module.exports = { historicalFields, deltaFields, loadPrevious, enrichHistory };
