// Rebuild V3 from a legacy market snapshot (including live historical-price lookups).
const fs=require('node:fs');const path=require('node:path');const {writeOutcomeExports}=require('./outcome-exports');
async function main(){
 const input=process.argv[2];if(!input)throw new Error('Usage: node build-catalog.js legacy-markets.jsonl output-dir');
 const rows=fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(JSON.parse);
 if(rows.some(r=>!Array.isArray(r.outcomes)))throw new Error('Expected a legacy market snapshot. V3 outcome files are already grouped in catalog.json and events/.');
 const snapshot=rows[0]?.snapshot_at;if(!snapshot)throw new Error('Input snapshot timestamp is required');
 const start=new Date(Date.parse(snapshot)+2*3600000).toISOString(),end=new Date(Date.parse(snapshot)+28*3600000).toISOString();
 const eligible=rows.filter(r=>r.liquidity>=20&&!require('./scanner').getExclusionReason(r.sport,{question:r.question,sportsMarketType:r.market_type,groupItemTitle:r.group_item_title,category:r.category,slug:r.market_slug},{title:r.event_title})&&Date.parse(r.game_start_time)>=Date.parse(start)&&Date.parse(r.game_start_time)<=Date.parse(end));
 const output=path.resolve(process.argv[3]||'out');
 const result=await writeOutcomeExports(eligible,output,{snapshot_at:snapshot,window_start:start,window_end:end,filters:require('./combo-policy').SCANNER_POLICY});
 const {rows:outcomes,unclassifiedRows,comboRows,...counts}=result;
 fs.writeFileSync(path.join(output,'index.json'),JSON.stringify({schema_version:3,scanner_version:'BET-X V3',rebuild:true,unclassified_separate:true,snapshot_at:snapshot,window_start:start,window_end:end,
   ...counts,unclassified_outcomes:unclassifiedRows.length,unclassified_markets:new Set(unclassifiedRows.map(r=>r.market_id)).size,filters:require('./combo-policy').SCANNER_POLICY,combo_policy:require('./combo-policy').COMBO_POLICY,combo_verification:result.verification,outcomes:outcomes.length,combo_outcomes:outcomes.filter(r=>r.combo_verified).length},null,2)+'\n');
 console.log(JSON.stringify(counts,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
