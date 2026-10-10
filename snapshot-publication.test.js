const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {prepareSnapshot,readPreparedFile,materializeSnapshot,repackSnapshot,restoreFromGit}=require('./snapshot-publication');
const {downloadSnapshotFile}=require('./download-snapshot');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'betx-publication-'));
async function main(){try{
  const source=path.join(root,'source'),dest=path.join(root,'published');fs.mkdirSync(source);
  for(const file of ['markets.jsonl','combo-markets.jsonl','high-probability-outcomes.jsonl','index.json','events.json','catalog.json','high-probability-markets.json','line-ladders.json','unclassified-outcomes.json','candidate-audit.json','combo-summary.json','combo-corners.jsonl','CHAT-START.md','README.md','chat-manifest.json']){
    const content=file==='markets.jsonl'?'{"id":1,"price_6h_ago":0.8,"liquidity":25,"depth":{"bid":12}}\n'.repeat(8):file==='line-ladders.json'?JSON.stringify({lines:'x'.repeat(120)}):file==='high-probability-markets.json'?JSON.stringify({sports:'y'.repeat(120)}):file;
    fs.writeFileSync(path.join(source,file),content);
  }
  fs.mkdirSync(path.join(source,'chat'));fs.writeFileSync(path.join(source,'chat','page.json'),'reader');
  const manifest=prepareSnapshot(source,dest,{maxFileBytes:100,partBytes:60});
  assert.equal(manifest.schema_version,2);
  assert.equal(Object.keys(manifest.files).length,16);
  const boundary=path.join(root,'boundary');fs.mkdirSync(boundary);fs.cpSync(source,boundary,{recursive:true});
  fs.writeFileSync(path.join(boundary,'catalog.json'),'x'.repeat(100));
  fs.writeFileSync(path.join(boundary,'events.json'),'x'.repeat(101));
  const boundaryPublished=path.join(root,'boundary-published'),boundaryManifest=prepareSnapshot(boundary,boundaryPublished,{maxFileBytes:100,partBytes:60});
  assert(fs.existsSync(path.join(boundaryPublished,'catalog.json')));
  assert(!boundaryManifest.split_files['catalog.json']);
  assert(boundaryManifest.split_files['events.json']);
  assert.deepEqual(readPreparedFile(boundaryPublished,'events.json'),fs.readFileSync(path.join(boundary,'events.json')));
  assert(manifest.split_files['markets.jsonl'].parts.length>1);
  assert(manifest.split_files['line-ladders.json'].parts.length>1);
  assert(manifest.split_files['high-probability-markets.json'].parts.length>1);
  assert(!fs.existsSync(path.join(dest,'markets.jsonl')));
  assert.deepEqual(readPreparedFile(dest,'markets.jsonl'),fs.readFileSync(path.join(source,'markets.jsonl')));
  for(const name of ['line-ladders.json','high-probability-markets.json'])assert.deepEqual(readPreparedFile(dest,name),fs.readFileSync(path.join(source,name)));
  assert.equal(fs.readFileSync(path.join(dest,'chat','page.json'),'utf8'),'reader');
  const fetcher=async url=>{const name=url.slice(url.indexOf('/data/')+6);const file=path.join(dest,name);return fs.existsSync(file)?{ok:true,arrayBuffer:async()=>fs.readFileSync(file)}:{ok:false,status:404};};
  for(const name of ['markets.jsonl','line-ladders.json','high-probability-markets.json','combo-markets.jsonl'])assert.deepEqual(await downloadSnapshotFile(name,{fetcher}),fs.readFileSync(path.join(source,name)));
  await assert.rejects(downloadSnapshotFile('missing.json',{fetcher}),/absent/);
  for(const item of Object.values(manifest.split_files))for(const part of item.parts)assert(fs.statSync(path.join(dest,part.file)).size<100);
  const published={read:(_ref,name)=>fs.readFileSync(path.join(dest,name)),exists:(_ref,name)=>fs.existsSync(path.join(dest,name))};
  const target=path.join(root,'restored.jsonl');restoreFromGit('HEAD','markets.jsonl',target,published);
  assert.deepEqual(fs.readFileSync(target),fs.readFileSync(path.join(source,'markets.jsonl')));
  const legacy=path.join(root,'legacy.jsonl');restoreFromGit('HEAD','combo-markets.jsonl',legacy,{read:(_ref,name)=>fs.readFileSync(path.join(source,name)),exists:()=>false});
  assert.deepEqual(fs.readFileSync(legacy),fs.readFileSync(path.join(source,'combo-markets.jsonl')));
  const materialized=materializeSnapshot(dest);assert(materialized.includes('markets.jsonl'));
  assert.deepEqual(fs.readFileSync(path.join(dest,'markets.jsonl')),fs.readFileSync(path.join(source,'markets.jsonl')));
  fs.writeFileSync(path.join(dest,'high-probability-markets.json'),'{"updated":true}\n');
  repackSnapshot(dest,{maxFileBytes:100,partBytes:60});
  assert(!fs.existsSync(path.join(dest,'markets.jsonl')));
  assert.deepEqual(readPreparedFile(dest,'markets.jsonl'),fs.readFileSync(path.join(source,'markets.jsonl')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dest,'high-probability-markets.json'),'utf8')),{updated:true});
  const first=manifest.split_files['markets.jsonl'].parts[0].file;fs.appendFileSync(path.join(dest,first),'corrupt');
  assert.throws(()=>readPreparedFile(dest,'markets.jsonl'),/Corrupt/);
  await assert.rejects(downloadSnapshotFile('markets.jsonl',{fetcher}),/Corrupt/);
  fs.appendFileSync(path.join(dest,'combo-markets.jsonl'),'stale');
  assert.throws(()=>readPreparedFile(dest,'combo-markets.jsonl'),/Corrupt/);
  await assert.rejects(downloadSnapshotFile('combo-markets.jsonl',{fetcher}),/Corrupt/);
  console.log('Publication tests passed: exact parts, checksums, Chat Reader copy, legacy and split reconstruction.');
}finally{fs.rmSync(root,{recursive:true,force:true});}}
main().catch(error=>{console.error(error);process.exitCode=1;});
