// Contract observed in Flashscore's public Feed_Request / FeedFetcher / DetailLink.
// Bootstrap contains configuration only. Event discovery uses sport/day feeds, never homepage links.
const CONFIG_URL='https://static.flashscore.com/x/js/core_2_2315000000.js';
const DAY=86400000;
function records(text){
  if(typeof text!=='string'||!text.includes('SA÷')||!text.includes('¬'))throw new Error('Invalid Flashscore sport feed');
  return text.split('~').map(block=>Object.fromEntries(block.split('¬').filter(Boolean).map(field=>{const p=field.indexOf('÷');return [field.slice(0,p),field.slice(p+1)];})));
}
function parseFeed(text,{sport,sportId,config,url,observedAt}){
  let league=null,actualSport=null;const events=[];
  for(const r of records(text)){
    if(r.SA)actualSport=Number(r.SA);
    if(r.ZA)league=r;
    if(!r.AA)continue;
    if(actualSport!==sportId||!league||!r.AE||!r.AF||!r.AD||!r.JA||!r.JB||!r.WU||!r.WV||!r.PX||!r.PY)continue;
    if(!/^[A-Za-z0-9]{8}$/.test(r.AA)||!Number.isFinite(Number(r.AD)))continue;
    const parts=[`${r.WU}-${r.PX}`,`${r.WV}-${r.PY}`].sort().map(encodeURIComponent);
    const sportPath=sport==='soccer'?'football':sport;
    const eventUrl=`https://www.flashscore.com/match/${sportPath}/${parts.join('/')}/?mid=${r.AA}`;
    const [category,...rest]=league.ZA.split(': '),competition=rest.join(': ')||league.ZA;
    const discipline=sport==='esports'?({'COUNTER-STRIKE':'cs2','DOTA 2':'dota2','LEAGUE OF LEGENDS':'lol','VALORANT':'valorant','RAINBOW SIX':'rainbow6'}[category]||null):null;
    events.push({provider:'flashscore',event_id:r.AA,event_url:eventUrl,sport,discipline,scope:sport==='esports'?'series':'match',
      participants:[r.AE,r.AF],participant_ids:[r.JA,r.JB],participant_hashes:[r.PX,r.PY],participant_slugs:[r.WU,r.WV],competition,
      competition_category:category,competition_id:league.ZEE||null,start_time:new Date(Number(r.AD)*1000).toISOString(),best_of:null,
      project_id:config.app.project.id,odds_endpoint:config.app.fsds.client_urls.odds,odds_contract:'flashscore_oce_2026_09_22',
      evidence:{url,observed_at:observedAt,method:'flashscore_sport_day_feed',feed_sport_id:sportId,competition:league.ZA,event_status:r.AB||null,fields:{event_id:'AA',start_time:'AD',participants:['AE','AF'],participant_ids:['JA','JB']}}});
  }
  return events;
}
function feedRequests(facts,config,now=Date.now()){
  const requests=new Map(),unsupported=[];
  for(const fact of facts){
    const sportId=config.app.sport_list[fact.sport],start=Date.parse(fact.start_time);
    if(!sportId||!Number.isFinite(start)){unsupported.push({sport:fact.sport,start_time:fact.start_time,reason:'unsupported_sport_or_missing_time'});continue;}
    const offset=Math.floor(start/DAY)-Math.floor(now/DAY);
    // Site feeds may include the preceding evening. Adjacent dates cover timezone boundaries.
    for(const day of [offset-1,offset,offset+1]){
      if(Math.abs(day)>config.app.calendar_range)continue;
      const key=`${sportId}:${day}`;
      const url=`${config.app.feed_resolver.default_url}/${config.app.project.id}/x/feed/f_${sportId}_${day}_0_${config.app.lang.web}_${config.app.project_type.id}`;
      requests.set(key,{sport:fact.sport,sportId,day,url});
    }
    if(Math.abs(offset)>config.app.calendar_range)unsupported.push({sport:fact.sport,start_time:fact.start_time,reason:'outside_feed_calendar'});
  }
  return {requests:[...requests.values()],unsupported};
}
async function discoverEvents(facts,{fetchImpl=fetch,http,embeddedJson,deadline=Infinity,now=Date.now(),configUrl=CONFIG_URL}={}){
  const candidates=[],diagnostics=[],errors={};
  try{
    const config=embeddedJson(await(await http(configUrl,fetchImpl)).text(),'cjs._config =');
    if(!config.app?.feed_sign||!config.app?.sport_list||!config.app?.feed_resolver?.default_url||!Number.isFinite(config.app.calendar_range)||config.app.calendar_range<0||config.app.calendar_range>7)throw new Error('Flashscore configuration schema changed');
    const origin=new URL(config.app.feed_resolver.default_url);
    if(origin.protocol!=='https:'||!/(^|\.)flashscore\.ninja$/.test(origin.hostname)||!Number.isInteger(config.app.project.id)||!Number.isInteger(config.app.project_type.id)||!/^\w+$/.test(config.app.lang.web))throw new Error('Unverified Flashscore feed origin or parameters');
    const plan=feedRequests(facts,config,now);
    diagnostics.push(...plan.unsupported.map(x=>({provider:'flashscore',phase:'event_feed',...x})));
    let next=0,rateLimited=false;
    await Promise.all(Array.from({length:3},async()=>{
      while(next<plan.requests.length){
        const request=plan.requests[next++];
        if(rateLimited){diagnostics.push({provider:'flashscore',phase:'event_feed',...request,error:'Skipped after provider rate limit'});continue;}
        if(Date.now()>=deadline){diagnostics.push({provider:'flashscore',phase:'event_feed',...request,error:'Discovery time budget reached'});continue;}
        try{
          const response=await http(request.url,(url,options)=>fetchImpl(url,{...options,headers:{...options?.headers,'x-fsign':config.app.feed_sign}}));
          const observedAt=new Date().toISOString(),events=parseFeed(await response.text(),{...request,config,observedAt});
          candidates.push(...events);diagnostics.push({provider:'flashscore',phase:'event_feed',...request,events:events.length,observed_at:observedAt});
        }catch(e){if(e.http_status===429)rateLimited=true;diagnostics.push({provider:'flashscore',phase:'event_feed',...request,error:e.message,http_status:e.http_status??null,retry_after_ms:e.retryAfterMs??null});}
      }
    }));
    if(diagnostics.some(d=>d.error))errors.flashscore='One or more sport/day feeds failed; see diagnostics';
  }catch(e){errors.flashscore=e.message;diagnostics.push({provider:'flashscore',phase:'feed_configuration',url:configUrl,error:e.message,http_status:e.http_status??null});}
  // Deduplicate overlapping calendar feeds; conflicting identities remain ambiguous.
  const unique=new Map();for(const c of candidates){const key=JSON.stringify([c.event_id,c.participants,c.competition,c.start_time]);unique.set(key,c);}
  const values=[...unique.values()],counts=new Map();for(const c of values)counts.set(c.event_id,(counts.get(c.event_id)||0)+1);
  for(const c of values)if(counts.get(c.event_id)>1)c.identity_conflict=true;
  return {candidates:values,diagnostics,errors};
}
module.exports={CONFIG_URL,records,parseFeed,feedRequests,discoverEvents};
