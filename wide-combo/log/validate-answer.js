const fs=require('node:fs');
const path=require('node:path');
const {readSlim}=require('../slim');

const number=(value,label) => {
  if(value===null || value===undefined || value==='') throw new Error(`Missing ${label}`);
  const parsed=Number(value);
  if(!Number.isFinite(parsed)) throw new Error(`Invalid ${label}`);
  return parsed;
};
function validateAnswer(answer,source,{minimumMultiplier=1.05}={}) {
  const wide=path.join(source,'wide-combo');
  const file=fs.existsSync(path.join(wide,'candidates.csv'))?'candidates.csv':'slim.csv';
  const {meta,rows}=readSlim(path.join(wide,file));
  if(answer.snapshot_id!==meta.snapshot_id || answer.snapshot_at!==meta.snapshot_at || answer.source_sha256!==meta.source_sha256)
    throw new Error('Answer and candidate snapshot metadata differ');
  const byNum=new Map(rows.map(row=>[row.num,row]));
  if(byNum.size!==rows.length) throw new Error('Duplicate source number');
  if(!Array.isArray(answer.legs) || !Array.isArray(answer.rejected) || !Array.isArray(answer.not_checked))
    throw new Error('Answer requires legs, rejected and not_checked arrays');
  const seenNum=new Set(),seenMatch=new Set();
  let priceProduct=1,multiplier=1;
  const legs=answer.legs.map(leg=>{
    const row=byNum.get(leg.num);
    if(!row) throw new Error(`Unknown candidate: ${leg.num}`);
    if(seenNum.has(leg.num)) throw new Error(`Duplicate leg: ${leg.num}`);
    if(seenMatch.has(row.match_num)) throw new Error(`Two legs for match ${row.match_num}`);
    seenNum.add(leg.num);seenMatch.add(row.match_num);
    const ask=number(row.best_ask,`${leg.num} best_ask`);
    if(ask<=0 || ask>=1) throw new Error(`Invalid ask: ${leg.num}`);
    if(!Array.isArray(leg.sources) || !leg.sources.length || leg.sources.some(url=>typeof url!=='string'||!/^https:\/\//.test(url)))
      throw new Error(`Missing source for ${leg.num}`);
    const first=number(leg.stage1_probability,`${leg.num} stage1_probability`);
    const second=leg.stage2_probability==null?first:number(leg.stage2_probability,`${leg.num} stage2_probability`);
    if(first<0||first>1||second<0||second>1) throw new Error(`Invalid probability: ${leg.num}`);
    const conservative=Math.min(first,second);
    priceProduct*=ask;multiplier*=conservative/ask;
    if(leg.best_ask!=null && Math.abs(number(leg.best_ask,'answer ask')-ask)>1e-9) throw new Error(`Invented ask: ${leg.num}`);
    return {num:leg.num,match_num:row.match_num,best_ask:ask,stage1_probability:first,
      stage2_probability:leg.stage2_probability==null?null:second,conservative_probability:conservative,sources:leg.sources};
  });
  for(const item of answer.rejected) {
    if(!byNum.has(item.num)||!item.reason) throw new Error(`Invalid rejection: ${item.num}`);
    if(seenNum.has(item.num)) throw new Error(`Selected and rejected: ${item.num}`);
    seenNum.add(item.num);
  }
  for(const range of answer.not_checked) {
    if(typeof range!=='string'||!/^W\d+(?:-W\d+)?$/.test(range)) throw new Error(`Invalid unchecked range: ${range}`);
    const [first,last]=range.split('-');
    const start=Number(first.slice(1)),end=Number((last??first).slice(1));
    if(end<start) throw new Error(`Invalid unchecked range: ${range}`);
    for(let i=start;i<=end;i++) {
      const num=`W${String(i).padStart(3,'0')}`;
      if(!byNum.has(num)||seenNum.has(num)) throw new Error(`Invalid unchecked number: ${num}`);
      seenNum.add(num);
    }
  }
  if(seenNum.size!==rows.length) throw new Error(`Answer leaves ${rows.length-seenNum.size} candidates unaccounted for`);
  if(answer.stage2_checked_nums || answer.stage3_checked_nums) {
    const stage1=new Set(answer.stage1_passed_nums??[]);
    if(stage1.size>20) throw new Error('Stage 1 batch exceeds 20 outcomes');
    for(const num of [...(answer.stage2_checked_nums??[]),...(answer.stage3_checked_nums??[])])
      if(!stage1.has(num)) throw new Error(`Later stage lacks Stage 1 approval: ${num}`);
  }
  const comboOdds=legs.length?1/priceProduct:null;
  const complete=legs.length>0&&multiplier>=minimumMultiplier;
  if(answer.status==='final'&&!complete) throw new Error(`Combo multiplier below ${minimumMultiplier}`);
  return {snapshot_id:meta.snapshot_id,snapshot_at:meta.snapshot_at,source_sha256:meta.source_sha256,
    source_file:file,selected:legs.length,rejected:answer.rejected.length,not_checked:answer.not_checked.length,
    legs,combo_odds_from_single_asks:comboOdds,combo_multiplier:legs.length?multiplier:null,
    meets_minimum_multiplier:complete,actual_combo_rfq_odds:null};
}
if(require.main===module){
  try {const [answerFile,source]=process.argv.slice(2);if(!answerFile||!source)throw new Error('Usage: node wide-combo/log/validate-answer.js ANSWER.json SNAPSHOT_DIR');
    console.log(JSON.stringify(validateAnswer(JSON.parse(fs.readFileSync(answerFile,'utf8')),source),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={validateAnswer};
