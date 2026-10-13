const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {makeSlim}=require('../slim');
const {validateAnswer}=require('./validate-answer');
const journal=require('./journal');
const {scoreResult,verifiedScore,settle}=require('./settle');
const {report}=require('./report');
const meta={snapshot_at:'2026-10-13T09:00:00Z',snapshot_id:'snapshot-1',source_sha256:'source-hash'};
function source(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'betx-log-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.mkdirSync(path.join(dir,'wide-combo'));
  const rows=[
    {num:'W001',match_num:'M01',match_title:'A vs. B',game_start_time:'2026-10-13T13:00:00Z',
      family:'totals',market_type:'totals',outcome_label:'Over 1.5',outcome_line:1.5,best_ask:.8,liquidity:100},
    {num:'W002',match_num:'M02',match_title:'C vs. D',game_start_time:'2026-10-13T14:00:00Z',
      family:'winner',market_type:'moneyline',outcome_label:'C',best_ask:.85,liquidity:110}
  ];
  fs.writeFileSync(path.join(dir,'wide-combo','slim.csv'),makeSlim(rows,meta));
  return {dir,rows};
}
test('answer validator reads prices from source and rejects repeated matches',t=>{
  const {dir,rows}=source(t);
  const answer={...meta,status:'final',legs:[{num:'W001',stage1_probability:.9,sources:['https://example.org/one']},
    {num:'W002',stage1_probability:.95,sources:['https://example.org/two']}],rejected:[],not_checked:[]};
  const checked=validateAnswer(answer,dir);
  assert.equal(checked.combo_odds_from_single_asks,1/(.8*.85));
  assert(checked.combo_multiplier>1.05);
  assert.equal(checked.actual_combo_rfq_odds,null);
  assert.throws(()=>validateAnswer({...answer,legs:[{...answer.legs[0],best_ask:.7},answer.legs[1]]},dir),/Invented ask/);
  rows[1].match_num='M01';fs.writeFileSync(path.join(dir,'wide-combo','slim.csv'),makeSlim(rows,meta));
  assert.throws(()=>validateAnswer(answer,dir),/Two legs for match/);
});
test('score settlement handles totals, handicaps, draw no and unsupported periods',()=>{
  const base={sport:'soccer',period:'match',match_title:'A vs. B'};
  assert.equal(scoreResult({...base,family:'totals',market_type:'totals',outcome:'Under',outcome_line:'5.5'},2,1,'A','B'),'win');
  assert.equal(scoreResult({...base,family:'handicap',market_type:'spreads',outcome:'B',outcome_line:'2.5'},2,1,'A','B'),'win');
  assert.equal(scoreResult({...base,family:'winner',market_type:'moneyline',outcome:'No',label:'Will A vs. B end in a draw?'},2,1,'A','B'),'win');
  assert.equal(scoreResult({...base,family:'winner',market_type:'moneyline',outcome:'No',question:'Will B win on 2026-10-13?'},2,1,'A','B'),'win');
  assert.equal(scoreResult({...base,period:'first_half',family:'totals',market_type:'totals',outcome:'Over',outcome_line:'1.5'},2,1,'A','B'),null);
  assert.equal(scoreResult({...base,family:'totals',market_type:'totals',outcome:'Under',outcome_line:''},2,1,'A','B'),null);
});
test('only an exact final score match settles a journal leg',async t=>{
  const {dir}=source(t),file=path.join(dir,'legs.csv');
  const leg={leg_id:'one',snapshot_id:meta.snapshot_id,num:'W001',match_id:'match-1',match_title:'A vs. B',sport:'soccer',
    family:'totals',market_type:'totals',period:'match',outcome:'Over',outcome_line:'1.5',
    start_utc:'2026-10-13T13:00:00Z',best_ask:.8,combo_id:'combo-1',source_event_id:'123',result:''};
  journal.write(file,[leg]);
  const event={idEvent:'123',strStatus:'Match Finished',strHomeTeam:'A',strAwayTeam:'B',strTimestamp:'2026-10-13T13:00:00Z',intHomeScore:'2',intAwayScore:'1'};
  assert(verifiedScore(leg,event));
  assert.equal(verifiedScore(leg,{...event,strAwayTeam:'Other'}),null);
  assert.deepEqual(await settle(file,{lookup:async()=>({event,url:'https://www.thesportsdb.com/event/123'}),now:'2026-10-13T16:00:00Z'}),
    {settled:1,unmatched:0,unsupported:0,pending:0});
  assert.equal(journal.read(file)[0].result,'win');
  assert.equal(journal.read(file)[0].settlement_source,'https://www.thesportsdb.com/event/123');
});
test('unmatched public score leaves result empty',async t=>{
  const {dir}=source(t),file=path.join(dir,'legs.csv');
  journal.write(file,[{leg_id:'pending',match_id:'match-2',match_title:'A vs. B',sport:'soccer',family:'totals',
    market_type:'totals',period:'match',outcome:'Over',outcome_line:'1.5',start_utc:'2026-10-13T13:00:00Z',result:''}]);
  const outcome=await settle(file,{search:async()=>({event:{idEvent:'123',strStatus:'Match Finished',strHomeTeam:'Wrong',
    strAwayTeam:'B',strTimestamp:'2026-10-13T13:00:00Z',intHomeScore:'2',intAwayScore:'1'},url:'https://example.org/123'})});
  assert.equal(outcome.unmatched,1);
  assert.equal(journal.read(file)[0].result,'');
});
test('report marks small buckets and does not count empty results as losses',()=>{
  const rows=Array.from({length:29},(_,i)=>({leg_id:String(i),combo_id:String(i),family:'totals',best_ask:'.82',result:i===0?'':'win',model_probability:''}));
  const text=report(rows);
  assert.match(text,/мало данных/);
  assert.match(text,/С результатом \| Доля побед/);
  assert.match(text,/Пустой result означает ожидание/);
});
