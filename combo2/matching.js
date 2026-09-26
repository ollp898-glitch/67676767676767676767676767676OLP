// Independent enrichment semantics. Never imports or modifies scanner classification.
const normalize = x => String(x ?? '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const ALIASES = new Map([['cd real santander','real santander'],['orsomarso sc','orsomarso'],['bounty hunters esports','bounty hunters']]);
const name = x => ALIASES.get(normalize(x)) || normalize(x);
const discipline = row => ({cs2:'cs2',csgo:'cs2',val:'valorant',valorant:'valorant',lol:'lol',dota2:'dota2',dota:'dota2',r6:'rainbow6',r6siege:'rainbow6',rainbow6:'rainbow6',rl:'rocket-league',ow:'overwatch',ow2:'overwatch',mlbb:'mobile-legends'}[String(row.league_code).toLowerCase()] || 'other');
const ROUTES = {cs2:['hltv','liquipedia'],valorant:['vlr','liquipedia'],lol:['gol','liquipedia'],dota2:['dotabuff','opendota','liquipedia'],rainbow6:['siegegg','liquipedia'],'rocket-league':['liquipedia'],overwatch:['liquipedia'],'mobile-legends':['liquipedia'],other:[]};
function eventFacts(row) {
  let title = row.match_title || row.event_title || '';
  title=title.replace(/\s+-\s+(?:More Markets|Halftime Result)$/i,'');
  const bo=title.match(/\(BO(\d+)\)/i), tournament=bo ? title.split(/\(BO\d+\)\s*-\s*/i)[1] : null;
  const tennisTournament=row.sport==='tennis'&&title.includes(':')?title.slice(0,title.indexOf(':')).trim():null;
  const cricketTournament=row.sport==='cricket'&&title.includes(':')?title.slice(0,title.indexOf(':')).trim():null;
  if(cricketTournament)title=title.slice(title.indexOf(':')+1).trim();
  if(tennisTournament)title=title.slice(title.indexOf(':')+1).trim();
  if(row.sport==='esports')title=title.replace(/^[^:]+:\s*/,'').split(/\s*\(BO\d+\)/i)[0];
  const teams=title.split(/\s+(?:vs\.?|v\.?|—)\s+/i);
  return {sport:row.sport,discipline:row.sport==='esports'?discipline(row):null,participants:teams.length===2?teams.map(s=>s.trim()):[],
    competition:tournament || tennisTournament || cricketTournament || row.league_name || null,start_time:row.game_start_time,best_of:bo?Number(bo[1]):null,scope:row.sport==='esports'?'series':'match',...(tennisTournament?{tennis_doubles:/doubles/i.test(tennisTournament)}:{})};
}
const LEAGUE_ALIASES=new Map([['fifa friendlies','friendly international'],['club friendlies','club friendly'],['categoria primera b','primera b'],['categoria primera a','primera a'],['fifa u 20 women s world cup','world cup women u20'],['uefa women s champions league','uefa champions league women'],['liga nacional de guatemala','liga nacional'],['college football','ncaa'],['asian games men','asian games'],['sri lanka tour of england odis','one day international'],['west indies women tour of zimbabwe odis','one day international women']]);
function competition(x) { const v=normalize(x).replace(/ round \d+$/,'').replace(/ (?:clausura|apertura)$/,'').replace(/ (?:play offs|league phase)$/,'').replace(/^(concacaf nations league|uefa nations league) league [a-d]$/,'$1');return LEAGUE_ALIASES.get(v)||v; }
// Explicit, reviewed source aliases, scoped by competition. Never strip W/U20 globally.
const EVENT_ALIASES={
  'friendly international':{'sao tome e principe':'sao tome and principe','korea republic':'south korea','ir iran':'iran','china pr':'china'},
  'club friendly':{'sportfreunde siegen 1899':'siegen ger','borussia monchengladbach':'b monchengladbach ger','rw oberhausen':'oberhausen ger','schalke 04':'schalke ger'},
  'uefa nations league':{'republic of ireland':'ireland'},
  'concacaf nations league':{'trinidad and tobago':'trinidad tobago'},
  'botola pro':{'us amal tiznit':'amal tiznit'},
  'liga nacional':{'csd xelaju mc':'xelaju','antigua gfc':'antigua'},
  'wnba':{'dallas wings':'dallas wings w','seattle storm':'seattle storm w','chicago sky':'chicago sky w','washington mystics':'washington mystics w'},
  'nfl':{'falcons':'atlanta falcons','packers':'green bay packers'},
  'ncaa':{'liberty':'liberty flames'},
  'one day international women':{'zimbabwe women':'zimbabwe w','west indies women':'west indies w'},
  'usl championship':{'birmingham legion fc':'birmingham','brooklyn fc':'brooklyn'},
  'knvb beker':{'vv sparta nijkerk':'sparta nijkerk','rksv udi 19':'udi 19','vv ijsselmeervogels':'ijsselmeervogels','vv gemert':'gemert','jos watergraafsmeer':'watergraafsmeer','sv tec':'tec','rksv rohda raalte':'raalte','vpv purmersteijn':'purmersteijn'},
  'mls':{'seattle sounders fc':'seattle sounders'},
  'canadian premier league':{'inter toronto fc':'inter toronto'},
  'liga 1':{'cs cienciano':'cienciano'},
  'primera a':{'aguilas doradas rionegro':'aguilas','atletico nacional':'atl nacional','millonarios fc':'millonarios'},
  'world cup women u20':{'italy':'italy u20 w','spain':'spain u20 w','dpr korea':'north korea u20 w','colombia':'colombia u20 w'},
  'uefa champions league women':{'servette fc chenois feminin':'servette geneve fc w','ol lyonnes':'ol lyonnes w','oud heverlee leuven women':'leuven w','as roma':'as roma w','fc barcelona':'barcelona w','paris fc':'paris fc w','chelsea fc':'chelsea w','fk austria wien':'austria vienna w'}
};
function eventName(p,league){const n=name(p);return EVENT_ALIASES[competition(league)]?.[n]||n;}
const TENNIS_TOURNAMENTS={'chengdu open':'chengdu','hangzhou open':'hangzhou','singapore open':'singapore','korea open':'seoul','genoa 2':'genova 2'};
function tennisTokens(value,isSlug=false){
  // Flashscore appends birth years to some full-name slugs. Preserve all name tokens.
  const text=isSlug?String(value).replace(/-(?:19|20)\d{2}$/,''):value;
  return normalize(text).split(' ').sort().join(' ');
}
function participantOrder(facts,c){
  const a=facts.participants.map(p=>eventName(p,facts.competition)),b=(c.participants||[]).map(p=>eventName(p,c.competition));
  if(a.length!==2||b.length!==2||a[0]===a[1])return null;
  if(facts.sport==='tennis'&&!facts.tennis_doubles&&c.participant_slugs?.length===2){
    // Full given/family names in source slugs, not surname/initial-only matching.
    const slugs=c.participant_slugs.map(p=>tennisTokens(p,true)),full=facts.participants.map(p=>tennisTokens(p));
    if(full[0]!==full[1]&&full.every((p,i)=>p===slugs[i]))return [0,1];
    if(full[0]!==full[1]&&full.every((p,i)=>p===slugs[1-i]))return [1,0];
  }
  if(a.every((p,i)=>p===b[i]))return [0,1];
  // US sports and tennis source titles need not list home/away in Flashscore order.
  if(['baseball','basketball','american-football','tennis'].includes(facts.sport)&&a.every((p,i)=>p===b[1-i]))return [1,0];
  return null;
}
function competitionMatches(facts,c){
  if(facts.sport==='tennis'&&c.competition_category){
    if(facts.tennis_doubles||!/SINGLES/.test(c.competition_category))return false;
    const title=c.competition.replace(/\s*\([^)]*\)/g,'').replace(/,\s*(?:hard|clay|grass|carpet).*$/i,'');
    const source=competition(facts.competition),target=competition(title),canonical=TENNIS_TOURNAMENTS[source]||source;
    if(target===canonical)return true;
    // An omitted ITF edition is allowed only when level/city match exactly; explicit editions must agree.
    return /^[mw]\d+ /.test(canonical)&&! / \d+$/.test(canonical)&&/^\d+$/.test(target.startsWith(canonical+' ')?target.slice(canonical.length+1):'');
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
const HALF_LINE=x=>Number.isFinite(x)&&Math.abs(x%1)===0.5;
function totalSelection(row){
  const m=String(row.outcome).trim().match(/^(Over|Under)(?:\s+(\d+(?:\.\d+)?))?$/i),line=row.outcome_line??row.line;
  if(!m||!Number.isFinite(line)||(m[2]!==undefined&&Number(m[2])!==line))return null;
  return {selection:m[1].toUpperCase(),line};
}
function setHandicapLine(row,facts){
  const m=String(row.question).match(/^Set Handicap:\s*(.+?)\s*\(([+-]?\d+(?:\.\d+)?)\)\s+vs\.?\s+(.+?)\s*\(([+-]?\d+(?:\.\d+)?)\)$/i);
  if(!m||Number(m[2])!==-Number(m[4]))return null;
  const names=[m[1],m[3]].map(name);if(names[0]===names[1]||!facts.participants.every(p=>names.includes(name(p))))return null;
  const i=names.indexOf(name(row.outcome));return i<0?null:Number(i===0?m[2]:m[4]);
}
// Half-unit spreads have no push. Require the named team and explicit sign from the question.
function spreadLine(row,facts){
  const prefix={spreads:'Spread',first_half_spreads:'(?:1H|1st Half) Spread'}[row.market_type];
  if(!prefix)return null;
  const m=String(row.question).match(new RegExp('^'+prefix+':\\s*(.+?)\\s*\\(([+-]\\d+(?:\\.\\d+)?)\\)$','i'));
  if(!m||!facts.participants.some(p=>name(p)===name(m[1]))||!facts.participants.some(p=>name(p)===name(row.outcome)))return null;
  const signed=name(row.outcome)===name(m[1])?Number(m[2]):-Number(m[2]);
  if(!HALF_LINE(signed)||!Number.isFinite(row.line)||row.line!==Number(m[2])||(row.outcome_line!=null&&row.outcome_line!==signed))return null;
  return signed;
}
function usSport(row){return (row.sport==='baseball'&&row.league_code==='mlb')||(row.sport==='american-football'&&row.league_code==='cfb');}
function marketKey(row,facts) {
  let period=PERIODS[row.period];if(!period)return null;
  if(usSport(row)&&row.period==='match')period='FULL_TIME_OVER_TIME';
  const expectedPeriods={moneyline:['match'],soccer_halftime_result:['half_1'],soccer_second_half_result:['half_2'],tennis_first_set_winner:['set_1'],tennis_set_winner:['set_1','set_2'],totals:['match'],first_half_totals:['half_1'],second_half_totals:['half_2'],tennis_first_set_totals:['set_1'],tennis_match_totals:['match'],tennis_set_totals:['match'],both_teams_to_score:['match'],both_teams_to_score_first_half:['half_1'],both_teams_to_score_second_half:['half_2'],spreads:['match'],first_half_spreads:['half_1']};
  if(expectedPeriods[row.market_type]&&!expectedPeriods[row.market_type].includes(row.period))return null;
  const raw=name(row.outcome), side=facts.participants.findIndex(p=>name(p)===raw);
  const common={sport:row.sport,discipline:facts.discipline,period,participant:null,selection:null,line:null,metric:null};
  if(row.family==='winner' && ['moneyline','soccer_halftime_result','soccer_second_half_result','tennis_first_set_winner','tennis_set_winner'].includes(row.market_type)) {
    let selection=side>=0?(side===0?'HOME':'AWAY'):raw==='draw'?'DRAW':null;
    if(raw==='yes') {
      if(/end in a draw\?/i.test(row.question))selection='DRAW';
      else {const m=row.question.match(/^Will (.+) win on \d{4}-\d{2}-\d{2}\?$/);if(m){const i=facts.participants.findIndex(p=>name(p)===name(m[1]));selection=i===0?'HOME':i===1?'AWAY':null;}}
    }
    if(raw==='yes'&&row.sport==='soccer'&&row.market_type==='soccer_halftime_result'){
      const pattern=/^(.+) leading at halftime\?$/i;
      const m=String(row.question).match(pattern);if(m){const i=facts.participants.findIndex(p=>name(p)===name(m[1]));selection=i===0?'HOME':i===1?'AWAY':null;}
    }
    // A binary No is NOT a single 1X2 selection; no synthetic double-chance odds.
    if(!selection)return null;
    const type=row.sport==='soccer'?'HOME_DRAW_AWAY':(['tennis','esports'].includes(row.sport)||usSport(row))?'HOME_AWAY':null;
    return type?{...common,type,selection}:null;
  }
  const total=totalSelection(row);
  if(row.family==='totals'&&['totals','first_half_totals','second_half_totals'].includes(row.market_type)&&row.sport==='soccer'&&total)
    return {...common,type:'OVER_UNDER',metric:'GOALS',...total};
  if(usSport(row)&&row.family==='totals'&&total&&row.line===total.line&&HALF_LINE(total.line)&&((row.market_type==='totals'&&row.period==='match')||(row.sport==='american-football'&&row.market_type==='first_half_totals'&&row.period==='half_1')))
    return {...common,type:'OVER_UNDER',metric:row.sport==='baseball'?'RUNS':'POINTS',...total};
  if(usSport(row)&&row.family==='handicap'&&side>=0&&((row.market_type==='spreads'&&row.period==='match')||(row.sport==='american-football'&&row.market_type==='first_half_spreads'&&row.period==='half_1'))){
    const line=spreadLine(row,facts);if(line!==null)return {...common,type:'ASIAN_HANDICAP',metric:row.sport==='baseball'?'RUNS':'POINTS',selection:side===0?'HOME':'AWAY',line};
  }
  if(row.sport==='tennis'&&total&&HALF_LINE(total.line)&&((row.family==='games_totals'&&['tennis_first_set_totals','tennis_match_totals'].includes(row.market_type))||(row.family==='sets_totals'&&row.market_type==='tennis_set_totals')))
    return {...common,type:'OVER_UNDER',metric:row.family==='sets_totals'?'SETS':'GAMES',...total};
  if(row.sport==='soccer'&&row.family==='both_score'&&['both_teams_to_score','both_teams_to_score_first_half','both_teams_to_score_second_half'].includes(row.market_type)&&['yes','no'].includes(raw))
    return {...common,type:'BOTH_TEAMS_TO_SCORE',selection:raw.toUpperCase()};
  if(row.sport==='soccer'&&row.family==='handicap'&&['spreads','first_half_spreads'].includes(row.market_type)&&side>=0&&HALF_LINE(row.outcome_line))
    return {...common,type:'ASIAN_HANDICAP',metric:'GOALS',selection:side===0?'HOME':'AWAY',line:row.outcome_line};
  if(row.sport==='tennis'&&row.family==='sets_handicap'&&row.market_type==='tennis_set_handicap'&&row.period==='match'&&side>=0){
    const line=setHandicapLine(row,facts);if(HALF_LINE(line))return {...common,type:'ASIAN_HANDICAP',metric:'SETS',selection:side===0?'HOME':'AWAY',line};
  }
  // Unsupported corners, team/player totals and settlement rules fail closed.
  return null;
}
const canonicalKey = key => key ? JSON.stringify([key.sport,key.discipline??null,key.type,key.period,key.metric??null,key.participant??null,key.selection,key.line??null]) : null;
function comparison(row,quotes,facts) {
  const key=canonicalKey(marketKey(row,facts));
  const quoteKey=q=>{
    if(q.event_participant_name&&['HOME_DRAW_AWAY','HOME_AWAY','ASIAN_HANDICAP'].includes(q.canonical?.type)){
      const index=facts.participants.findIndex(p=>eventName(p,facts.competition)===eventName(q.event_participant_name,facts.competition)||(facts.sport==='tennis'&&q.event_participant_slug&&tennisTokens(p)===tennisTokens(q.event_participant_slug,true)));
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
