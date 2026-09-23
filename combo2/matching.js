// Independent enrichment semantics. Never imports or modifies scanner classification.
const normalize = x => String(x ?? '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const ALIASES = new Map([['cd real santander','real santander'],['orsomarso sc','orsomarso'],['bounty hunters esports','bounty hunters']]);
const name = x => ALIASES.get(normalize(x)) || normalize(x);
const discipline = row => ({cs2:'cs2',csgo:'cs2',val:'valorant',valorant:'valorant',lol:'lol',dota2:'dota2',dota:'dota2',r6:'rainbow6',r6siege:'rainbow6',rainbow6:'rainbow6',rl:'rocket-league',ow:'overwatch',ow2:'overwatch',mlbb:'mobile-legends'}[String(row.league_code).toLowerCase()] || 'other');
const ROUTES = {cs2:['hltv','liquipedia'],valorant:['vlr','liquipedia'],lol:['gol','liquipedia'],dota2:['dotabuff','opendota','liquipedia'],rainbow6:['siegegg','liquipedia'],'rocket-league':['liquipedia'],overwatch:['liquipedia'],'mobile-legends':['liquipedia'],other:[]};
function eventFacts(row) {
  let title = row.match_title || row.event_title || '';
  const bo=title.match(/\(BO(\d+)\)/i), tournament=bo ? title.split(/\(BO\d+\)\s*-\s*/i)[1] : null;
  const tennisTournament=row.sport==='tennis'&&title.includes(':')?title.slice(0,title.indexOf(':')).trim():null;
  if(tennisTournament)title=title.slice(title.indexOf(':')+1).trim();
  if(row.sport==='esports')title=title.replace(/^[^:]+:\s*/,'').split(/\s*\(BO\d+\)/i)[0];
  const teams=title.split(/\s+(?:vs\.?|v\.?|—)\s+/i);
  return {sport:row.sport,discipline:row.sport==='esports'?discipline(row):null,participants:teams.length===2?teams.map(s=>s.trim()):[],
    competition:tournament || tennisTournament || row.league_name || null,start_time:row.game_start_time,best_of:bo?Number(bo[1]):null,scope:row.sport==='esports'?'series':'match',...(tennisTournament?{tennis_doubles:/doubles/i.test(tennisTournament)}:{})};
}
const LEAGUE_ALIASES=new Map([['fifa friendlies','friendly international'],['club friendlies','club friendly'],['categoria primera b','primera b'],['categoria primera a','primera a'],['fifa u 20 women s world cup','world cup women u20'],['uefa women s champions league','uefa champions league women']]);
function competition(x) { const v=normalize(x).replace(/ round \d+$/,'').replace(/ (?:clausura|apertura)$/,'').replace(/ (?:play offs|league phase)$/,'').replace(/^(concacaf nations league|uefa nations league) league [a-d]$/,'$1');return LEAGUE_ALIASES.get(v)||v; }
// Explicit, reviewed source aliases, scoped by competition. Never strip W/U20 globally.
const EVENT_ALIASES={
  'friendly international':{'sao tome e principe':'sao tome and principe','korea republic':'south korea','ir iran':'iran'},
  'usl championship':{'birmingham legion fc':'birmingham','brooklyn fc':'brooklyn'},
  'knvb beker':{'vv sparta nijkerk':'sparta nijkerk','rksv udi 19':'udi 19','vv ijsselmeervogels':'ijsselmeervogels','vv gemert':'gemert','jos watergraafsmeer':'watergraafsmeer','sv tec':'tec','rksv rohda raalte':'raalte','vpv purmersteijn':'purmersteijn'},
  'mls':{'seattle sounders fc':'seattle sounders'},
  'canadian premier league':{'inter toronto fc':'inter toronto'},
  'liga 1':{'cs cienciano':'cienciano'},
  'primera a':{'aguilas doradas rionegro':'aguilas'},
  'world cup women u20':{'italy':'italy u20 w','spain':'spain u20 w','dpr korea':'north korea u20 w','colombia':'colombia u20 w'},
  'uefa champions league women':{'servette fc chenois feminin':'servette geneve fc w','ol lyonnes':'ol lyonnes w','oud heverlee leuven women':'leuven w','as roma':'as roma w','fc barcelona':'barcelona w','paris fc':'paris fc w','chelsea fc':'chelsea w','fk austria wien':'austria vienna w'}
};
function eventName(p,league){const n=name(p);return EVENT_ALIASES[competition(league)]?.[n]||n;}
function participantOrder(facts,c){
  const a=facts.participants.map(p=>eventName(p,facts.competition)),b=(c.participants||[]).map(p=>eventName(p,c.competition));
  if(a.length!==2||b.length!==2||a[0]===a[1])return null;
  if(facts.sport==='tennis'&&!facts.tennis_doubles&&c.participant_slugs?.length===2){
    // Full given/family names in source slugs, not surname/initial-only matching.
    const tokens=x=>normalize(x).split(' ').sort().join(' '),slugs=c.participant_slugs.map(tokens),full=facts.participants.map(tokens);
    if(full[0]!==full[1]&&full.every((p,i)=>p===slugs[i]))return [0,1];
    if(full[0]!==full[1]&&full.every((p,i)=>p===slugs[1-i]))return [1,0];
  }
  if(a.every((p,i)=>p===b[i]))return [0,1];
  // US sports and tennis source titles need not list home/away in Flashscore order.
  if(['baseball','basketball','tennis'].includes(facts.sport)&&a.every((p,i)=>p===b[1-i]))return [1,0];
  return null;
}
function competitionMatches(facts,c){
  if(facts.sport==='tennis'&&c.competition_category){
    if(facts.tennis_doubles||!/SINGLES/.test(c.competition_category))return false;
    const title=c.competition.replace(/\s*\([^)]*\)/g,'').replace(/,\s*(?:hard|clay|grass|carpet).*$/i,'');
    return competition(title)===competition(facts.competition);
  }
  return competition(c.competition)===competition(facts.competition);
}
const HOSTS={flashscore:['flashscore.com','www.flashscore.com'],hltv:['hltv.org','www.hltv.org'],vlr:['vlr.gg','www.vlr.gg'],gol:['gol.gg','www.gol.gg'],dotabuff:['dotabuff.com','www.dotabuff.com'],opendota:['opendota.com','www.opendota.com'],siegegg:['siege.gg','siegegg.com','www.siege.gg','www.siegegg.com'],liquipedia:['liquipedia.net']};
function directUrl(provider,url) {
  try { const u=new URL(url);if(u.protocol!=='https:'||!HOSTS[provider]?.includes(u.hostname))return false;
    return provider==='flashscore'?u.pathname.startsWith('/match/')&&!!u.searchParams.get('mid'):
      provider==='hltv'?/^\/matches\/\d+\//.test(u.pathname):provider==='vlr'?/^\/\d+\//.test(u.pathname):
      provider==='gol'?/\/game\/stats\/\d+/.test(u.pathname):
      provider==='dotabuff'||provider==='opendota'?/\/(matches|esports\/series)\/[\w-]+/.test(u.pathname):
      provider==='siegegg'?/\/matches\//.test(u.pathname):u.pathname.split('/').filter(Boolean).length>=3&&!/\/Team:/.test(u.pathname);
  } catch { return false; }
}
function matchEvent(facts,candidates,provider,error=null) {
  const base={provider,event_id:null,event_url:null,match_status:'unmatched',match_confidence:0,match_method:null,match_notes:error || 'No exact event confirmed'};
  if(!facts.participants.length||!facts.competition||!Number.isFinite(Date.parse(facts.start_time)))return {...base,match_notes:'Missing source participants, competition or start time'};
  const exact=candidates.filter(c=>c.provider===provider&&directUrl(provider,c.event_url)&&c.sport===facts.sport&&c.discipline===facts.discipline&&c.scope===facts.scope&&
    !c.identity_conflict&&participantOrder(facts,c)&&competitionMatches(facts,c)&&
    Number.isFinite(Date.parse(c.start_time))&&Math.abs(Date.parse(c.start_time)-Date.parse(facts.start_time))<=300000&&
    (!facts.best_of||c.best_of===facts.best_of));
  const unique=[...new Map(exact.map(c=>[c.event_id,c])).values()];
  if(unique.length>1)return {...base,match_status:'ambiguous',match_notes:'Multiple exact candidate events'};
  if(!unique.length){
    const pool=candidates.filter(c=>c.provider===provider&&c.sport===facts.sport),participants=pool.filter(c=>participantOrder(facts,c)),leagues=participants.filter(c=>competitionMatches(facts,c)),times=leagues.filter(c=>Math.abs(Date.parse(c.start_time)-Date.parse(facts.start_time))<=300000);
    const reason=!pool.length?'No sport feed candidates available':!participants.length?'Participants not confirmed in sport feeds':!leagues.length?'Competition not confirmed':!times.length?'Scheduled start differs by more than 5 minutes':'Discipline, scope, BO or consistent identity not confirmed';
    return {...base,match_notes:error?`${reason}; ${error}`:reason};
  }
  const c=unique[0];return {...base,event_id:c.event_id,event_url:c.event_url,match_status:'matched',match_confidence:1,
    match_method:'normalized_participants_competition_utc_time_scope',participant_order:participantOrder(facts,c),match_notes:'Verified participants with explicit order mapping; start within 5 minutes; competition and series/BO validation',evidence:c.evidence || null};
}
function analyticsFor(facts,candidates,errors={}) {
  if(facts.sport!=='esports')return matchEvent(facts,candidates,'flashscore',errors.flashscore);
  const providers=ROUTES[facts.discipline] || [];
  if(!providers.length)return {provider:null,event_id:null,event_url:null,match_status:'provider_not_available',match_confidence:0,match_method:null,match_notes:'Unknown esports discipline'};
  const attempts=providers.map(p=>matchEvent(facts,candidates,p,errors[p]));
  // An ambiguous primary mapping must not be disguised as a verified fallback.
  const primary=attempts[0];if(primary.match_status==='ambiguous')return {...primary,attempts};
  const selected=attempts.find(a=>a.match_status==='matched')||primary;
  return {...selected,primary_provider:providers[0],route_position:providers.indexOf(selected.provider),attempts};
}
const PERIODS={match:'FULL_TIME',half_1:'FIRST_HALF',half_2:'SECOND_HALF',set_1:'FIRST_SET',set_2:'SECOND_SET',quarter_1:'FIRST_QUARTER',period_1:'FIRST_PERIOD'};
function marketKey(row,facts) {
  const period=PERIODS[row.period];if(!period)return null;
  const raw=name(row.outcome), side=facts.participants.findIndex(p=>name(p)===raw);
  const common={sport:row.sport,discipline:facts.discipline,period,participant:null,selection:null,line:null,metric:null};
  if(row.family==='winner' && ['moneyline','soccer_halftime_result'].includes(row.market_type)) {
    let selection=side>=0?(side===0?'HOME':'AWAY'):raw==='draw'?'DRAW':null;
    if(raw==='yes') {
      if(/end in a draw\?/i.test(row.question))selection='DRAW';
      else {const m=row.question.match(/^Will (.+) win on \d{4}-\d{2}-\d{2}\?$/);if(m){const i=facts.participants.findIndex(p=>name(p)===name(m[1]));selection=i===0?'HOME':i===1?'AWAY':null;}}
    }
    // A binary No is NOT a single 1X2 selection; no synthetic double-chance odds.
    if(!selection)return null;
    const type=row.sport==='soccer'?'HOME_DRAW_AWAY':['tennis','esports'].includes(row.sport)?'HOME_AWAY':null;
    return type?{...common,type,selection}:null;
  }
  if(row.family==='totals'&&['totals','first_half_totals'].includes(row.market_type)&&row.sport==='soccer'&&['over','under'].includes(raw)&&Number.isFinite(row.outcome_line??row.line))
    return {...common,type:'OVER_UNDER',metric:'GOALS',selection:raw.toUpperCase(),line:row.outcome_line??row.line};
  // Unsupported corners, team/player totals and settlement rules fail closed.
  return null;
}
const canonicalKey = key => key ? JSON.stringify([key.sport,key.discipline??null,key.type,key.period,key.metric??null,key.participant??null,key.selection,key.line??null]) : null;
function comparison(row,quotes,facts) {
  const key=canonicalKey(marketKey(row,facts));
  const quoteKey=q=>{
    if(q.event_participant_name&&['HOME_DRAW_AWAY','HOME_AWAY'].includes(q.canonical?.type)){
      const tokens=x=>normalize(x).split(' ').sort().join(' ');
      const index=facts.participants.findIndex(p=>eventName(p,facts.competition)===eventName(q.event_participant_name,facts.competition)||(facts.sport==='tennis'&&q.event_participant_slug&&tokens(p)===tokens(q.event_participant_slug)));
      return index<0?null:canonicalKey({...q.canonical,selection:index===0?'HOME':'AWAY'});
    }
    return canonicalKey(q.canonical);
  };
  const matching=key?quotes.filter(q=>quoteKey(q)===key&&q.active===true&&Number.isFinite(q.decimal_odds)&&q.decimal_odds>1):[];
  const groups=new Map();for(const q of matching){const id=String(q.bookmaker_id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(q);}
  const bookmakers=[];for(const values of groups.values())if(values.length===1)bookmakers.push(values[0]);
  const bf=bookmakers.filter(q=>normalize(q.bookmaker_name)==='betfair');
  const betfair=bf.length===1?{matched:true,bookmaker:'Betfair',bookmaker_id:bf[0].bookmaker_id,decimal_odds:bf[0].decimal_odds,probability_percent:100/bf[0].decimal_odds,
    observed_at:bf[0].external_odds_observed_at,source_timestamp:bf[0].source_timestamp,match_method:'exact_semantic_key',match_confidence:1}:
    {matched:false,decimal_odds:null,probability_percent:null,reason:!key?'unsupported_or_unproven_market_semantics':bf.length>1?'ambiguous_betfair_quote':'betfair_selection_not_available'};
  return {betfair,bookmakers,comparison:{polymarket_probability_percent:row.probability_percent,betfair_probability_percent:betfair.probability_percent,
    probability_difference_pp:betfair.matched?row.probability_percent-betfair.probability_percent:null,method:'raw_implied_probability_no_margin_adjustment'}};
}
module.exports={normalize,name,discipline,ROUTES,eventFacts,directUrl,matchEvent,analyticsFor,marketKey,canonicalKey,comparison,competition,participantOrder};
