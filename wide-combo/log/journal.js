const fs=require('node:fs');
const path=require('node:path');
const {csvCell,parseCsv}=require('../slim');
const COLUMNS=['leg_id','snapshot_id','source_sha256','num','match_num','match_id','match_title','sport','family','market_type',
  'period','question','outcome','outcome_line','outcome_id','token_id','start_utc','label','best_ask','selected_at',
  'model_probability','model_p_low','combo_id','combo_quote_odds','stake_usd','source_event_id',
  'result','settled_at','settlement_source','score_home','score_away'];
function parse(text) {
  const records=parseCsv(text),header=records.shift()??[];
  if(header.join(',')!==COLUMNS.join(',')) throw new Error('Unexpected leg journal schema');
  return records.map(record=>{
    if(record.length!==COLUMNS.length) throw new Error('Invalid journal row width');
    return Object.fromEntries(COLUMNS.map((column,i)=>[column,record[i]]));
  });
}
function serialize(rows) {
  return [COLUMNS.join(','),...rows.map(row=>COLUMNS.map(column=>csvCell(row[column])).join(','))].join('\n')+'\n';
}
function read(file) {return fs.existsSync(file)?parse(fs.readFileSync(file,'utf8')):[];}
function write(file,rows) {
  if(new Set(rows.map(row=>row.leg_id)).size!==rows.length) throw new Error('Duplicate leg ID');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+'.tmp';fs.writeFileSync(temp,serialize(rows));fs.renameSync(temp,file);
  fs.writeFileSync(path.join(path.dirname(file),'report.md'),require('./report').report(rows));
}
module.exports={COLUMNS,parse,serialize,read,write};
