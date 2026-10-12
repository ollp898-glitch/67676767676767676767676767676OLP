const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {eligible,MAX_PAGE_BYTES} = require('./build');
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
  const seen = new Map(), groupCounts = {};
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
  for (const row of expected) {
    const published = seen.get(row.outcome_id);
    for (const [key,value] of Object.entries(row)) assert.deepEqual(published[key],value,`Changed source field ${key} on ${row.outcome_id}`);
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
