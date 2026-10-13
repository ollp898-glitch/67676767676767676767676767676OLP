const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {validateAnswer}=require('./validate-answer');
const journal=require('./journal');
function record(answer,source,logFile,comboId,{selectedAt=new Date().toISOString(),stakeUsd=null,comboQuoteOdds=null}={}) {
  if(!comboId||typeof comboId!=='string') throw new Error('combo_id is required');
  if(!Number.isFinite(Date.parse(selectedAt))) throw new Error('Invalid selected_at');
  if(stakeUsd!=null&&(!Number.isFinite(Number(stakeUsd))||Number(stakeUsd)<=0)) throw new Error('Invalid stake');
  if(comboQuoteOdds!=null&&(!Number.isFinite(Number(comboQuoteOdds))||Number(comboQuoteOdds)<=1)) throw new Error('Invalid Combo RFQ odds');
  const checked=validateAnswer(answer,source);
  if(!checked.meets_minimum_multiplier) throw new Error('Cannot record a combo below the minimum multiplier');
  const idMap=JSON.parse(fs.readFileSync(path.join(source,'wide-combo','id-map.json'),'utf8'));
  if(idMap.snapshot_id!==checked.snapshot_id||idMap.source_sha256!==checked.source_sha256) throw new Error('ID map snapshot differs');
  const byNum=new Map(idMap.items.map(item=>[item.num,item]));
  const existing=journal.read(logFile),ids=new Set(existing.map(row=>row.leg_id));
  const added=checked.legs.map(leg=>{
    const item=byNum.get(leg.num);
    if(!item) throw new Error(`Missing ID map entry: ${leg.num}`);
    const page=JSON.parse(fs.readFileSync(path.join(source,item.full_page),'utf8'));
    if(page.snapshot_id!==checked.snapshot_id||page.source_sha256!==checked.source_sha256) throw new Error('Full page snapshot differs');
    const row=page.outcomes.find(candidate=>candidate.num===leg.num);
    if(!row||row.outcome_id!==item.outcome_id) throw new Error(`Full row mismatch: ${leg.num}`);
    const legId=createHash('sha256').update(`${comboId}:${checked.snapshot_id}:${leg.num}`).digest('hex').slice(0,20);
    if(ids.has(legId)) throw new Error(`Already recorded: ${leg.num}`);
    ids.add(legId);
    return {leg_id:legId,snapshot_id:checked.snapshot_id,source_sha256:checked.source_sha256,
      num:leg.num,match_num:row.match_num,match_id:row.match_id,match_title:row.match_title,sport:row.sport,
      family:row.family,market_type:row.market_type,period:row.period,question:row.question,outcome:row.outcome,
      outcome_line:row.outcome_line??row.line,outcome_id:row.outcome_id,token_id:row.token_id,
      start_utc:row.game_start_time,label:row.outcome_label,best_ask:leg.best_ask,selected_at:selectedAt,
      model_probability:row.model_probability,model_p_low:leg.conservative_probability,combo_id:comboId,
      combo_quote_odds:comboQuoteOdds,stake_usd:stakeUsd,source_event_id:'',result:'',settled_at:'',
      settlement_source:'',score_home:'',score_away:''};
  });
  journal.write(logFile,[...existing,...added]);
  return {added:added.length,log_file:logFile};
}
if(require.main===module){
  try{const [answerFile,source,logFile,comboId]=process.argv.slice(2);
    if(!answerFile||!source||!logFile||!comboId)throw new Error('Usage: node wide-combo/log/record.js ANSWER.json SNAPSHOT_DIR LOG.csv COMBO_ID');
    console.log(JSON.stringify(record(JSON.parse(fs.readFileSync(answerFile,'utf8')),source,logFile,comboId)));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={record};
