const fs = require('node:fs');
const {refreshCandidates} = require('./refresh-candidates');
const {checkCompatibility} = require('./candidate-policy');
async function main() {
  const [input,...ids] = process.argv.slice(2);
  if (!input || ids.length < 2) throw new Error('Usage: node check-combo.js INPUT.jsonl OUTCOME_ID OUTCOME_ID [...]');
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate selected outcome');
  const rows = fs.readFileSync(input,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const selected = ids.map(id=>{const matches=rows.filter(r=>r.outcome_id===id);if(matches.length!==1)throw new Error(`Missing or ambiguous outcome ${id}`);return matches[0];});
  const refreshed = await refreshCandidates(selected);
  const result = checkCompatibility(refreshed.outcomes);
  if (refreshed.outcomes.length !== selected.length) { result.local_status='rejected';result.combo_compatible=false;result.errors.push('one_or_more_selected_legs_failed_refresh'); }
  console.log(JSON.stringify({checked_at:new Date().toISOString(),...result,rejected:refreshed.rejected,legs:refreshed.outcomes},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
