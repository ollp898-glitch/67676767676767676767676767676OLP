const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {eligible,MAX_PAGE_BYTES} = require('./build');
const {COLUMNS,numberOutcomes,slimRow,readSlim} = require('./slim');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function validate(source, root = path.join(source,'wide-combo')) {
  const input = fs.readFileSync(path.join(source,'combo-markets.jsonl'));
  const original = input.toString('utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const expected = original.filter(eligible);
  const index = JSON.parse(fs.readFileSync(path.join(root,'index.json'),'utf8'));
  assert.equal(index.source_sha256,sha(input));
  assert.equal(index.source_outcomes,original.length);
  assert.equal(index.outcomes,expected.length);
  assert.equal(index.snapshot_at,original[0]?.snapshot_at ?? index.snapshot_at);
  const seen = new Map(), fullPages = new Map(), groupCounts = {};
  const read = file => {
    assert(file.startsWith('wide-combo/') && !file.includes('..'));
    const data = fs.readFileSync(path.join(source,file));
    assert(data.length <= MAX_PAGE_BYTES,`Oversized file: ${file}`);
    const doc = JSON.parse(data);
    assert.equal(doc.snapshot_id,index.snapshot_id);
    assert.equal(doc.snapshot_at,index.snapshot_at);
    assert.equal(doc.source_sha256,index.source_sha256);
    return doc;
  };
  for (const sport of index.sports) {
    const sportIndex = read(sport.index);
    let sportCount = 0;
    for (const family of sportIndex.families) {
      const group = read(family.index);
      let count = 0;
      for (const page of group.pages) {
        const doc = read(page.file);
        assert.equal(doc.count,doc.outcomes.length);
        assert.equal(page.count,doc.count);
        assert(doc.outcomes.length <= 8);
        for (const row of doc.outcomes) {
          assert(eligible(row));
          assert.equal(row.sport,sport.sport); assert.equal(row.family,family.family);
          assert.equal(row.source_snapshot_id,index.snapshot_id);
          assert.equal(row.model_status,'not_connected');
          for (const key of ['model_provider','model_probability','model_observed_at','model_market_match','probability_difference_pp','estimated_ev','analysis_notes']) assert.equal(row[key],null);
          assert(!seen.has(row.outcome_id),`Duplicate outcome: ${row.outcome_id}`);
          seen.set(row.outcome_id,row);
          fullPages.set(row.num,page.file);
        }
        count += doc.count;
      }
      assert.equal(count,group.count); assert.equal(count,family.count);
      groupCounts[`${sport.sport}/${family.family}`]=count;
      sportCount += count;
    }
    assert.equal(sportCount,sport.count);
    assert.equal(sportCount,index.by_sport[sport.sport]);
  }
  assert.equal(seen.size,index.outcomes);
  assert.deepEqual([...seen.keys()].sort(),expected.map(row=>row.outcome_id).sort());
  const numbered=numberOutcomes(expected),byNum=new Map(numbered.map(row=>[row.num,row]));
  for (const row of expected) {
    const published = seen.get(row.outcome_id);
    for (const [key,value] of Object.entries(row)) assert.deepEqual(published[key],value,`Changed source field ${key} on ${row.outcome_id}`);
  }
  assert.equal(index.slim?.file,'wide-combo/slim.csv');
  const slimBytes=fs.readFileSync(path.join(source,index.slim.file));
  assert(slimBytes.length<=200_000,'Oversized slim.csv');
  assert.equal(index.slim.bytes,slimBytes.length);
  const slim=readSlim(path.join(source,index.slim.file));
  for(const key of ['snapshot_at','snapshot_id','source_sha256']) assert.equal(slim.meta[key],index[key]);
  assert.equal(slim.rows.length,index.outcomes);
  assert.equal(index.slim.count,index.outcomes);
  assert.deepEqual(slim.rows.map(row=>row.num),numbered.map(row=>row.num));
  for(const flat of slim.rows) {
    const numberedRow=byNum.get(flat.num),published=seen.get(numberedRow?.outcome_id);
    assert(published,`Unknown slim number: ${flat.num}`);
    assert.equal(published.num,flat.num);
    assert.equal(published.match_num,numberedRow.match_num);
    const expectedFlat=slimRow(published);
    for(const column of COLUMNS) assert.equal(flat[column],expectedFlat[column]==null?'':String(expectedFlat[column]),`Wrong slim ${column} on ${flat.num}`);
  }
  assert.equal(index.id_map?.file,'wide-combo/id-map.json');
  const idMap=JSON.parse(fs.readFileSync(path.join(source,index.id_map.file),'utf8'));
  for(const key of ['snapshot_at','snapshot_id','source_sha256']) assert.equal(idMap[key],index[key]);
  assert.equal(idMap.count,index.outcomes);assert.equal(index.id_map.count,index.outcomes);
  assert.deepEqual(idMap.items.map(item=>item.num),numbered.map(row=>row.num));
  for(const item of idMap.items) {
    const row=seen.get(item.outcome_id);
    assert(row,`Unknown mapped outcome: ${item.outcome_id}`);
    assert.equal(item.num,row.num);assert.equal(item.match_num,row.match_num);
    assert.equal(item.token_id,row.token_id??null);assert.equal(item.market_url,row.market_url);
    assert.equal(item.full_page,fullPages.get(item.num));
  }
  let events=0; for(const page of index.events.pages) {const doc=read(page.file);events+=doc.count; assert.equal(doc.count,doc.outcomes.length);}
  assert.equal(events,index.matches);
  let ranked=0; for(const page of index.liquidity_ranking.pages) {const doc=read(page.file);ranked+=doc.count; assert.equal(doc.count,doc.outcomes.length);}
  assert.equal(ranked,index.outcomes);
  return {source_outcomes:original.length,wide_outcomes:seen.size,groups:groupCounts};
}
if (require.main === module) {
  try {console.log(JSON.stringify(validate(process.argv[2] ?? 'out'),null,2));}
  catch (error) {console.error(error.stack);process.exitCode=1;}
}
module.exports={validate};
