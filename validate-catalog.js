const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

function jsonl(file){
  const body=fs.readFileSync(file,'utf8');
  return body.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
}
function validateCatalog(directory){
  const index=JSON.parse(fs.readFileSync(path.join(directory,'index.json'),'utf8'));
  const rows=jsonl(path.join(directory,'markets.jsonl'));
  const excluded=jsonl(path.join(directory,'excluded.jsonl'));
  const unrecognized=jsonl(path.join(directory,'unrecognized.jsonl'));
  const summary=JSON.parse(fs.readFileSync(path.join(directory,'exclusion-summary.json'),'utf8'));
  const history=jsonl(path.join(directory,'exclusion-history.jsonl'));
  const {buildExclusionAudit}=require('./exclusion-audit');
  const expectedAudit=buildExclusionAudit(excluded,unrecognized,rows,index.snapshot_at);
  assert.deepEqual(summary,expectedAudit,'Exclusion summary differs from raw records');
  assert(history.length>0&&history.some(x=>x.snapshot_at===index.snapshot_at),'Missing current exclusion history');
  assert.deepEqual(history.map(x=>x.snapshot_at),[...new Set(history.map(x=>x.snapshot_at))].sort());
  assert.equal(index.unrecognized_markets,unrecognized.length);
  assert.equal(index.unrecognized_source_outcomes,summary.counts.unrecognized_source_outcomes);
  assert.equal(index.unrecognized_saved_markets,summary.counts.unrecognized_saved_markets);
  assert.equal(index.unrecognized_saved_outcomes,summary.counts.unrecognized_saved_outcomes);
  assert.equal(index.exclusion_unique_markets,summary.counts.excluded_unique_markets);
  const unknownIds=new Set(unrecognized.map(x=>String(x.market_id)));
  assert.equal(unknownIds.size,unrecognized.length,'Repeated unrecognized market');
  const recordedIds=new Set(excluded.filter(x=>x.reason==='unclassified_market_type'&&x.scope==='market').map(x=>String(x.market_id)));
  assert.deepEqual(unknownIds,recordedIds,'Unrecognized markets must have exclusion reason');
  for(const market of unrecognized)assert(market.outcome_count===market.outcomes.length&&market.reason==='unclassified_market_type');
  assert.equal(index.schema_version,1);
  assert.equal(index.pagination_complete,true);
  assert.equal(index.scan_status,'complete');
  assert.equal(index.saved_outcomes,rows.length);
  assert.equal(index.excluded_records,excluded.length);
  assert.equal(index.checked_outcomes,rows.length+excluded.filter(x=>x.scope==='outcome'&&
    ['no_ask','book_unverified'].includes(x.reason)).length);
  assert.equal(index.book_api_errors,excluded.filter(x=>x.book_status==='api_error').length);
  assert.equal(index.duplicate_markets,excluded.filter(x=>x.reason==='duplicate_market').length);
  assert.equal(index.duplicate_outcomes,excluded.filter(x=>x.reason==='duplicate_outcome').length);
  assert.equal(index.markets_with_ask,new Set(rows.map(x=>x.market_id)).size);
  const identities=new Set();
  for(const row of rows){
    for(const key of ['event_id','match_id','market_id','condition_id','token_id','outcome_id','outcome_index',
      'sport','event_title','game_start_time','market_question','market_type','outcome','book_status',
      'book_observed_at','combo_status','combo_verified','combo_verification_status','combo_verified_at',
      'event_combo_status']) assert(Object.hasOwn(row,key),`Missing ${key}`);
    assert(!identities.has(row.outcome_id),`Duplicate ${row.outcome_id}`);
    identities.add(row.outcome_id);
    assert(row.price>=0.05&&row.price<=0.95);
    assert(row.best_ask>0&&row.best_ask<1&&row.ask_size>0);
    assert.equal(row.book_status,'available');
    if(row.best_bid==null)assert.equal(row.spread,null);
    else assert(row.best_bid<row.best_ask&&row.spread>=0);
    assert(Date.parse(row.game_start_time)>=Date.parse(index.snapshot_at)+3600000);
    assert(Date.parse(row.game_start_time)<=Date.parse(index.snapshot_at)+28*3600000);
    assert(['available','unavailable','pending','unknown'].includes(row.combo_status));
    assert(['available','unavailable','pending','unknown'].includes(row.event_combo_status));
    assert.equal(row.combo_verified,row.combo_status==='available');
    assert.equal(row.selection_status,row.classification_status==='unclassified'?'excluded':'eligible');
    assert.equal(row.exclusion_reason,row.classification_status==='unclassified'?'unclassified_market_type':null);
    if(row.classification_status==='unclassified')assert(unknownIds.has(String(row.market_id)),'Unknown market absent from audit');
    assert.equal(String(row.source_market.id),row.market_id);
    assert.equal(String(row.source_market.clobTokenIds[row.outcome_index]),row.token_id);
  }
  for(const row of excluded){
    assert(row.reason&&row.checked_at&&['market','outcome'].includes(row.scope));
    assert(Object.hasOwn(row,'market_id')&&Object.hasOwn(row,'event_id'));
  }
  return {saved_outcomes:rows.length,excluded_records:excluded.length};
}
if(require.main===module){
  try{console.log(JSON.stringify(validateCatalog(process.argv[2]||'out')));}
  catch(error){console.error(error);process.exitCode=1;}
}
module.exports={validateCatalog};
