const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {buildSportsMetadataIndex,classifySport,resolveLeagueMeta} = require('./sport-classification');
const {buildCatalog,classifyMarket} = require('./event-catalog');
const {fetchComboCatalog,verifyCombo,enrichBooks} = require('./market-verification');
const {buildExclusionAudit,historyEntry}=require('./exclusion-audit');

const GAMMA = 'https://gamma-api.polymarket.com';
const HOUR = 60 * 60 * 1000;
const POLICY = Object.freeze({min_start_hours:1,max_start_hours:28,min_price_inclusive:0.05,max_price_inclusive:0.95,
  ask_required:true,min_liquidity_usd:null,max_spread:null,excluded_sports:['chess','table-tennis','darts'],excluded_market_types:['assists','soccer_exact_score','soccer_anytime_goalscorer','soccer_first_half_exact_score']});
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
const array = value => {
  if(Array.isArray(value)) return value;
  if(typeof value !== 'string') return [];
  try {const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[];} catch {return [];}
};
const number = value => value === '' || value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null;

async function getJson(url,fetchImpl=fetch) {
  let last;
  for(let attempt=0;attempt<4;attempt++){
    try{
      const response=await fetchImpl(url,{headers:{'User-Agent':'bet-x-market-scanner/2.0',Accept:'application/json'},signal:AbortSignal.timeout(20000)});
      if(response.ok) return await response.json();
      last=new Error(`HTTP ${response.status}`);
      if(response.status!==429 && response.status<500) throw last;
    }catch(error){last=error;}
    if(attempt<3)await sleep(500*2**attempt);
  }
  throw last;
}
function compactMarket(market){
  const event=market.events?.[0]||{};
  return {market_id:market.id??null,condition_id:market.conditionId??null,event_id:event.id??null,
    event_title:event.title??null,market_question:market.question??null,market_type:market.sportsMarketType??null};
}
function record(excluded,reason,market,checkedAt,extra={}){
  excluded.push({checked_at:checkedAt,scope:extra.outcome_index==null?'market':'outcome',reason,...compactMarket(market),...extra});
}
function comboStatus(result,catalog){
  if(result.combo_verified) return 'available';
  if(result.combo_verification_status==='pending') return 'pending';
  if(result.combo_verification_status==='not_listed'&&catalog.complete) return 'unavailable';
  if(['condition_mismatch','outcome_mapping_mismatch','position_mapping_mismatch','missing_clob_token'].includes(result.combo_verification_status)) return 'unavailable';
  return 'unknown';
}
function eventComboStatus(statuses){
  if(statuses.includes('available'))return 'available';
  if(statuses.includes('pending'))return 'pending';
  if(statuses.includes('unknown')||!statuses.length)return 'unknown';
  return 'unavailable';
}
function marketFromGamma(market,event,classification,leagueMeta,observedAt,snapshotAt){
  const names=array(market.outcomes),prices=array(market.outcomePrices),tokens=array(market.clobTokenIds),positions=array(market.positionIds);
  return {snapshot_at:snapshotAt,price_observed_at:observedAt,event_id:event.id??null,event_title:event.title??null,
    event_slug:event.slug??null,market_id:String(market.id),condition_id:market.conditionId??null,
    market_slug:market.slug??null,question:market.question??null,group_item_title:market.groupItemTitle??null,
    market_type:market.sportsMarketType??null,line:market.line??null,game_start_time:new Date(market.gameStartTime).toISOString(),
    sport:classification.sport,sport_source:classification.source,league_code:leagueMeta?.sport??null,
    league_name:leagueMeta?.name??null,league_series_id:leagueMeta?.series??null,
    liquidity:number(market.liquidityNum??market.liquidity),volume:number(market.volumeNum??market.volume),
    volume_24h:number(market.volume24hr),accepting_orders:market.acceptingOrders??null,
    order_book:market.enableOrderBook??null,gamma_combo_status:market.comboStatus??null,
    gamma_best_bid:number(market.bestBid),gamma_best_ask:number(market.bestAsk),gamma_spread:number(market.spread),
    outcomes:names.map((outcome,index)=>({outcome,price:number(prices[index]),outcome_index:index,
      token_id:tokens[index]==null?null:String(tokens[index]),position_id:positions[index]==null?null:String(positions[index])})),
    clob_token_ids:tokens,position_ids:positions,
    source_market:{id:market.id,conditionId:market.conditionId,question:market.question,slug:market.slug,
      sportsMarketType:market.sportsMarketType,groupItemTitle:market.groupItemTitle,line:market.line,
      description:market.description,resolutionSource:market.resolutionSource,outcomes:names,prices,
      clobTokenIds:tokens,positionIds:positions,event_id:event.id,event_title:event.title,event_slug:event.slug}};
}
function outcomeLine(market,outcome,classification){
  if(classification.outcome_lines?.[outcome.outcome_index]!=null)return classification.outcome_lines[outcome.outcome_index];
  const line=number(market.line);
  if(line==null)return null;
  if(classification.family!=='handicap')return line;
  const match=String(market.question||'').match(/^Spread:\s*(.+?)\s*\(([+-]?\d+(?:\.\d+)?)\)$/i);
  const names=market.outcomes.map(o=>String(o.outcome).trim().toLowerCase());
  if(!match||names.length!==2||names.some(n=>n==='yes'||n==='no')||!names.includes(match[1].trim().toLowerCase()))return null;
  return outcome.outcome.trim().toLowerCase()===match[1].trim().toLowerCase()?Number(match[2]):-Number(match[2]);
}
function outputRow(market,outcome,matchId,classification,combo,eventStatus){
  const {outcomes,clob_token_ids,position_ids,source_market,...base}=market;
  const token_id=outcome.token_id;
  return {...base,schema_version:1,match_id:matchId,
    market_question:market.question,league:market.league_name??market.league_code??null,
    market_url:market.event_slug?`https://polymarket.com/event/${market.event_slug}?tid=${token_id}`:null,
    event_url:market.event_slug?`https://polymarket.com/event/${market.event_slug}`:null,
    outcome_id:token_id?`token:${token_id}`:`market:${market.market_id}:outcome:${outcome.outcome_index}`,
    token_id,position_id:outcome.position_id,outcome_index:outcome.outcome_index,
    outcome:outcome.outcome,raw_outcome:outcome.outcome,price:outcome.price,
    probability_percent:outcome.price*100,market_line:market.line,
    outcome_line:outcomeLine(market,outcome,classification),
    period:classification.period,family:classification.family,classification_status:classification.family==='other'?'unclassified':'classified',
    selection_status:classification.family==='other'?'excluded':'eligible',
    exclusion_reason:classification.family==='other'?'unclassified_market_type':null,
    classification_source:classification.classification_source,classification_note:classification.classification_note??null,
    source_market,combo_status:combo.status,combo_verified:combo.combo_verified,
    combo_verification_status:combo.combo_verification_status,combo_verified_at:combo.combo_verified_at,
    event_combo_status:eventStatus};
}
function validateRows(rows,excluded,index){
  const ids=new Set();
  for(const row of rows){
    if(ids.has(row.outcome_id))throw new Error(`Duplicate outcome ${row.outcome_id}`);
    ids.add(row.outcome_id);
    if(!(row.price>=POLICY.min_price_inclusive&&row.price<=POLICY.max_price_inclusive))throw new Error('Saved price outside policy');
    if(row.book_status!=='available'||!(row.best_ask>0&&row.ask_size>0))throw new Error('Saved outcome has no executable Ask');
    if(!row.event_id||!row.match_id||!row.market_id||!row.token_id)throw new Error('Missing outcome identity');
  }
  if(index.saved_outcomes!==rows.length||index.excluded_records!==excluded.length)throw new Error('Index count mismatch');
}
async function scan({fetchImpl=fetch,now=new Date(),output=path.join(process.cwd(),'out'),comboFetch=fetchImpl,bookFetch=fetchImpl,
  rankingBuilder=require('./liquidity-rankings').buildRankings}={}){
  const scanStartedAt=new Date().toISOString(),snapshotAt=now.toISOString();
  const [sportsTag,sportsMetadata]=await Promise.all([
    getJson(`${GAMMA}/tags/slug/sports`,fetchImpl),getJson(`${GAMMA}/sports`,fetchImpl)]);
  if(!sportsTag?.id||!Array.isArray(sportsMetadata))throw new Error('Sports metadata unavailable');
  const metaIndex=buildSportsMetadataIndex(sportsMetadata);
  const excluded=[],markets=[],rankingMarkets=[],seenMarkets=new Set(),seenOutcomes=new Set();
  let cursor=null,pages=0,processedMarkets=0,duplicateMarkets=0;
  const visited=new Set();
  while(true){
    // Gamma events support start_time_min/max, while /markets/keyset does not
    // support filtering by the sports-specific gameStartTime. Use a 1h guard
    // band on the far edge; keep exact 1–28h gameStartTime checks below.
    const params=new URLSearchParams({limit:'100',closed:'false',tag_id:String(sportsTag.id),related_tags:'true',
      start_time_min:now.toISOString(),start_time_max:new Date(now.getTime()+29*HOUR).toISOString()});
    if(cursor)params.set('after_cursor',cursor);
    const data=await getJson(`${GAMMA}/events/keyset?${params}`,fetchImpl);
    if(!Array.isArray(data?.events))throw new Error('Invalid Gamma event page');
    pages++;
    const observedAt=new Date().toISOString();
    for(const sourceEvent of data.events){
      if(!sourceEvent||typeof sourceEvent!=='object'||!Array.isArray(sourceEvent.markets))
        throw new Error('Gamma event missing its embedded markets');
      const eventMeta={...sourceEvent};
      delete eventMeta.markets; // avoid retaining the entire event/market payload in every row
      processedMarkets+=sourceEvent.markets.length;
      for(const rawMarket of sourceEvent.markets){
        if(!rawMarket||typeof rawMarket!=='object')throw new Error('Malformed Gamma embedded market');
        // Embedded event markets can omit back-references and tags. Preserve
        // event identity, sports metadata, Combo and market fields downstream.
        const market={...rawMarket,
          events:[{...(rawMarket.events?.[0]||{}),...eventMeta}],
          tags:Array.isArray(rawMarket.tags)&&rawMarket.tags.length?rawMarket.tags:eventMeta.tags};
        const checkedAt=new Date().toISOString();
      if(market.id==null){record(excluded,'invalid_market_data',market,checkedAt);continue;}
      const id=String(market.id);
      if(seenMarkets.has(id)){duplicateMarkets++;record(excluded,'duplicate_market',market,checkedAt);continue;}
      seenMarkets.add(id);
      const event=market.events?.[0];
      if(market.closed===true||market.events?.[0]?.closed===true){record(excluded,'market_closed',market,checkedAt);continue;}
      if(market.active!==true||market.events?.[0]?.active===false){record(excluded,'market_inactive',market,checkedAt);continue;}
      if(market.live===true||market.ended===true||event?.live===true||event?.ended===true){record(excluded,'market_live',market,checkedAt);continue;}
      const start=Date.parse(market.gameStartTime);
      if(!Number.isFinite(start)){record(excluded,'invalid_market_data',market,checkedAt);continue;}
      if(start<now.getTime()+HOUR||start>now.getTime()+28*HOUR){record(excluded,'outside_time_window',market,checkedAt);continue;}
      // Capture Gamma liquidity before outcome/price/Ask exclusions. This does not
      // change which markets the scanner accepts or cause another API request.
      const rankingEvent=event||{};
      const classification=classifySport(market,rankingEvent,metaIndex);
      // Exclude an entire sport before rankings, catalog, Combo, price and book checks.
      // Keep exactly one market-level audit record with the detected sport.
      if(POLICY.excluded_sports.includes(classification.sport)){
        record(excluded,'excluded_sport',market,checkedAt,{
          sport:classification.sport,sport_source:classification.source,
          exclusion_stage:'sport_filter'});
        continue;
      }
      // Market-type exclusion is independent of the sport filter: audit each
      // eligible market once and skip downstream catalog/rankings/CLOB work.
      const marketType=String(market.sportsMarketType??'').trim().toLowerCase();
      if(POLICY.excluded_market_types.includes(marketType)){
        record(excluded,'excluded_market_type',market,checkedAt,{
          market_type:marketType,exclusion_stage:'market_type_filter'});
        continue;
      }
      const leagueMeta=classification.league||resolveLeagueMeta(market,rankingEvent,metaIndex).meta;
      rankingMarkets.push({market_id:id,event_id:rankingEvent.id??null,event_title:rankingEvent.title??null,event_slug:rankingEvent.slug??null,
        game_start_time:new Date(start).toISOString(),sport:classification.sport,
        league_code:leagueMeta?.sport??null,league_name:leagueMeta?.name??null,
        league_series_id:leagueMeta?.series??null,market_type:market.sportsMarketType??null,
        question:market.question??null,market_slug:market.slug??null,line:market.line??null,
        liquidity:number(market.liquidityNum??market.liquidity),snapshot_at:snapshotAt});
      if(!event?.id){record(excluded,'invalid_market_data',market,checkedAt);continue;}
      const names=array(market.outcomes),prices=array(market.outcomePrices);
      if(!names.length||prices.length!==names.length||names.some(name=>typeof name!=='string'||!name.trim())){
        record(excluded,'invalid_market_data',market,checkedAt);continue;
      }
      markets.push(marketFromGamma(market,event,classification,leagueMeta,observedAt,snapshotAt));
      }
    }
    const next=data.next_cursor??null;
    if(next!=null&&(typeof next!=='string'||next===cursor||visited.has(next)))throw new Error('Repeated or invalid Gamma cursor');
    if(!next&&data.events.length===100)throw new Error('Full Gamma page without continuation cursor');
    if(!next)break;
    if(data.events.length===0)throw new Error('Empty Gamma page with continuation cursor');
    visited.add(next);cursor=next;
    await sleep(100);
  }
  if(processedMarkets===0)throw new Error('Time-filtered sports event catalog returned no markets');
  const grouped=buildCatalog(markets),matchByMarket=new Map(),eventMarkets=new Map();
  const marketClassifications=new Map(markets.map(m=>[m.market_id,classifyMarket(m)]));
  const unrecognized=[];
  for(const market of markets){
    const classification=marketClassifications.get(market.market_id);
    if(classification.family!=='other')continue;
    const source={id:market.market_id,conditionId:market.condition_id,question:market.question,
      sportsMarketType:market.market_type,events:[{id:market.event_id,title:market.event_title}]};
    record(excluded,'unclassified_market_type',source,snapshotAt,{exclusion_stage:'selection',
      classification_status:'unclassified',classification_source:classification.classification_source,
      classification_note:classification.classification_note??null});
    unrecognized.push({snapshot_at:snapshotAt,reason:'unclassified_market_type',exclusion_stage:'selection',
      market_id:market.market_id,condition_id:market.condition_id,event_id:market.event_id,
      event_title:market.event_title,event_slug:market.event_slug,game_start_time:market.game_start_time,
      sport:market.sport,league:market.league_name??market.league_code??null,
      market_type:market.market_type??null,market_question:market.question,
      market_line:market.line,classification_source:classification.classification_source,
      classification_note:classification.classification_note??null,outcome_count:market.outcomes.length,
      outcomes:market.outcomes.map(({outcome_index,outcome,price,token_id})=>({outcome_index,outcome,price,token_id}))});
  }
  console.log(`Gamma scan complete: ${pages} pages, ${markets.length} time-eligible markets`);
  for(const event of grouped.events)for(const section of event.sections)for(const market of section.markets){
    matchByMarket.set(market.market_id,event.match_id);
    if(!eventMarkets.has(event.match_id))eventMarkets.set(event.match_id,[]);
    eventMarkets.get(event.match_id).push(market.market_id);
  }
  // The Combo catalog is checked for every time-eligible market before price or Ask filtering.
  const comboCatalog=await fetchComboCatalog(markets.map(m=>({market_id:m.market_id})),comboFetch);
  console.log(`Combo catalog: ${comboCatalog.status}, ${comboCatalog.pages} pages`);
  const comboByOutcome=new Map(),statusByMarket=new Map();
  for(const market of markets)for(const outcome of market.outcomes){
    const result=verifyCombo({...market,...outcome,raw_outcome:outcome.outcome},comboCatalog);
    const status=comboStatus(result,comboCatalog);
    comboByOutcome.set(`${market.market_id}:${outcome.outcome_index}`,{...result,status});
    if(!statusByMarket.has(market.market_id))statusByMarket.set(market.market_id,[]);
    statusByMarket.get(market.market_id).push(status);
  }
  const eventStatuses=new Map([...eventMarkets].map(([matchId,ids])=>
    [matchId,eventComboStatus(ids.flatMap(id=>statusByMarket.get(id)||[]))]));
  const priced=[];
  for(const market of markets)for(const outcome of market.outcomes){
    const source={id:market.market_id,conditionId:market.condition_id,question:market.question,
      sportsMarketType:market.market_type,events:[{id:market.event_id,title:market.event_title}]};
    const extra={outcome_index:outcome.outcome_index,outcome:outcome.outcome,token_id:outcome.token_id,price:outcome.price};
    const key=outcome.token_id?`token:${outcome.token_id}`:`market:${market.market_id}:outcome:${outcome.outcome_index}`;
    if(seenOutcomes.has(key)){record(excluded,'duplicate_outcome',source,snapshotAt,extra);continue;}
    seenOutcomes.add(key);
    if(outcome.price===null||outcome.price<0||outcome.price>1){record(excluded,'invalid_price',source,snapshotAt,extra);continue;}
    if(outcome.price<POLICY.min_price_inclusive){record(excluded,'price_below_5',source,snapshotAt,extra);continue;}
    if(outcome.price>POLICY.max_price_inclusive){record(excluded,'price_above_95',source,snapshotAt,extra);continue;}
    if(!outcome.token_id){record(excluded,'book_unverified',source,snapshotAt,extra);continue;}
    if(market.accepting_orders===false||market.order_book===false){record(excluded,'market_not_tradable',source,snapshotAt,extra);continue;}
    const classification=marketClassifications.get(market.market_id),matchId=matchByMarket.get(market.market_id);
    priced.push(outputRow(market,outcome,matchId,classification,
      comboByOutcome.get(`${market.market_id}:${outcome.outcome_index}`),
      eventStatuses.get(matchId)));
  }
  await enrichBooks(priced,bookFetch);
  console.log(`CLOB books checked for ${priced.length} outcomes`);
  const rows=[];
  for(const row of priced){
    if(row.book_status==='available'){rows.push(row);continue;}
    const source={id:row.market_id,conditionId:row.condition_id,question:row.question,
      sportsMarketType:row.market_type,events:[{id:row.event_id,title:row.event_title}]};
    const reason=row.book_status==='no_ask'?'no_ask':'book_unverified';
    record(excluded,reason,source,row.book_observed_at,{outcome_index:row.outcome_index,
      outcome:row.outcome,token_id:row.token_id,price:row.price,book_status:row.book_status});
  }
  const apiBookErrors=priced.filter(row=>row.book_status==='api_error').length;
  if(apiBookErrors===priced.length&&priced.length>0||
    priced.length>=10&&apiBookErrors>=Math.max(5,Math.ceil(priced.length*0.2)))
    throw new Error(`Systematic CLOB errors: ${apiBookErrors}/${priced.length}`);
  const audit=buildExclusionAudit(excluded,unrecognized,rows,snapshotAt);
  const index={schema_version:1,scanner_version:'BET-X clean rebuild',scan_started_at:scanStartedAt,
    scan_finished_at:new Date().toISOString(),snapshot_at:snapshotAt,policy:POLICY,
    processed_markets:processedMarkets,unique_markets:seenMarkets.size,
    catalog_source:'gamma_events_keyset_time_filtered',catalog_time_window_hours:[0,29],
    unique_events:new Set(markets.map(m=>String(m.event_id))).size,unique_matches:grouped.events.length,
    source_outcomes:markets.reduce((sum,m)=>sum+m.outcomes.length,0),
    checked_outcomes:priced.length,saved_outcomes:rows.length,excluded_records:excluded.length,
    exclusion_unique_markets:audit.counts.excluded_unique_markets,
    excluded_sport_markets:audit.counts.excluded_sport_markets,
    excluded_market_type_markets:audit.counts.excluded_market_type_markets,
    unrecognized_markets:audit.counts.unrecognized_markets,
    unrecognized_source_outcomes:audit.counts.unrecognized_source_outcomes,
    unrecognized_saved_markets:audit.counts.unrecognized_saved_markets,
    unrecognized_saved_outcomes:audit.counts.unrecognized_saved_outcomes,
    duplicate_markets:duplicateMarkets,duplicate_outcomes:excluded.filter(x=>x.reason==='duplicate_outcome').length,
    markets_with_ask:new Set(rows.map(x=>x.market_id)).size,
    combo_markets:new Set(markets.filter(m=>(statusByMarket.get(m.market_id)||[]).includes('available')).map(m=>m.market_id)).size,
    combo_events:[...eventStatuses.values()].filter(x=>x==='available').length,
    book_api_errors:apiBookErrors,api_errors:apiBookErrors+(comboCatalog.status==='api_error'?1:0),
    combo_verification:{status:comboCatalog.status,pages:comboCatalog.pages,
      coverage_complete:comboCatalog.coverage_complete,error:comboCatalog.error??null},
    pagination_complete:true,scan_status:'complete',freshness_status:'valid_at_publication',pages};
  validateRows(rows,excluded,index);
  let rankings=null;
  try{
    rankings=rankingBuilder(rankingMarkets,rows,snapshotAt);
    index.rankings_status='complete';
    index.rankings_event_count=rankings.event_count;
    index.rankings_tournament_count=rankings.tournament_count;
  }catch(error){
    index.rankings_status='failed';index.rankings_error=String(error.message||error).slice(0,500);
    console.error('Optional liquidity rankings failed:',error);
  }
  const parent=path.dirname(output);fs.mkdirSync(parent,{recursive:true});
  const stage=fs.mkdtempSync(path.join(parent,`.${path.basename(output)}-`));
  try{
    const writeJsonl=(name,items)=>fs.writeFileSync(path.join(stage,name),items.map(x=>JSON.stringify(x)).join('\n')+(items.length?'\n':''));
    writeJsonl('markets.jsonl',rows);
    writeJsonl('excluded.jsonl',excluded);
    writeJsonl('unrecognized.jsonl',unrecognized);
    writeJsonl('exclusion-history.jsonl',[historyEntry(audit)]);
    fs.writeFileSync(path.join(stage,'exclusion-summary.json'),JSON.stringify(audit,null,2)+'\n');
    if(rankings){
      try{fs.writeFileSync(path.join(stage,'rankings.json'),JSON.stringify(rankings)+'\n');}
      catch(error){index.rankings_status='failed';index.rankings_error=String(error.message||error).slice(0,500);
        console.error('Optional liquidity rankings write failed:',error);}
    }
    fs.writeFileSync(path.join(stage,'index.json'),JSON.stringify(index,null,2)+'\n');
    require('./validate-catalog').validateCatalog(stage);
    if(fs.existsSync(output))fs.rmSync(output,{recursive:true,force:true});
    fs.renameSync(stage,output);
  }catch(error){fs.rmSync(stage,{recursive:true,force:true});throw error;}
  return index;
}
if(require.main===module)scan().then(index=>console.log(JSON.stringify(index,null,2))).catch(error=>{
  console.error(error);process.exitCode=1;});
module.exports={scan,POLICY,comboStatus,eventComboStatus,validateRows};
