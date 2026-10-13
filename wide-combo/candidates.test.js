const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {makeSlim,readSlim}=require('./slim');
const {buildCandidates,durationMinutes,selectionReference}=require('./candidates');
const defaultPolicy=require('./policy.json');

function fixture(rows){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'betx-candidates-test-'));
  const meta={snapshot_at:'2026-10-13T09:00:00Z',snapshot_id:'snap',source_sha256:'source'};
  fs.writeFileSync(path.join(root,'slim.csv'),makeSlim(rows,meta));
  return root;
}
const row=(num,overrides={})=>({num,match_num:`M${num}`,match_title:'Home vs Away',sport:'soccer',league_name:'League',
  game_start_time:'2026-10-13T13:00:00Z',family:'handicap',market_type:'soccer_spreads',outcome_label:'Home -0.5',
  outcome_line:-0.5,best_ask:0.90,best_bid:0.88,spread:0.02,liquidity:100,book_status:'available',
  depth:{buy_scenarios:[{requested_usd:100,fully_fillable:true,slippage_pp:0.2}]},...overrides});
function policyFile(root,overrides={}){
  const file=path.join(root,'candidate-policy-input.json');
  fs.writeFileSync(file,JSON.stringify({...defaultPolicy,status:'active',...overrides}));
  return file;
}
test('pending policy publishes an explicit empty candidate list and complete audit',t=>{
  const root=fixture([row('W001')]);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const audit=buildCandidates(root,{policyFile:policyFile(root,{status:'awaiting_owner_thresholds'})});
  assert.equal(audit.source_count,1);assert.equal(audit.candidates,0);
  assert.equal(audit.excluded_by_reason.policy_awaiting_owner_thresholds,1);
  assert.equal(readSlim(path.join(root,'candidates.csv')).rows.length,0);
});
test('agreed liquidity, full fill and spread gates preserve all sports and lines',t=>{
  const root=fixture([row('W001'),row('W002',{sport:'basketball',outcome_line:1.5}),
    row('W003',{liquidity:39}),row('W004',{spread:0.036}),
    row('W005',{depth:{buy_scenarios:[{requested_usd:100,fully_fillable:false}]}}),
    row('W006',{book_status:'stale_or_invalid_timestamp'})]);
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const audit=buildCandidates(root,{policyFile:policyFile(root)});
  assert.equal(audit.candidates,2);
  assert.deepEqual(readSlim(path.join(root,'candidates.csv')).rows.map(item=>item.num),['W001','W002']);
  assert.deepEqual(audit.excluded_by_reason,{liquidity_below_minimum:1,spread_above_maximum:1,
    cannot_fill_100_usd:1,book_unavailable:1});
});
test('deadline uses configured sport duration and reports unknown duration',t=>{
  const root=fixture([row('W001',{game_start_time:'2026-10-13T21:45:00Z'}),
    row('W002',{sport:'cricket',match_title:'Test: Home vs Away'}),
    row('W003',{sport:'cricket',match_title:'T20s: Home vs Away',game_start_time:'2026-10-13T18:00:00Z'}),
    row('W004',{sport:'cricket',match_title:'ODI: Home vs Away',game_start_time:'2026-10-13T14:00:00Z'}),
    row('W005',{sport:'basketball',game_start_time:'2026-10-13T19:00:00Z'}),
    row('W006',{sport:'unknown',game_start_time:'2026-10-13T19:00:00Z'})]);
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const audit=buildCandidates(root,{policyFile:policyFile(root),until:'2026-10-13T23:00:00Z'});
  assert.equal(audit.candidates,3);
  assert.deepEqual(readSlim(path.join(root,'candidates.csv')).rows.map(item=>item.num),['W003','W004','W005']);
  assert.deepEqual(audit.excluded_by_reason,{ends_after_deadline:1,no_duration:2});
});
test('owner thresholds include exact boundaries and ignore unrestricted signals',t=>{
  const root=fixture([row('W001',{best_ask:0.8,spread:0.035,
      depth:{buy_scenarios:[{requested_usd:100,fully_fillable:true,slippage_pp:0.5}]},
      game_start_time:'2026-10-13T10:00:00Z',book_age_ms_at_observation:99999999}),
    row('W002',{best_ask:0.97,price_change_24h_pp:30,price_history_quality:{large_jumps:20}}),
    row('W003',{best_ask:0.799}),row('W004',{best_ask:0.971}),
    row('W005',{depth:{buy_scenarios:[{requested_usd:100,fully_fillable:true,slippage_pp:0.51}]}}),
    row('W006',{game_start_time:'2026-10-13T09:59:59Z'})]);
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const audit=buildCandidates(root,{policyFile:policyFile(root)});
  assert.deepEqual(readSlim(path.join(root,'candidates.csv')).rows.map(item=>item.num),['W001','W002']);
  assert.deepEqual(audit.excluded_by_reason,{ask_below_minimum:1,ask_above_maximum:1,
    slippage_above_maximum:1,starts_too_soon:1});
  assert.equal(audit.candidates+Object.values(audit.excluded_by_reason).reduce((a,b)=>a+b,0),audit.source_count);
});
test('sport durations follow policy without inferring cricket format',()=>{
  for(const [sport,minutes] of Object.entries({'soccer':120,'hockey':160,'basketball':150,
    'american-football':200,'baseball':190,'tennis':180,'mma':240}))
    assert.equal(durationMinutes({sport},defaultPolicy),minutes);
  assert.equal(durationMinutes({sport:'cricket',match_title:'T20 World Cup'},defaultPolicy),210);
  assert.equal(durationMinutes({sport:'cricket',match_title:'T20I: A vs B'},defaultPolicy),210);
  assert.equal(durationMinutes({sport:'cricket',match_title:'ODI: A vs B'},defaultPolicy),480);
  assert.equal(durationMinutes({sport:'cricket',match_title:'Test: A vs B'},defaultPolicy),null);
  assert.equal(durationMinutes({sport:'cricket',match_title:'Cricket World Cup League 2'},defaultPolicy),null);
  assert.equal(durationMinutes({sport:'volleyball'},defaultPolicy),null);
});
test('start lead time uses the latest source observation rather than scan start',t=>{
  const root=fixture([row('W001',{game_start_time:'2026-10-13T10:30:00Z'})]);
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const referenceAt=selectionReference([{book_observed_at:'2026-10-13T09:45:00Z',
    combo_verified_at:'2026-10-13T09:40:00Z'}],'2026-10-13T09:00:00Z');
  assert.equal(referenceAt,'2026-10-13T09:45:00.000Z');
  const audit=buildCandidates(root,{policyFile:policyFile(root),referenceAt});
  assert.equal(audit.candidates,0);
  assert.equal(audit.excluded_by_reason.starts_too_soon,1);
});
