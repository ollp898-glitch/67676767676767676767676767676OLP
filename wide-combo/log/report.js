const fs=require('node:fs');
const journal=require('./journal');
const fmt=value=>value==null?'—':Number(value).toFixed(3);
const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
function groupReport(name,rows) {
  const settled=rows.filter(row=>row.result==='win'||row.result==='loss');
  const prices=settled.map(row=>Number(row.best_ask)).filter(Number.isFinite);
  const models=settled.map(row=>Number(row.model_probability)).filter(value=>Number.isFinite(value)&&value>0);
  const price=mean(prices),model=mean(models);
  return `| ${name} | ${rows.length} | ${settled.length} | ${settled.length<30?'мало данных':fmt(settled.filter(row=>row.result==='win').length/settled.length)} | ${fmt(price)} | ${fmt(model)} | ${price!=null&&model!=null?fmt((model-price)*100):'—'} |`;
}
function report(rows) {
  const buckets=[['0.80–0.85',.8,.85],['0.85–0.90',.85,.9],['0.90–0.95',.9,.95]];
  const table='| Группа | Ног | С результатом | Доля побед | Средняя ask | Средняя model P | Разница, п.п. |\n|---|---:|---:|---:|---:|---:|---:|\n';
  const byPrice=buckets.map(([name,low,high])=>groupReport(name,rows.filter(row=>Number(row.best_ask)>=low&&Number(row.best_ask)<high))).join('\n');
  const families=[...new Set(rows.map(row=>row.family))].sort();
  const byFamily=families.map(family=>groupReport(family,rows.filter(row=>row.family===family))).join('\n');
  const groups=new Map();for(const row of rows){if(!groups.has(row.combo_id))groups.set(row.combo_id,[]);groups.get(row.combo_id).push(row);}
  let resolved=0,wins=0,staked=0,profit=0,withoutQuote=0;
  for(const legs of groups.values()) {
    if(!legs.length||legs.some(leg=>!leg.result)) continue;
    if(legs.some(leg=>leg.result==='void')) continue;
    resolved++;
    const won=legs.every(leg=>leg.result==='win');if(won) wins++;
    const quotes=[...new Set(legs.map(leg=>leg.combo_quote_odds))];
    const stakes=[...new Set(legs.map(leg=>leg.stake_usd))];
    if(quotes.length!==1||stakes.length!==1||!quotes[0]||!stakes[0]) {withoutQuote++;continue;}
    const stake=Number(stakes[0]),odds=Number(quotes[0]);
    if(!Number.isFinite(stake)||stake<=0||!Number.isFinite(odds)||odds<=1){withoutQuote++;continue;}
    staked+=stake;profit+=won?stake*(odds-1):-stake;
  }
  return '# Wide Combo — журнал результатов\n\n'+
    `Записано ног: ${rows.length}. Пустой result означает ожидание, а не поражение. Доля побед приводится только для групп с 30 и более рассчитанными ногами.\n\n`+
    '## По ценовым корзинам\n\n'+table+byPrice+'\n\n'+
    '## По типам рынков\n\n'+table+(byFamily||'Нет записей.')+'\n\n'+
    `## Комбо целиком\n\nСобрано: ${groups.size}. Завершено без void: ${resolved}. Выиграло: ${wins}. `+
    `Без фактического коэффициента Combo RFQ или ставки: ${withoutQuote}. `+
    `ROI по комбо с подтверждённым коэффициентом и ставкой: ${staked?fmt(profit/staked*100)+'%':'—'}.\n\n`+
    'Цены одиночных ног не являются котировкой Combo RFQ. Комбо с void исключены из ROI до отдельной проверки условий расчёта.\n';
}
if(require.main===module){
  const [logFile='wide-combo/log/legs.csv',output='wide-combo/log/report.md']=process.argv.slice(2);
  try{fs.writeFileSync(output,report(journal.read(logFile)));console.log(output);}
  catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={report};
