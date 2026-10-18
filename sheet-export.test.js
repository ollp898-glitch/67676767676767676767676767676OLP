'use strict';
const assert=require('node:assert/strict');
const {buildExport}=require('./sheet-export');
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
console.log('Sheets export tests passed');
