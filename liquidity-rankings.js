'use strict';
const {buildCatalog}=require('./event-catalog');

const clean=s=>String(s||'').trim().replace(/\s+/g,' ');
const generic=/^(?:ATP(?: Tour| Doubles)?|WTA(?: Tour| Doubles)?|Tennis|Counter[ -]?Strike|CS2|Dota\s*2?|Esports|Sports|Football|Soccer|Cricket|MMA|UFC)$/i;
function tournamentFor(event){
  const title=clean(event.title),league=clean(event.league_name);
  if(event.sport==='tennis'){
    const prefix=title.match(/^([^:]{3,100}):\s+.+/);
    if(prefix&&!generic.test(prefix[1]))return {name:clean(prefix[1]),source:'event_title',status:'known'};
  }
  if(event.sport==='esports'){
    const suffix=title.match(/\s+-\s+(.+)$/);
    if(suffix){
      const name=clean(suffix[1].replace(/\s+(?:Playoffs|Regular Season|Group [A-Z])$/i,''));
      if(name&&!generic.test(name))return {name,source:'event_title',status:'known'};
    }
  }
  if(league&&!generic.test(league))return {name:league,source:'gamma_league',status:'known'};
  return {name:null,source:null,status:'unknown'};
}
function aggregateLiquidity(markets,filtered){
  let total=0,missing=0;
  for(const m of markets){
    if(m.liquidity===null||!Number.isFinite(m.liquidity)||m.liquidity<0)missing++;
    else total+=m.liquidity;
  }
  return {liquidity_usd:missing?null:Number(total.toFixed(6)),missing_liquidity_markets:missing,
    markets_with_liquidity:markets.length-missing,market_count:markets.length,
    ...(filtered?{filtered_market_count:filtered.size}: {})};
}
function byLiquidity(a,b){
  return (b.total_liquidity_usd??-1)-(a.total_liquidity_usd??-1)||
    (b.filtered_liquidity_usd??-1)-(a.filtered_liquidity_usd??-1)||
    String(a.title||a.tournament).localeCompare(String(b.title||b.tournament));
}
function mergeScoreEvents(events){
  const groups=new Map();
  for(const event of events){
    const title=event.sport==='soccer'
      ?event.title.replace(/ - (?:(?:1st|2nd) Half )?Exact Score$/i,''):event.title;
    const slug=event.sport==='soccer'&&event.canonical_slug
      ?event.canonical_slug.replace(/-(?:exact-score|first-half-exact-score|second-half-exact-score)$/i,''):null;
    const key=event.sport==='soccer'
      ?JSON.stringify([event.sport,event.tournament,slug||title,event.game_start_time])
      :event.match_id;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(event);
  }
  return [...groups.values()].map(items=>{
    if(items.length===1)return items[0];
    const title=items[0].sport==='soccer'
      ?items[0].title.replace(/ - (?:(?:1st|2nd) Half )?Exact Score$/i,''):items[0].title;
    const base=items.find(x=>x.title===title)||items[0];
    const sum=(field)=>items.some(x=>x[field]===null)?null:
      Number(items.reduce((n,x)=>n+x[field],0).toFixed(6));
    return {...base,title,event_ids:[...new Set(items.flatMap(x=>x.event_ids))].sort(),
      market_count:sum('market_count'),saved_outcomes_count:sum('saved_outcomes_count'),
      markets_with_ask:sum('markets_with_ask'),total_liquidity_usd:sum('total_liquidity_usd'),
      filtered_liquidity_usd:sum('filtered_liquidity_usd'),
      total_missing_liquidity_markets:sum('total_missing_liquidity_markets'),
      filtered_missing_liquidity_markets:sum('filtered_missing_liquidity_markets')};
  });
}
function buildRankings(sourceMarkets,savedRows,snapshotAt){
  const unique=new Map();
  for(const m of sourceMarkets){
    if(m.market_id==null)throw Error('Ranking market has no id');
    if(!unique.has(String(m.market_id)))unique.set(String(m.market_id),m);
  }
  const savedByMarket=new Map();
  for(const row of savedRows){
    const id=String(row.market_id);
    if(!unique.has(id))throw Error(`Saved outcome outside ranking source: ${id}`);
    savedByMarket.set(id,(savedByMarket.get(id)||0)+1);
  }
  const catalog=buildCatalog([...unique.values()]);
  const events=[],tournaments=new Map();
  for(const event of catalog.events){
    const markets=event.sections.flatMap(s=>s.markets);
    const filtered=markets.filter(m=>savedByMarket.has(String(m.market_id)));
    const total=aggregateLiquidity(markets),eligible=aggregateLiquidity(filtered);
    const tournament=tournamentFor(event);
    const item={match_id:event.match_id,event_ids:event.source_event_ids,title:event.title,
      canonical_slug:event.canonical_slug,sport:event.sport,
      game_start_time:event.game_start_time,tournament:tournament.name,tournament_status:tournament.status,
      tournament_source:tournament.source,market_count:markets.length,saved_outcomes_count:filtered.reduce((n,m)=>n+savedByMarket.get(String(m.market_id)),0),
      markets_with_ask:filtered.length,total_liquidity_usd:total.liquidity_usd,
      filtered_liquidity_usd:eligible.liquidity_usd,
      total_missing_liquidity_markets:total.missing_liquidity_markets,
      filtered_missing_liquidity_markets:eligible.missing_liquidity_markets};
    events.push(item);
    if(tournament.name){
      const key=JSON.stringify([event.sport,tournament.name.toLocaleLowerCase()]);
      if(!tournaments.has(key))tournaments.set(key,{sport:event.sport,tournament:tournament.name,events:[],markets:[]});
      const group=tournaments.get(key);group.events.push(item);group.markets.push(...markets);
    }
  }
  const mergedEvents=mergeScoreEvents(events);
  const tournamentRows=[...tournaments.values()].map(group=>{
    const markets=[...new Map(group.markets.map(m=>[String(m.market_id),m])).values()];
    const filtered=markets.filter(m=>savedByMarket.has(String(m.market_id)));
    return {sport:group.sport,tournament:group.tournament,
      match_count:mergedEvents.filter(e=>e.sport===group.sport&&e.tournament===group.tournament).length,
      market_count:markets.length,saved_outcomes_count:group.events.reduce((n,e)=>n+e.saved_outcomes_count,0),
      markets_with_ask:filtered.length,total_liquidity_usd:aggregateLiquidity(markets).liquidity_usd,
      filtered_liquidity_usd:aggregateLiquidity(filtered).liquidity_usd,
      total_missing_liquidity_markets:aggregateLiquidity(markets).missing_liquidity_markets,
      filtered_missing_liquidity_markets:aggregateLiquidity(filtered).missing_liquidity_markets};
  });
  mergedEvents.sort(byLiquidity);tournamentRows.sort(byLiquidity);
  const result={schema_version:1,snapshot_at:snapshotAt,source_market_count:unique.size,saved_outcomes_count:savedRows.length,
    event_count:mergedEvents.length,tournament_count:tournamentRows.length,
    unknown_tournament_events:mergedEvents.filter(e=>e.tournament_status==='unknown').length,
    events:mergedEvents,tournaments:tournamentRows};
  if(mergedEvents.reduce((n,e)=>n+e.market_count,0)!==unique.size||
     mergedEvents.reduce((n,e)=>n+e.saved_outcomes_count,0)!==savedRows.length)
    throw Error('Ranking counts do not reconcile with source');
  return result;
}
module.exports={buildRankings,tournamentFor,mergeScoreEvents};
