const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {build}=require('./build'),{validate}=require('./validate');
const {eventFacts,matchEvent,analyticsFor,comparison,ROUTES}=require('./matching');
const {parseOdds,FlashscoreOdds,ProviderError,http}=require('./providers');
const {write,read,key}=require('./storage');
const fixture=require('./fixtures/flashscore.json');
const feedFixture=require('./fixtures/event-feeds.json');
require('./fair-probability.test');
const expansion=require('./fixtures/coverage-expansion.json');
test('real expansion fixtures confirm tournament aliases, cricket prefixes and US team ordering',()=>{
 for(const {source,candidate} of expansion.events){const f=eventFacts(source),m=matchEvent(f,[candidate],'flashscore');assert.equal(m.event_id,candidate.event_id,source.event_title);assert.equal(m.match_status,'matched');}
 for(const sport of ['basketball','american-football']){const sample=expansion.events.find(e=>e.source.sport===sport);assert.deepEqual(matchEvent(eventFacts(sample.source),[sample.candidate],'flashscore').participant_order,[1,0]);}
});
test('aliases preserve tournament editions, qualifiers, gender, opponents and time',()=>{
 const sample=expansion.events.find(e=>e.source.event_title.startsWith('Chengdu Open:')),f=eventFacts(sample.source);
 for(const patch of [{competition:'Chengdu (China) - Qualification, hard'},{competition_category:'ATP - DOUBLES'},{sport:'soccer'},{start_time:'2020-01-01T00:00:00Z'},{participants:['Different','Opponent'],participant_slugs:['different','opponent']}])assert.equal(matchEvent(f,[{...sample.candidate,...patch}],'flashscore').event_id,null);
 const itf=expansion.events.find(e=>e.source.event_title.startsWith('W15 Maanshan:'));assert.equal(matchEvent({...eventFacts(itf.source),competition:'W15 Maanshan 4'},[itf.candidate],'flashscore').event_id,null);
 const w=expansion.events.find(e=>e.source.sport==='basketball');assert.equal(matchEvent({...eventFacts(w.source),competition:'NBA'},[{...w.candidate,competition:'NBA'}],'flashscore').event_id,null);
 const china=expansion.events.find(e=>e.source.sport==='soccer');assert.equal(matchEvent({...eventFacts(china.source),participants:['China PR','Palestine']},[{...china.candidate,competition:'FIFA Friendlies',participants:['China','Maldives']}],'flashscore').event_id,null);
});
test('all newly supported market types match factual bookmaker responses',()=>{
 for(const sample of expansion.markets){const q=parseOdds(sample.response,sample.candidate,sample.observed_at),c=comparison(sample.source,q,eventFacts(sample.source));assert(c.bookmakers.length>0,sample.source.market_type);for(const b of c.bookmakers)assert(b.decimal_odds>1);}
});
test('new market scopes and tennis metrics cannot be interchanged',()=>{
 for(const type of ['tennis_first_set_winner','tennis_set_winner','tennis_first_set_totals','tennis_match_totals','tennis_set_totals','both_teams_to_score_first_half','both_teams_to_score_second_half']){
  const sample=expansion.markets.find(s=>s.source.market_type===type),q=parseOdds(sample.response,sample.candidate,sample.observed_at),f=eventFacts(sample.source);
  assert.equal(comparison({...sample.source,period:sample.source.period==='match'?'set_1':'match'},q,f).bookmakers.length,0,type);
 }
 const sample=expansion.markets.find(s=>s.source.market_type==='tennis_set_totals'),q=parseOdds(sample.response,sample.candidate,sample.observed_at),f=eventFacts(sample.source);
 assert.equal(comparison({...sample.source,family:'games_totals',market_type:'tennis_match_totals'},q,f).bookmakers.length,0);
 assert.equal(comparison({...sample.source,outcome:'Under 9.5'},q,f).bookmakers.length,0);
});
test('half-line handicaps use the selected participant sign, never a generic market line',()=>{
 const s=expansion.markets.find(s=>s.source.market_type==='spreads'),q=parseOdds(s.response,s.candidate,s.observed_at),f=eventFacts(s.source);
 assert(comparison(s.source,q,f).bookmakers.length);assert.deepEqual(comparison({...s.source,outcome_line:null},q,f),comparison(s.source,q,f));assert.equal(comparison({...s.source,outcome_line:null,question:'Spread: unclear'},q,f).bookmakers.length,0);
 for(const line of [0,1,1.25,1.75])assert.equal(comparison({...s.source,outcome_line:line},q,f).bookmakers.length,0);
 assert.equal(comparison({...s.source,outcome_line:-s.source.outcome_line},q,f).bookmakers.length,0);
 const t=expansion.markets.find(s=>s.source.market_type==='tennis_set_handicap'),tq=parseOdds(t.response,t.candidate,t.observed_at),tf=eventFacts(t.source);
 assert(comparison(t.source,tq,tf).bookmakers.length);assert.equal(comparison({...t.source,question:'Set Handicap: unclear'},tq,tf).bookmakers.length,0);
 assert.equal(comparison({...t.source,outcome:'Someone else'},tq,tf).bookmakers.length,0);
});
test('BTTS No uses the explicit boolean and never a winner No or missing selection',()=>{
 const s=expansion.markets.find(s=>s.source.market_type==='both_teams_to_score_first_half'),q=parseOdds(s.response,s.candidate,s.observed_at),f=eventFacts(s.source);
 assert(comparison(s.source,q,f).bookmakers.length);assert.equal(comparison({...s.source,family:'winner',market_type:'soccer_halftime_result'},q,f).bookmakers.length,0);
 const invalid=structuredClone(s.response);for(const g of invalid.data.findOddsByEventId.odds)for(const i of g.odds)i.bothTeamsToScore=null;
 assert.equal(comparison(s.source,parseOdds(invalid,s.candidate,s.observed_at),f).bookmakers.length,0);
});
const {parseFeed,feedRequests,discoverEvents,CONFIG_URL}=require('./flashscore-events');
const feedCandidates=feedFixture.feeds.flatMap(f=>parseFeed(f.text,{...f,config:feedFixture.config,observedAt:'2026-09-23T17:00:00Z'}));
test('real sport feeds confirm football, tennis and both MLB doubleheader games',()=>{
 for(const r of feedFixture.source_events){const m=matchEvent(eventFacts(r),feedCandidates,'flashscore');assert.equal(m.match_status,'matched',r.event_title);assert.equal(m.evidence.method,'flashscore_sport_day_feed');}
 const games=feedFixture.source_events.filter(r=>r.sport==='baseball').map(r=>matchEvent(eventFacts(r),feedCandidates,'flashscore'));
 assert.equal(new Set(games.map(g=>g.event_id)).size,2);for(const g of games)assert.deepEqual(g.participant_order,[1,0]);
 assert.throws(()=>parseFeed('<html>Access denied</html>',{}),/Invalid/);
 assert.equal(parseFeed(feedFixture.feeds[0].text,{...feedFixture.feeds[0],sportId:999,config:feedFixture.config}).length,0);
});
test('tennis full-name slugs are required; initials, doubles and wrong tournament fail closed',()=>{
 const r=feedFixture.source_events.find(r=>r.sport==='tennis'),f=eventFacts(r),c=feedCandidates.find(c=>c.sport==='tennis');
 assert.equal(matchEvent(f,[c],'flashscore').match_status,'matched');
 for(const patch of [{participant_slugs:null},{competition:'Different city'},{competition_category:'ITF MEN - DOUBLES'},{identity_conflict:true}])assert.equal(matchEvent(f,[{...c,...patch}],'flashscore').event_id,null);
});
test('event plan batches one request per sport/day and covers UTC boundaries',()=>{
 const f=feedFixture.source_events.map(eventFacts),p=feedRequests([...f,...f],feedFixture.config,Date.parse('2026-09-23T23:59:59Z'));
 assert.equal(p.requests.length,new Set(p.requests.map(r=>r.url)).size);assert(p.requests.some(r=>r.day===1));assert(p.requests.some(r=>r.day===-1));
 assert(p.requests.every(r=>/\/x\/feed\/f_\d+_-?\d+_0_en_1$/.test(r.url)));
 const old=feedRequests([{sport:'soccer',start_time:'2020-01-01'}],feedFixture.config,Date.parse('2026-09-23'));assert.equal(old.requests.length,0);assert.equal(old.unsupported[0].reason,'outside_feed_calendar');
});
test('discovery reads configuration and feeds only, with bounded concurrency and explicit failures',async()=>{
 let active=0,max=0;const urls=[];
 const fetchImpl=async(url,options)=>{urls.push(url);if(url===CONFIG_URL)return new Response('cjs._config = '+JSON.stringify(feedFixture.config));
  assert.equal(options.headers['x-fsign'],feedFixture.config.app.feed_sign);active++;max=Math.max(active,max);await new Promise(r=>setTimeout(r,2));active--;
  if(url.includes('_-1_'))return new Response('unavailable',{status:503});return new Response(feedFixture.feeds.find(f=>f.sport==='soccer').text);
 };
 const found=await discoverEvents([eventFacts(feedFixture.source_events[0])],{fetchImpl,http,embeddedJson:require('./providers').embeddedJson,now:Date.parse('2026-09-23')});
 assert(found.candidates.length);assert(found.diagnostics.some(d=>d.http_status===503));assert(max<=3);assert(urls.every(u=>u===CONFIG_URL||u.includes('/x/feed/')));
});
test('real feed participant IDs resolve to real bookmaker odds on three events',()=>{
 for(const sample of feedFixture.odds){const c=feedCandidates.find(c=>c.event_id===sample.event_id),q=parseOdds(sample.response,c,'2026-09-23T17:00:00Z');assert(q.length);assert(q.some(x=>x.bookmaker_name==='Betfair'));assert(q.some(x=>x.bookmaker_name==='1xBet'));assert(q.some(x=>x.canonical?.selection==='HOME'&&x.event_participant_id===c.participant_ids[0]));}
});
test('feed throttling stops queued requests; conflicts across calendar feeds cannot confirm identity',async()=>{
 const options={http,embeddedJson:require('./providers').embeddedJson,now:Date.parse('2026-09-23')};let calls=0;
 const throttled=await discoverEvents(feedFixture.source_events.map(eventFacts),{...options,fetchImpl:async(url)=>{if(url===CONFIG_URL)return new Response('cjs._config = '+JSON.stringify(feedFixture.config));calls++;return new Response('slow down',{status:429,headers:{'Retry-After':'60'}});}});
 assert(calls<=3);assert(throttled.diagnostics.some(d=>d.error==='Skipped after provider rate limit'));assert(throttled.diagnostics.some(d=>d.retry_after_ms===60000));
 let seq=0;const f=feedFixture.feeds.find(f=>f.sport==='soccer');const conflicting=await discoverEvents([eventFacts(feedFixture.source_events[0])],{...options,fetchImpl:async(url)=>{if(url===CONFIG_URL)return new Response('cjs._config = '+JSON.stringify(feedFixture.config));return new Response(seq++===0?f.text:f.text.replace('AE÷Aruba','AE÷Different team'));}});
 assert(conflicting.candidates.some(c=>c.identity_conflict));assert.equal(matchEvent(eventFacts(feedFixture.source_events[0]),conflicting.candidates,'flashscore').event_id,null);
});
test('quote participant identity prevents home/away inversion',()=>{
 const f={sport:'tennis',discipline:null,participants:['B Player','A Player'],competition:'Cup'},r={sport:'tennis',family:'winner',market_type:'moneyline',period:'match',outcome:'B Player',probability_percent:70};
 const q={bookmaker_name:'Betfair',bookmaker_id:429,active:true,decimal_odds:1.5,event_participant_name:'B Player',canonical:{sport:'tennis',discipline:null,type:'HOME_AWAY',period:'FULL_TIME',selection:'AWAY'}};
 assert.equal(comparison(r,[q],f).betfair.decimal_odds,1.5);assert.equal(comparison({...r,outcome:'A Player'},[q],f).betfair.matched,false);
});
const row={snapshot_at:'2026-09-22T17:26:11.788Z',match_id:'test-match',event_id:'poly-event',market_id:'poly-market',condition_id:'condition',outcome_id:'over',token_id:'token-over',sport:'soccer',league_name:'Categoría Primera B',league_code:'col2',match_title:'CD Real Santander vs. Orsomarso SC',game_start_time:'2026-09-22T21:00:00.000Z',family:'totals',market_type:'totals',period:'match',line:1.5,outcome_line:1.5,outcome:'Over',probability_percent:70,price:0.7,decimal_odds:1.429,custom_preserved:{nested:['untouched']}};
const facts=eventFacts(row),quotes=parseOdds(fixture.response,fixture.event,'2026-09-22T20:00:00.000Z');
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'betx-layer-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
async function layer(t,rows=[row],options={}){const dir=temp(t);fs.writeFileSync(path.join(dir,'combo-markets.jsonl'),rows.map(JSON.stringify).join('\n')+'\n');const root=path.join(dir,'combo-2');await build(dir,root,{discovery:async()=>({candidates:[fixture.event],errors:{},diagnostics:[]}),odds:{fetchEvent:async()=>({quotes,observed_at:'2026-09-22T20:00:00.000Z'})},...options});return {dir,root};}
test('real Flashscore contract: event identity, known bookmakers and odds arithmetic',()=>{assert(quotes.length>0);assert(quotes.some(q=>q.bookmaker_name==='Betfair'));const c=comparison(row,quotes,facts);assert(c.betfair.matched);assert.equal(c.betfair.probability_percent,100/c.betfair.decimal_odds);assert.equal(c.comparison.probability_difference_pp,70-100/c.betfair.decimal_odds);assert.throws(()=>parseOdds(fixture.response,{...fixture.event,event_id:'wrong'},'now'));});
test('fail closed for line, family, period, player/team, selection and binary No',()=>{for(const patch of [{line:9.25,outcome_line:9.25},{family:'corners_totals'},{family:'team_totals'},{family:'player_props'},{period:'set_1'},{outcome:'No'},{sport:'baseball'},{outcome:'Mystery'}])assert.equal(comparison({...row,...patch},quotes,facts).betfair.matched,false,JSON.stringify(patch));});
test('never use another bookmaker as Betfair; reject duplicate ambiguous quotes',()=>{const noBf=quotes.filter(q=>q.bookmaker_name!=='Betfair');assert.equal(comparison(row,noBf,facts).betfair.matched,false);const c=comparison(row,[...quotes,...quotes],facts);assert.equal(c.betfair.matched,false);});
test('strict ordered event matching rejects wrong competition/time/scope and ambiguity',()=>{assert.equal(matchEvent(facts,[fixture.event],'flashscore').match_status,'matched');for(const patch of [{participants:[...fixture.event.participants].reverse()},{competition:'Different competition'},{scope:'game'},{start_time:'2026-09-23T21:00:00Z'},{sport:'tennis'}])assert.equal(matchEvent(facts,[{...fixture.event,...patch}],'flashscore').event_url,null);assert.equal(matchEvent(facts,[fixture.event,{...fixture.event,event_id:'second'}],'flashscore').match_status,'ambiguous');});
test('esports routes and strict series/game/BO boundaries',()=>{assert.deepEqual(ROUTES.dota2,['dotabuff','opendota','liquipedia']);assert.deepEqual(ROUTES.cs2,['hltv','liquipedia']);const f={sport:'esports',discipline:'cs2',participants:['A','B'],competition:'Cup',start_time:'2026-09-22T21:00:00Z',scope:'series',best_of:3};const c={...f,provider:'hltv',event_id:'123',event_url:'https://www.hltv.org/matches/123/a-vs-b'};assert.equal(analyticsFor(f,[c]).provider,'hltv');assert.equal(analyticsFor(f,[c]).match_status,'matched');assert.equal(analyticsFor(f,[{...c,scope:'game'}]).event_url,null);assert.equal(analyticsFor(f,[{...c,best_of:1}]).event_url,null);assert.equal(analyticsFor({...f,discipline:'other'},[]).match_status,'provider_not_available');});
test('all rows unchanged, parent grouping, no missing sibling fill, bounded pages',async t=>{const rows=Array.from({length:20},(_,i)=>({...row,outcome_id:'o'+i,token_id:'t'+i}));let requests=0;const {dir,root}=await layer(t,rows,{odds:{fetchEvent:async()=>{requests++;return {quotes,observed_at:'2026-09-22T20:00:00Z'};}}});assert.equal(requests,1);assert.equal(validate(dir,root).outcomes,20);const e=read(path.join(root,'events',key(row.match_id),'index.json'));assert.equal(e.market_count,1);assert.equal(e.markets[0].parts.length,3);assert.equal(e.outcome_count,20);});
test('mixed or duplicate source snapshots fail; external errors retain all rows',async t=>{const {dir,root}=await layer(t,[row],{odds:{fetchEvent:async()=>{throw new Error('HTTP 429');}}});assert.equal(validate(dir,root).outcomes,1);assert.equal(read(path.join(root,'index.json')).build_status,'partial');fs.writeFileSync(path.join(dir,'combo-markets.jsonl'),JSON.stringify(row)+'\n'+JSON.stringify({...row,outcome_id:'second',snapshot_at:'different'})+'\n');await assert.rejects(build(dir,root,{offline:true}),/Mixed/);});
test('validator rejects changed Poly fields and mixed page IDs',async t=>{const {dir,root}=await layer(t);const e=read(path.join(root,'events',key(row.match_id),'index.json'));const file=path.join(root,e.markets[0].parts[0].path),part=read(file);part.market.outcomes[0].polymarket.price=0.1;write(file,part);assert.throws(()=>validate(dir,root));part.market.outcomes[0].polymarket.price=row.price;part.snapshot_id='other';write(file,part);assert.throws(()=>validate(dir,root));});
test('HTTP adapter uses observed event query once and honors throttling',async()=>{let calls=0;const client=new FlashscoreOdds(async url=>{calls++;const u=new URL(url);assert.equal(u.searchParams.get('_hash'),'oce');assert.equal(u.searchParams.get('eventId'),fixture.event.event_id);return {ok:true,status:200,json:async()=>fixture.response};});await client.fetchEvent(fixture.event);assert.equal(calls,1);await assert.rejects(http('https://www.flashscore.com/',async()=>({ok:false,status:429,headers:{get:k=>k==='Retry-After'?'15':null},text:async()=>'Too many requests'})),e=>e.retryAfterMs===15000);});
test('old reader navigation preserves page bytes and refreshes only manifest entries',async t=>{const {dir,root}=await layer(t);const text='Existing reader\nExternal odds are timestamped snapshots; standalone collector status is separate.\n';fs.writeFileSync(path.join(dir,'CHAT-START.md'),text);fs.writeFileSync(path.join(dir,'README.md'),text);fs.writeFileSync(path.join(dir,'chat-manifest.json'),JSON.stringify({files:[{path:'CHAT-START.md'},{path:'README.md'}]}));require('./link-reader').link(dir);const once=fs.readFileSync(path.join(dir,'CHAT-START.md'),'utf8');assert(!once.includes('standalone collector'));assert(once.includes('two-second pause'));require('./link-reader').link(dir);assert.equal(fs.readFileSync(path.join(dir,'CHAT-START.md'),'utf8'),once);const m=read(path.join(dir,'chat-manifest.json'));assert.equal(m.files[0].bytes,Buffer.byteLength(once));assert.equal(m.files[0].sha256,require('./storage').hash(once));assert.equal(validate(dir,root).outcomes,1);});
test('empty source remains valid',async t=>{const {dir,root}=await layer(t,[]);assert.equal(validate(dir,root).outcomes,0);});

test('validator rejects falsified analytics coverage and small-file overflow',async t=>{const {dir,root}=await layer(t);const file=path.join(root,'index.json'),index=read(file);index.coverage.normal.matched++;write(file,index);assert.throws(()=>validate(dir,root));assert.throws(()=>write(path.join(root,'too-large.json'),{text:'x'.repeat(60000)}),/exceeds/);});

function twoEvents(){const later=new Date(Date.parse(row.game_start_time)+3600000).toISOString();return {rows:[row,{...row,match_id:'same-event-group',outcome_id:'same-event-outcome'},{...row,match_id:'later-match',outcome_id:'later-outcome',game_start_time:later}],candidates:[fixture.event,{...fixture.event,event_id:'later-event',start_time:later}]};}
test('one pass deduplicates events, waits 2s after completion and reuses the saved snapshot',async t=>{
 const {rows,candidates}=twoEvents(),sequence=[];let active=0;
 const options={discovery:async()=>({candidates,errors:{},diagnostics:[]}),sleep:async ms=>{assert.equal(active,0);sequence.push(['pause',ms]);},odds:{fetchEvent:async event=>{assert.equal(active,0);active++;sequence.push(['request',event.event_id]);await Promise.resolve();active--;return {quotes:[],observed_at:new Date().toISOString()};}}};
 const {dir,root}=await layer(t,rows,options);assert.deepEqual(sequence,[['request',fixture.event.event_id],['pause',2000],['request','later-event']]);
 const index=read(path.join(root,'index.json'));assert.equal(index.odds_collection.successes,2);assert.equal(index.odds_collection.mode,'once_per_scanner_snapshot');assert(!('collector' in index));assert(!fs.existsSync(path.join(root,'runtime')));
 const before=fs.readFileSync(path.join(root,'index.json'),'utf8');await build(dir,root,{discovery:async()=>{throw Error('must reuse');},odds:{fetchEvent:async()=>{throw Error('must not refetch');}}});assert.equal(fs.readFileSync(path.join(root,'index.json'),'utf8'),before);
 const view=require('./view-event').viewEvent(root,row.match_id);assert.equal(view.markets[0].outcomes[0].polymarket.outcome_id,row.outcome_id);
 fs.writeFileSync(path.join(dir,'combo-markets.jsonl'),rows.map(r=>JSON.stringify({...r,snapshot_at:'2026-09-23T17:00:00Z'})).join('\n')+'\n');sequence.length=0;await build(dir,root,options);assert.equal(sequence.filter(x=>x[0]==='request').length,2);
});
test('rate limiting ends the pass without retries and preserves every source outcome',async t=>{
 const {rows,candidates}=twoEvents();let calls=0;
 const {dir,root}=await layer(t,rows,{discovery:async()=>({candidates,errors:{},diagnostics:[]}),sleep:async()=>{throw Error('no more requests');},odds:{fetchEvent:async()=>{calls++;throw new ProviderError('Rate limited',{status:429,retryAfterMs:60000});}}});
 assert.equal(calls,1);assert.equal(validate(dir,root).outcomes,3);const c=read(path.join(root,'index.json')).odds_collection;assert.equal(c.errors,1);assert.equal(c.rate_limits,1);assert.equal(c.skipped,1);
});
test('failed event is not retried, following event still waits 2s',async t=>{
 const {rows,candidates}=twoEvents();let calls=0,pauses=0;
 const {root}=await layer(t,rows,{discovery:async()=>({candidates,errors:{},diagnostics:[]}),sleep:async ms=>{assert.equal(ms,2000);pauses++;},odds:{fetchEvent:async()=>{calls++;if(calls===1)throw Error('Unavailable');return {quotes:[],observed_at:new Date().toISOString()};}}});assert.equal(calls,2);assert.equal(pauses,1);assert.equal(read(path.join(root,'index.json')).odds_collection.successes,1);
});

const nflTypes=require('./fixtures/nfl-markets.json');
const marketTypes={samples:[...require('./fixtures/market-types.json').samples,...nflTypes.samples]};
const reviewedEvents=require('./fixtures/event-aliases-20260927.json');
test('reviewed sport-feed identities preserve exact event URLs and participant order',()=>{
 for(const s of reviewedEvents.samples){const f=eventFacts(s.source),a=matchEvent(f,[s.candidate],'flashscore');assert.equal(a.event_id,s.candidate.event_id,s.source.match_title);assert.equal(a.event_url,s.candidate.event_url);assert.deepEqual(a.participant_order,s.order);}
});
test('reviewed aliases never relax opponent, competition, gender, time or identity checks',()=>{
 for(const s of reviewedEvents.samples){const f=eventFacts(s.source),c=s.candidate;
  for(const patch of [{participants:[c.participants[0],'Different opponent']},{competition:'Different competition'},{participants:c.participants.map(p=>p+' U19')},{start_time:new Date(Date.parse(f.start_time)+300001).toISOString()},{scope:'game'},{identity_conflict:true}])assert.equal(matchEvent(f,[{...c,...patch}],'flashscore').event_id,null,s.source.match_title);
  assert.equal(matchEvent(f,[c,{...c,event_id:'duplicate-event'}],'flashscore').match_status,'ambiguous');
 }
 const s=reviewedEvents.samples.find(s=>s.source.league_code==='nfl');assert.equal(matchEvent({...eventFacts(s.source),competition:'Unrelated league'},[{...s.candidate,competition:'Unrelated league'}],'flashscore').event_id,null);
});
test('NFL quotes follow the named team across reversed event order and signed handicaps',()=>{
 assert.deepEqual(nflTypes.samples.map(s=>s.source.market_type).sort(),['moneyline','totals','spreads','first_half_totals','first_half_spreads'].sort());
 for(const s of nflTypes.samples){const f=eventFacts(s.source),q=parseOdds(s.response,s.event,s.observed_at),c=comparison(s.source,q,f);assert(c.bookmakers.length);assert.deepEqual(matchEvent(f,[s.event],'flashscore').participant_order,[1,0]);
  if(s.source.family==='handicap'){assert(s.expected.line>0);assert.equal(comparison(s.source,c.bookmakers.map(x=>({...x,canonical:{...x.canonical,line:-x.canonical.line}})),f).bookmakers.length,0);}
  for(const patch of [{league_code:'unknown'},{period:'quarter_1'},{market_type:'second_half_totals',period:'half_2',family:'totals'}])assert.equal(comparison({...s.source,...patch},q,f).bookmakers.length,0);
 }
});
test('new market mappings reproduce factual feed quotes and preserve source rows',()=>{
 for(const s of marketTypes.samples){const before=JSON.stringify(s.source),q=parseOdds(s.response,s.event,s.observed_at),c=comparison(s.source,q,eventFacts(s.source));const b=c.bookmakers.find(x=>x.bookmaker_id===s.expected.bookmaker_id);assert(b,s.source.market_type);assert.equal(b.decimal_odds,s.expected.decimal_odds);assert.equal(b.betting_scope,s.expected.period);assert.equal(JSON.stringify(s.source),before);}
});
test('US full-game quotes require overtime scope; halves and innings cannot substitute',()=>{
 for(const s of marketTypes.samples.filter(s=>['baseball','american-football'].includes(s.source.sport))){
  const response=structuredClone(s.response);for(const g of response.data.findOddsByEventId.odds)g.bettingScope=s.source.period==='match'?'FULL_TIME':'FULL_TIME_OVER_TIME';
  assert.equal(comparison(s.source,parseOdds(response,s.event,s.observed_at),eventFacts(s.source)).bookmakers.length,0);
  const q=parseOdds(s.response,s.event,s.observed_at);for(const patch of [{period:'innings_1_5'},{league_code:'mlbb'},{sport:'cricket'},{outcome:'No'}])assert.equal(comparison({...s.source,...patch},q,eventFacts({...s.source,...patch})).bookmakers.length,0);
 }
});
test('US handicaps require exact named participant, explicit signed half line and consistent source line',()=>{
 for(const s of marketTypes.samples.filter(s=>s.source.family==='handicap')){const q=parseOdds(s.response,s.event,s.observed_at),f=eventFacts(s.source);
  for(const patch of [{question:'Spread: Unknown (-1.5)'},{question:s.source.question.replace(/[+-]/g,'')},{outcome_line:100.5},{line:100.5},{outcome:'Unknown'},{period:'half_2'}])assert.equal(comparison({...s.source,...patch},q,f).bookmakers.length,0);
  const selected=q.filter(x=>x.canonical&&x.event_participant_name===s.source.outcome&&x.line===s.expected.line);if(selected.length)assert.equal(comparison(s.source,selected.map(x=>({...x,canonical:{...x.canonical,line:-x.canonical.line}})),f).bookmakers.length,0);
 }
});
test('new totals cannot be confused with team totals, corners, unknown units or whole lines',()=>{
 for(const s of marketTypes.samples.filter(s=>s.source.family==='totals')){const f=eventFacts(s.source),q=parseOdds(s.response,s.event,s.observed_at);
  for(const patch of [{family:'team_totals',market_type:'team_totals'},{family:'corners_totals',market_type:'total_corners'},{line:2,outcome_line:2},{outcome_line:s.source.line+1}])assert.equal(comparison({...s.source,...patch},q,f).bookmakers.length,0);
  for(const metric of ['CORNERS','GAMES','SETS',null]){const raw=structuredClone(s.response);for(const g of raw.data.findOddsByEventId.odds)for(const i of g.odds)if(i.handicap)i.handicap.type=metric;assert.equal(comparison(s.source,parseOdds(raw,s.event,s.observed_at),f).bookmakers.length,0);}
 }
});
test('reversed US title order follows participant IDs and does not invert handicap sign',()=>{
 for(const s of marketTypes.samples.filter(s=>['baseball','american-football'].includes(s.source.sport)&&s.source.family!=='totals')){const q=parseOdds(s.response,s.event,s.observed_at),f=eventFacts(s.source),a=comparison(s.source,q,f),b=comparison(s.source,q,{...f,participants:[...f.participants].reverse()});assert.deepEqual(a,b);}
});
test('soccer halftime Yes requires exact proposition and No remains unmatched',()=>{
 const s=marketTypes.samples.find(s=>s.source.market_type==='soccer_halftime_result'),q=parseOdds(s.response,s.event,s.observed_at),f=eventFacts(s.source);for(const patch of [{outcome:'No'},{question:'Someone leading at halftime?'},{period:'match'}])assert.equal(comparison({...s.source,...patch},q,f).bookmakers.length,0);
});

test('legacy snapshot migrates aggregates from saved quotes without network requests',async t=>{
 const s=marketTypes.samples.find(s=>s.source.market_type==='totals'),r={...row,...s.source,match_id:'legacy',outcome_id:'legacy-outcome'};
 const {dir,root}=await layer(t,[r],{discovery:async()=>({candidates:[s.event],errors:{},diagnostics:[]}),odds:{fetchEvent:async()=>({quotes:[],observed_at:s.observed_at})}});
 const e=read(path.join(root,'events',key(r.match_id),'index.json')),file=path.join(root,e.markets[0].parts[0].path),part=read(file),out=part.market.outcomes[0];delete out.bookmaker_aggregate;delete out.market_edge_pp;Object.assign(out,comparison(r,[],e.facts));out.betfair.reason='unsupported_or_unproven_market_semantics';write(file,part);
 const index=read(path.join(root,'index.json'));delete index.schema_version;index.coverage.esports={};index.coverage.betfair_matched=0;index.coverage.betfair_unmatched=1;write(path.join(root,'index.json'),index);assert.equal(validate(dir,root).outcomes,1);
 const collection=structuredClone(index.odds_collection);await build(dir,root,{discovery:async()=>{throw Error('no discovery');},odds:{fetchEvent:async()=>{throw Error('no recollection');}}});assert.equal(validate(dir,root).outcomes,1);const updated=read(file).market.outcomes[0];assert.equal(updated.bookmaker_aggregate.bookmaker_count,0);assert.equal(updated.market_edge_pp,null);assert(!updated.betfair);assert.deepEqual(read(path.join(root,'index.json')).odds_collection,collection);
});

const {median,enrich,summarize}=require('./market-summary');
test('fair median excludes incomplete books while retaining all raw odds',()=>{
 const raw=quotes.find(q=>comparison(row,[q],facts).bookmakers.length),pairs=[[1.8,2.0],[1.85,1.9],[1.83,null]],all=[];
 for(let i=0;i<pairs.length;i++){const q={...raw,bookmaker_id:i,bookmaker_name:['Betfair','Bet365','Unibet'][i],decimal_odds:pairs[i][0]};all.push(q);if(pairs[i][1])all.push({...q,decimal_odds:pairs[i][1],canonical:{...q.canonical,selection:'UNDER'}});}
 const q=require('./fair-probability').attachMarkets(all),c=enrich(row,q,facts),a=c.bookmaker_aggregate,expected=(100*2/3.8+100*1.9/3.75)/2;
 assert.equal(a.bookmaker_count,3);assert.equal(a.fair_bookmaker_count,2);assert(Math.abs(a.median_fair_probability_percent-expected)<1e-12);assert.equal(c.market_edge_pp,a.median_fair_probability_percent-70);assert.equal(a.polymarket_vs_market_median_pp,-c.market_edge_pp);assert.equal(a.median_odds,1.83);assert.equal(a.min_odds,1.8);assert.equal(a.max_odds,1.85);assert.equal(c.bookmakers[2].fair_probability_percent,null);assert.equal(c.bookmakers[2].display,'Unibet 1.83 (—)');assert(c.bookmakers[0].display.includes('(52.6%)'));assert.equal(enrich(row,[...q,q[0]],facts).bookmaker_aggregate.fair_bookmaker_count,1);assert.equal(median([3,1,2]),2);assert.equal(summarize(row,[]).market_edge_pp,null);
});
test('esports excluded before discovery and absent from output and ranking',async t=>{
 const es={...row,sport:'esports',league_code:'cs2',match_id:'esports',outcome_id:'es-outcome',match_title:'A vs. B (BO3) - Cup'};let inspected=false;
 const {dir,root}=await layer(t,[row,es],{discovery:async facts=>{inspected=true;assert.equal(facts.length,1);assert.equal(facts[0].sport,'soccer');return {candidates:[fixture.event],errors:{},diagnostics:[]};}});assert(inspected);assert.equal(validate(dir,root).outcomes,1);const index=read(path.join(root,'index.json'));assert.equal(index.source_outcomes,2);assert.equal(index.excluded_outcomes.esports,1);assert(!index.sports.some(s=>s.name==='esports'));assert(!fs.existsSync(path.join(root,'events',key('esports'))));assert(!Object.hasOwn(index.coverage,'esports'));
});
test('market edge ranking is descending, deterministic, paged and readable inside Combo 2.0',async t=>{
 const rows=Array.from({length:42},(_,i)=>({...row,outcome_id:'rank-'+String(i).padStart(2,'0'),probability_percent:i===41?95:i<2?65:70}));rows.push({...row,outcome_id:'missing',outcome:'No'});
 const {dir,root}=await layer(t,rows),index=read(path.join(root,'index.json')),menu=read(path.join(root,index.market_edge_ranking.path)),items=menu.pages.flatMap(p=>read(path.join(root,p.path)).items);assert.equal(items.length,42);assert.equal(menu.unranked_outcomes,1);assert.equal(menu.pages.length,3);assert.equal(items[0].outcome_id,'rank-00');assert.equal(items[1].outcome_id,'rank-01');assert.equal(items.at(-1).outcome_id,'rank-41');assert(items[0].market_edge_pp>0);assert(items.at(-1).market_edge_pp<0);assert.equal(validate(dir,root).outcomes,43);const reader=fs.readFileSync(path.join(root,'rankings/market-edge/page-1.md'),'utf8');assert(reader.includes('Median БК'));assert(reader.includes('Polymarket vs market median'));assert(reader.includes('page-2.md'));assert(fs.readFileSync(path.join(root,'README.md'),'utf8').includes('rankings/market-edge/index.md'));
 const file=path.join(root,menu.pages[0].path),page=read(file);page.items.reverse();write(file,page);assert.throws(()=>validate(dir,root));
});
test('aggregate and readable ranking tampering fail validation',async t=>{
 const {dir,root}=await layer(t),event=read(path.join(root,'events',key(row.match_id),'index.json')),file=path.join(root,event.markets[0].parts[0].path),page=read(file),original=structuredClone(page);page.market.outcomes[0].bookmaker_aggregate.median_odds=999;write(file,page);assert.throws(()=>validate(dir,root));write(file,original);fs.appendFileSync(path.join(root,'rankings/market-edge/page-1.md'),'Wrong ranking');assert.throws(()=>validate(dir,root));
});

test('saved fair evidence and readable bookmaker probabilities are validated',async t=>{
 const {dir,root}=await layer(t),e=read(path.join(root,'events',key(row.match_id),'index.json')),part=e.markets[0].parts[0],file=path.join(root,part.path),original=read(file);
 assert(original.market.outcomes[0].bookmakers.some(q=>q.fair_probability_percent!==null));
 const reader=fs.readFileSync(path.join(root,part.reader_path),'utf8');assert(reader.includes('Median БК'));assert(reader.includes('Betfair'));assert(/%\\?\)/.test(reader));
 for(const mutate of [q=>q.fair_probability_percent=99,q=>q.full_market.bookmaker_id=-1,q=>q.full_market.outcomes.pop(),q=>q.display='Wrong']){const changed=structuredClone(original);mutate(changed.market.outcomes[0].bookmakers[0]);write(file,changed);assert.throws(()=>validate(dir,root));}write(file,original);assert.equal(validate(dir,root).outcomes,1);
});

test('schema-3 migration keeps raw odds but never reconstructs missing complete markets',async t=>{
 const {dir,root}=await layer(t),e=read(path.join(root,'events',key(row.match_id),'index.json')),part=e.markets[0].parts[0],file=path.join(root,part.path),page=read(file),out=page.market.outcomes[0],v3=require('./market-summary-v3');
 for(const q of out.bookmakers)for(const field of ['full_market','fair_probability_percent','fair_probability_status','fair_probability_method','market_overround_percent','display'])delete q[field];
 Object.assign(out,v3.enrich(out.polymarket,out.bookmakers,e.facts));write(file,page);
 const index=read(path.join(root,'index.json'));index.schema_version=3;index.market_edge_ranking=v3.writeRanking(root,{snapshot_id:index.snapshot_id,snapshot_at:index.snapshot_at},[v3.rankingRow(e,out,part.path)],1,0);write(path.join(root,'index.json'),index);assert.equal(validate(dir,root).outcomes,1);
 const rawOdds=out.bookmakers.map(q=>q.decimal_odds),collection=structuredClone(index.odds_collection);
 await build(dir,root,{discovery:async()=>{throw Error('No rediscovery');},odds:{fetchEvent:async()=>{throw Error('No odds refresh');}}});
 const migrated=read(file).market.outcomes[0],current=read(path.join(root,'index.json'));assert.equal(current.schema_version,4);assert.deepEqual(current.odds_collection,collection);assert.deepEqual(migrated.bookmakers.map(q=>q.decimal_odds),rawOdds);assert(migrated.bookmakers.every(q=>q.fair_probability_percent===null));assert.equal(migrated.bookmaker_aggregate.median_fair_probability_percent,null);assert.equal(current.market_edge_ranking.ranked_outcomes,0);assert.equal(validate(dir,root).outcomes,1);
});
test('next esports-only snapshot clears old rankings without provider requests',async t=>{
 const {dir,root}=await layer(t);assert(fs.existsSync(path.join(root,'rankings/market-edge/page-1.md')));const es={...row,snapshot_at:'2026-09-23T17:00:00Z',sport:'esports',league_code:'cs2'};fs.writeFileSync(path.join(dir,'combo-markets.jsonl'),JSON.stringify(es)+'\n');await build(dir,root,{discovery:async()=>{throw Error('No discovery for excluded events');},odds:{fetchEvent:async()=>{throw Error('No odds for excluded events');}}});assert.equal(validate(dir,root).outcomes,0);assert(!fs.existsSync(path.join(root,'rankings/market-edge/page-1.md')));assert.equal(read(path.join(root,'index.json')).market_edge_ranking.ranked_outcomes,0);
});

const recognition=require('./fixtures/recognition-expansion.json');
const identityExpansion=require('./fixtures/event-identities-2026-09-29.json');
const octoberIdentities=require('./fixtures/event-identities-2026-10-01.json');

test('October feed identities and bookmaker prices require exact participants and market scope',()=>{
 assert.equal(octoberIdentities.events.length,47);
 for(const s of octoberIdentities.events){const f=eventFacts(s.source),c=s.candidate;assert.equal(matchEvent(f,[c],'flashscore').event_id,c.event_id,s.source.match_title);
  for(const patch of [{start_time:new Date(Date.parse(c.start_time)+3600000).toISOString()},{competition:'Unrelated competition'},{participants:['Unknown','Opponent'],participant_slugs:['unknown','opponent']},{identity_conflict:true}])assert.equal(matchEvent(f,[{...c,...patch}],'flashscore').event_id,null);
  assert.equal(matchEvent(f,[c,{...c,event_id:'duplicate'}],'flashscore').match_status,'ambiguous');
 }
 for(const s of octoberIdentities.markets){const q=parseOdds(s.response,s.candidate,s.observed_at),f=eventFacts(s.source);assert(comparison(s.source,q,f).bookmakers.length,s.source.question);assert.equal(comparison({...s.source,period:'unknown'},q,f).bookmakers.length,0);}
});
test('full-name tennis aliases do not drop arbitrary middle names or accept initials',()=>{
 for(const s of octoberIdentities.events.filter(s=>s.source.sport==='tennis')){const f=eventFacts(s.source);for(const wrong of ['Someone Else',f.participants[0]+' Unknown'])assert.equal(matchEvent({...f,participants:[wrong,f.participants[1]]},[s.candidate],'flashscore').event_id,null);}
});
test('football first-half handicap recovers only an explicit signed named-team line',()=>{
 const s=octoberIdentities.markets.find(s=>s.source.market_type==='first_half_spreads');assert(s);const f=eventFacts(s.source),q=parseOdds(s.response,s.candidate,s.observed_at);assert.equal(s.source.outcome_line,null);assert(comparison(s.source,q,f).bookmakers.length);
 for(const patch of [{question:'1st Half Spread: Unknown (-1.5)'},{question:s.source.question.replace(/[+-]/g,'')},{line:2},{outcome:'Unknown'},{period:'match'}])assert.equal(comparison({...s.source,...patch},q,f).bookmakers.length,0);
 assert.equal(comparison(s.source,q.map(q=>({...q,canonical:q.canonical?{...q.canonical,period:'SECOND_HALF'}:null})),f).bookmakers.length,0);
});
test('44 additional real feed identities preserve strict participants, time and competition',()=>{
 assert.equal(identityExpansion.events.length,44);
 for(const s of identityExpansion.events){const f=eventFacts(s.source),c=s.candidate;assert.equal(matchEvent(f,[c],'flashscore').event_id,c.event_id,s.source.match_title);
  for(const patch of [{start_time:new Date(Date.parse(c.start_time)+3600000).toISOString()},{competition:'Unrelated league'},{sport:'unrelated'},{participants:['Wrong','Opponent'],participant_slugs:['wrong','opponent']},{identity_conflict:true}])assert.equal(matchEvent(f,[{...c,...patch}],'flashscore').event_id,null,s.source.match_title);
  assert.equal(matchEvent(f,[c,{...c,event_id:'duplicate'}],'flashscore').match_status,'ambiguous');
 }
});
test('NHL abbreviations preserve reversed teams and tennis main draw cannot match qualifiers',()=>{
 for(const s of identityExpansion.events.filter(s=>s.source.sport==='hockey')){const f=eventFacts(s.source);assert.deepEqual(matchEvent(f,[s.candidate],'flashscore').participant_order,[1,0]);assert.equal(matchEvent({...f,competition:'AHL'},[{...s.candidate,competition:'AHL'}],'flashscore').event_id,null);}
 for(const s of identityExpansion.events.filter(s=>s.source.sport==='tennis'))assert.equal(matchEvent(eventFacts(s.source),[{...s.candidate,competition:'Beijing (China) - Qualification, hard'}],'flashscore').event_id,null);
});
test('recognition expansion reproduces exact reviewed feed events and native odds',()=>{
 for(const s of recognition.events){const f=eventFacts(s.source);assert.equal(matchEvent(f,[s.candidate],'flashscore').event_id,s.candidate.event_id);for(const patch of [{start_time:'2020-01-01T00:00:00Z'},{participants:['Wrong','Opponent'],participant_slugs:['wrong','opponent']},{competition:'Unrelated competition'}])assert.equal(matchEvent(f,[{...s.candidate,...patch}],'flashscore').event_id,null);}
 for(const s of recognition.markets){const q=parseOdds(s.response,s.candidate,s.observed_at),f=eventFacts(s.source),result=comparison(s.source,q,f);assert(result.bookmakers.length>0,s.source.question);for(const b of result.bookmakers)assert(q.includes(b));assert.equal(comparison({...s.source,period:'unknown'},q,f).bookmakers.length,0);}
});
test('native double chance follows participant IDs, not array order or summed prices',()=>{
 const samples=recognition.markets.filter(s=>s.response.data.findOddsByEventId.odds.some(g=>g.bettingType==='DOUBLE_CHANCE'));assert(samples.length>=6);
 for(const s of samples){const f=eventFacts(s.source),raw=structuredClone(s.response),original=comparison(s.source,parseOdds(raw,s.candidate,s.observed_at),f);for(const g of raw.data.findOddsByEventId.odds)g.odds.reverse();assert.deepEqual(comparison(s.source,parseOdds(raw,s.candidate,s.observed_at),f),original);
  for(const mutation of ['missing','duplicate','unknown','wrong-period']){const data=structuredClone(s.response);for(const g of data.data.findOddsByEventId.odds){if(mutation==='missing')g.odds.pop();if(mutation==='duplicate')g.odds[0].eventParticipantId=g.odds[1].eventParticipantId;if(mutation==='unknown')g.odds[0].eventParticipantId='unknown';if(mutation==='wrong-period')g.bettingScope='UNSUPPORTED';}assert.equal(comparison(s.source,parseOdds(data,s.candidate,s.observed_at),f).bookmakers.length,0,mutation);}
  assert.equal(comparison({...s.source,question:'Will Unrelated Team win on 2026-09-28?'},parseOdds(s.response,s.candidate,s.observed_at),f).bookmakers.length,0);
  const synthetic=structuredClone(s.response);for(const g of synthetic.data.findOddsByEventId.odds)g.bettingType='HOME_DRAW_AWAY';assert.equal(comparison(s.source,parseOdds(synthetic,s.candidate,s.observed_at),f).bookmakers.length,0);
 }
});
test('neither-to-score is only the explicit zero-goals proposition in regulation',()=>{
 const s=recognition.markets.find(s=>s.source.market_type==='soccer_first_to_score');assert(s);const f=eventFacts(s.source),q=parseOdds(s.response,s.candidate,s.observed_at);assert(comparison(s.source,q,f).bookmakers.length);
 for(const patch of [{question:f.participants[0]+' to score first vs. '+f.participants[1]+'?'},{question:'Wrong vs. Opponent: Neither team to score first?'},{period:'half_1'},{family:'team_totals'},{market_type:'total_corners'}])assert.equal(comparison({...s.source,...patch},q,f).bookmakers.length,0);
 assert.equal(comparison(s.source,q.map(q=>({...q,canonical:{...q.canonical,line:1.5}})),f).bookmakers.length,0);
});
test('tennis tournament aliases preserve qualification and WNBA winners require overtime',()=>{
 for(const s of recognition.events.filter(s=>s.source.sport==='tennis')){const f=eventFacts(s.source);if(/Qualification/.test(f.competition))assert.equal(matchEvent({...f,competition:f.competition.replace(/, Qualification/,'')},[s.candidate],'flashscore').event_id,null);}
 const samples=recognition.markets.filter(s=>s.source.sport==='basketball');assert.equal(samples.length,3);for(const s of samples){const f=eventFacts(s.source),q=parseOdds(s.response,s.candidate,s.observed_at);assert(comparison(s.source,q,f).bookmakers.length);assert.equal(comparison(s.source,q.map(q=>({...q,canonical:{...q.canonical,period:'FULL_TIME'}})),f).bookmakers.length,0);assert.equal(comparison({...s.source,league_code:'nba'},q,f).bookmakers.length,0);}
});
test('misclassified MLBB is excluded before discovery and schema-3 policy migration uses saved odds',async t=>{
 const es={...row,sport:'baseball',league_code:'mlbb',match_id:'mlbb',outcome_id:'mlbb-outcome'};
 const {dir,root}=await layer(t,[row,es],{discovery:async facts=>{assert.equal(facts.length,1);return {candidates:[fixture.event],errors:{},diagnostics:[]};}});assert.equal(validate(dir,root).outcomes,1);assert.equal(read(path.join(root,'index.json')).excluded_outcomes.esports,1);
 // Build an authentic old-policy schema-3 snapshot using a private module copy.
 const temp=path.join(dir,'old-code');fs.mkdirSync(temp);for(const file of ['build.js','matching.js','providers.js','flashscore-events.js','storage.js','market-summary.js','market-summary-fair.js','market-summary-v3.js','fair-probability.js','validate.js','view-event.js'])fs.copyFileSync(path.join(__dirname,file),path.join(temp,file));
 const buildFile=path.join(temp,'build.js');fs.writeFileSync(buildFile,fs.readFileSync(buildFile,'utf8').replaceAll('!isEsports(r)',"r.sport!=='esports'").replace('exclusion_policy_version:2','exclusion_policy_version:1'));
 const historical=path.join(dir,'historical');await require(path.join(temp,'build')).build(dir,historical,{discovery:async()=>({candidates:[fixture.event],errors:{},diagnostics:[]}),odds:{fetchEvent:async()=>({quotes,observed_at:fixture.observed_at})},sleep:async()=>{}});assert.equal(validate(dir,historical).outcomes,2);const before=read(path.join(historical,'index.json'));
 await build(dir,historical,{discovery:async()=>{throw Error('No rediscovery');},odds:{fetchEvent:async()=>{throw Error('No recollection');}}});const after=read(path.join(historical,'index.json'));assert.equal(validate(dir,historical).outcomes,1);assert.equal(after.exclusion_policy_version,2);assert.deepEqual(after.odds_collection,before.odds_collection);assert.equal(after.coverage.bookmaker_outcomes,before.coverage.bookmaker_outcomes);assert.equal(after.excluded_outcomes.esports,1);
});
