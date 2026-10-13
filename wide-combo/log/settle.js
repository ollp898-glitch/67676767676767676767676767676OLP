const journal=require('./journal');
const FINAL=new Set(['match finished','finished','final','ft']);
const same=(a,b)=>String(a??'').trim().replace(/\s+/g,' ').toLowerCase()===String(b??'').trim().replace(/\s+/g,' ').toLowerCase();
function scoreResult(leg,home,away,homeName,awayName) {
  if(leg.sport!=='soccer'||leg.period!=='match') return null;
  const goals=home+away,side=String(leg.outcome??'').trim();
  if(leg.family==='totals'&&leg.market_type==='totals') {
    if(leg.outcome_line==null||leg.outcome_line==='') return null;
    const line=Number(leg.outcome_line);
    if(!Number.isFinite(line)||!['Over','Under'].includes(side)) return null;
    const diff=goals-line;
    return diff===0?'void':(side==='Over'?diff>0:diff<0)?'win':'loss';
  }
  if(leg.family==='handicap'&&leg.market_type==='spreads') {
    if(leg.outcome_line==null||leg.outcome_line==='') return null;
    const line=Number(leg.outcome_line);
    if(!Number.isFinite(line)) return null;
    const own=same(side,homeName)?home:same(side,awayName)?away:null;
    const other=same(side,homeName)?away:same(side,awayName)?home:null;
    if(own===null) return null;
    const diff=own+line-other;
    return diff===0?'void':diff>0?'win':'loss';
  }
  if(leg.family==='winner'&&leg.market_type==='moneyline') {
    const draw=home===away;
    if(same(side,homeName)) return home>away?'win':'loss';
    if(same(side,awayName)) return away>home?'win':'loss';
    if(same(side,'draw')||same(side,'tie')) return draw?'win':'loss';
    if(/end in a draw/i.test(leg.question??leg.label??'')&&['Yes','No'].includes(side))
      return (side==='Yes')===draw?'win':'loss';
    const winQuestion=String(leg.question??leg.label??'').match(/^Will (.+?) win(?: on \d{4}-\d{2}-\d{2})?\?/i);
    if(winQuestion&&['Yes','No'].includes(side)) {
      const team=winQuestion[1],teamWon=same(team,homeName)?home>away:same(team,awayName)?away>home:null;
      if(teamWon!==null) return (side==='Yes')===teamWon?'win':'loss';
    }
  }
  return null;
}
function verifiedScore(leg,event) {
  if(!event||!/^\d+$/.test(String(event.idEvent))||
    (leg.source_event_id&&String(event.idEvent)!==String(leg.source_event_id))||
    !FINAL.has(String(event.strStatus??'').toLowerCase())) return null;
  const [homeName,awayName]=String(leg.match_title??'').split(' vs. ');
  if(!homeName||!awayName||!same(homeName,event.strHomeTeam)||!same(awayName,event.strAwayTeam)) return null;
  const start=Date.parse(leg.start_utc),eventStart=Date.parse(event.strTimestamp??'');
  if(!Number.isFinite(start)||!Number.isFinite(eventStart)||Math.abs(start-eventStart)>24*3600*1000) return null;
  const home=Number(event.intHomeScore),away=Number(event.intAwayScore);
  if(!Number.isInteger(home)||!Number.isInteger(away)||home<0||away<0) return null;
  return {home,away,homeName,awayName};
}
async function lookupTheSportsDb(id) {
  if(!/^\d+$/.test(String(id))) throw new Error('TheSportsDB event ID must be numeric');
  const url=`https://www.thesportsdb.com/api/v1/json/123/lookupevent.php?id=${id}`;
  const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error(`TheSportsDB HTTP ${response.status}`);
  const data=await response.json();
  return {event:data.events?.find(event=>String(event.idEvent)===String(id))??null,url};
}
async function searchTheSportsDb(leg) {
  const [home,away]=String(leg.match_title??'').split(' vs. ');
  if(!home||!away||leg.sport!=='soccer') return {event:null,url:null};
  const date=new Date(leg.start_utc);
  if(!Number.isFinite(date.getTime())) return {event:null,url:null};
  const query=new URLSearchParams({e:`${home}_vs_${away}`,d:date.toISOString().slice(0,10)});
  const url=`https://www.thesportsdb.com/api/v1/json/123/searchevents.php?${query}`;
  const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error(`TheSportsDB HTTP ${response.status}`);
  const data=await response.json();
  return {event:data.event?.[0]??data.events?.[0]??null,url};
}
async function settle(logFile,{lookup=lookupTheSportsDb,search=searchTheSportsDb,now=new Date().toISOString()}={}) {
  const rows=journal.read(logFile),cache=new Map();let settled=0,unmatched=0,unsupported=0;
  for(const leg of rows) {
    if(leg.result||leg.sport!=='soccer') continue;
    const key=leg.source_event_id||leg.match_id;
    if(!cache.has(key)) cache.set(key,leg.source_event_id?await lookup(leg.source_event_id):await search(leg));
    const source=cache.get(key),score=verifiedScore(leg,source.event);
    if(!score){unmatched++;continue;}
    const result=scoreResult(leg,score.home,score.away,score.homeName,score.awayName);
    if(!result){unsupported++;continue;}
    leg.result=result;leg.settled_at=now;leg.settlement_source=source.url;
    leg.source_event_id=source.event.idEvent;leg.score_home=score.home;leg.score_away=score.away;settled++;
  }
  journal.write(logFile,rows);
  return {settled,unmatched,unsupported,pending:rows.filter(row=>!row.result).length};
}
if(require.main===module){settle(process.argv[2]??'wide-combo/log/legs.csv').then(result=>console.log(JSON.stringify(result)))
  .catch(error=>{console.error(error.stack);process.exitCode=1;});}
module.exports={scoreResult,verifiedScore,lookupTheSportsDb,searchTheSportsDb,settle};
