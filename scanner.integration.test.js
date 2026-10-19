const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {scan}=require('./scanner');
const {parseBook,enrichBooks}=require('./market-verification');
const {validateCatalog}=require('./validate-catalog');
const AT=new Date('2026-10-18T00:00:00Z');
const start=hours=>new Date(AT.getTime()+hours*3600000).toISOString();
const market=(id,hours,prices=[.5,.5],options={})=>({
  id,conditionId:`condition-${id}`,active:true,closed:false,acceptingOrders:true,enableOrderBook:true,
  gameStartTime:start(hours),sportsMarketType:'moneyline',question:'Alpha vs Beta',
  outcomes:JSON.stringify(['Yes','No']),outcomePrices:JSON.stringify(prices),
  clobTokenIds:JSON.stringify([`${id}-0`,`${id}-1`]),positionIds:JSON.stringify([`${id}-p0`,`${id}-p1`]),
  liquidityNum:0,volumeNum:100,comboStatus:'disabled',tags:[{id:'soccer',slug:'soccer'}],
  events:[{id:options.eventId||`event-${id}`,title:'Alpha vs Beta',slug:options.eventSlug||`alpha-beta-${id}`}],
  ...options});
const read=(dir,name)=>fs.readFileSync(path.join(dir,name),'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
function api(input,{comboIds=[],pendingIds=[],incompleteCombo=false,bookError=false,loop=false}={}){
  let page=0;
  return async (url,options={})=>{
    const u=String(url);
    const json=async()=>{
      if(u.endsWith('/tags/slug/sports'))return {id:'sports'};
      if(u.endsWith('/sports'))return [{sport:'soccer',name:'Soccer',tags:['soccer']}];
      if(u.includes('/markets/keyset')){
        page++;
        if(loop)return {markets:input,next_cursor:'repeat'};
        return {markets:input,next_cursor:null};
      }
      if(u.includes('combo-markets')){
        if(incompleteCombo&&u.includes('cursor='))throw new Error('Combo API unavailable');
        return {markets:input.filter(m=>comboIds.includes(m.id)||pendingIds.includes(m.id)).map(m=>({
          id:m.id,condition_id:m.conditionId,outcomes:JSON.parse(m.outcomes),
          position_ids:JSON.parse(m.positionIds),pending:pendingIds.includes(m.id)})),
          next_cursor:incompleteCombo?'more':null};
      }
      if(u.endsWith('/books')){
        if(bookError)throw new Error('CLOB API unavailable');
        const ids=JSON.parse(options.body).map(x=>x.token_id);
        return ids.filter(id=>!id.startsWith('missing-book')).map(id=>{
          const marketId=id.slice(0,id.lastIndexOf('-'));
          return {asset_id:id,market:`condition-${marketId}`,timestamp:String(Date.now()),
            bids:id.startsWith('ask-only')?[]:[{price:'0.10',size:'500'}],
            asks:id.startsWith('no-ask')?[]:[{price:'0.55',size:'500'}]};
        });
      }
      throw new Error(`Unexpected URL ${u}`);
    };
    return {ok:true,json};
  };
}
async function test(){
  const direct=parseBook({token_id:'t',condition_id:'c'},{asset_id:'t',market:'c',timestamp:String(Date.now()),
    bids:[],asks:[{price:'0.8',size:'2'}]});
  assert.equal(direct.book_status,'available');
  assert.equal(direct.best_bid,null);assert.equal(direct.spread,null);assert.equal(direct.ask_size,2);
  assert.equal(parseBook({token_id:'t',condition_id:'c'},{asset_id:'t',market:'c',timestamp:String(Date.now()),bids:[],asks:[]}).book_status,'no_ask');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'betx-rebuild-test-')),out=path.join(root,'out');
  try{
    const input=[
      market('at1',1,[.05,.95]),market('at28',28,[.5,.5]),
      market('before1',1-1/3600000),market('after28',28+1/3600000),
      market('prices',2,[.049,.951]),market('ask-only',2,[.5,.5]),
      market('no-ask',2,[.5,.5]),market('missing-book',2,[.5,.5]),
      market('unknown',2,[.5,.5],{sportsMarketType:'future_market',liquidityNum:0}),
      market('spread',2,[.5,.5],{liquidityNum:0}),
      market('handicap',2,[.5,.5],{sportsMarketType:'spreads',question:'Spread: Alpha (-1.5)',line:-1.5,
        outcomes:JSON.stringify(['Alpha','Beta'])}),
      market('combo-outside',2,[.99,.01],{eventId:'shared',eventSlug:'shared-match'}),
      market('combo-inside',2,[.5,.5],{eventId:'shared',eventSlug:'shared-match'}),
      market('inactive',2,[.5,.5],{active:false}),
      market('closed',2,[.5,.5],{closed:true}),
      market('live',2,[.5,.5],{live:true}),
      market('untradable',2,[.5,.5],{acceptingOrders:false}),
    ];
    input.push({...input[0]});
    const fetchImpl=api(input,{comboIds:['at1','combo-outside'],pendingIds:['at28']});
    const index=await scan({fetchImpl,now:AT,output:out});
    validateCatalog(out);
    const rows=read(out,'markets.jsonl'),excluded=read(out,'excluded.jsonl');
    const rankings=JSON.parse(fs.readFileSync(path.join(out,'rankings.json'),'utf8'));
    assert.equal(index.rankings_status,'complete');
    assert.equal(rankings.saved_outcomes_count,rows.length);
    assert(rankings.source_market_count>new Set(rows.map(r=>r.market_id)).size);
    assert.equal(rankings.events.reduce((n,e)=>n+e.market_count,0),rankings.source_market_count);
    assert.equal(rankings.events.reduce((n,e)=>n+e.saved_outcomes_count,0),rows.length);
    assert.equal(index.saved_outcomes,rows.length);
    assert.equal(rows.filter(r=>r.market_id==='at1').length,2);
    assert.deepEqual(rows.filter(r=>r.market_id==='at1').map(r=>r.price),[.05,.95]);
    assert(rows.some(r=>r.market_id==='at28'));
    assert(rows.some(r=>r.market_id==='unknown'&&r.classification_status==='unclassified'));
    assert(rows.some(r=>r.market_id==='ask-only'&&r.best_bid===null&&r.spread===null));
    assert(rows.some(r=>r.market_id==='spread'&&r.liquidity===0&&r.spread>.035));
    assert.deepEqual(rows.filter(r=>r.market_id==='handicap').map(r=>r.outcome_line),[-1.5,1.5]);
    assert(rows.filter(r=>r.market_id==='combo-inside').every(r=>r.event_combo_status==='available'&&r.combo_status==='unavailable'));
    assert(rows.filter(r=>r.market_id==='at28').every(r=>r.combo_status==='pending'));
    for(const reason of ['price_below_5','price_above_95','outside_time_window','no_ask','book_unverified',
      'duplicate_market','market_inactive','market_closed','market_live','market_not_tradable'])
      assert(excluded.some(x=>x.reason===reason),reason);
    assert(!rows.some(r=>['no-ask','missing-book','before1','after28','prices'].includes(r.market_id)));
    const failedRankings=await scan({fetchImpl,now:AT,output:out,rankingBuilder:()=>{throw Error('ranking test failure');}});
    assert.equal(failedRankings.rankings_status,'failed');
    assert.equal(read(out,'markets.jsonl').length,rows.length);
    assert.equal(fs.existsSync(path.join(out,'rankings.json')),false);
    const previous=fs.readFileSync(path.join(out,'index.json'));
    await assert.rejects(scan({fetchImpl:api(input,{loop:true}),now:AT,output:out}),/cursor/);
    assert.deepEqual(fs.readFileSync(path.join(out,'index.json')),previous);
    await assert.rejects(scan({fetchImpl:api(Array.from({length:100},(_,i)=>market(`page${i}`,2))),now:AT,output:out}),/continuation cursor/);
    assert.deepEqual(fs.readFileSync(path.join(out,'index.json')),previous);
    const partial=await scan({fetchImpl:api([market('uncertain',2)],{incompleteCombo:true}),now:AT,output:out});
    assert.equal(partial.combo_verification.coverage_complete,false);
    assert(read(out,'markets.jsonl').every(r=>r.combo_status==='unknown'&&r.event_combo_status==='unknown'));
    assert.equal(read(out,'excluded.jsonl').filter(x=>x.reason==='no_ask').length,0);
    const bookFailure=[{token_id:'api-book-0',condition_id:'condition-api-book'}];
    await enrichBooks(bookFailure,api([],{bookError:true}));
    assert.equal(bookFailure[0].book_status,'api_error');
    await assert.rejects(scan({fetchImpl:api([market('api-book',2)],{bookError:true}),now:AT,output:out}),/Systematic CLOB errors/);
    assert.equal(read(out,'markets.jsonl').length,2);
    const bulk=Array.from({length:26},(_,i)=>market(`bulk${i}`,2));
    await assert.rejects(scan({fetchImpl:api(bulk,{bookError:true}),now:AT,output:out}),/Systematic CLOB errors/);
    console.log('Scanner integration passed: boundaries, Ask-only books, classification, Combo, errors, pagination and snapshot retention.');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test().catch(error=>{console.error(error);process.exitCode=1;});
