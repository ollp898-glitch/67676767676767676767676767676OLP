// Repair missing event links without collecting odds again or changing source rows.
const path=require('node:path');
const {source,read,write,key}=require('./storage');
const {matchEvent}=require('./matching');
async function refresh(sourceDir,root=path.join(sourceDir,'combo-2'),{discovery=require('./providers').discover}={}){
 require('./validate').validate(sourceDir,root);
 const src=source(sourceDir),index=read(path.join(root,'index.json')),meta={snapshot_id:index.snapshot_id,snapshot_at:index.snapshot_at};
 const ids=[...new Set(src.rows.map(r=>r.match_id))],events=ids.map(id=>read(path.join(root,'events',key(id),'index.json')));
 const pending=events.filter(e=>e.odds_source.match_status!=='matched');
 const found=pending.length?await discovery(pending.map(e=>e.facts)):{candidates:[],diagnostics:[],errors:{}};
 const registry=read(path.join(root,'registry/index.json')),updated=[];
 for(const e of pending){const mapping=matchEvent(e.facts,found.candidates,'flashscore',found.errors.flashscore);if(mapping.match_status!=='matched')continue;
  const candidate=found.candidates.find(c=>c.provider==='flashscore'&&c.event_id===mapping.event_id);
  e.analytics=mapping;e.odds_source={...e.odds_source,event_id:mapping.event_id,event_url:mapping.event_url,participant_order:mapping.participant_order,evidence:mapping.evidence,match_status:'matched',match_notes:mapping.match_notes};
  write(path.join(root,'events',key(e.match_id),'index.json'),e);
  const file=`registry/${key(candidate.event_id)}.json`;write(path.join(root,file),{...meta,event:candidate});if(!registry.events.includes(file))registry.events.push(file);
  updated.push({match_id:e.match_id,title:e.title,event_id:mapping.event_id,event_url:mapping.event_url});
 }
 index.coverage.normal={matched:0,unmatched:0,ambiguous:0};index.coverage.flashscore_events={};
 for(const e of events){index.coverage.normal[e.analytics.match_status]++;const s=index.coverage.flashscore_events[e.sport]??={total:0,matched:0,unmatched:0,ambiguous:0};s.total++;s[e.odds_source.match_status]++;}
 const report={...meta,observed_at:new Date().toISOString(),mode:'event_links_only_saved_odds_unchanged',before:events.length-pending.length,after:index.coverage.normal.matched,total:events.length,updated,unmatched:events.filter(e=>e.odds_source.match_status!=='matched').map(e=>({match_id:e.match_id,title:e.title,sport:e.sport,start_time:e.game_start_time,reason:matchEvent(e.facts,found.candidates,'flashscore',found.errors.flashscore).match_notes}))};
 const reader=['# Combo 2.0 — Flashscore event links','',`Snapshot: ${index.snapshot_at}. Confirmed: ${report.after}/${report.total}.`,'','| Event | Sport | Flashscore |','|---|---|---|',...events.map(e=>`| ${e.title.replace(/\|/g,'/')} | ${e.sport} | ${e.odds_source.event_url?`[Match](${e.odds_source.event_url})`:'Not confirmed'} |`),'','This refresh changes event links only. Saved bookmaker odds and their timestamps are unchanged.',''].join('\n');
 require('./market-summary').textFile(root,'event-links.md',reader);
 write(path.join(root,'event-link-audit.json'),report);write(path.join(root,'registry/index.json'),registry);index.event_link_audit='event-link-audit.json';index.event_link_reader='event-links.md';write(path.join(root,'index.json'),index);
 require('./validate').validate(sourceDir,root);return report;
}
module.exports={refresh};if(require.main===module)refresh(process.argv[2]||'out').then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});
