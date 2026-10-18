'use strict';
// Compact, read-only Google Sheets view. Does NOT affect scanner eligibility.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const COLUMNS=Object.freeze([
  ['Спорт','sport'],['Событие','event_title'],['Начало (UTC)','game_start_time'],
  ['Тип рынка','market_type'],['Исход','outcome'],['Фора / линия','outcome_line'],
  ['Цена рынка','price'],['Best Ask','best_ask'],['Best Bid','best_bid'],
  ['Спред','spread'],['Ликвидность USD','liquidity'],['Ask size','ask_size'],
  ['Глубина Ask USD','ask_notional_usd'],['Combo рынка','combo_status'],
  ['Combo события','event_combo_status'],['Статус стакана','book_status'],
  ['Ссылка Polymarket','market_url'],['Время снимка','snapshot_at'],
  ['ID события','event_id'],['ID матча BET-X','match_id'],['ID рынка','market_id'],
  ['Condition ID','condition_id'],['Token ID','token_id'],
  ['Индекс исхода','outcome_index'],['Название рынка','market_question'],
  ['Классификация','classification_status'],['Лига','league']
]);
const NUMERIC=new Set(['outcome_line','price','best_ask','best_bid','spread','liquidity','ask_size','ask_notional_usd','outcome_index']);
function buildExport(data,index,now=new Date()) {
 if(index.scan_status!=='complete'||index.pagination_complete!==true)throw Error('Incomplete scan');
 const raw=String(data);
 const input=raw.split(/\r?\n/).filter(Boolean);
 if(input.length!==index.saved_outcomes)throw Error('Markets count mismatch');
 const seen=new Set(),rows=[];
 for(const line of input) {
  const row=JSON.parse(line);
  if(!row.token_id||seen.has(String(row.token_id)))throw Error('Duplicate or missing token id');
  seen.add(String(row.token_id));
  if(row.book_status!=='available'||!(row.best_ask>0&&row.ask_size>0))throw Error('Invalid source Ask');
  rows.push(COLUMNS.map(([,k])=>{
    const v=row[k];
    if(v==null)return '';
    if(NUMERIC.has(k))return typeof v==='number'&&Number.isFinite(v)?v:'';
    const s=String(v);
    // Prevent a question, team name or label from becoming a formula.
    return s.startsWith('=')?"'"+s:s;
  }));
 }
 return {schema_version:1,source:'BET-X Polymarket scanner',snapshot_at:index.snapshot_at,exported_at:now.toISOString(),
  source_sha256:crypto.createHash('sha256').update(raw).digest('hex'),
  row_count:rows.length,columns:COLUMNS.map(([title])=>title),rows};
}
function buildStatsCSV(index){
  if(index.scan_status!=='complete'||index.pagination_complete!==true)throw Error('Incomplete scan for dashboard stats');
  const keys=['snapshot_at','scan_finished_at','processed_markets','unique_events','unique_matches',
    'source_outcomes','checked_outcomes','saved_outcomes','excluded_records','markets_with_ask',
    'combo_markets','combo_events','book_api_errors','api_errors','duplicate_markets',
    'duplicate_outcomes','scan_status'];
  for(const key of keys)if(index[key]===undefined||index[key]===null)throw Error('Missing dashboard metric: '+key);
  return ['key,value',...keys.map(key=>key+','+String(index[key]))].join('\n')+'\n';
}
function exportFile(dir,output=path.join(dir,'sheets.json')){
 const raw=fs.readFileSync(path.join(dir,'markets.jsonl'),'utf8');
 const index=JSON.parse(fs.readFileSync(path.join(dir,'index.json'),'utf8'));
 const result=buildExport(raw,index);
 const tmp=output+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(result)+'\n');
 fs.renameSync(tmp,output);
 const stats=path.join(dir,'dashboard-stats.csv'),statsTmp=stats+'.tmp';
 fs.writeFileSync(statsTmp,buildStatsCSV(index));
 fs.renameSync(statsTmp,stats);
 return {row_count:result.row_count,bytes:fs.statSync(output).size,source_sha256:result.source_sha256,stats_file:stats};
}
if(require.main===module){
 try{console.log(JSON.stringify(exportFile(process.argv[2]||'out')));}
 catch(e){console.error(e);process.exitCode=1;}
}
module.exports={COLUMNS,buildExport,buildStatsCSV,exportFile};
