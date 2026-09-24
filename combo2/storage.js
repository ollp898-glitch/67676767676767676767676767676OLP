const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const MAX_BYTES=60000;
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const key=x=>hash(String(x)).slice(0,24);
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const text=JSON.stringify(value,null,2)+'\n';if(Buffer.byteLength(text)>MAX_BYTES)throw new Error(`File exceeds ${MAX_BYTES} bytes: ${file}`);const tmp=file+'.tmp';fs.writeFileSync(tmp,text);fs.renameSync(tmp,file);}
function read(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function source(dir){const bytes=fs.readFileSync(path.join(dir,'combo-markets.jsonl'));const rows=bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);const stamps=new Set(rows.map(r=>r.snapshot_at));if(stamps.size>1)throw new Error('Mixed source snapshots');const ids=new Set();for(const r of rows){if(!r.outcome_id||!r.match_id||!r.market_id||ids.has(r.outcome_id))throw new Error('Missing/duplicate source identity');ids.add(r.outcome_id);}return {rows,sha256:hash(bytes),snapshot_at:rows[0]?.snapshot_at??null,snapshot_id:hash(bytes).slice(0,20)};}
module.exports={MAX_BYTES,hash,key,write,read,source};
