const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {writeChatReader,validateChatReader}=require('./chat-reader');
const dir=path.join(__dirname,'out','reader-test');
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'combo-summary.json'),'{}');
const rows=Array.from({length:350},(_,i)=>({outcome_id:`id-${i}`,market_id:String(i),match_id:`match-${i}`,
  sport:'soccer',family:'corners_totals',outcome:'Over',question:'A | B <test>\n',outcome_label:'Over 9.5 corners',
  price:.8,combo_verified:i%2===0,combo_candidate_universe:true,raw_extra:{retain:true}}));
let ref=writeChatReader(rows,dir,{snapshot_at:'2026-09-18T00:00:00Z'},{status:'complete',coverage_complete:true});
let manifest=validateChatReader(dir,rows);assert.equal(ref.scopes.all.outcomes,350);assert.equal(ref.scopes.combo.outcomes,175);
assert(manifest.files.some(f=>f.path.endsWith('pages-2.json')));assert(manifest.files.every(f=>f.bytes<=60000));
const original=ref.snapshot_id;
ref=writeChatReader(rows,dir,{snapshot_at:'2026-09-18T01:00:00Z'},{status:'complete',coverage_complete:true});
assert.notEqual(ref.snapshot_id,original);validateChatReader(dir,rows);
writeChatReader([],dir,{snapshot_at:'2026-09-18T02:00:00Z'},{status:'complete',coverage_complete:true});
validateChatReader(dir,[]);assert.match(fs.readFileSync(path.join(dir,'CHAT-START.md'),'utf8'),/исходы: \*\*0\*\*/);
console.log('Chat reader passed: exact complete records, scope filters, bounded pages/indexes, valid links, snapshot isolation and empty replacement.');
