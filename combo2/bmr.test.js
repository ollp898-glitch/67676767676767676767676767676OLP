const test=require('node:test'),assert=require('node:assert/strict');
const {eventMatch,parseQuotes,matchedQuotes,BmrProvider}=require('./bmr');
const {enrich}=require('./market-summary');
const {mergeBookmakers}=require('./bookmaker-identity');
const {fair}=require('./fair-probability');
const f=require('./fixtures/bmr.json');
const facts={sport:'american-football',discipline:null,participants:['Southern Miss','Troy'],start_time:new Date(f.event.dt).toISOString()};
const row={sport:facts.sport,league_code:'cfb',family:'winner',market_type:'moneyline',period:'match',line:null,outcome:'Troy',probability_percent:80};
const quotes=()=>parseQuotes(f.event,f.lines,f.options,f.types,f.observed_at);
test('BMR exact event identity is sport/league, both names, time and unique candidate',()=>{
 assert.equal(eventMatch(facts,[f.event],'cfb').status,'matched');
 for(const e of [{...f.event,spid:3},{...f.event,lid:16},{...f.event,dt:f.event.dt+300001},{...f.event,des:'Southern Miss Women@Troy Trojans'},{...f.event,participants:[]}])assert.equal(eventMatch(facts,[e],'cfb').status,'unmatched');
 assert.equal(eventMatch(facts,[f.event,f.event],'cfb').reason,'ambiguous_event');
 assert.equal(eventMatch({...facts,tennis_doubles:true},[f.event],'cfb').status,'unmatched');
});
test('BMR live fixture maps native participant orientation and computes each paid separately',()=>{
 const result=enrich(row,quotes(),facts);assert.equal(result.bookmakers.length,2);
 assert(result.bookmakers.every(q=>q.fair_probability_percent>0));
 const q=result.bookmakers.find(q=>q.paid===8),other=q.full_market.outcomes.find(o=>o.selection!==q.canonical.selection);
 assert.equal(q.fair_probability_percent,100/q.decimal_odds/(1/q.decimal_odds+1/other.decimal_odds));
 assert.equal(matchedQuotes({...row,outcome:'Southern Miss'},quotes(),facts).length,2);
});
test('BMR type metadata, line, period, activity and option labels fail closed',()=>{
 assert.equal(parseQuotes(f.event,f.lines,f.options,[],f.observed_at).length,0);
 assert.equal(parseQuotes(f.event,f.lines.map(l=>({...l,iof:true})),f.options,f.types,f.observed_at).length,0);
 const total={...row,family:'totals',market_type:'first_half_totals',period:'half_1',outcome:'Over',line:26.5};
 assert(matchedQuotes(total,quotes(),facts).length>0);
 assert.equal(matchedQuotes({...total,line:27.5},quotes(),facts).length,0);
 assert.equal(matchedQuotes({...total,period:'match'},quotes(),facts).length,0);
 const qs=quotes();const q=qs.find(x=>x.canonical.type==='HOME_AWAY');
 assert.equal(matchedQuotes(row,[{...q,raw:{...q.raw,eid:1}}],facts).length,0);
 assert.equal(matchedQuotes(row,[{...q,decimal_odds:10}],facts).length,0);
});
test('BMR incomplete, conflicting and integer settlement markets have no invented fair probability',()=>{
 const lines=f.lines.filter(l=>l.mtid===83&&l.paid===8&&l.partid===461);
 const q=parseQuotes(f.event,lines,f.options,f.types,f.observed_at)[0];assert.equal(fair(q).fair_probability_percent,null);
 assert.equal(matchedQuotes(row,[q,q],facts).length,0);
 assert.equal(parseQuotes(f.event,[...lines,...lines],f.options,f.types,f.observed_at).length,1);
 const full=quotes().find(x=>x.canonical.type==='HOME_AWAY');assert.equal(fair({...full,full_market:{...full.full_market,bookmaker_id:'other'}}).fair_probability_percent,null);
});
test('same paid brands and cross-source bookmaker aliases do not inflate the median',()=>{
 const q=quotes().find(q=>q.paid===8&&q.canonical.type==='HOME_AWAY');
 const fs={...q,source:'flashscore',bookmaker_id:'fs8',bookmaker_name:'BetOnline',bookmaker_aliases:undefined,full_market:{...q.full_market,bookmaker_id:'fs8'}};
 const same={...q,bookmaker_name:'SportsBetting'};
 assert.equal(mergeBookmakers([q,same,fs]).length,1);
 assert.equal(mergeBookmakers([q,same,fs])[0].source,'flashscore');
 assert.equal(mergeBookmakers([q,{...fs,full_market:null}])[0].source,'bmr');
});
test('BMR transport is public GET, serial with 2s spacing and stops on rate limit',async()=>{
 const calls=[],delays=[];const p=new BmrProvider({sleep:async ms=>delays.push(ms),fetchImpl:async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({data:{ok:true}})};}});
 await p.query('{a}');await p.query('{b}');assert.deepEqual(delays,[2000]);assert(calls.every(x=>!x.opts.headers&&!x.opts.body&&x.url.includes('?query=')));
 const limited=new BmrProvider({sleep:async()=>{},fetchImpl:async()=>({ok:false,status:429})});await assert.rejects(limited.query('{a}'),/429/);await assert.rejects(limited.query('{b}'),/stopped/);
});
test('BMR supplements saved snapshot, validates and never refetches Flashscore or same-snapshot BMR',async t=>{
 const fs=require('fs'),os=require('os'),path=require('path');const {build}=require('./build'),{validate}=require('./validate');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'betx-bmr-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const root=path.join(dir,'combo-2');
 const sourceRow={...row,match_id:'bmr-test',market_id:'market',condition_id:'condition',outcome_id:'outcome',snapshot_at:f.observed_at,event_id:'poly',match_title:'Southern Miss vs. Troy',game_start_time:facts.start_time,token_id:'token'};
 fs.writeFileSync(path.join(dir,'combo-markets.jsonl'),JSON.stringify(sourceRow)+'\n');
 const discovery=async()=>({candidates:[],errors:{},diagnostics:[]});
 const baseline=await build(dir,root,{discovery});
 const bmr={discover:async()=>[f.event],fetchEvent:async()=>({quotes:quotes(),observed_at:f.observed_at})};
 const forbidden=async()=>{throw Error('must not refetch Flashscore');};
 const result=await build(dir,root,{bmr,discovery:forbidden,odds:{fetchEvent:forbidden}});
 assert.deepEqual(result.odds_collection,baseline.odds_collection);assert.equal(result.coverage.bookmaker_outcomes,1);assert.equal(result.market_edge_ranking.ranked_outcomes,1);assert.equal(validate(dir,root).valid,true);
 await build(dir,root,{bmr:{discover:forbidden,fetchEvent:forbidden},discovery:forbidden,odds:{fetchEvent:forbidden}});
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'index.json'))),result);
});

test('merged bookmaker order is stable on repeated validation',()=>{
 const qs=quotes().filter(q=>q.canonical.type==='HOME_AWAY'&&q.canonical.selection==='HOME');
 const q=qs[0];const fs={...q,source:'flashscore',bookmaker_id:'99',bookmaker_name:'William Hill',bookmaker_aliases:undefined,full_market:null};
 const once=mergeBookmakers([...qs,fs]);assert.deepEqual(mergeBookmakers(once),once);
});
