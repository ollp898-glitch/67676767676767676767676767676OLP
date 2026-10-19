'use strict';
// Reasons may overlap. Unrecognized means excluded from SELECTION, not erased.
const LABELS=Object.freeze({
  invalid_market_data:'Некорректные данные рынка',duplicate_market:'Повтор рынка',
  market_closed:'Рынок закрыт',market_inactive:'Рынок неактивен',market_live:'Матч уже идёт',
  outside_time_window:'Вне временного окна',duplicate_outcome:'Повтор исхода',
  invalid_price:'Недопустимая цена',price_below_5:'Цена ниже 5%',price_above_95:'Цена выше 95%',
  market_not_tradable:'Торговля недоступна',no_ask:'В стакане нет Ask',
  book_unverified:'Стакан не подтверждён',unclassified_market_type:'Тип рынка не распознан',
  excluded_sport:'Вид спорта исключён настройками сканера'
});
function buildExclusionAudit(excluded,unrecognized,rows,snapshotAt){
 const byReason=new Map(),allMarketIds=new Set(),byExcludedSport=new Map();
 for(const item of excluded){
  const reason=String(item.reason);
  if(!byReason.has(reason))byReason.set(reason,{reason,description_ru:LABELS[reason]||reason,
    stage:reason==='unclassified_market_type'?'selection':'screening',
    records:0,market_records:0,outcome_records:0,market_ids:new Set(),outcome_ids:new Set(),book_statuses:{}});
  const g=byReason.get(reason);g.records++;
  if(item.scope==='market')g.market_records++;
  if(item.scope==='outcome')g.outcome_records++;
  if(item.market_id!=null&&item.market_id!==''){
   g.market_ids.add(String(item.market_id));allMarketIds.add(String(item.market_id));
   if(item.scope==='outcome')g.outcome_ids.add(String(item.market_id)+':'+String(item.outcome_index??item.token_id??'unknown'));
  }
  if(item.book_status)g.book_statuses[item.book_status]=(g.book_statuses[item.book_status]||0)+1;
  if(reason==='excluded_sport'){
   const sport=String(item.sport||'other');
   if(!byExcludedSport.has(sport))byExcludedSport.set(sport,{sport,records:0,market_ids:new Set()});
   const stat=byExcludedSport.get(sport);stat.records++;
   if(item.market_id!=null&&item.market_id!=='')stat.market_ids.add(String(item.market_id));
  }
 }
 const reasons=[...byReason.values()].map(x=>({
  reason:x.reason,description_ru:x.description_ru,stage:x.stage,records:x.records,
  market_records:x.market_records,outcome_records:x.outcome_records,
  unique_markets:x.market_ids.size,unique_outcomes:x.outcome_ids.size,
  ...(Object.keys(x.book_statuses).length?{book_statuses:x.book_statuses}:{})
 })).sort((a,b)=>b.records-a.records||a.reason.localeCompare(b.reason));
 const excludedSports=[...byExcludedSport.values()].map(x=>({
  sport:x.sport,records:x.records,unique_markets:x.market_ids.size
 })).sort((a,b)=>b.unique_markets-a.unique_markets||a.sport.localeCompare(b.sport));
 const saved=rows.filter(x=>x.classification_status==='unclassified');
 const savedByMarket=new Map();
 for(const row of saved)savedByMarket.set(String(row.market_id),(savedByMarket.get(String(row.market_id))||0)+1);
 const types=new Map();
 for(const market of unrecognized){
  const key=market.market_type==null||market.market_type===''?'__MISSING__':String(market.market_type);
  if(!types.has(key))types.set(key,{market_type:key==='__MISSING__'?null:key,
    markets:0,source_outcomes:0,saved_outcomes:0,saved_markets:0});
  const t=types.get(key);t.markets++;t.source_outcomes+=market.outcome_count;
  const count=savedByMarket.get(String(market.market_id))||0;
  t.saved_outcomes+=count;if(count)t.saved_markets++;
 }
 return {
  schema_version:1,snapshot_at:snapshotAt,
  counts:{exclusion_records:excluded.length,excluded_unique_markets:allMarketIds.size,
   excluded_sport_markets:new Set(excluded.filter(x=>x.reason==='excluded_sport').map(x=>String(x.market_id))).size,
   unrecognized_markets:unrecognized.length,
   unrecognized_source_outcomes:unrecognized.reduce((sum,m)=>sum+m.outcome_count,0),
   unrecognized_saved_markets:new Set(saved.map(x=>String(x.market_id))).size,
   unrecognized_saved_outcomes:saved.length},
  counting_note:'Reasons may overlap. Unique market counts per reason must not be summed. Unrecognized markets are retained in raw catalog for audit but excluded from selection.',
  reasons,excluded_sports:excludedSports,unrecognized_types:[...types.values()].sort((a,b)=>b.markets-a.markets||String(a.market_type).localeCompare(String(b.market_type)))
 };
}
function historyEntry(summary){
 return {snapshot_at:summary.snapshot_at,excluded_unique_markets:summary.counts.excluded_unique_markets,
  exclusion_records:summary.counts.exclusion_records,
  excluded_sport_markets:summary.counts.excluded_sport_markets,
  excluded_sports:summary.excluded_sports,
  unrecognized_markets:summary.counts.unrecognized_markets,
  unrecognized_saved_markets:summary.counts.unrecognized_saved_markets,
  by_reason:summary.reasons.map(({reason,records,unique_markets})=>({reason,records,unique_markets})),
  unrecognized_types:summary.unrecognized_types.map(({market_type,markets,saved_markets})=>({market_type,markets,saved_markets}))};
}
module.exports={buildExclusionAudit,historyEntry};
