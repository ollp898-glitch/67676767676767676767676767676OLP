const assert=require('node:assert/strict');
const fs=require('node:fs');
const {semanticLabel}=require('./candidate-policy');
const {fetchComboCatalog,enrichBooks,parseBook}=require('./market-verification');
const {buildComboSummary,isCorner}=require('./combo-summary');
async function test(){
  const now=Date.now();
  for(const market_type of ['total_corners','soccer_team_total_corners','soccer_first_half_total_corners','soccer_second_half_total_corners']){
    assert.match(semanticLabel({sport:'soccer',market_type,outcome:'Over',line:4.5,question:'A vs B: O/U 4.5 Corners'}),/^Over 4.5 corners/);
  }
  assert.match(semanticLabel({sport:'soccer',market_type:'totals',outcome:'Under',line:2.5}),/^Under 2.5 goals/);
  let calls=0;
  const catalog=await fetchComboCatalog([{market_id:'target'}],async()=>({ok:true,json:async()=>{
    calls++;return {markets:calls===1001?[{id:'target'}]:[],next_cursor:calls===1001?null:String(calls)};
  }}));
  assert.equal(calls,1001);assert.equal(catalog.coverage_complete,true);assert.equal(catalog.entries.size,1);
  const limited=await fetchComboCatalog([{market_id:'missing'}],async()=>({ok:true,json:async()=>({markets:[],next_cursor:'next'})}),1);
  assert.equal(limited.status,'truncated');assert.equal(limited.coverage_complete,false);assert.deepEqual(limited.missing_markets,['missing']);
  const timed=await fetchComboCatalog([{market_id:'missing'}],async()=>{throw new Error('must not fetch');},Infinity,0);
  assert.equal(timed.status,'time_budget_exceeded');assert.equal(timed.coverage_complete,false);
  const loop=await fetchComboCatalog([{market_id:'missing'}],async()=>({ok:true,json:async()=>({markets:[],next_cursor:'repeated'})}));
  assert.equal(loop.status,'api_error');assert.match(loop.error,/cursor/);
  const originalNow=Date.now;
  const rows=Array.from({length:51},(_,i)=>({token_id:String(i),condition_id:'condition'}));
  let clock=now,batches=0;
  const book=id=>({asset_id:id,market:'condition',timestamp:String(clock),bids:[{price:'.7',size:'100'}],asks:[{price:'.8',size:'100'}]});
  try{
    Date.now=()=>clock;
    await enrichBooks(rows,async(url,options)=>({ok:true,json:async()=>{
      if(batches++) clock+=180000; // A slow subsequent batch must not invalidate the first at receipt.
      return JSON.parse(options.body).map(x=>book(x.token_id));
    }}));
    assert(rows.every(r=>r.book_status==='available'));
    assert.equal(rows[0].book_observed_at,new Date(now).toISOString());
    assert.equal(rows[50].book_observed_at,new Date(now+180000).toISOString());
    assert.equal(parseBook(rows[0],{...book('0'),timestamp:String(now)},clock).book_status,'stale_or_invalid_timestamp');
    assert.equal(parseBook(rows[0],{...book('0'),timestamp:String(now)},clock).book_timestamp,new Date(now).toISOString());
    const dup=[{token_id:'0',condition_id:'condition'}];
    await enrichBooks(dup,async()=>({ok:true,json:async()=>[book('0'),book('0')]}));
    assert.equal(dup[0].book_status,'duplicate_book');assert.equal(dup[0].best_ask,null);
  }finally{Date.now=originalNow;}
  const fixture=[
    {market_id:'1',match_id:'a',family:'corners_totals',period:'first_half',market_type:'soccer_first_half_total_corners'},
    {market_id:'2',match_id:'a',family:'corners_team_totals',period:'match',market_type:'soccer_team_total_corners'},
    {market_id:'3',match_id:'b',family:'totals',period:'match',market_type:'totals'}];
  const summary=buildComboSummary(fixture,{snapshot_at:'2026-09-17T09:26:48.351Z'},{coverage_complete:false});
  assert.equal(summary.outcomes,3);assert.equal(summary.corners.outcomes,2);assert.equal(summary.corners.matches,1);
  assert.equal(summary.corners.by_period.first_half,1);assert(summary.warnings.includes('combo_catalog_coverage_incomplete'));
  assert.equal(buildComboSummary([],{snapshot_at:'test'},{coverage_complete:true}).corners.outcomes,0);
  if(process.argv[2]){
    const snapshot=fs.readFileSync(process.argv[2],'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
    const corners=snapshot.filter(isCorner);
    assert.equal(snapshot.length,2203);assert.equal(corners.length,92);
    assert.equal(new Set(corners.map(r=>r.outcome_id)).size,92);
    assert(corners.every(r=>/^(Over|Under) [\d.]+ corners/.test(semanticLabel(r))));
    assert.equal(buildComboSummary(snapshot,{snapshot_at:snapshot[0].snapshot_at},{coverage_complete:false}).corners.matches,25);
  }
  console.log('Scanner fixes passed: >1000 pages, explicit incomplete coverage, cursor loops, per-batch freshness, stale/duplicate books, corner labels and exact counts.');
}
test().catch(e=>{console.error(e);process.exitCode=1;});
