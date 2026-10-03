// One source of truth for shortlist, live refresh and validation.
const COMBO_POLICY=Object.freeze({version:2,min_start_hours:2,max_start_hours:30,min_liquidity_usd:50,minimum_probability:0.55,maximum_probability_exclusive:0.95});
const priceAllowed=p=>Number.isFinite(p)&&p>=COMBO_POLICY.minimum_probability&&p<COMBO_POLICY.maximum_probability_exclusive;
const liquidityAllowed=n=>Number.isFinite(n)&&n>=COMBO_POLICY.min_liquidity_usd;
function windowAllowed(start,reference){const s=Date.parse(start),r=typeof reference==='number'?reference:Date.parse(reference);return Number.isFinite(s)&&Number.isFinite(r)&&s>=r+COMBO_POLICY.min_start_hours*3600000&&s<=r+COMBO_POLICY.max_start_hours*3600000;}
function meetsComboLimits(row){return priceAllowed(row.price)&&liquidityAllowed(row.liquidity)&&windowAllowed(row.game_start_time,row.live_refreshed_at||row.snapshot_at);}
module.exports={COMBO_POLICY,priceAllowed,liquidityAllowed,windowAllowed,meetsComboLimits};
