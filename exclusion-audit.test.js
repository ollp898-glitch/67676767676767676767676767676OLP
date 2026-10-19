'use strict';
const assert=require('node:assert/strict');
const {buildExclusionAudit,historyEntry}=require('./exclusion-audit');
const excluded=[
 {reason:'unclassified_market_type',scope:'market',market_id:'1'},
 {reason:'price_below_5',scope:'outcome',market_id:'1',outcome_index:0},
 {reason:'no_ask',scope:'outcome',market_id:'2',outcome_index:1},
 {reason:'no_ask',scope:'outcome',market_id:'2',outcome_index:0}
];
const unrecognized=[{market_id:'1',market_type:'soccer_exact_score',outcome_count:3}];
const rows=[{market_id:'1',classification_status:'unclassified'},{market_id:'2',classification_status:'classified'}];
const summary=buildExclusionAudit(excluded,unrecognized,rows,'2026-10-19T16:00:00Z');
assert.equal(summary.counts.exclusion_records,4);
assert.equal(summary.counts.excluded_unique_markets,2);
assert.equal(summary.counts.unrecognized_markets,1);
assert.equal(summary.counts.unrecognized_source_outcomes,3);
assert.equal(summary.counts.unrecognized_saved_outcomes,1);
assert.equal(summary.unrecognized_types[0].saved_markets,1);
assert.equal(summary.reasons.find(x=>x.reason==='no_ask').unique_markets,1);
assert.equal(summary.reasons.find(x=>x.reason==='no_ask').unique_outcomes,2);
assert.equal(summary.reasons.find(x=>x.reason==='unclassified_market_type').stage,'selection');
assert.equal(historyEntry(summary).unrecognized_markets,1);
console.log('Exclusion audit passed');
