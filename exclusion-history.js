'use strict';
// The data branch is force-republished, so carry this bounded audit forward.
const fs=require('node:fs');
function parse(text){return String(text||'').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));}
function mergeHistory(previous,current,limit=730){
 if(!Number.isInteger(limit)||limit<1)throw Error('Invalid history limit');
 const entries=new Map();
 for(const item of [...previous,...current]){
  if(!item||typeof item.snapshot_at!=='string'||!Number.isFinite(Date.parse(item.snapshot_at))||
    !Array.isArray(item.by_reason)||!Array.isArray(item.unrecognized_types))
   throw Error('Malformed exclusion history entry');
  entries.set(item.snapshot_at,item);
 }
 return [...entries.values()].sort((a,b)=>a.snapshot_at.localeCompare(b.snapshot_at)).slice(-limit);
}
function mergeFiles(priorFile,currentFile){
 const prior=fs.existsSync(priorFile)?parse(fs.readFileSync(priorFile,'utf8')):[];
 const current=parse(fs.readFileSync(currentFile,'utf8'));
 if(current.length!==1)throw Error('Expected one current scan history record');
 const result=mergeHistory(prior,current),tmp=currentFile+'.tmp';
 fs.writeFileSync(tmp,result.map(x=>JSON.stringify(x)).join('\n')+'\n');
 fs.renameSync(tmp,currentFile);return result.length;
}
if(require.main===module){
 try{console.log('Exclusion history snapshots: '+mergeFiles(process.argv[2],process.argv[3]));}
 catch(error){console.error(error);process.exitCode=1;}
}
module.exports={parse,mergeHistory,mergeFiles};
