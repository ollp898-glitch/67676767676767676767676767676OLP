const fs=require('node:fs'),path=require('node:path');
// Bounded files keep rejection evidence usable even when the feed is large.
function createAudit(outDir,snapshot_at){
 const dir=path.join(outDir,'scanner-audit');fs.mkdirSync(dir,{recursive:true});
 for(const name of fs.readdirSync(dir))if(/^(part-\d+\.jsonl|index\.json)$/.test(name))fs.unlinkSync(path.join(dir,name));
 const counts={},pages=[];let batch=[];
 function flush(){if(!batch.length)return;const file=`part-${pages.length+1}.jsonl`;fs.writeFileSync(path.join(dir,file),batch.map(JSON.stringify).join('\n')+'\n');pages.push({file,records:batch.length});batch=[];}
 function record(reason,market,scope='ordinary',details={}){counts[`${scope}:${reason}`]=(counts[`${scope}:${reason}`]||0)+1;batch.push({snapshot_at,scope,reason,market_id:market.id??null,source_event_ids:(market.events||[]).map(e=>e.id),raw_market:market,...details});if(batch.length>=100)flush();}
 function finish(extra={}){flush();const result={snapshot_at,scope:'Every market returned by the sports feed; closed markets are outside the requested active feed',counts,pages,...extra};fs.writeFileSync(path.join(dir,'index.json'),JSON.stringify(result,null,2)+'\n');return {file:'scanner-audit/index.json',counts,records:pages.reduce((n,p)=>n+p.records,0)};}
 return {record,finish};
}
module.exports={createAudit};
