'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [source,indexFile,manifestFile,outDir] = process.argv.slice(2);
if (![source,indexFile,manifestFile,outDir].every(Boolean)) throw Error('Usage: node sheets-bridge.js MARKETS INDEX MANIFEST OUTPUT');
const bytes = fs.readFileSync(source);
const index = JSON.parse(fs.readFileSync(indexFile,'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestFile,'utf8'));
const sha = crypto.createHash('sha256').update(bytes).digest('hex');
if (manifest.files?.['markets.jsonl']?.sha256 !== sha) throw Error('Source checksum mismatch');
const lines=bytes.toString('utf8').split(/\r?\n/).filter(Boolean);
if (lines.length!==index.saved_outcomes) throw Error('Source count mismatch: '+lines.length+' vs '+index.saved_outcomes);
const fields=['sport','event_title','game_start_time','market_type','outcome','outcome_line','price','best_ask','best_bid','spread','liquidity','ask_size','ask_notional_usd','combo_status','event_combo_status','book_status','market_url','snapshot_at','event_id','match_id','market_id','condition_id','token_id','outcome_index','market_question','classification_status','league'];
const numeric=new Set(['outcome_line','price','best_ask','best_bid','spread','liquidity','ask_size','ask_notional_usd','outcome_index']);
const ids=new Set(), rows=[];
for(const line of lines){
 const r=JSON.parse(line);
 if(!r.token_id||ids.has(r.token_id)) throw Error('Missing or duplicate token ID '+r.token_id);
 ids.add(r.token_id);
 if(!(r.best_ask>0)||r.book_status!=='available') throw Error('Invalid saved book for token '+r.token_id);
 const row=fields.map(k=>{
   const v=r[k];
   if(v===null||v===undefined)return '';
   if(numeric.has(k))return Number.isFinite(v)?v:'';
   return String(v);
 });
 rows.push(row);
}
fs.mkdirSync(outDir,{recursive:true});
for(const file of fs.readdirSync(outDir)) if(/^part-\d{3}\.json$/.test(file)||file==='index.json')fs.unlinkSync(path.join(outDir,file));
const parts=[],chunk=200;
for(let i=0;i<rows.length;i+=chunk){
 const slice=rows.slice(i,i+chunk);
 const name='part-'+String(Math.floor(i/chunk)+1).padStart(3,'0')+'.json';
 const payload=JSON.stringify({start_row:i+2,rows:slice});
 const data=Buffer.from(payload+'\n','utf8');
 if(data.length>900000)throw Error('Part unexpectedly too large: '+name);
 fs.writeFileSync(path.join(outDir,name),data);
 parts.push({file:name,start_row:i+2,rows:slice.length,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});
}
fs.writeFileSync(path.join(outDir,'index.json'),JSON.stringify({source:'data/markets.jsonl',snapshot_at:index.snapshot_at,source_sha256:sha,columns:fields,rows:rows.length,parts},null,2)+'\n');
console.log(JSON.stringify({rows:rows.length,parts:parts.length,source_sha256:sha,bytes:bytes.length}));
