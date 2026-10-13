const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {build} = require('./build');
const {validate} = require('./validate');
const {run} = require('./run');
function fixture() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'betx-wide-test-'));
  const base={snapshot_at:'2026-10-12T09:35:07.285Z',combo_verified:true,sport:'soccer',family:'handicap',market_type:'soccer_spreads',
    match_id:'match-1',market_id:'market-1',event_slug:'one-v-two',match_title:'One vs Two',league_name:'League',game_start_time:'2026-10-12T13:00:00Z',
    period:'match',outcome:'One',outcome_label:'One, handicap',liquidity:100,book_status:'unavailable',best_ask:null,price_1h_ago:0.79};
  const rows=[
    {...base,outcome_id:'a',line:-0.5,outcome_line:-0.5,price:0.8},
    {...base,outcome_id:'b',market_id:'market-2',line:-1.5,outcome_line:-1.5,price:0.9},
    {...base,outcome_id:'c',market_id:'market-3',line:-2.5,outcome_line:-2.5,price:0.95},
    {...base,outcome_id:'d',market_id:'market-4',line:-3.5,outcome_line:-3.5,price:0.7999},
    {...base,outcome_id:'e',market_id:'market-5',line:-4.5,outcome_line:-4.5,price:0.88,combo_verified:false}
  ];
  fs.writeFileSync(path.join(dir,'combo-markets.jsonl'),rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
  fs.writeFileSync(path.join(dir,'index.json'),JSON.stringify({snapshot_at:base.snapshot_at}));
  return {dir,rows};
}
test('keeps all verified lines in [80%,95%) with source fields and null model data', t=>{
  const {dir}=fixture();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const index=build(dir);const result=validate(dir);
  assert.equal(index.outcomes,2);assert.equal(result.wide_outcomes,2);
  const group=JSON.parse(fs.readFileSync(path.join(dir,'wide-combo/sports/soccer/handicap/page-001.json')));
  assert.deepEqual(group.outcomes.map(row=>row.outcome_line),[-1.5,-0.5]);
  assert.equal(group.outcomes[0].book_status,'unavailable');
  assert.equal(group.outcomes[0].price_1h_ago,0.79);
  assert.equal(group.outcomes[0].model_probability,null);
  assert.deepEqual(group.outcomes.map(row=>row.num),['W001','W002']);
  assert.deepEqual(group.outcomes.map(row=>row.match_num),['M01','M01']);
  const slim=fs.readFileSync(path.join(dir,'wide-combo/slim.csv'));
  const idMap=JSON.parse(fs.readFileSync(path.join(dir,'wide-combo/id-map.json')));
  assert(slim.length<=200_000);
  assert.equal(idMap.count,2);
  assert(fs.existsSync(path.join(dir,'wide-combo/PROMPT.md')));
  assert(!fs.existsSync(path.join(dir,'wide-combo/log')));
  assert.deepEqual(idMap.items.map(item=>item.num),['W001','W002']);
  assert.equal(idMap.items[0].full_page,'wide-combo/sports/soccer/handicap/page-001.json');
  build(dir);
  assert.deepEqual(fs.readFileSync(path.join(dir,'wide-combo/slim.csv')),slim);
  validate(dir);
});
test('rejects mixed snapshots without changing source', t=>{
  const {dir,rows}=fixture();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  rows[1].snapshot_at='other';
  const file=path.join(dir,'combo-markets.jsonl');const original=rows.map(row=>JSON.stringify(row)).join('\n')+'\n';fs.writeFileSync(file,original);
  assert.throws(()=>build(dir),/Mixed Combo snapshots/);
  assert.equal(fs.readFileSync(file,'utf8'),original);
});
test('validator catches a missing eligible line', t=>{
  const {dir}=fixture();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  build(dir);
  const file=path.join(dir,'wide-combo/sports/soccer/handicap/page-001.json');
  const page=JSON.parse(fs.readFileSync(file));page.outcomes.pop();page.count=1;fs.writeFileSync(file,JSON.stringify(page));
  assert.throws(()=>validate(dir));
});
test('optional layer records failure and leaves Combo source intact', t=>{
  const {dir}=fixture();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const source=fs.readFileSync(path.join(dir,'combo-markets.jsonl'));
  const result=run(dir,{buildLayer:()=>{throw new Error('simulated Wide failure');}});
  assert.equal(result.status,'failed');
  assert.match(JSON.parse(fs.readFileSync(path.join(dir,'wide-combo-error.json'))).error,/simulated Wide failure/);
  assert.deepEqual(fs.readFileSync(path.join(dir,'combo-markets.jsonl')),source);
  assert(!fs.existsSync(path.join(dir,'wide-combo')));
});
