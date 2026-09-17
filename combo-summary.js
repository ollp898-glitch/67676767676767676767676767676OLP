const {createHash} = require('node:crypto');
const CORNER_FAMILIES = new Set(['corners_totals','corners_team_totals']);
const isCorner = row => CORNER_FAMILIES.has(row.family);
const count = (rows,key) => Object.fromEntries([...new Set(rows.map(r=>String(r[key] ?? 'unknown')))].sort()
  .map(value=>[value,rows.filter(r=>String(r[key] ?? 'unknown')===value).length]));
const jsonlText = rows => rows.map(r=>JSON.stringify(r)).join('\n')+(rows.length?'\n':'');
function buildComboSummary(rows,metadata,verification) {
  const corners=rows.filter(isCorner), text=jsonlText(rows);
  return {schema_version:1,snapshot_at:metadata.snapshot_at,
    source_file:'combo-markets.jsonl',source_bytes:Buffer.byteLength(text),
    source_sha256:createHash('sha256').update(text).digest('hex'),
    scope:'strategy_filtered_verified_single_legs_70plus',minimum_probability:0.7,
    maximum_probability_exclusive:0.96,verification_scope:'single_leg',
    represents_all_provider_combo_markets:false,requires_live_refresh:true,
    catalog_verification:verification,
    outcomes:rows.length,markets:new Set(rows.map(r=>r.market_id)).size,matches:new Set(rows.map(r=>r.match_id)).size,
    by_market_type:count(rows,'market_type'),by_family:count(rows,'family'),by_sport:count(rows,'sport'),
    book_status_at_observation:count(rows,'book_status'),
    corners:{file:'combo-corners.jsonl',outcomes:corners.length,markets:new Set(corners.map(r=>r.market_id)).size,
      matches:new Set(corners.map(r=>r.match_id)).size,by_market_type:count(corners,'market_type'),
      by_family:count(corners,'family'),by_period:count(corners,'period')},
    warnings:[...(verification.coverage_complete === true ? [] : ['combo_catalog_coverage_incomplete']),
      'snapshot_prices_are_not_current_execution_quotes','combination_not_provider_verified']};
}
module.exports={buildComboSummary,isCorner,jsonlText};
