const fs=require('node:fs');const path=require('node:path');const {createHash}=require('node:crypto');
const {buildCatalog}=require('./event-catalog');const {loadPrevious,enrichHistory}=require('./price-history');
const {verifyRows}=require('./market-verification');
const {isHighCandidate}=require('./candidate-policy');
const {buildComboSummary,isCorner}=require('./combo-summary');
const countMarkets=rows=>new Set(rows.map(r=>String(r.market_id))).size;
function outcomeLine(market, outcome, family) {
  if(market.line===null||market.line===undefined||market.line===''||!Number.isFinite(Number(market.line)))return null;
  if(!/handicap/.test(family))return Number(market.line);
  const match=(market.question||'').match(/^Spread:\s*(.+?)\s*\(([+-]?\d+(?:\.\d+)?)\)$/i);
  const norm=s=>String(s).trim().toLowerCase();
  if(!match||!market.outcomes.some(o=>norm(o.outcome)===norm(match[1]))||market.outcomes.length!==2||market.outcomes.some(o=>/^(yes|no)$/i.test(o.outcome)))return null;
  return norm(outcome)===norm(match[1])?Number(match[2]):-Number(match[2]);
}
function flattenMarkets(markets) {
  const catalog=buildCatalog(markets);const rows=[];
  for(const event of catalog.events) for(const section of event.sections) for(const market of section.markets) {
    const {outcomes,clob_token_ids,position_ids,best_bid,best_ask,spread,...base}=market;
    outcomes.forEach((outcome,outcome_index)=>{
      if(!Number.isFinite(outcome.price)||outcome.price<0.2||outcome.price>=0.96)return;
      const token_id=clob_token_ids?.[outcome_index] ? String(clob_token_ids[outcome_index]) : null;
      rows.push({...base,schema_version:3,match_id:event.match_id,match_title:event.title,
        period:section.period,period_title:section.period_title,family:section.family,family_title:section.title,section_id:section.id,
        classification_status:section.family==='other'?'unclassified':'classified',classification_source:section.classification_source,
        classification_note:section.family==='other' ? `Unsupported market type: ${market.market_type || '(missing)'}` : null,
        outcome_id:token_id?`token:${token_id}`:`market:${market.market_id}:outcome:${outcome_index}`,token_id,outcome_index,
        position_id:position_ids?.[outcome_index] ?? null,...outcome,outcome_line:outcomeLine(market,outcome.outcome,section.family),probability_percent:Number((outcome.price*100).toFixed(6)),
        decimal_odds:Number((1/outcome.price).toFixed(3)),market_best_bid:best_bid??null,market_best_ask:best_ask??null,market_spread:spread??null});
    });
  }
  if(new Set(rows.map(r=>r.outcome_id)).size!==rows.length)throw new Error('Duplicate outcome ID');
  return {rows,catalog};
}
function structured(catalog, rows, metadata) {
  const byMarket=new Map();for(const row of rows){const k=String(row.market_id);if(!byMarket.has(k))byMarket.set(k,[]);byMarket.get(k).push(row);}
  const events=catalog.events.flatMap(event=>{
    const sections=event.sections.flatMap(({markets,...section})=>{
      const outcomes=markets.flatMap(m=>byMarket.get(String(m.market_id))||[]);
      return outcomes.length?[{...section,outcomes_count:outcomes.length,markets_count:countMarkets(outcomes),outcomes}]:[];
    });
    if(!sections.length)return [];
    const {sections:oldSections,markets_count,combo_markets_count,...base}=event;
    const outcomes=sections.flatMap(s=>s.outcomes);
    return [{...base,markets_count:countMarkets(outcomes),outcomes_count:outcomes.length,combo_markets_count:countMarkets(outcomes.filter(isHighCandidate)),sections}];
  });
  const byEvent=new Map(events.map(e=>[e.match_id,e]));
  const sports=catalog.navigation.sports.flatMap(s=>{
    const leagues=s.leagues.flatMap(l=>{const selected=l.events.map(e=>byEvent.get(e.match_id)).filter(Boolean);return selected.length?[{...l,events:selected}]:[];});
    return leagues.length?[{...s,leagues}]:[];
  });
  return {schema_version:3,...metadata,markets_count:countMarkets(rows),outcomes_count:rows.length,events_count:events.length,sports};
}
function ladderScope(row) {
  if(row.line===null||row.line===undefined||row.line===''||!Number.isFinite(Number(row.line)))return null;
  const q=row.question||'';
  // Keep team/player/period words intact. Only replace the explicit line expression.
  if(/\bO\/U\s+[+-]?\d+(?:\.\d+)?/i.test(q))return q.replace(/\bO\/U\s+[+-]?\d+(?:\.\d+)?/i,'O/U {line}');
  if(/handicap/.test(row.family) && Number.isFinite(row.outcome_line) && /^Spread:/i.test(q))return `Spread: ${row.outcome} ({line})`;
  return null;
}
function ladders(rows) {
  const groups=new Map();
  for(const row of rows){const scope=ladderScope(row);if(!scope)continue;
    const key=JSON.stringify([row.match_id,row.period,row.family,row.market_type,scope,row.outcome]);
    if(!groups.has(key))groups.set(key,{ladder_id:createHash('sha256').update(key).digest('hex').slice(0,24),match_id:row.match_id,
      match_title:row.match_title,sport:row.sport,league_code:row.league_code,period:row.period,family:row.family,family_title:row.family_title,
      market_type:row.market_type,scope,outcome:row.outcome,lines:[]});
    groups.get(key).lines.push({...row,market_line:row.line,line:row.outcome_line ?? Number(row.line),label:`${row.outcome} ${row.outcome_line ?? row.line}`});
  }
  return [...groups.values()].map(g=>({...g,lines:g.lines.sort((a,b)=>a.line-b.line||a.outcome_id.localeCompare(b.outcome_id))}));
}
async function writeOutcomeExports(markets,outDir,metadata,fetchImpl=fetch,log=console.log) {
  fs.mkdirSync(outDir,{recursive:true});
  const {rows,catalog}=flattenMarkets(markets);
  const previousFile=process.env.BETX_PREVIOUS_FILE || path.join(outDir,'markets.jsonl');
  const previous=loadPrevious(previousFile);
  const history=await enrichHistory(rows,previous,fetchImpl,log);
  const verification=await verifyRows(rows,fetchImpl);
  const all=structured(catalog,rows,metadata), highRows=rows.filter(isHighCandidate),high=structured(catalog,highRows,{...metadata,minimum_probability:0.7});
  const json=(file,data)=>fs.writeFileSync(path.join(outDir,file),JSON.stringify(data,null,2)+'\n');
  const jsonl=(file,data)=>fs.writeFileSync(path.join(outDir,file),data.map(r=>JSON.stringify(r)).join('\n')+(data.length?'\n':''));
  jsonl('markets.jsonl',rows);jsonl('combo-markets.jsonl',rows.filter(isHighCandidate));jsonl('high-probability-outcomes.jsonl',highRows);
  const comboSummary=buildComboSummary(highRows,metadata,verification);
  json('combo-summary.json',comboSummary);
  jsonl('combo-corners.jsonl',highRows.filter(isCorner));
  json('high-probability-markets.json',high);
  json('candidate-audit.json',{snapshot_at:metadata.snapshot_at,verification,quarantine:rows.filter(r=>r.quarantined),excluded:rows.filter(r=>!r.quarantined&&!isHighCandidate(r)).map(r=>({outcome_id:r.outcome_id,outcome_label:r.outcome_label,price:r.price,reasons:r.combo_exclusion_reasons,combo_verification_status:r.combo_verification_status}))});
  json('unclassified-outcomes.json',{schema_version:3,snapshot_at:metadata.snapshot_at,outcomes:rows.filter(r=>r.classification_status==='unclassified')});
  const lineLadders=ladders(rows);json('line-ladders.json',{schema_version:3,...metadata,ladders_count:lineLadders.length,ladders:lineLadders});
  const eventsDir=path.join(outDir,'events');fs.mkdirSync(eventsDir,{recursive:true});
  for(const name of fs.readdirSync(eventsDir))if(/^match-[a-f0-9]{24}\.json$/.test(name))fs.unlinkSync(path.join(eventsDir,name));
  const summaries=[];
  for(const sport of all.sports)for(const league of sport.leagues)for(const event of league.events){
    json(`events/${event.match_id}.json`,event);
    const summary={...event,file:`events/${event.match_id}.json`,sections:event.sections.map(({outcomes,...s})=>s)};summaries.push(summary);
  }
  json('events.json',summaries);
  const summaryMap=new Map(summaries.map(e=>[e.match_id,e]));
  json('catalog.json',{...all,sports:all.sports.map(s=>({...s,leagues:s.leagues.map(l=>({...l,events:l.events.map(e=>summaryMap.get(e.match_id))}))}))});
  // Retire the old event-summary JSONL: every public JSONL line is now one outcome.
  const legacy=path.join(outDir,'events.jsonl');if(fs.existsSync(legacy))fs.unlinkSync(legacy);
  return {rows,events:all.events_count,markets:all.markets_count,history,verification,
    combo_summary:{file:'combo-summary.json',scope:comboSummary.scope,outcomes:highRows.length,
      corners:comboSummary.corners.outcomes,coverage_complete:verification.coverage_complete},
    event_catalog:{events:all.events_count,unclassified_markets:countMarkets(rows.filter(r=>r.family==='other')),unclassified_outcomes:rows.filter(r=>r.family==='other').length,
      files:{events:'events.json',navigation:'catalog.json',event_details:'events/'}},
    high_probability_catalog:{file:'high-probability-markets.json',jsonl:'high-probability-outcomes.jsonl',minimum_probability:0.7,combo_only:true,verification_scope:'single_leg',requires_live_refresh:true,markets:high.markets_count,outcomes:high.outcomes_count,events:high.events_count},
    line_ladders:{file:'line-ladders.json',count:lineLadders.length}};
}
module.exports={outcomeLine,flattenMarkets,structured,ladderScope,ladders,writeOutcomeExports};
