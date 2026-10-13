const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {makeSlim,readSlim}=require('./slim');
const {buildCandidates}=require('./candidates');
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
  const audit=buildCandidates(root);
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
  const root=fixture([row('W001',{game_start_time:'2026-10-13T21:45:00Z'}),row('W002',{sport:'basketball'})]);
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const audit=buildCandidates(root,{policyFile:policyFile(root),until:'2026-10-13T23:00:00Z'});
  assert.equal(audit.candidates,0);
  assert.deepEqual(audit.excluded_by_reason,{ends_after_deadline:1,unknown_sport_duration:1});
});
