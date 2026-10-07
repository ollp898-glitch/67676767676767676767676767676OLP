// Public BMR page protocol. No account, cookies, API key or fuzzy matching.
const {marketKey,canonicalKey,normalize}=require('./matching');
const {attachMarkets}=require('./fair-probability');
const ENDPOINT='https://ms.virginia.us-east-1.bookmakersreview.com/ms-odds-v2/odds-v2-service';
const VERSION=1;
const SPORTS={soccer:2,baseball:3,'american-football':4,basketball:5,hockey:6,tennis:8,mma:9,cricket:21};
// The page displays multiple brands for some provider accounts. Keep ONE account.
const BOOKS={8:['BetOnline','SportsBetting'],9:['Bovada','Ozoon'],10:['BookMaker','Betcris'],123:['BetAnything'],44:['Heritage Sports'],29:['Everygame','Intertops'],16:['JustBet'],82:['MyBookie'],130:['Bet105'],36:['William Hill'],28:['BetPhoenix'],84:['Skybook'],3:['5Dimes','IslandCasino','Sportbet'],4:['ABCislands'],5:['Bet365'],83:['BetMania'],65:['GTbets'],15:['JazzSports','LooseLines'],18:['Matchbook'],20:['Pinnacle'],35:['SportsInteraction'],22:['The Greek Sportsbook'],54:['WagerWeb'],38:['YouWager']};
const ALIASES={
  '6:7':{'ottawa':'ottawa senators','detroit':'detroit red wings','carolina':'carolina hurricanes','montreal':'montreal canadiens','new jersey':'new jersey devils','minnesota':'minnesota wild','buffalo':'buffalo sabres','nashville':'nashville predators','toronto':'toronto maple leafs','st louis':'st louis blues','chicago':'chicago blackhawks','vegas':'vegas golden knights','seattle':'seattle kraken','senators':'ottawa senators','red wings':'detroit red wings','hurricanes':'carolina hurricanes','canadiens':'montreal canadiens','utah':'utah mammoth','devils':'new jersey devils','wild':'minnesota wild','sabres':'buffalo sabres','predators':'nashville predators','maple leafs':'toronto maple leafs','blues':'st louis blues','blackhawks':'chicago blackhawks','islanders':'new york islanders','rangers':'new york rangers','golden knights':'vegas golden knights','kraken':'seattle kraken','panthers':'florida panthers','kings':'los angeles kings'},
  '3:3':{'l a dodgers':'los angeles dodgers','ch white sox':'chicago white sox','los angeles':'los angeles dodgers','atlanta':'atlanta braves','milwaukee':'milwaukee brewers','san diego':'san diego padres','cleveland':'cleveland guardians'},
  '4:6':{'southern miss':'southern miss golden eagles','troy':'troy trojans'},
  '2:4':{'chicago fire fc':'chicago fire'}
};
const LEAGUES={baseball:{mlb:3},hockey:{nhl:7},'american-football':{nfl:16,cfb:6},tennis:{atp:23,wta:24}};
function identity(name,event){let s=String(name);if(event.spid===8&&s.split(',').length===2)s=s.split(',').reverse().join(' ');const n=normalize(s);return ALIASES[`${event.spid}:${event.lid}`]?.[n]||n;}
function participants(e){
  const names=String(e.des||'').split('@'),p=e.participants;
  if(names.length!==2||names.some(x=>!x.trim())||!Array.isArray(p)||p.length!==2||new Set(p.map(x=>x.partid)).size!==2)return null;
  const home=p.filter(x=>x.ih===true),away=p.filter(x=>x.ih===false);
  if(home.length!==1||away.length!==1)return null;
  return [{name:names[1],id:String(home[0].partid)},{name:names[0],id:String(away[0].partid)}];
}
function eventMatch(facts,events,leagueCode){
  if(facts.tennis_doubles||facts.participants.length!==2)return {status:'unmatched',reason:'unproven_participant_structure'};
  const same=events.filter(e=>e.spid===SPORTS[facts.sport]&&(!LEAGUES[facts.sport]||LEAGUES[facts.sport][leagueCode]===e.lid)).filter(e=>{const p=participants(e);if(e.spid===3){const slug=String(e.slg||'').split('-vs-').map(normalize);if(slug.length!==2||!facts.participants.every(n=>slug.includes(normalize(n))))return false;}return p&&new Set(p.map(x=>identity(x.name,e))).size===2&&facts.participants.every(n=>p.some(x=>identity(n,e)===identity(x.name,e)));});
  const hits=same.filter(e=>Number.isFinite(e.dt)&&Math.abs(e.dt-Date.parse(facts.start_time))<=300000);
  if(hits.length!==1)return {status:'unmatched',reason:hits.length?'ambiguous_event':same.length?'start_time_mismatch':'event_not_in_feed'};
  const e=hits[0];return {status:'matched',event:e,participant_order:participants(e).map(p=>facts.participants.findIndex(n=>identity(n,e)===identity(p.name,e)))};
}
const MAP=[];
function add(spid,mtid,name,type,period,metric=null){MAP.push({spid,mtid,name,type,period,metric});}
for(const spid of [3,4]){
  add(spid,83,'2way (Including OT)','HOME_AWAY','FULL_TIME_OVER_TIME');
  add(spid,401,'Point Spread (Including OT)','ASIAN_HANDICAP','FULL_TIME_OVER_TIME',spid===3?'RUNS':'POINTS');
  add(spid,402,'American Total (Including OT)','OVER_UNDER','FULL_TIME_OVER_TIME',spid===3?'RUNS':'POINTS');
}
add(6,125,'2way (including overtime and penalties)','HOME_AWAY','FULL_TIME_OVER_TIME');
add(6,411,'Point Spread (including overtime and penalties)','ASIAN_HANDICAP','FULL_TIME_OVER_TIME','GOALS');
add(6,412,'American Total (including overtime and penalties)','OVER_UNDER','FULL_TIME_OVER_TIME','GOALS');
for(const [mtid,name,type,period] of [[397,'1st Half - Point Spread','ASIAN_HANDICAP','FIRST_HALF'],[398,'1st Half - American Total','OVER_UNDER','FIRST_HALF'],[403,'1st Period - Point Spread','ASIAN_HANDICAP','FIRST_QUARTER'],[407,'1st Period - American Total','OVER_UNDER','FIRST_QUARTER']])add(4,mtid,name,type,period,'POINTS');
add(8,126,'2way','HOME_AWAY','FULL_TIME');
add(2,1,'Winner','HOME_DRAW_AWAY','FULL_TIME');
add(2,23,'1st Half Winner','HOME_DRAW_AWAY','FIRST_HALF');
add(2,396,'American Total','OVER_UNDER','FULL_TIME','GOALS');
add(2,398,'1st Half - American Total','OVER_UNDER','FIRST_HALF','GOALS');
add(2,17,'Both Teams to Score','BOTH_TEAMS_TO_SCORE','FULL_TIME');
function parseQuotes(event,lines,options,types,observedAt){
  const p=participants(event);if(!p||event.es!=='scheduled')return [];
  const opts=new Map(options.map(o=>[o.boid,o.nam])),result=[];
  for(const l of lines){
    const m=MAP.find(m=>m.spid===event.spid&&m.mtid===l.mtid);
    if(!m||!types.some(t=>t.spid===m.spid&&t.mtid===m.mtid&&t.nam===m.name)||l.eid!==event.eid||!BOOKS[l.paid]||l.iof!==false||!Number.isFinite(l.pri)||l.pri<=1||!Number.isFinite(l.adj)||!l.lineid||!Number.isFinite(new Date(Number(l.tim)).getTime())||!Number.isFinite(Date.parse(observedAt)))continue;
    const option=opts.get(l.boid);if(typeof option!=='string')continue;
    const side=p.findIndex(x=>x.id===String(l.partid));let selection=null,line=null;
    if(['HOME_AWAY','HOME_DRAW_AWAY','ASIAN_HANDICAP'].includes(m.type)){
      if(m.type==='HOME_DRAW_AWAY'&&normalize(option)==='draw'&&side<0)selection='DRAW';
      else if(side>=0){
        let label=option;
        if(m.type==='ASIAN_HANDICAP'){const match=option.match(/^(.+) ([+-]\d+(?:\.\d+)?)$/);if(!match||Number(match[2])!==l.adj)continue;label=match[1];line=l.adj||0;}
        if(identity(label,event)!==identity(p[side].name,event))continue;
        selection=side===0?'HOME':'AWAY';
      }
      if(m.type!=='ASIAN_HANDICAP'&&l.adj!==0)continue;
    }else if(m.type==='OVER_UNDER'){
      const match=option.match(/^(Over|Under) (\d+(?:\.\d+)?)$/i);if(!match||Number(match[2])!==l.adj||side>=0)continue;selection=match[1].toUpperCase();line=l.adj;
    }else if(m.type==='BOTH_TEAMS_TO_SCORE'&&['yes','no'].includes(normalize(option))&&l.adj===0&&side<0)selection=normalize(option).toUpperCase();
    if(!selection)continue;
    const canonical={sport:Object.keys(SPORTS).find(s=>SPORTS[s]===event.spid),discipline:null,type:m.type,period:m.period,metric:m.metric,participant:null,selection,line};
    result.push({source:'bmr',event_id:String(event.eid),bookmaker_id:`bmr:${l.paid}`,bookmaker_name:BOOKS[l.paid][0],bookmaker_aliases:BOOKS[l.paid],paid:l.paid,decimal_odds:l.pri,current_decimal_odds:l.pri,active:true,canonical,event_participant_id:side>=0?p[side].id:null,market_participant_ids:p.map(x=>x.id),external_odds_observed_at:observedAt,source_timestamp:new Date(Number(l.tim)).toISOString(),bmr_event:event,bmr_market:{mtid:m.mtid,name:m.name},raw:l,raw_outcome:option});
  }
  // Identical duplicated transport rows are one quote; conflicting rows remain ambiguous.
  return attachMarkets([...new Map(result.map(q=>[JSON.stringify(q),q])).values()]);
}
function matchedQuotes(row,quotes,facts){
  const key=canonicalKey(marketKey(row,facts));if(!key)return [];
  const selected=quotes.filter(q=>{
    if(q.source!=='bmr'||q.bookmaker_id!==`bmr:${q.paid}`||!q.bmr_event||q.event_id!==String(q.bmr_event.eid)||q.raw?.eid!==q.bmr_event.eid)return false;
    const match=eventMatch(facts,[q.bmr_event],row.league_code);if(match.status!=='matched')return false;
    const rebuilt=parseQuotes(q.bmr_event,[q.raw],[{boid:q.raw.boid,nam:q.raw_outcome}],[{spid:q.bmr_event.spid,mtid:q.bmr_market?.mtid,nam:q.bmr_market?.name}],q.external_odds_observed_at)[0];
    if(!rebuilt||JSON.stringify(rebuilt.canonical)!==JSON.stringify(q.canonical)||rebuilt.decimal_odds!==q.decimal_odds||q.active!==true||rebuilt.event_participant_id!==q.event_participant_id||JSON.stringify(rebuilt.market_participant_ids)!==JSON.stringify(q.market_participant_ids)||rebuilt.bookmaker_name!==q.bookmaker_name||JSON.stringify(rebuilt.bookmaker_aliases)!==JSON.stringify(q.bookmaker_aliases))return false;
    let c=q.canonical;
    if(['HOME','AWAY'].includes(c.selection)){const side=match.participant_order[c.selection==='HOME'?0:1];c={...c,selection:side===0?'HOME':'AWAY'};}
    return canonicalKey(c)===key;
  });
  const byPaid=new Map();for(const q of selected){const a=byPaid.get(q.paid)||[];a.push(q);byPaid.set(q.paid,a);}return [...byPaid.values()].filter(a=>a.length===1).flat();
}
class BmrProvider{
  constructor({fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),cache=null}={}){this.fetchImpl=fetchImpl;this.sleep=sleep;this.cache=cache;this.last=false;this.stopped=false;}
  async query(query){
    if(this.cache?.has(query))return this.cache.get(query);
    if(this.stopped)throw Error('BMR stopped after rate limit');
    if(this.last)await this.sleep(2000);this.last=true;
    const r=await this.fetchImpl(ENDPOINT+'?query='+encodeURIComponent(query),{signal:AbortSignal.timeout(30000)});
    if(r.status===429)this.stopped=true;
    if(!r.ok)throw Error(`BMR HTTP ${r.status}`);
    const d=await r.json();if(d.errors?.length||!d.data)throw Error('BMR GraphQL error: '+JSON.stringify(d.errors));
    this.cache?.set(query,d.data);return d.data;
  }
  async discover(facts){
    if(!facts.length)return [];
    const times=facts.map(f=>Date.parse(f.start_time)).filter(Number.isFinite);if(!times.length)return [];
    const spids=[...new Set(facts.map(f=>SPORTS[f.sport]).filter(Boolean))],events=[];
    for(let skip=0;skip<10000;skip+=200){
      const q=`{ eventsV2(spid:[${spids}],dt:{between:[${Math.min(...times)-300000},${Math.max(...times)+300000}]},limit:200,skip:${skip},showEmptyEvents:true) { events { eid dt spid lid es des slg participants { partid ih ptid psid } } } }`;
      const page=(await this.query(q)).eventsV2?.events;if(!Array.isArray(page))throw Error('BMR invalid event page');events.push(...page);if(page.length<200)return [...new Map(events.map(e=>[e.eid,e])).values()];
    }throw Error('BMR event pagination incomplete');
  }
  async fetchEvent(event){
    const mtids=MAP.filter(m=>m.spid===event.spid).map(m=>m.mtid);if(!mtids.length)return {quotes:[],observed_at:null};
    this.types??=(await this.query(`{ marketTypes(spid:[2,3,4,6,8],sitid:"5",did:"1") { mtid spid nam } }`)).marketTypes;
    if(!Array.isArray(this.types))throw Error('BMR invalid market metadata');
    const lines=[];
    for(let skip=0;skip<10000;skip+=500){const page=(await this.query(`{ currentLines(eid:[${event.eid}],mtid:[${mtids}],paid:[${Object.keys(BOOKS)}],limit:500,skip:${skip}) }`)).currentLines;if(!Array.isArray(page))throw Error('BMR invalid line page');lines.push(...page);if(page.length<500)break;if(skip===9500)throw Error('BMR line pagination incomplete');}
    const ids=[...new Set(lines.map(l=>l.boid))],options=[];
    for(let i=0;i<ids.length;i+=100){const page=(await this.query(`{ bettingOptions(boid:[${ids.slice(i,i+100)}]) { boid nam } }`)).bettingOptions;if(!Array.isArray(page))throw Error('BMR missing option semantics');options.push(...page);}
    const observed_at=new Date().toISOString();return {quotes:parseQuotes(event,lines,options,this.types,observed_at),observed_at};
  }
}
module.exports={ENDPOINT,VERSION,BOOKS,MAP,SPORTS,identity,participants,eventMatch,parseQuotes,matchedQuotes,BmrProvider};
