const assert = require('node:assert/strict');
const {annotatePolicy,isHighCandidate,semanticLabel,checkCompatibility} = require('./candidate-policy');
const {fetchComboCatalog,verifyCombo,parseBook,buyDepth,verifyRows} = require('./market-verification');
const {refreshRow,refreshCandidates} = require('./refresh-candidates');
const {historicalFields} = require('./price-history');
const {writeOutcomeExports} = require('./outcome-exports');
const fs = require('node:fs'), path=require('node:path');
async function test() {
  const now = Date.now(), at = new Date(now).toISOString();
  const row = {market_id:'1',condition_id:'c',token_id:'token-no',position_id:'position-no',outcome_id:'token:token-no',outcome_index:1,outcome:'No',
    sport:'baseball',family:'extra_innings',classification_status:'classified',market_type:'baseball_game_extra_innings',question:'Extra Innings?',line:null,
    match_id:'match-1',match_title:'A vs B',period:'full_game',section_id:'full_game/extra_innings',combo_eligible:true,combo_catalog_cursor:null,price:0.8,
    game_start_time:new Date(now+12*3600000).toISOString(),snapshot_at:at,price_observed_at:at};
  const entry = {id:'1',condition_id:'c',outcomes:['Yes','No'],position_ids:['position-yes','position-no'],pending:false};
  let calls=0;
  const catalog = await fetchComboCatalog([row],async url=>{calls++;return {ok:true,json:async()=>calls===1?{markets:[],next_cursor:'opaque+/='}:{markets:[entry],next_cursor:null}};});
  assert.equal(calls,2);assert.equal(verifyCombo(row,catalog).combo_verified,true);
  assert.equal(verifyCombo({...row,position_id:'token-no'},catalog).combo_verification_status,'position_mapping_mismatch');
  assert.equal(verifyCombo({...row,outcome:'Yes'},catalog).combo_verified,false);
  assert.equal(verifyCombo(row,{...catalog,entries:new Map([['1',{...entry,pending:true}]])}).combo_verified,false);
  assert.equal(verifyCombo(row,{...catalog,entries:new Map(),complete:false,status:'truncated'}).combo_verification_status,'truncated');
  assert.equal(verifyCombo({...row,combo_eligible:false},catalog).combo_verified,false);
  assert.equal(semanticLabel(row),'No Extra Innings');
  assert.equal(semanticLabel({...row,question:'Minnesota Twins to win 1st inning?'}),'Minnesota Twins не выиграют 1-й иннинг');
  assert.match(semanticLabel({...row,outcome:'Under',line:1.5,market_type:'baseball_player_home_runs'}),/^Under 1.5 HR/);
  for (const bad of [{family:'other'},{sport:'other'},{market_type:'baseball_player_home_runs'},{family:'penta_kill'},{question:'Power Slap winner?'}]) {
    const annotated=annotatePolicy({...row,...bad,combo_verified:true});assert.equal(isHighCandidate(annotated),false);
  }
  const book={asset_id:'token-no',market:'c',timestamp:String(now),bids:[{price:'.7',size:'100'},{price:'.78',size:'50'}],asks:[{price:'.85',size:'100'},{price:'.8',size:'10'}]};
  const parsed = parseBook(row,book,now);assert.equal(parsed.best_bid,.78);assert.equal(parsed.best_ask,.8);
  assert.equal(parsed.depth.buy_scenarios[2].fully_fillable,false);
  const depth=buyDepth([{price:.8,size:10},{price:.9,size:100}],17);assert.equal(depth.fully_fillable,true);assert.equal(depth.shares,20);assert.equal(depth.vwap,.85);
  assert.equal(parseBook(row,{...book,asset_id:'token-yes'},now).book_status,'token_or_condition_mismatch');
  assert.equal(parseBook(row,{...book,timestamp:now-120001},now).book_status,'stale_or_invalid_timestamp');
  assert.equal(parseBook(row,{...book,bids:[{price:'.9',size:1}]},now).book_status,'crossed_book');
  const gamma={id:'1',conditionId:'c',active:true,closed:false,acceptingOrders:true,enableOrderBook:true,clobTokenIds:['token-yes','token-no'],positionIds:entry.position_ids,
    outcomes:entry.outcomes,outcomePrices:['.2','.8'],question:row.question,sportsMarketType:row.market_type,line:null,gameStartTime:row.game_start_time,liquidityNum:100,volumeNum:100,comboStatus:'enabled'};
  assert.equal(refreshRow(row,gamma,now).row.price,.8);
  assert.equal(refreshRow(row,{...gamma,gameStartTime:new Date(now+2*3600000).toISOString()},now).reason,'market_metadata_changed_rescan_required');
  assert.equal(refreshRow(row,{...gamma,clobTokenIds:['token-no','token-yes']},now).reason,'identity_changed');
  assert.equal(refreshRow(row,{...gamma,outcomePrices:['.31','.69']},now).reason,'probability_outside_policy');
  const fetchMock=async(url,options)=>({ok:true,json:async()=>{
    if(url.includes('gamma-api')) return [gamma];
    if(url.includes('combo-markets')) return {markets:[entry],next_cursor:null};
    if(url.endsWith('/books')) return [book];
    if(url.endsWith('/batch-prices-history')) return {history:{}};
    throw new Error(`Unexpected ${url}`);
  }});
  const refreshed=await refreshCandidates([row],fetchMock);assert.equal(refreshed.outcomes.length,1);assert.equal(refreshed.outcomes[0].analysis_ready,true);
  const leg=refreshed.outcomes[0], second={...leg,outcome_id:'second',condition_id:'second',match_id:'second'};
  assert.equal(checkCompatibility([leg,second]).local_status,'passed');assert.equal(checkCompatibility([leg,second]).combo_compatible,null);
  assert.equal(checkCompatibility([leg,{...second,match_id:leg.match_id}]).local_status,'needs_review');
  assert.equal(checkCompatibility([leg,{...second,condition_id:leg.condition_id}]).local_status,'rejected');
  assert.equal(checkCompatibility([leg,{...second,analysis_expires_at:at}],now+1).local_status,'rejected');
  const t=now/1000;
  const history=historicalFields([{t:t-3600,p:.8},{t:t-3600,p:.9},{t:t-21600,p:.7},{t:t-21600,p:.7},{t:t+1,p:.5},{t:t-1,p:4}],at);
  assert.equal(history.price_1h_ago,null);assert.equal(history.price_1h_ago_status,'conflicting_points');assert.equal(history.price_6h_ago,.7);
  assert.equal(history.price_history_quality.duplicate_points,1);assert.equal(history.price_history_quality.future_points,1);assert.equal(history.price_history_quality.invalid_points,1);
  // Full writer: only the verified No leg passes; an empty rerun replaces it.
  const dir=path.join(__dirname,'out','combo-test');
  const market={...row,event_id:'event',event_title:'A vs B',outcomes:[{outcome:'Yes',price:.2},{outcome:'No',price:.8}],clob_token_ids:['token-yes','token-no'],position_ids:entry.position_ids};
  await writeOutcomeExports([market],dir,{snapshot_at:at},fetchMock,()=>{});
  const selected=fs.readFileSync(path.join(dir,'high-probability-outcomes.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(selected.length,1);assert.equal(selected[0].token_id,'token-no');assert.equal(selected[0].combo_verified,true);
  await writeOutcomeExports([],dir,{snapshot_at:at},fetchMock,()=>{});
  assert.equal(fs.readFileSync(path.join(dir,'high-probability-outcomes.jsonl'),'utf8'),'');
  console.log('Combo tests passed: policy, semantic labels, exact token/position identity, pending rejection, pagination, depth, refresh, compatibility, history cleanup and shortlist replacement.');
}
test().catch(e=>{console.error(e);process.exitCode=1;});
