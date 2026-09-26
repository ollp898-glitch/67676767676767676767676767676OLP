const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {source,read,MAX_BYTES}=require('./storage');
const {comparison,directUrl}=require('./matching');
function validate(sourceDir,root){
 const src=source(sourceDir),index=read(path.join(root,'index.json'));assert.equal(index.source_sha256,src.sha256);assert.equal(index.snapshot_id,src.snapshot_id);const seen=[],counts={events:0,markets:0,bf:0,books:0};
 const coverage={normal:{matched:0,unmatched:0,ambiguous:0},esports:{},flashscore_events:{}};
 const load=p=>{const file=path.resolve(root,p);assert(file.startsWith(path.resolve(root)+path.sep),'Unsafe path');assert(fs.statSync(file).size<=MAX_BYTES);const d=read(file);assert.equal(d.snapshot_id,index.snapshot_id);assert.equal(d.snapshot_at,index.snapshot_at);return d;};
 function bucket(b){const doc=load(b.path);if(doc.disciplines){assert.equal(b.events,doc.disciplines.reduce((n,d)=>n+d.events,0));assert.equal(b.outcomes,doc.disciplines.reduce((n,d)=>n+d.outcomes,0));for(const d of doc.disciplines)bucket(d);return;}let outcomes=0,events=0;for(const page of doc.pages)for(const entry of load(page).events){const e=load(entry.path);events++;counts.events++;
 const analytics=e.analytics;if(analytics.match_status==='matched')assert(directUrl(analytics.provider,analytics.event_url));else assert.equal(analytics.event_url,null);
 const fc=coverage.flashscore_events[e.sport]??={total:0,matched:0,unmatched:0,ambiguous:0};fc.total++;fc[e.odds_source.match_status]++;
 if(e.odds_source.match_status==='matched'){assert(directUrl('flashscore',e.odds_source.event_url));assert(e.odds_source.event_id);assert.deepEqual([...e.odds_source.participant_order].sort(),[0,1]);}else assert.equal(e.odds_source.event_id,null);
 if(e.sport!=='esports')coverage.normal[analytics.match_status]=(coverage.normal[analytics.match_status]||0)+1;
 else{const provider=analytics.provider||'unavailable';coverage.esports[provider]??={matched:0,unmatched:0,ambiguous:0,fallback_matched:0};const stat=coverage.esports[provider];stat[analytics.match_status]=(stat[analytics.match_status]||0)+1;if(analytics.match_status==='matched'&&analytics.route_position>0)stat.fallback_matched++;}
 let eventRows=0;const markets=e.markets||e.market_pages.flatMap(p=>load(p).markets);assert.equal(markets.length,e.market_count);for(const m of markets){counts.markets++;let n=0;for(const part of m.parts){const p=load(part.path);assert.equal(p.match_id,e.match_id);assert.equal(p.market.market_id,m.market_id);assert.equal(p.market.outcomes.length,part.outcomes);for(const out of p.market.outcomes){assert.equal(out.polymarket.match_id,e.match_id);assert.equal(out.polymarket.market_id,m.market_id);assert(!Object.hasOwn(out,'analytics'));seen.push(out.polymarket);n++;
 const recomputed=comparison(out.polymarket,out.bookmakers,e.facts);// A saved snapshot may predate support for this type; preserve its historical absence reason.
 const legacyUnsupported=out.betfair.matched===false&&out.betfair.reason==='unsupported_or_unproven_market_semantics'&&recomputed.betfair.matched===false&&recomputed.betfair.reason==='betfair_selection_not_available';
 assert.deepEqual(out.betfair,legacyUnsupported?{...recomputed.betfair,reason:out.betfair.reason}:recomputed.betfair);assert.deepEqual(out.comparison,recomputed.comparison);
 if(out.betfair.matched){counts.bf++;assert.equal(out.betfair.probability_percent,100/out.betfair.decimal_odds);assert.equal(out.comparison.probability_difference_pp,out.polymarket.probability_percent-out.betfair.probability_percent);}else assert.equal(out.comparison.probability_difference_pp,null);if(out.bookmakers.length)counts.books++;}}assert.equal(n,m.outcome_count);eventRows+=n;}assert.equal(eventRows,e.outcome_count);assert.equal(eventRows,entry.outcomes);outcomes+=eventRows;}
 assert.equal(events,b.events);assert.equal(outcomes,b.outcomes);}
 for(const b of index.sports)bucket(b);
 const sort=a=>a.slice().sort((a,b)=>a.outcome_id.localeCompare(b.outcome_id));assert.deepEqual(sort(seen),sort(src.rows));assert.equal(seen.length,index.layer_outcomes);assert.equal(seen.length,index.source_outcomes);assert.equal(counts.events,index.events);assert.equal(counts.markets,index.markets);assert.equal(counts.bf,index.coverage.betfair_matched);assert.equal(counts.books,index.coverage.bookmaker_outcomes);assert.equal(index.coverage.betfair_unmatched,seen.length-counts.bf);assert.equal(index.coverage.bookmaker_unmatched,seen.length-counts.books);
 assert.deepEqual(index.coverage.normal,coverage.normal);assert.deepEqual(index.coverage.esports,coverage.esports);
 assert.deepEqual(index.coverage.flashscore_events,coverage.flashscore_events);
 for(const p of load('registry/index.json').events)load(p);for(const p of load(index.diagnostics).pages)load(p);
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(e.name.endsWith('.json'))load(path.relative(root,file));}}walk(root);
 return {valid:true,...counts,outcomes:seen.length,snapshot_id:index.snapshot_id};
}
module.exports={validate};
if(require.main===module)console.log(JSON.stringify(validate(process.argv[2]||'out',process.argv[3]||path.join(process.argv[2]||'out','combo-2'))));
