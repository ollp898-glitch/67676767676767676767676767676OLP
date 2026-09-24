const fs=require('node:fs');
const path=require('node:path');
const {source,key,write,read,MAX_BYTES}=require('./storage');
const {eventFacts,analyticsFor,matchEvent,comparison}=require('./matching');
const {discover,FlashscoreOdds}=require('./providers');
async function build(sourceDir,outputDir,{discovery=discover,odds=new FlashscoreOdds(),offline=false,discoveryOptions={},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  const src=source(sourceDir),meta={snapshot_id:src.snapshot_id,snapshot_at:src.snapshot_at};
  const root=path.resolve(outputDir),stage=root+'.building';
  if(root===path.resolve(sourceDir))throw new Error('Output must be a separate combo-2 directory');
  const existingFile=path.join(root,'index.json');
  if(!offline&&fs.existsSync(existingFile)){
    const existing=read(existingFile);
    if(existing.source_sha256===src.sha256&&existing.odds_collection?.mode==='once_per_scanner_snapshot'){
      require('./validate').validate(sourceDir,root);return existing;
    }
  }
  const groups=new Map();for(const r of src.rows){if(!groups.has(r.match_id))groups.set(r.match_id,[]);groups.get(r.match_id).push(r);}
  const found=offline?{candidates:[],errors:{flashscore:'Offline build: external mapping not attempted'},diagnostics:[]}:await discovery([...groups.values()].map(a=>eventFacts(a[0])),discoveryOptions);
  // Only our own staging directory is replaced; source files are never written.
  fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true});
  const index={...meta,name:'BET-X Combo Layer 2.0 Beta',source:'combo-markets.jsonl',source_sha256:src.sha256,source_outcomes:src.rows.length,layer_outcomes:0,events:groups.size,markets:0,
    max_file_bytes:MAX_BYTES,build_at:new Date().toISOString(),build_status:'partial',sports:[],coverage:{normal:{matched:0,unmatched:0,ambiguous:0},esports:{},flashscore_events:{},bookmaker_outcomes:0,betfair_matched:0,betfair_unmatched:0},
    odds_collection:{mode:offline?'offline':'once_per_scanner_snapshot',request_delay_ms:2000,concurrency:1,started_at:new Date().toISOString(),completed_at:null,last_request_at:null,successes:0,errors:0,rate_limits:0,skipped:0},diagnostics:'diagnostics/index.json'};
  const buckets=new Map(),registry=[],cache=new Map();let diagnosticNo=0;
  const diagnostics=[...found.diagnostics];
  for(const [id,rows] of groups){
    const first=rows[0],facts=eventFacts(first),analytics=analyticsFor(facts,found.candidates,found.errors);
    const mapping=matchEvent(facts,found.candidates,'flashscore',found.errors.flashscore);
    const feedCoverage=index.coverage.flashscore_events[facts.sport]??={total:0,matched:0,unmatched:0,ambiguous:0};feedCoverage.total++;feedCoverage[mapping.match_status]++;
    const candidate=mapping.match_status==='matched'?found.candidates.find(c=>c.provider==='flashscore'&&c.event_id===mapping.event_id):null;
    let result={quotes:[],observed_at:null},error=null;
    if(candidate){if(!cache.has(candidate.event_id)){
      if(index.odds_collection.rate_limits){cache.set(candidate.event_id,{error:'Skipped after provider rate limit; next attempt belongs to the next scanner snapshot'});index.odds_collection.skipped++;}
      else{
        if(cache.size)await sleep(2000);
        index.odds_collection.last_request_at=new Date().toISOString();
        try{cache.set(candidate.event_id,{result:await odds.fetchEvent(candidate)});index.odds_collection.successes++;}
        catch(e){cache.set(candidate.event_id,{error:e.message});index.odds_collection.errors++;if(e.http_status===429)index.odds_collection.rate_limits++;}
      }
    }
      const cached=cache.get(candidate.event_id);result=cached.result||result;error=cached.error||null;
      if(!registry.some(r=>r.event_id===candidate.event_id))registry.push(candidate);
    }
    if(error)diagnostics.push({provider:'flashscore',event_id:mapping.event_id,phase:'odds',error});
    const eventPath=`events/${key(id)}/index.json`,base=path.posix.dirname(eventPath);
    const event={...meta,match_id:id,event_ids:[...new Set(rows.map(r=>r.event_id))],title:first.match_title||first.event_title,sport:first.sport,discipline:facts.discipline,league_code:first.league_code,league_name:first.league_name,game_start_time:first.game_start_time,facts,
      analytics,odds_source:{provider:'flashscore',event_id:mapping.event_id,event_url:mapping.event_url,participant_order:mapping.participant_order||null,evidence:mapping.evidence||null,match_status:mapping.match_status,match_notes:mapping.match_notes,status:error?'error':result.observed_at?'available':'unavailable',error,external_odds_observed_at:result.observed_at},outcome_count:rows.length,market_count:0,markets:[]};
    const markets=new Map();for(const r of rows){if(!markets.has(r.market_id))markets.set(r.market_id,[]);markets.get(r.market_id).push(r);}
    for(const [marketId,items] of markets){
      const r=items[0];if(items.some(x=>x.condition_id!==r.condition_id||x.family!==r.family||x.period!==r.period))throw new Error(`Inconsistent parent market ${marketId}`);
      const parent={market_id:marketId,condition_id:r.condition_id,question:r.question,market_type:r.market_type,family:r.family,period:r.period,line:r.line};
      const outcomes=items.map(row=>{const c=comparison(row,result.quotes,facts);index.layer_outcomes++;if(c.bookmakers.length)index.coverage.bookmaker_outcomes++;if(c.betfair.matched)index.coverage.betfair_matched++;else index.coverage.betfair_unmatched++;return {outcome_id:row.outcome_id,outcome:row.outcome,outcome_label:row.outcome_label,token_id:row.token_id,polymarket:row,...c};});
      const parts=[];let chunk=[];
      const flush=()=>{if(!chunk.length)return;const file=`${base}/markets/${key(marketId)}-${parts.length+1}.json`;write(path.join(stage,file),{...meta,match_id:id,market:{...parent,outcomes:chunk}});parts.push({path:file,outcomes:chunk.length});chunk=[];};
      for(const outcome of outcomes){if(chunk.length>=8||Buffer.byteLength(JSON.stringify({...meta,match_id:id,market:{...parent,outcomes:[...chunk,outcome]}},null,2))>MAX_BYTES-1)flush();chunk.push(outcome);}flush();
      event.markets.push({...parent,outcome_count:items.length,parts});index.markets++;
    }
    event.market_count=markets.size;
    // Large event menus are paged too; analytics remains only in event index.
    if(Buffer.byteLength(JSON.stringify(event,null,2))>MAX_BYTES-1){const all=event.markets;delete event.markets;event.market_pages=[];for(let i=0;i<all.length;i+=30){const file=`${base}/markets-${i/30+1}.json`;write(path.join(stage,file),{...meta,match_id:id,markets:all.slice(i,i+30)});event.market_pages.push(file);}}
    write(path.join(stage,eventPath),event);
    const bucket=first.sport==='esports'?`esports/${facts.discipline}`:first.sport;
    if(!buckets.has(bucket))buckets.set(bucket,[]);buckets.get(bucket).push({match_id:id,title:event.title,path:eventPath,outcomes:rows.length,markets:markets.size});
    if(first.sport!=='esports')index.coverage.normal[analytics.match_status]=(index.coverage.normal[analytics.match_status]||0)+1;
    else{const p=analytics.provider||'unavailable';index.coverage.esports[p]??={matched:0,unmatched:0,ambiguous:0,fallback_matched:0};const stat=index.coverage.esports[p];stat[analytics.match_status]=(stat[analytics.match_status]||0)+1;if(analytics.match_status==='matched'&&analytics.route_position>0)stat.fallback_matched++;}
  }
  const esports=[];
  for(const [bucket,events] of buckets){const dir=`sports/${bucket}`,pages=[];for(let i=0;i<events.length;i+=40){const file=`${dir}/events-${i/40+1}.json`;write(path.join(stage,file),{...meta,events:events.slice(i,i+40)});pages.push(file);}const entry={name:bucket,path:`${dir}/index.json`,events:events.length,outcomes:events.reduce((n,e)=>n+e.outcomes,0)};write(path.join(stage,entry.path),{...meta,...entry,pages});if(bucket.startsWith('esports/'))esports.push(entry);else index.sports.push(entry);}
  if(esports.length){const entry={name:'esports',path:'sports/esports/index.json',events:esports.reduce((n,e)=>n+e.events,0),outcomes:esports.reduce((n,e)=>n+e.outcomes,0)};write(path.join(stage,entry.path),{...meta,...entry,disciplines:esports});index.sports.push(entry);}
  const registryFiles=[];for(const event of registry){const file=`registry/${key(event.event_id)}.json`;write(path.join(stage,file),{...meta,event});registryFiles.push(file);}write(path.join(stage,'registry/index.json'),{...meta,events:registryFiles});
  const diagFiles=[];for(let i=0;i<diagnostics.length;i+=20){const file=`diagnostics/${++diagnosticNo}.json`;write(path.join(stage,file),{...meta,items:diagnostics.slice(i,i+20)});diagFiles.push(file);}write(path.join(stage,'diagnostics/index.json'),{...meta,pages:diagFiles});
  index.coverage.bookmaker_unmatched=src.rows.length-index.coverage.bookmaker_outcomes;
  index.build_status=index.coverage.normal.unmatched===0&&index.coverage.normal.ambiguous===0&&Object.values(index.coverage.esports).every(p=>!p.unmatched&&!p.ambiguous&&!p.provider_not_available)&&index.coverage.betfair_unmatched===0&&diagnostics.length===0?'complete':'partial';
  index.odds_collection.completed_at=new Date().toISOString();
  write(path.join(stage,'index.json'),index);
  require('./validate').validate(sourceDir,stage);
  const backup=root+'.previous';fs.rmSync(backup,{recursive:true,force:true});if(fs.existsSync(root))fs.renameSync(root,backup);try{fs.renameSync(stage,root);}catch(e){if(fs.existsSync(backup))fs.renameSync(backup,root);throw e;}fs.rmSync(backup,{recursive:true,force:true});
  return index;
}
module.exports={build};
if(require.main===module){const args=process.argv.slice(2).filter(x=>x!=='--offline'),dir=args[0]||'out';build(dir,args[1]||path.join(dir,'combo-2'),{offline:process.argv.includes('--offline'),discoveryOptions:process.env.BETX_ANALYTICS_CATALOG?{catalog:read(process.env.BETX_ANALYTICS_CATALOG)}:{}}).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e);process.exitCode=1;});}
