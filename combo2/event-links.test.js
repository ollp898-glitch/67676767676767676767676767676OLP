const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const fixtures=require('./fixtures/event-links-2026-10-08.json'),{eventFacts,matchEvent}=require('./matching');
test('14 real October 8 event links preserve exact identities, tournament, time and ambiguity checks',()=>{
 assert.equal(fixtures.length,14);
 for(const {source,candidate} of fixtures){const facts=eventFacts(source);assert.equal(matchEvent(facts,[candidate],'flashscore').event_id,candidate.event_id,source.match_title);
 for(const patch of [{sport:'other'},{competition:'Other league'},{start_time:new Date(Date.parse(facts.start_time)+300001).toISOString()},{participants:['Unknown',candidate.participants[1]]},{identity_conflict:true}])assert.equal(matchEvent(facts,[{...candidate,...patch}],'flashscore').event_id,null);
 }
 const x=fixtures[0],facts=eventFacts(x.source);assert.deepEqual(matchEvent(facts,[x.candidate],'flashscore').participant_order,[1,0]);assert.equal(matchEvent(facts,[{...x.candidate,event_id:'other123'}],'flashscore').event_id,null);
 const other=fixtures[1];assert.equal(matchEvent(eventFacts(other.source),[{...other.candidate,participants:other.candidate.participants.slice().reverse()}],'flashscore').event_id,null);
});
test('link-only refresh preserves saved odds, source rows, timestamps and all market files',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'betx-links-'));try{
 const x=fixtures[1],root=path.join(dir,'combo-2');fs.writeFileSync(path.join(dir,'combo-markets.jsonl'),JSON.stringify(x.source)+'\n');
 await require('./build').build(dir,root,{offline:true});const before=require('./storage').read(path.join(root,'index.json'));
 const files=new Map();function collect(d){for(const f of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,f.name);if(f.isDirectory())collect(p);else if(p.includes(path.sep+'markets'+path.sep))files.set(p,fs.readFileSync(p));}}collect(root);
 const source=fs.readFileSync(path.join(dir,'combo-markets.jsonl'));
 const report=await require('./refresh-event-links').refresh(dir,root,{discovery:async()=>({candidates:[x.candidate],diagnostics:[],errors:{}})});assert.equal(report.before,0);assert.equal(report.after,1);
 assert.deepEqual(fs.readFileSync(path.join(dir,'combo-markets.jsonl')),source);for(const [p,b]of files)assert.deepEqual(fs.readFileSync(p),b);
 const after=require('./storage').read(path.join(root,'index.json'));assert.deepEqual(after.odds_collection,before.odds_collection);assert.equal(after.coverage.bookmaker_outcomes,before.coverage.bookmaker_outcomes);assert.deepEqual(after.market_edge_ranking,before.market_edge_ranking);
 await require('./refresh-event-links').refresh(dir,root,{discovery:async()=>{throw Error('Already linked events must not request discovery');}});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
