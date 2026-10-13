const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {COLUMNS,csvCell,readSlim}=require('./slim');
const POLICY_FILE=path.join(__dirname,'policy.json');
function validatePolicy(policy) {
  if(policy.schema_version!==1||!['active','awaiting_owner_thresholds'].includes(policy.status)) throw new Error('Invalid candidate policy status');
  for(const key of ['min_liquidity_usd','max_spread','max_book_age_ms','min_best_ask','max_best_ask_inclusive',
    'max_slippage_100_pp','max_abs_price_change_24h_pp','max_large_jumps','min_start_minutes']) {
    if(policy[key]!=null&&(!Number.isFinite(policy[key])||policy[key]<0)) throw new Error(`Invalid candidate policy ${key}`);
  }
  if(!Number.isFinite(policy.min_liquidity_usd)||!Number.isFinite(policy.max_spread)) throw new Error('Required candidate limits missing');
  for(const key of ['min_best_ask','max_best_ask_inclusive']) if(policy[key]!=null&&policy[key]>1) throw new Error(`Invalid candidate policy ${key}`);
  if(policy.require_full_fill_100!==true) throw new Error('Full $100 fill is required');
  for(const key of ['sports','families']) if(policy[key]!=null&&(!Array.isArray(policy[key])||policy[key].some(value=>typeof value!=='string'))) throw new Error(`Invalid ${key}`);
  if(typeof policy.duration_minutes_by_sport!=='object'||policy.duration_minutes_by_sport===null) throw new Error('Missing sport durations');
  for(const value of Object.values(policy.duration_minutes_by_sport)) if(!Number.isFinite(value)||value<=0) throw new Error('Invalid sport duration');
  return policy;
}
const finite=value=>value!==''&&value!=null&&Number.isFinite(Number(value))?Number(value):null;
function reason(row,policy,until,snapshotAt) {
  if(policy.status!=='active') return 'policy_awaiting_owner_thresholds';
  if(policy.sports && !policy.sports.includes(row.sport)) return 'sport_not_selected';
  if(policy.families && !policy.families.includes(row.family)) return 'family_not_selected';
  if(finite(row.liq)===null||Number(row.liq)<policy.min_liquidity_usd) return 'liquidity_below_minimum';
  if(row.book_status!=='A') return 'book_unavailable';
  const ask=finite(row.best_ask);
  if(ask===null||ask<=0||ask>=1) return 'missing_best_ask';
  if(row.fill100!=='true') return 'cannot_fill_100_usd';
  const spread=finite(row.spread);
  if(spread===null||spread>policy.max_spread) return 'spread_above_maximum';
  if(policy.max_book_age_ms!=null&&(finite(row.book_age_ms)===null||Number(row.book_age_ms)>policy.max_book_age_ms)) return 'book_too_old';
  if(policy.min_best_ask!=null&&ask<policy.min_best_ask) return 'ask_below_minimum';
  if(policy.max_best_ask_inclusive!=null&&ask>policy.max_best_ask_inclusive) return 'ask_above_maximum';
  if(policy.max_slippage_100_pp!=null&&(finite(row.slip100_pp)===null||Number(row.slip100_pp)>policy.max_slippage_100_pp)) return 'slippage_above_maximum';
  if(policy.max_abs_price_change_24h_pp!=null&&(finite(row.d24)===null||Math.abs(Number(row.d24))>policy.max_abs_price_change_24h_pp)) return 'price_change_above_maximum';
  if(policy.max_large_jumps!=null&&(finite(row.jumps)===null||Number(row.jumps)>policy.max_large_jumps)) return 'large_jumps_above_maximum';
  const start=finite(row.start_utc);
  if(start===null) return 'invalid_start';
  if(policy.min_start_minutes!=null&&start-Date.parse(snapshotAt)/1000<policy.min_start_minutes*60) return 'starts_too_soon';
  if(until!=null){
    const duration=policy.duration_minutes_by_sport[row.sport];
    if(duration==null) return 'unknown_sport_duration';
    if(start+duration*60>until) return 'ends_after_deadline';
  }
  return null;
}
function buildCandidates(root,{until=null,policyFile=POLICY_FILE}={}) {
  const policyBytes=fs.readFileSync(policyFile),policy=validatePolicy(JSON.parse(policyBytes));
  let deadline=null;
  if(until!=null){
    if(typeof until!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(until)||!Number.isFinite(Date.parse(until))) throw new Error('--until must be UTC ISO time ending in Z');
    deadline=Date.parse(until)/1000;
  }
  const slim=readSlim(path.join(root,'slim.csv')),selected=[],excluded={};
  for(const row of slim.rows){const why=reason(row,policy,deadline,slim.meta.snapshot_at);
    if(why)excluded[why]=(excluded[why]??0)+1;else selected.push(row);
  }
  const header=[`# schema_version=1`,`# snapshot_at=${slim.meta.snapshot_at}`,`# snapshot_id=${slim.meta.snapshot_id}`,
    `# source_sha256=${slim.meta.source_sha256}`,`# count=${selected.length}`];
  const csv=[...header,COLUMNS.join(','),...selected.map(row=>COLUMNS.map(column=>csvCell(row[column])).join(','))].join('\n')+'\n';
  if(Buffer.byteLength(csv)>200_000) throw new Error('candidates.csv exceeds 200 KB');
  fs.writeFileSync(path.join(root,'policy.json'),policyBytes);
  fs.writeFileSync(path.join(root,'candidates.csv'),csv);
  const audit={schema_version:1,snapshot_at:slim.meta.snapshot_at,snapshot_id:slim.meta.snapshot_id,
    source_sha256:slim.meta.source_sha256,policy_sha256:createHash('sha256').update(policyBytes).digest('hex'),
    policy_status:policy.status,until_utc:until,source_count:slim.rows.length,candidates:selected.length,
    excluded_by_reason:excluded};
  if(audit.candidates+Object.values(excluded).reduce((sum,value)=>sum+value,0)!==audit.source_count) throw new Error('Candidate audit count mismatch');
  fs.writeFileSync(path.join(root,'candidates-audit.json'),JSON.stringify(audit,null,2)+'\n');
  return audit;
}
if(require.main===module){
  try{const root=process.argv[2]??'out/wide-combo',at=process.argv.indexOf('--until');
    console.log(JSON.stringify(buildCandidates(root,{until:at>=0?process.argv[at+1]:null}),null,2));}
  catch(error){console.error(error.stack);process.exitCode=1;}
}
module.exports={buildCandidates,validatePolicy,reason};
