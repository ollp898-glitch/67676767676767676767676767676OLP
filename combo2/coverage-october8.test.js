const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const f=require('./fixtures/coverage-2026-10-08.json'),m=require('./matching'),b=require('./bmr');
test('27 additional live feed identities preserve league, country, gender, time and ambiguity',()=>{
 assert.equal(f.flashscore.length,27);
 for(const {source,candidate,page} of f.flashscore){const facts=m.eventFacts(source);assert.equal(m.matchEvent(facts,[candidate],'flashscore').event_id,candidate.event_id,source.match_title);
 assert(!page.error);{assert.equal(page.event_id,candidate.event_id);assert.deepEqual(page.participants,candidate.participants);assert.equal(page.start_time,candidate.start_time);}
 for(const patch of [{sport:'other'},{competition:'Unrelated league'},{start_time:new Date(Date.parse(facts.start_time)+300001).toISOString()},{participants:['Wrong team',candidate.participants[1]],participant_slugs:['wrong',candidate.participant_slugs[1]]}])assert.equal(m.matchEvent(facts,[{...candidate,...patch}],'flashscore').event_id,null);
 assert.equal(m.matchEvent(facts,[candidate,{...candidate,event_id:'duplicate'}],'flashscore').match_status,'ambiguous');
 if(['Super League','Championship','Premier League'].includes(candidate.competition))assert.equal(m.matchEvent(facts,[{...candidate,competition_category:'WRONG COUNTRY'}],'flashscore').event_id,null);
 }
});
test('13 additional BMR source events require exact sport, league, team pair and time',()=>{
 assert.equal(f.bmr.length,13);
 for(const {source,event}of f.bmr){const facts=m.eventFacts(source);assert.equal(b.eventMatch(facts,[event],source.league_code).status,'matched');
 for(const patch of [{spid:999},{lid:999},{dt:event.dt+300001},{des:'Unknown@Opponent'}])assert.equal(b.eventMatch(facts,[{...event,...patch}],source.league_code).status,'unmatched');
 assert.equal(b.eventMatch(facts,[event,event],source.league_code).reason,'ambiguous_event');
 }
});
test('matching upgrade fetches a newly linked event once, preserving previously observed odds and cache',async t=>{
 const {build}=require('./build'),{read,write}=require('./storage');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'betx-backfill-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const root=path.join(dir,'combo-2');
 const samples=f.flashscore.slice(0,2);fs.writeFileSync(path.join(dir,'combo-markets.jsonl'),samples.map(x=>JSON.stringify(x.source)).join('\n')+'\n');
 const found=candidates=>({candidates,errors:{},diagnostics:[]});const observed=samples[0].source.snapshot_at;let calls=[];
 const odds={fetchEvent:async c=>{calls.push(c.event_id);return {quotes:[],observed_at:observed};}};
 const before=await build(dir,root,{discovery:async()=>found([samples[0].candidate]),odds});assert.equal(calls.length,1);
 const index=read(path.join(root,'index.json'));delete index.event_matching_version;write(path.join(root,'index.json'),index);
 const after=await build(dir,root,{discovery:async facts=>{assert.equal(facts.length,1);return found([samples[1].candidate]);},odds,sleep:async()=>{}});
 assert.deepEqual(calls,samples.map(x=>x.candidate.event_id));assert.equal(after.odds_collection.successes,before.odds_collection.successes+1);assert.equal(after.odds_collection.started_at,before.odds_collection.started_at);
 await build(dir,root,{discovery:async()=>{throw Error('cached discovery');},odds:{fetchEvent:async()=>{throw Error('cached odds');}}});
 assert.equal(require('./validate').validate(dir,root).valid,true);
});
test('BMR matching upgrade reuses previously attempted provider events even if discovery no longer lists them',async t=>{
 const {build}=require('./build'),{read,write}=require('./storage');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'betx-bmr-cache-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const root=path.join(dir,'combo-2'),x=f.bmr[0];fs.writeFileSync(path.join(dir,'combo-markets.jsonl'),JSON.stringify(x.source)+'\n');
 const discovery=async()=>({candidates:[],errors:{},diagnostics:[]});let calls=0;const bmr={discover:async()=>[x.event],fetchEvent:async()=>{calls++;return {quotes:[],observed_at:x.source.snapshot_at};}};
 const before=await build(dir,root,{discovery,bmr});const index=read(path.join(root,'index.json'));index.bmr_provider.version--;write(path.join(root,'index.json'),index);
 const after=await build(dir,root,{discovery:async()=>{throw Error('must reuse Flashscore');},bmr:{discover:async()=>[],fetchEvent:async()=>{throw Error('must reuse BMR');}}});assert.equal(calls,1);assert.equal(after.bmr_provider.events_matched,before.bmr_provider.events_matched);assert.deepEqual(after.odds_collection,before.odds_collection);
});

test('feed record without a working event page remains unconfirmed',()=>{for(const x of f.unverified_pages)assert.equal(m.matchEvent(m.eventFacts(x.source),[x.candidate],'flashscore').event_id,null);});
