const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {numberOutcomes,makeSlim} = require('./slim');
const {buildCandidates} = require('./candidates');

const MAX_PAGE_BYTES = 60_000;
const PAGE_ROWS = 8;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const safe = value => String(value ?? 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
const countBy = (rows, key) => Object.fromEntries([...new Set(rows.map(row => String(row[key] ?? 'unknown')))].sort().map(value => [value, rows.filter(row => String(row[key] ?? 'unknown') === value).length]));
const sourceRows = source => fs.readFileSync(path.join(source, 'combo-markets.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const eligible = row => row.combo_verified === true && Number.isFinite(row.price) && row.price >= 0.8 && row.price < 0.95;
const modelFields = () => ({model_provider:null, model_probability:null, model_status:'not_connected', model_observed_at:null,
  model_market_match:null, probability_difference_pp:null, estimated_ev:null, analysis_notes:null});
function writeJson(root, name, object) {
  const body = JSON.stringify(object, null, 2) + '\n';
  if (Buffer.byteLength(body) > MAX_PAGE_BYTES) throw new Error(`Wide Combo page exceeds ${MAX_PAGE_BYTES} bytes: ${name}`);
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target, body);
  return {file:`wide-combo/${name.replaceAll('\\', '/')}`, count:object.outcomes?.length ?? object.count ?? null, bytes:Buffer.byteLength(body)};
}
function pages(root, prefix, rows, meta) {
  const result = []; let batch = [];
  const flush = () => { if (!batch.length) return;
    result.push(writeJson(root, `${prefix}/page-${String(result.length + 1).padStart(3,'0')}.json`, {...meta, count:batch.length, outcomes:batch})); batch = [];
  };
  for (const row of rows) {
    const next = [...batch, row];
    if (batch.length && (batch.length >= PAGE_ROWS || Buffer.byteLength(JSON.stringify({...meta,count:next.length,outcomes:next},null,2)+'\n') > MAX_PAGE_BYTES)) flush();
    batch.push(row);
    if (Buffer.byteLength(JSON.stringify({...meta,count:1,outcomes:batch},null,2)+'\n') > MAX_PAGE_BYTES && batch.length === 1) throw new Error(`Single outcome exceeds page limit: ${row.outcome_id}`);
  }
  flush(); return result;
}
function build(source, output = path.join(source, 'wide-combo'), options = {}) {
  const input = fs.readFileSync(path.join(source, 'combo-markets.jsonl'));
  const rows = sourceRows(source);
  const sourceHash = sha(input), snapshotAt = rows[0]?.snapshot_at ?? JSON.parse(fs.readFileSync(path.join(source,'index.json'),'utf8')).snapshot_at;
  if (!snapshotAt || rows.some(row => row.snapshot_at !== snapshotAt)) throw new Error('Mixed Combo snapshots');
  const selected = rows.filter(eligible);
  if (new Set(selected.map(row => row.outcome_id)).size !== selected.length) throw new Error('Duplicate Wide Combo outcome ID');
  const snapshotId = sha(`${snapshotAt}:${sourceHash}`).slice(0,20);
  const meta = {schema_version:1, snapshot_at:snapshotAt, snapshot_id:snapshotId, source_file:'combo-markets.jsonl', source_sha256:sourceHash};
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'betx-wide-'));
  try {
    const enriched = numberOutcomes(selected.map(row => ({...row, ...modelFields(), source_snapshot_id:snapshotId,
      market_url:row.market_slug ? `https://polymarket.com/event/${row.event_slug}?tid=${row.token_id ?? ''}` : null,
      event_url:row.event_slug ? `https://polymarket.com/event/${row.event_slug}` : null})));
    const groups = [], sports = [], fullPageByNum = new Map();
    for (const sport of [...new Set(enriched.map(row => row.sport))].sort()) {
      const sportRows = enriched.filter(row => row.sport === sport), families = [];
      for (const family of [...new Set(sportRows.map(row => row.family))].sort()) {
        const groupRows = sportRows.filter(row => row.family === family);
        const folder = `sports/${safe(sport)}/${safe(family)}`;
        const groupPages = pages(stage,folder,groupRows,{...meta,sport,family});
        let offset=0;
        for(const page of groupPages) {
          for(const row of groupRows.slice(offset,offset+page.count)) fullPageByNum.set(row.num,page.file);
          offset+=page.count;
        }
        const group = {sport,family,count:groupRows.length,pages:groupPages};
        writeJson(stage,`${folder}/index.json`,{...meta,...group});
        families.push({family,count:groupRows.length,index:`wide-combo/${folder}/index.json`}); groups.push(group);
      }
      writeJson(stage,`sports/${safe(sport)}/index.json`,{...meta,sport,count:sportRows.length,families});
      sports.push({sport,count:sportRows.length,index:`wide-combo/sports/${safe(sport)}/index.json`});
    }
    const events = [...new Set(enriched.map(row => row.match_id))].sort().map(matchId => {
      const eventRows = enriched.filter(row => row.match_id === matchId), first = eventRows[0];
      return {match_id:matchId,match_title:first.match_title,sport:first.sport,league_code:first.league_code,
        league_name:first.league_name,game_start_time:first.game_start_time,count:eventRows.length,
        outcome_ids:eventRows.map(row => row.outcome_id)};
    });
    const eventPages = pages(stage,'events',events,{...meta,kind:'event_catalog'});
    const liquidityPages = pages(stage,'rankings/liquidity',enriched.slice().sort((a,b) => (b.liquidity ?? -1)-(a.liquidity ?? -1) || a.outcome_id.localeCompare(b.outcome_id)),{...meta,kind:'liquidity_ranking'});
    const slim=makeSlim(enriched,meta),slimBytes=Buffer.byteLength(slim);
    if(slimBytes>200_000) throw new Error(`Wide Combo slim.csv exceeds 200 KB: ${slimBytes}`);
    fs.writeFileSync(path.join(stage,'slim.csv'),slim);
    const candidateAudit=buildCandidates(stage,options);
    const idMap={...meta,count:enriched.length,items:enriched.map(row => ({num:row.num,match_num:row.match_num,
      outcome_id:row.outcome_id,token_id:row.token_id??null,market_url:row.market_url,full_page:fullPageByNum.get(row.num)}))};
    fs.writeFileSync(path.join(stage,'id-map.json'),JSON.stringify(idMap,null,2)+'\n');
    const index = {...meta,source_outcomes:rows.length,outcomes:enriched.length,matches:events.length,markets:new Set(enriched.map(row => row.market_id)).size,
      probability:{minimum_inclusive:0.8,maximum_exclusive:0.95},model_status:'not_connected',by_sport:countBy(enriched,'sport'),
      by_family:countBy(enriched,'family'),by_market_type:countBy(enriched,'market_type'),sports,
      events:{count:events.length,pages:eventPages},liquidity_ranking:{count:enriched.length,pages:liquidityPages},
      slim:{file:'wide-combo/slim.csv',count:enriched.length,bytes:slimBytes},id_map:{file:'wide-combo/id-map.json',count:enriched.length},
      candidates:{file:'wide-combo/candidates.csv',count:candidateAudit.candidates,status:candidateAudit.policy_status,
        until_utc:candidateAudit.until_utc,audit:'wide-combo/candidates-audit.json',policy:'wide-combo/policy.json'},
      max_page_bytes:MAX_PAGE_BYTES};
    writeJson(stage,'index.json',index);
    fs.copyFileSync(path.join(__dirname,'README.md'),path.join(stage,'README.md'));
    fs.copyFileSync(path.join(__dirname,'PROMPT.md'),path.join(stage,'PROMPT.md'));
    fs.mkdirSync(path.dirname(output),{recursive:true});
    if (fs.existsSync(output)) fs.rmSync(output,{recursive:true,force:true});
    fs.renameSync(stage,output);
    return index;
  } catch (error) {fs.rmSync(stage,{recursive:true,force:true}); throw error;}
}
if (require.main === module) {
  try {const source = process.argv[2] ?? 'out',at=process.argv.indexOf('--until');
    console.log(JSON.stringify(build(source,path.join(source,'wide-combo'),{until:at>=0?process.argv[at+1]:null}),null,2));}
  catch (error) {console.error(error.stack); process.exitCode=1;}
}
module.exports={build,eligible,modelFields,MAX_PAGE_BYTES};
