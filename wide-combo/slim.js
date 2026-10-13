const fs = require('node:fs');

const COLUMNS = ['num','match_num','match_title','league','start_utc','family','market_type','label','line',
  'best_ask','best_bid','spread','liq','book_status','book_age_ms','fill100','slip100_pp','d24','jumps','model_p','edge_pp'];
const BOOK_STATUS_CODES={available:'A',stale_or_invalid_timestamp:'S',empty_side:'E'};
const scalar = value => value == null ? '' : String(value);
const csvCell = value => {
  const text = scalar(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
};
const lex = (a,b) => scalar(a).localeCompare(scalar(b),'en');
const compactUtc = value => {
  if (value == null) return null;
  const seconds=Date.parse(value)/1000;
  if (!Number.isInteger(seconds)) throw new Error(`Invalid UTC start: ${value}`);
  return seconds;
};
function compareLine(a,b) {
  if (a == null && b != null) return -1;
  if (b == null && a != null) return 1;
  const left = Number(a), right = Number(b);
  if (a != null && b != null && Number.isFinite(left) && Number.isFinite(right) && left !== right) return left-right;
  return lex(a,b);
}
function compareOutcomes(a,b) {
  return lex(a.game_start_time,b.game_start_time) || lex(a.match_id,b.match_id) || lex(a.family,b.family) ||
    lex(a.market_type,b.market_type) || compareLine(a.outcome_line ?? a.line,b.outcome_line ?? b.line) ||
    (Number(a.outcome_index ?? 0)-Number(b.outcome_index ?? 0)) || lex(a.outcome_id,b.outcome_id);
}
function numberOutcomes(rows) {
  const matchIds = [...new Set(rows.map(row => row.match_id))].sort((a,b) => {
    const start = id => rows.find(row => row.match_id === id)?.game_start_time;
    return lex(start(a),start(b)) || lex(a,b);
  });
  const matchNumbers = new Map(matchIds.map((id,i) => [id,`M${String(i+1).padStart(2,'0')}`]));
  return rows.slice().sort(compareOutcomes).map((row,i) => ({...row,num:`W${String(i+1).padStart(3,'0')}`,
    match_num:matchNumbers.get(row.match_id)}));
}
function slimRow(row) {
  const fill = row.depth?.buy_scenarios?.find(item => Number(item.requested_usd) === 100);
  return {num:row.num,match_num:row.match_num,match_title:row.match_title,league:row.league_name,
    start_utc:compactUtc(row.game_start_time),family:row.family,market_type:row.market_type,label:row.outcome_label,
    line:row.outcome_line ?? row.line,best_ask:row.best_ask,best_bid:row.best_bid,spread:row.spread,
    liq:row.liquidity,book_status:BOOK_STATUS_CODES[row.book_status]??row.book_status,
    book_age_ms:row.book_age_ms_at_observation ?? row.book_age_ms,
    fill100:fill?.fully_fillable,slip100_pp:fill?.slippage_pp,d24:row.price_change_24h_pp,
    jumps:row.price_history_quality?.large_jumps,model_p:row.model_probability,edge_pp:row.probability_difference_pp};
}
function makeSlim(rows,meta) {
  const header = ['# schema_version=1',`# snapshot_at=${meta.snapshot_at}`,`# snapshot_id=${meta.snapshot_id}`,
    `# source_sha256=${meta.source_sha256}`,`# count=${rows.length}`];
  return [...header,COLUMNS.join(','),...rows.map(row => {
    const flat = slimRow(row);
    return COLUMNS.map(column => csvCell(flat[column])).join(',');
  })].join('\n')+'\n';
}
function parseCsv(body) {
  const records=[]; let record=[], cell='', quoted=false;
  for (let i=0;i<body.length;i++) {
    const char=body[i];
    if (char === '"') {
      if (quoted && body[i+1] === '"') {cell+='"';i++;}
      else quoted=!quoted;
    } else if (char === ',' && !quoted) {record.push(cell);cell='';}
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && body[i+1] === '\n') i++;
      record.push(cell);cell='';
      if (record.some(value => value !== '')) records.push(record);
      record=[];
    } else cell+=char;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (record.length || cell) {record.push(cell);records.push(record);}
  return records;
}
function readSlim(file) {
  const contents=fs.readFileSync(file,'utf8'),meta={};
  let offset=0;
  while(contents.slice(offset).startsWith('# ')) {
    const end=contents.indexOf('\n',offset);
    if(end<0) throw new Error('Incomplete slim metadata');
    const line=contents.slice(offset+2,end).replace(/\r$/,''),at=line.indexOf('=');
    if(at<1) throw new Error('Invalid slim metadata');
    meta[line.slice(0,at)]=line.slice(at+1);offset=end+1;
  }
  const records=parseCsv(contents.slice(offset));
  const columns=records.shift()??[];
  if (columns.join(',') !== COLUMNS.join(',')) throw new Error('Unexpected slim columns');
  const rows=records.map(record => {
    if(record.length!==columns.length) throw new Error('Invalid slim row width');
    return Object.fromEntries(record.map((value,i) => [columns[i],value]));
  });
  if (Number(meta.count)!==rows.length) throw new Error('Slim count mismatch');
  return {meta,rows};
}
module.exports={COLUMNS,numberOutcomes,slimRow,makeSlim,readSlim,parseCsv,csvCell,BOOK_STATUS_CODES,compareOutcomes};
