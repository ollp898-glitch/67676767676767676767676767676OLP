const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {historicalFields,deltaFields,enrichHistory}=require('./price-history');const {flattenMarkets,ladders,writeOutcomeExports}=require('./outcome-exports');
async function test(){
 const at='2026-09-16T12:00:00Z',t=Date.parse(at)/1000;
 const h=historicalFields([{t:t-3600-60,p:0.85},{t:t-3600+1,p:0.9},{t:t-21600,p:0.82},{t:t-86400-901,p:0.5}],at);
 assert.equal(h.price_1h_ago,0.85);assert.equal(h.price_6h_ago,0.82);assert.equal(h.price_24h_ago,null);assert.equal(h.price_24h_ago_status,'stale');
 assert.equal(historicalFields([],at,'api_error').price_1h_ago_status,'api_error');
 const old={market_id:'x',condition_id:'c',snapshot_at:'2026-09-16T06:00:00Z',volume:'100',liquidity:50};
 const current={...old,snapshot_at:at,volume:400,liquidity:80};const d=deltaFields(current,new Map([['x',old]]));
 assert.equal(d.volume_delta,300);assert.equal(d.liquidity_delta,30);assert.equal(d.delta_hours,6);
 assert.equal(deltaFields({...current,volume:null},new Map([['x',old]])).volume_delta,null);
 assert.equal(deltaFields(current,new Map()).volume_delta,null);
 assert.equal(deltaFields({...current,condition_id:'different'},new Map([['x',old]])).volume_delta,null);
 const prices=[0.915,0.775,0.56,0.34];
 const markets=prices.map((price,i)=>({market_id:String(i),event_id:'e',event_title:'Leverkusen vs. Celje',sport:'soccer',snapshot_at:at,game_start_time:'2026-09-17T12:00:00Z',market_type:'totals',
   question:`Leverkusen vs. Celje: O/U ${i+1.5}`,line:i+1.5,outcomes:[{outcome:'Over',price},{outcome:'Under',price:1-price}],clob_token_ids:[`${i}-over`,`${i}-under`]}));
 const {rows}=flattenMarkets(markets);assert.equal(rows.length,5);assert(!rows.some(r=>r.price<0.35));
 const boundary=flattenMarkets([{...markets[0],outcomes:[{outcome:'Over',price:.35},{outcome:'Under',price:.349999}]}]).rows;
 assert.equal(boundary.length,1);assert.equal(boundary[0].price,.35);
 assert.equal(rows.find(r=>r.outcome==='Under').outcome_index,1);assert.equal(rows.find(r=>r.outcome==='Under').token_id,'2-under');
 const ls=ladders(rows),over=ls.find(l=>l.outcome==='Over');assert.deepEqual(over.lines.map(r=>r.line),[1.5,2.5,3.5]);
 assert.deepEqual(over.lines.map(r=>r.probability_percent),[91.5,77.5,56]);
 const separate=ladders([...rows,{...rows[0],outcome_id:'team',question:'Leverkusen Team Total O/U 1.5',family:'team_totals'}]);assert.equal(separate.length,3);
 let requests=0;
 await enrichHistory(rows,new Map(),async(url,options)=>{requests++;const body=JSON.parse(options.body);assert(body.markets.length<=20);return {ok:true,json:async()=>({history:Object.fromEntries(body.markets.map(id=>[id,[{t:t-3600,p:0.8},{t:t-21600,p:0.82},{t:t-86400,p:0.75}]]))})};},()=>{});
 assert.equal(requests,1);assert.equal(rows[0].price_6h_ago,0.82);assert.equal(rows[0].price_change_6h_pp,9.5);
 const dir=path.join(__dirname,'out','analytics-test');const full=await writeOutcomeExports(markets,dir,{snapshot_at:at},async()=>({ok:true,json:async()=>({history:{}})}),()=>{});
 assert.equal(full.rows[0].price_history_status,'no_data');
 const high=JSON.parse(fs.readFileSync(path.join(dir,'high-probability-markets.json'),'utf8'));
 assert.equal(high.outcomes_count,0); // Unverified Combo legs never enter the shortlist.
 const unknown=flattenMarkets([{...markets[0],market_type:'future_unknown'}]).rows[0];assert.equal(unknown.classification_status,'unclassified');assert.match(unknown.classification_note,/future_unknown/);
 const spread=flattenMarkets([{...markets[0],market_type:'spreads',line:-1.5,question:'Spread: Leverkusen (-1.5)',outcomes:[{outcome:'Leverkusen',price:0.6},{outcome:'Celje',price:0.4}]}]).rows;
 assert.equal(spread[0].outcome_line,-1.5);assert.equal(spread[1].outcome_line,1.5);
 const spreadLadders=ladders(spread);assert.equal(spreadLadders.find(l=>l.outcome==='Celje').lines[0].line,1.5);
 console.log('Analytics tests passed: outcome identity, 35% filter, history freshness/no lookahead, deltas, missing data, 65% subset and numeric ladders.');
}
test().catch(e=>{console.error(e);process.exitCode=1;});
