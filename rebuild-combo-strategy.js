// Reapply only strategy sport exclusions to an already verified scanner snapshot.
// Prices, timestamps, raw rows and the General Scanner files are never rewritten.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {COMBO_POLICY}=require('./combo-policy');
const {excludedSport,strategyExclusions}=require('./combo-strategy');
const {buildComboSummary,isCorner,jsonlText}=require('./combo-summary');
function rebuild(dir){
 const read=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')),write=(f,v)=>fs.writeFileSync(path.join(dir,f),JSON.stringify(v,null,2)+'\n');
 const rows=f=>fs.readFileSync(path.join(dir,f),'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
 const index=read('index.json'),before=rows('combo-markets.jsonl'),general=rows('markets.jsonl'),unknown=read('unclassified-outcomes.json').outcomes;
 for(const key of ['min_start_hours','max_start_hours','min_liquidity_usd','minimum_probability','maximum_probability_exclusive'])assert.equal(index.combo_policy[key],COMBO_POLICY[key],'Only sport policy may be migrated');
 const selected=before.filter(r=>!excludedSport(r)),ids=new Set(selected.map(r=>r.outcome_id)),counts=strategyExclusions([...general,...unknown]);
 index.combo_policy=COMBO_POLICY;index.combo_verification.strategy_exclusions=counts;
 const high=read('high-probability-markets.json');high.filters=COMBO_POLICY;
 const count=r=>new Set(r.map(x=>x.market_id)).size;
 high.sports=high.sports.flatMap(s=>{const leagues=s.leagues.flatMap(l=>{const events=l.events.flatMap(e=>{const sections=e.sections.flatMap(section=>{const outcomes=section.outcomes.filter(r=>ids.has(r.outcome_id));return outcomes.length?[{...section,outcomes,outcomes_count:outcomes.length,markets_count:count(outcomes)}]:[];});const outcomes=sections.flatMap(x=>x.outcomes);return outcomes.length?[{...e,sections,outcomes_count:outcomes.length,markets_count:count(outcomes),combo_markets_count:count(outcomes)}]:[];});return events.length?[{...l,events}]:[];});return leagues.length?[{...s,leagues}]:[];});
 Object.assign(high,{outcomes_count:selected.length,markets_count:count(selected),events_count:new Set(selected.map(r=>r.match_id)).size});
 for(const file of ['combo-markets.jsonl','high-probability-outcomes.jsonl'])fs.writeFileSync(path.join(dir,file),jsonlText(selected));
 write('high-probability-markets.json',high);fs.writeFileSync(path.join(dir,'combo-corners.jsonl'),jsonlText(selected.filter(isCorner)));
 const summary=buildComboSummary(selected,index,index.combo_verification);write('combo-summary.json',summary);
 const audit=read('candidate-audit.json');audit.verification=index.combo_verification;audit.strategy_exclusions=counts;
 const entries=new Map(audit.excluded.map(r=>[r.outcome_id,r]));for(const r of general.filter(excludedSport)){const prev=entries.get(r.outcome_id);entries.set(r.outcome_id,{...prev,outcome_id:r.outcome_id,sport:r.sport,outcome_label:r.outcome_label,price:r.price,reasons:[...new Set([...(prev?.reasons||[]),'sport_not_in_combo_strategy'])],combo_verification_status:r.combo_verification_status});}audit.excluded=[...entries.values()];write('candidate-audit.json',audit);
 index.combo_outcomes=selected.length;Object.assign(index.high_probability_catalog,{outcomes:selected.length,markets:high.markets_count,events:high.events_count});Object.assign(index.combo_summary,{outcomes:selected.length,corners:summary.corners.outcomes});
 index.chat_reader=require('./chat-reader').writeChatReader(general,dir,index,index.combo_verification,selected);write('index.json',index);
 return {before:before.length,after:selected.length,strategy_exclusions:counts};
}
module.exports={rebuild};if(require.main===module)console.log(JSON.stringify(rebuild(process.argv[2]||'out')));
