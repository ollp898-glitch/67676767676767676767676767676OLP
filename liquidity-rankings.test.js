'use strict';
const assert=require('node:assert/strict');
const {buildRankings}=require('./liquidity-rankings');
const snapshot='2026-10-18T12:00:00.000Z';
function market(id,event,title,sport,league,liquidity){return {market_id:String(id),event_id:event,event_title:title,
 event_slug:`event-${event}`,game_start_time:'2026-10-19T12:00:00.000Z',sport,league_name:league,
 league_code:null,league_series_id:null,market_type:'moneyline',question:'Winner?',liquidity,snapshot_at:snapshot};}
const source=[market(1,10,'Alpha vs Beta','soccer','Premier League',100),
 market(2,10,'Alpha vs Beta','soccer','Premier League',200),
 market(3,11,'Gamma vs Delta','soccer','Premier League',null),
 market(4,20,'European Open: A vs B','tennis','ATP Tour',50),
 market(5,30,'Counter-Strike: A vs B (BO3) - 1win Private Club #2 Playoffs','esports','CS2',75),
 market(6,40,'Unknown match','tennis','WTA Tour',30)];
const saved=[{market_id:'1'},{market_id:'1'},{market_id:'4'},{market_id:'5'}];
const result=buildRankings([...source,source[0]],saved,snapshot);
assert.equal(result.source_market_count,6);
assert.equal(result.event_count,5);
assert.equal(result.tournament_count,3);
assert.equal(result.unknown_tournament_events,1);
assert.equal(result.saved_outcomes_count,4);
const soccer=result.events.find(e=>e.event_ids.includes('10'));
assert.equal(soccer.market_count,2);
assert.equal(soccer.saved_outcomes_count,2);
assert.equal(soccer.markets_with_ask,1);
assert.equal(soccer.total_liquidity_usd,300);
assert.equal(soccer.filtered_liquidity_usd,100);
const premier=result.tournaments.find(t=>t.tournament==='Premier League');
assert.equal(premier.match_count,2);
assert.equal(premier.market_count,3);
assert.equal(premier.total_liquidity_usd,null);
assert.equal(premier.total_missing_liquidity_markets,1);
assert.equal(premier.filtered_liquidity_usd,100);
assert.equal(result.events.find(e=>e.tournament==='European Open').total_liquidity_usd,50);
assert(result.tournaments.some(t=>t.tournament==='1win Private Club #2'));
assert(!result.tournaments.some(t=>t.tournament==='WTA Tour'));
assert.equal(result.events.reduce((n,e)=>n+e.market_count,0),6);
assert.equal(result.events.reduce((n,e)=>n+e.saved_outcomes_count,0),4);
assert.throws(()=>buildRankings(source,[{market_id:'999'}],snapshot),/outside ranking source/);
console.log('Liquidity rankings tests passed');
