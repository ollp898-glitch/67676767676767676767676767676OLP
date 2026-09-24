const {name,normalize,directUrl} = require('./matching');
const ODDS_ENDPOINT='https://global.ds.lsapp.eu/odds/pq_graphql';
const DISCOVERY={flashscore:'https://www.flashscore.com/',hltv:'https://www.hltv.org/matches',vlr:'https://www.vlr.gg/matches',gol:'https://gol.gg/',dotabuff:'https://www.dotabuff.com/esports',opendota:'https://www.opendota.com/',siegegg:'https://siege.gg/matches',liquipedia:'https://liquipedia.net/'};
class ProviderError extends Error {
  constructor(message,{status=null,retryAfterMs=null,permanent=false}={}){super(message);this.http_status=status;this.retryAfterMs=retryAfterMs;this.permanent=permanent;}
}
async function http(url,fetchImpl=fetch,signal) {
  let res;try{res=await fetchImpl(url,{signal:signal || AbortSignal.timeout(15000)});}catch(e){throw new ProviderError(`${e.message}: ${e.cause?.code||e.name}`);}
  if(!res.ok || [202,204,205,304].includes(res.status)) {
    const retry=res.headers?.get('Retry-After'),ms=res.headers?.get('x-retry-after-ms');
    const delay=retry?(Number.isFinite(Number(retry))?Number(retry)*1000:Math.max(0,Date.parse(retry)-Date.now())):ms?Number(ms):null;
    const body=(await res.text()).slice(0,300).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
    throw new ProviderError(`HTTP ${res.status} ${new URL(url).hostname}: ${body}`,{status:res.status,retryAfterMs:Number.isFinite(delay)?delay:null,permanent:[401,403,404].includes(res.status)});
  }
  return res;
}
function embeddedJson(html,marker) {
  const start=html.indexOf(marker);if(start<0)throw new ProviderError('Source page has no supported event data',{permanent:true});
  const from=html.indexOf('{',start+marker.length);let depth=0,string=false,escape=false;
  for(let i=from;i<html.length;i++){const c=html[i];if(string){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')string=false;}else if(c==='"')string=true;else if(c==='{')depth++;else if(c==='}'&&!--depth)return JSON.parse(html.slice(from,i+1));}
  throw new ProviderError('Invalid embedded event JSON',{permanent:true});
}
function parseFlashscorePage(html,url) {
  const e=embeddedJson(html,'window.environment =');
  if(!e.event_id_c||!e.participantsData||!e.config?.app?.fsds?.client_urls?.odds)throw new ProviderError('Flashscore event schema changed',{permanent:true});
  const home=e.participantsData.home,away=e.participantsData.away;
  if(home?.length!==1||away?.length!==1)throw new ProviderError('Unsupported participant structure',{permanent:true});
  const u=new URL(url);u.searchParams.set('mid',e.event_id_c);
  const start=e.common_feed?.find(x=>Object.hasOwn(x,'DD'))?.DD;
  return {provider:'flashscore',event_id:e.event_id_c,event_url:u.href,sport:e.sport,discipline:null,scope:'match',
    participants:[home[0].name,away[0].name],competition:e.header?.tournament?.tournament || null,
    start_time:Number.isFinite(start)?new Date(start*1000).toISOString():null,best_of:null,
    participant_ids:[home[0].eventParticipantId,away[0].eventParticipantId],project_id:e.config.app.project.id,
    odds_endpoint:e.config.app.fsds.client_urls.odds,evidence:{url:u.href,observed_at:new Date().toISOString(),method:'server_rendered_environment'},
    odds_contract:'flashscore_oce_2026_09_22'};
}
function links(html,base){return [...new Set([...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].flatMap(m=>{try{return [new URL(m[1].replace(/&amp;/g,'&'),base).href];}catch{return [];}}))];}
function parseSiegePage(html,url){
  const data=html.match(/id="__NUXT_DATA__">([\s\S]*?)<\/script>/);if(!data)return [];
  const table=JSON.parse(data[1]),id=new URL(url).pathname.match(/^\/matches\/(\d+)/)?.[1];
  const holder=table.find(v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.hasOwn(v,`match:${id}`));if(!holder)return [];
  const record=table[holder[`match:${id}`]],value=k=>table[record[k]],rosters=value('rosters');if(!Array.isArray(rosters)||rosters.length!==2)return [];
  const participants=rosters.map(i=>{const r=table[i];return table[r.name];});if(participants.some(p=>typeof p!=='string'))return [];
  // The observed page explicitly identifies this as a match/series, but does not expose BO.
  // Keep BO unknown; source BO1/BO3 records therefore remain unmatched until confirmed.
  return [{provider:'siegegg',event_id:String(value('id')),event_url:url,sport:'esports',discipline:'rainbow6',scope:'series',participants,competition:value('competition_full_name'),start_time:value('date'),best_of:null,
    evidence:{url,observed_at:new Date().toISOString(),method:'siegegg_server_nuxt_match',missing:['best_of']}}];
}
function parseStructuredEvent(html,url,provider) {
  const nodes=[...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(m=>{try{const d=JSON.parse(m[1]);return Array.isArray(d)?d:d['@graph']||[d];}catch{return [];}});
  return nodes.filter(d=>['SportsEvent','Event'].includes(d['@type'])&&d.homeTeam?.name&&d.awayTeam?.name&&d.startDate&&d.superEvent?.name).map(d=>({
    provider,event_id:String(d['@id'] || url),event_url:url,sport:'esports',discipline:null,scope:null,
    participants:[d.homeTeam.name,d.awayTeam.name],competition:d.superEvent.name,start_time:d.startDate,best_of:null,
    evidence:{url,observed_at:new Date().toISOString(),method:'schema_org'}}));
}
async function discover(facts,{fetchImpl=fetch,seedUrls={},catalog=[],budgetMs=120000}={}) {
  const candidates=[...catalog],errors={},diagnostics=[];
  const deadline=Date.now()+budgetMs;
  const feeds=await require('./flashscore-events').discoverEvents(facts,{fetchImpl,http,embeddedJson,deadline});
  candidates.push(...feeds.candidates);Object.assign(errors,feeds.errors);diagnostics.push(...feeds.diagnostics);
  const providers=new Set(facts.flatMap(f=>f.sport==='esports'?require('./matching').ROUTES[f.discipline]||[]:[]));
  for(const provider of providers){
    if(Date.now()>=deadline){errors[provider]='Discovery time budget reached';diagnostics.push({provider,phase:'discovery',error:errors[provider]});continue;}
    const urls=new Set(seedUrls[provider]||[]);
    try {
      const res=await http(DISCOVERY[provider],fetchImpl),html=await res.text();
      for(const url of links(html,DISCOVERY[provider])){
        const words=normalize(decodeURIComponent(url));
        const detail=directUrl(provider,url)||(provider==='flashscore'&&/^https:\/\/www\.flashscore\.com\/match\//.test(url));
        if(detail&&facts.some(f=>f.participants.length===2&&f.participants.every(p=>words.includes(name(p)))))urls.add(url);
      }
    } catch(e){errors[provider]=e.message;diagnostics.push({provider,phase:'discovery',error:e.message,http_status:e.http_status??null});}
    for(const url of urls){
      if(Date.now()>=deadline){diagnostics.push({provider,phase:'event_detail',error:'Discovery time budget reached'});break;}
      try {
        const html=await (await http(url,fetchImpl)).text();
        const parsed=provider==='flashscore'?[parseFlashscorePage(html,url)]:provider==='siegegg'?parseSiegePage(html,url):parseStructuredEvent(html,url,provider);
        if(!parsed.length)throw new ProviderError('No supported exact event schema in page',{permanent:true});
        candidates.push(...parsed);
      }catch(e){diagnostics.push({provider,url,phase:'event_detail',error:e.message,http_status:e.http_status??null});}
    }
  }
  return {candidates,errors,diagnostics};
}
function parseOdds(data,event,at) {
  const d=data?.data?.findOddsByEventId;
  if(data?.errors?.length||!d||d.eventId!==event.event_id||!Array.isArray(d.odds)||!Array.isArray(d.settings?.bookmakers))throw new ProviderError('Flashscore odds response schema/identity mismatch',{permanent:true});
  const names=new Map(d.settings.bookmakers.map(b=>[b.bookmaker.id,b.bookmaker.name])),quotes=[];
  for(const group of d.odds){
    if(!Array.isArray(group.odds))throw new ProviderError('Invalid odds group',{permanent:true});
    for(const item of group.odds){
      const id=item.eventParticipantId, side=event.participant_ids.indexOf(id);
      let canonical=null;
      if(['HOME_DRAW_AWAY','HOME_AWAY'].includes(group.bettingType)){
        const draw=group.bettingType==='HOME_DRAW_AWAY'&&id===null&&group.odds.length===3&&group.odds.filter(x=>x.eventParticipantId===null).length===1&&event.participant_ids.every(p=>group.odds.some(x=>x.eventParticipantId===p));
        if(side>=0||draw)canonical={sport:event.sport,discipline:event.discipline,type:group.bettingType,period:group.bettingScope,selection:side===0?'HOME':side===1?'AWAY':'DRAW'};
      }
      // The observed primary football OVER_UNDER tab is goals; corners/team props are not represented by it.
      if(group.bettingType==='OVER_UNDER'&&event.sport==='soccer'&&id===null&&['OVER','UNDER'].includes(item.selection)&&['GOALS','UNKNOWN'].includes(item.handicap?.type)&&item.handicap.value!==''&&Number.isFinite(Number(item.handicap.value)))
        canonical={sport:'soccer',discipline:null,type:'OVER_UNDER',period:group.bettingScope,metric:'GOALS',selection:item.selection,line:Number(item.handicap.value)};
      if(group.bettingType==='OVER_UNDER'&&event.sport==='tennis'&&id===null&&['OVER','UNDER'].includes(item.selection)&&['GAMES','SETS'].includes(item.handicap?.type)&&item.handicap.value!==''&&Number.isFinite(Number(item.handicap.value)))
        canonical={sport:'tennis',discipline:null,type:'OVER_UNDER',period:group.bettingScope,metric:item.handicap.type,selection:item.selection,line:Number(item.handicap.value)};
      if(group.bettingType==='BOTH_TEAMS_TO_SCORE'&&event.sport==='soccer'&&id===null&&typeof item.bothTeamsToScore==='boolean')
        canonical={sport:'soccer',discipline:null,type:'BOTH_TEAMS_TO_SCORE',period:group.bettingScope,selection:item.bothTeamsToScore?'YES':'NO'};
      if(group.bettingType==='ASIAN_HANDICAP'&&side>=0&&item.handicap?.value!==''&&Number.isFinite(Number(item.handicap?.value))&&Math.abs(Number(item.handicap.value)%1)===0.5){
        const metric=event.sport==='soccer'&&['GOALS','UNKNOWN'].includes(item.handicap.type)?'GOALS':event.sport==='tennis'&&item.handicap.type==='SETS'?'SETS':null;
        if(metric)canonical={sport:event.sport,discipline:null,type:'ASIAN_HANDICAP',period:group.bettingScope,metric,selection:side===0?'HOME':'AWAY',line:Number(item.handicap.value)};
      }
      const numeric=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
      quotes.push({bookmaker_name:names.get(group.bookmakerId) || null,bookmaker_id:group.bookmakerId,betting_type:group.bettingType,betting_scope:group.bettingScope,
        selection:item.selection ?? (side===0?'HOME':side===1?'AWAY':canonical?.selection??null),line:numeric(item.handicap?.value),event_participant_id:id,event_participant_name:side>=0?event.participants[side]:null,event_participant_slug:side>=0?event.participant_slugs?.[side]||null:null,
        current_decimal_odds:numeric(item.value),decimal_odds:numeric(item.value),opening_decimal_odds:numeric(item.opening),active:item.active===true,
        source_timestamp:null,external_odds_observed_at:at,source:'flashscore_odds_feed',canonical});
    }
  }
  return quotes;
}
class FlashscoreOdds {
  constructor(fetchImpl=fetch){this.fetchImpl=fetchImpl;}
  async fetchEvent(event,signal) {
    if(event.odds_endpoint!==ODDS_ENDPOINT||event.odds_contract!=='flashscore_oce_2026_09_22')throw new ProviderError('Unverified Flashscore odds contract',{permanent:true});
    const url=new URL(ODDS_ENDPOINT);for(const [k,v] of Object.entries({_hash:'oce',eventId:event.event_id,projectId:event.project_id,geoIpCode:'',geoIpSubdivisionCode:''}))url.searchParams.set(k,v);
    // FsdsFetcher uses GET with these parameters and no x-fsign. Legacy /x/feed uses x-fsign separately.
    const res=await http(url.href,this.fetchImpl,signal),at=new Date().toISOString();
    return {quotes:parseOdds(await res.json(),event,at),observed_at:at};
  }
}
module.exports={ProviderError,http,embeddedJson,parseFlashscorePage,parseStructuredEvent,parseSiegePage,discover,parseOdds,FlashscoreOdds,ODDS_ENDPOINT};
