const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {isHighCandidate}=require('./candidate-policy');
const {ladderScope}=require('./outcome-exports');
const {buildComboSummary,isCorner}=require('./combo-summary');
const {validateChatReader}=require('./chat-reader');
const flatten=doc=>doc.sports.flatMap(s=>s.leagues.flatMap(l=>l.events.flatMap(e=>e.sections.flatMap(s=>s.outcomes))));
function validateCatalog(dir){
  const json=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
  const jsonl=f=>fs.readFileSync(path.join(dir,f),'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const index=json('index.json'),rows=jsonl('markets.jsonl');assert.equal(index.schema_version,3);
  validateChatReader(dir,rows);
  const ids=new Map();const start=Date.parse(index.snapshot_at)+3*3600000,end=Date.parse(index.snapshot_at)+32*3600000;
  assert.equal(Date.parse(index.window_start),start);assert.equal(Date.parse(index.window_end),end);
  for(const r of rows){
    assert(!ids.has(r.outcome_id),'Duplicate outcome');ids.set(r.outcome_id,r);
    assert(!('outcomes' in r),'A JSONL row must be one outcome');
    assert(r.price>=0.35&&r.price<0.96);assert.equal(typeof r.outcome,'string');
    assert(Date.parse(r.game_start_time)>=start&&Date.parse(r.game_start_time)<=end);
    assert.equal(r.probability_percent,Number((r.price*100).toFixed(6)));
    assert.equal(r.decimal_odds,Number((1/r.price).toFixed(3)));
    assert.equal(r.section_id,`${r.period}/${r.family}`);
    assert.equal(r.classification_status,r.family==='other'?'unclassified':'classified');
    assert.equal(typeof r.outcome_label,'string');
    if(r.combo_verified){assert(r.combo_candidate_universe);assert(r.combo_eligible);assert(r.token_id);assert(r.position_id);assert.equal(r.combo_verification_scope,'single_leg');assert(Object.hasOwn(r,'combo_catalog_cursor'));}
    if(r.quarantined)assert(!isHighCandidate(r));
    if(r.book_status==='available'){assert(r.best_bid>0&&r.best_bid<r.best_ask&&r.best_ask<1);assert(r.depth);}
    else {assert.equal(r.best_bid,null);assert.equal(r.best_ask,null);}
    for(const h of [1,6,24]){
      const p=r[`price_${h}h_ago`],at=r[`price_${h}h_ago_at`];
      assert(p===null||(Number.isFinite(p)&&p>=0&&p<=1));
      if(p!==null){const age=Date.parse(r.price_history_reference_at)-h*3600000-Date.parse(at);assert(age>=0&&age<=900000);}
      else assert.equal(at,null);
    }
  }
  const checkRows=(subset,expected)=>{
    assert.equal(new Set(subset.map(r=>r.outcome_id)).size,subset.length);
    assert.deepEqual(subset.map(r=>r.outcome_id).sort(),expected.map(r=>r.outcome_id).sort());
    for(const r of subset)assert.deepEqual(r,ids.get(r.outcome_id));
  };
  checkRows(jsonl('combo-markets.jsonl'),rows.filter(isHighCandidate));
  const high=json('high-probability-markets.json'),highRows=rows.filter(isHighCandidate);
  assert.deepEqual(json('combo-summary.json'),buildComboSummary(highRows,{snapshot_at:index.snapshot_at},index.combo_verification));
  checkRows(jsonl('combo-corners.jsonl'),highRows.filter(isCorner));
  checkRows(jsonl('high-probability-outcomes.jsonl'),highRows);checkRows(flatten(high),highRows);
  assert.equal(high.outcomes_count,highRows.length);assert.equal(high.snapshot_at,index.snapshot_at);
  const nav=json('catalog.json'),summaries=json('events.json'),detailed=[];
  const eventIds=new Set();
  for(const summary of summaries){
    assert(!eventIds.has(summary.match_id));eventIds.add(summary.match_id);
    assert.match(summary.file,/^events\/match-[a-f0-9]{24}\.json$/);
    const event=json(summary.file);let count=0;const marketIds=new Set();
    for(const section of event.sections){assert(section.outcomes.length>0);assert.equal(section.outcomes_count,section.outcomes.length);
      for(const r of section.outcomes){assert.equal(r.match_id,event.match_id);assert.equal(r.section_id,section.id);detailed.push(r);marketIds.add(r.market_id);count++;}}
    assert.equal(event.outcomes_count,count);assert.equal(event.markets_count,marketIds.size);
    assert.equal(summary.outcomes_count,count);
  }
  checkRows(detailed,rows);
  assert.deepEqual(nav.sports.flatMap(s=>s.leagues.flatMap(l=>l.events.map(e=>e.match_id))).sort(),[...eventIds].sort());
  assert.equal(index.outcomes,rows.length);assert.equal(index.markets,new Set(rows.map(r=>r.market_id)).size);assert.equal(index.events,eventIds.size);
  assert.equal(index.high_probability_catalog.outcomes,highRows.length);
  assert.equal(index.combo_outcomes,highRows.length);
  const audit=json('candidate-audit.json');checkRows(audit.quarantine,rows.filter(r=>r.quarantined));
  const unknown=json('unclassified-outcomes.json');checkRows(unknown.outcomes,rows.filter(r=>r.family==='other'));
  const ladders=json('line-ladders.json');assert.equal(ladders.ladders_count,ladders.ladders.length);
  for(const ladder of ladders.ladders){let last=-Infinity;for(const row of ladder.lines){assert(row.line>=last);last=row.line;
    assert.equal(row.match_id,ladder.match_id);assert.equal(row.family,ladder.family);assert.equal(row.period,ladder.period);
    assert.equal(row.outcome,ladder.outcome);assert.equal(ladderScope(row),ladder.scope);
    const {label,market_line,...original}=row;const source=ids.get(row.outcome_id);assert.equal(market_line,source.line);assert.deepEqual(original,{...source,line:source.outcome_line ?? Number(source.line)});
  }}
  assert(!fs.existsSync(path.join(dir,'events.jsonl')),'Legacy summary JSONL must be removed');
  return {markets:index.markets,outcomes:rows.length,events:eventIds.size,high_probability_outcomes:highRows.length};
}
if(require.main===module)console.log(validateCatalog(process.argv[2]||'out'));
module.exports={validateCatalog};
