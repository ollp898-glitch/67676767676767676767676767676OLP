const test=require('node:test'),assert=require('assert/strict');
const f=require('./fixtures/strategy-coverage-2026-10-07.json');
const {eventFacts,matchEvent,marketKey}=require('./matching');const {eventMatch,parseQuotes,matchedQuotes}=require('./bmr');
test('October 7 reviewed Flashscore identities retain strict sport, participants, league and start',()=>{
 assert.equal(f.events.length,21);
 for(const x of f.events){const facts=eventFacts(x.source);assert.equal(matchEvent(facts,[x.candidate],'flashscore').event_id,x.candidate.event_id,x.source.match_title);
  for(const change of [{sport:'other'},{participants:['Unknown','Teams']},{competition:'Unrelated league'},{start_time:new Date(Date.parse(facts.start_time)+300001).toISOString()}])assert.equal(matchEvent(facts,[{...x.candidate,...change}],'flashscore').event_id,null);
 }
});
test('BMR scoped NHL, CFB and MLB identities recover real events without fuzzy matching',()=>{
 assert.equal(f.bmr_events.length,6);for(const x of f.bmr_events){const facts=eventFacts(x.source);assert.equal(eventMatch(facts,[x.event],x.source.league_code).status,'matched');
 for(const change of [{spid:99},{lid:99},{des:'Unknown@Team'},{dt:x.event.dt+300001}])assert.equal(eventMatch(facts,[{...x.event,...change}],x.source.league_code).status,'unmatched');}
});
test('live WNBA BMR lines prove overtime totals and participant labels',()=>{
 const x=f.basketball,quotes=parseQuotes(x.event,x.lines,x.options,x.types,x.observed_at);assert(quotes.length>0);assert(quotes.every(q=>q.canonical.period==='FULL_TIME_OVER_TIME'));
 const facts={sport:'basketball',discipline:null,participants:['Las Vegas Aces','Golden State Valkyries'],start_time:new Date(x.event.dt).toISOString()};
 const row={sport:'basketball',league_code:'wnba',family:'winner',market_type:'moneyline',period:'match',outcome:'Las Vegas Aces'};
 assert(matchedQuotes(row,quotes,facts).length>0);assert.equal(matchedQuotes({...row,league_code:'nba'},quotes,facts).length,0);
 assert.equal(matchedQuotes({...row,period:'half_1'},quotes,facts).length,0);
 const totals=quotes.filter(q=>q.canonical.type==='OVER_UNDER'&&Math.abs(q.canonical.line%1)===.5);assert(totals.length);for(const q of totals){const r={...row,family:'totals',market_type:'totals',outcome:q.canonical.selection==='OVER'?'Over':'Under',line:q.canonical.line};assert(marketKey(r,facts));assert(matchedQuotes(r,quotes,facts).length);assert.equal(matchedQuotes(r,[{...q,canonical:{...q.canonical,line:q.canonical.line+.5}}],facts).length,0);}
});
