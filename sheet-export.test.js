'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {buildExport,buildStatsCSV,exportFile}=require('./sheet-export');
const base={token_id:'1000000000000000000000001',book_status:'available',best_ask:.67,ask_size:10,
  event_title:'Test vs Example',event_id:'111',match_id:'m1',market_id:'1',outcome:'Test',
  price:.66,combo_status:'unknown',event_combo_status:'unknown'};
const index={scan_status:'complete',pagination_complete:true,saved_outcomes:2,snapshot_at:'2026-10-18T18:20:03.067Z'};
const rows=[base,{...base,token_id:'1000000000000000000000002',outcome:'Other',best_bid:null}];
const result=buildExport(rows.map(JSON.stringify).join('\n')+'\n',index,new Date('2026-10-18T20:00:00Z'));
assert.equal(result.row_count,2);
assert.equal(result.columns.length,27);
assert.equal(result.rows[0].length,27);
assert.equal(result.rows[0][22],base.token_id);
assert.equal(typeof result.rows[0][22],'string');
assert.equal(result.rows[0][8],'');
assert.equal(result.rows[0][6],.66);
assert.equal(result.snapshot_at,index.snapshot_at);
assert.throws(()=>buildExport(JSON.stringify(base)+'\n',index),/count mismatch/i);
assert.throws(()=>buildExport(rows.map(r=>JSON.stringify({...r,token_id:base.token_id})).join('\n'),index),/Duplicate/);
assert.throws(()=>buildExport(rows.map(r=>JSON.stringify({...r,best_ask:null})).join('\n'),index),/Invalid source Ask/);
const dashboard=buildStatsCSV({...index,scan_finished_at:'2026-10-18T18:40:00Z',processed_markets:200,
  unique_events:8,unique_matches:7,source_outcomes:19,checked_outcomes:11,excluded_records:23,
  markets_with_ask:2,combo_markets:5,combo_events:4,book_api_errors:0,api_errors:0,
  duplicate_markets:0,duplicate_outcomes:0});
assert.match(dashboard,/processed_markets,200/);
assert.match(dashboard,/excluded_records,23/);
assert.match(dashboard,/saved_outcomes,2/);
assert.throws(()=>buildStatsCSV(index),/Missing dashboard metric/);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'betx-sheet-ranking-'));
try{
 const fullIndex={...index,scan_finished_at:'2026-10-18T18:40:00Z',processed_markets:2,
  unique_events:1,unique_matches:1,source_outcomes:2,checked_outcomes:2,excluded_records:0,
  markets_with_ask:1,combo_markets:0,combo_events:0,book_api_errors:0,api_errors:0,
  duplicate_markets:0,duplicate_outcomes:0,rankings_status:'complete'};
 const ranking={schema_version:1,snapshot_at:index.snapshot_at,saved_outcomes_count:2,
  event_count:1,tournament_count:1,events:[{title:'Test vs Example'}],tournaments:[{tournament:'Test League'}]};
 fs.writeFileSync(path.join(dir,'markets.jsonl'),rows.map(JSON.stringify).join('\n')+'\n');
 fs.writeFileSync(path.join(dir,'index.json'),JSON.stringify(fullIndex));
 fs.writeFileSync(path.join(dir,'rankings.json'),JSON.stringify(ranking));
 exportFile(dir);
 const feed=JSON.parse(fs.readFileSync(path.join(dir,'sheets.json')));
 assert.equal(feed.rankings_status,'complete');
 assert.equal(feed.rankings.events[0].title,'Test vs Example');
 assert.match(feed.rankings_sha256,/^[0-9a-f]{64}$/);
 fs.writeFileSync(path.join(dir,'rankings.json'),JSON.stringify({...ranking,snapshot_at:'wrong'}));
 exportFile(dir);
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'sheets.json'))).rankings_status,'failed');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log('Sheets export tests passed');
