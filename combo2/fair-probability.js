// Proportional normalization of a complete, mutually exclusive bookmaker market.
// Evidence is captured BEFORE filtering Polymarket outcomes, and retained for validation.
const half=x=>Number.isFinite(x)&&Math.abs(x%1)===0.5;
function market(q){
 const c=q.canonical;if(!c)return null;
 if(!['HOME_AWAY','HOME_DRAW_AWAY','OVER_UNDER','ASIAN_HANDICAP','BOTH_TEAMS_TO_SCORE'].includes(c.type))return null;
 if(['OVER_UNDER','ASIAN_HANDICAP'].includes(c.type)&&!half(c.line))return null; // pushes/quarter settlement are not binary probabilities
 const line=c.type==='ASIAN_HANDICAP'?(c.selection==='AWAY'?-c.line:c.line):c.line??null;
 return {event_id:q.event_id,bookmaker_id:q.bookmaker_id,sport:c.sport,discipline:c.discipline??null,type:c.type,period:c.period,metric:c.metric??null,line,observed_at:q.external_odds_observed_at};
}
const signature=q=>JSON.stringify(market(q));
function attachMarkets(quotes){
 const groups=new Map();for(const q of quotes){const k=signature(q);if(k==='null')continue;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(q);}
 return quotes.map(q=>{const ctx=market(q);if(!ctx)return {...q,full_market:null};const group=groups.get(signature(q));
  return {...q,full_market:{...ctx,outcomes:group.map(x=>({selection:x.canonical.selection,line:x.canonical.line??null,decimal_odds:x.decimal_odds,active:x.active,event_participant_id:x.event_participant_id??null})),participant_ids:q.market_participant_ids}};
 });
}
function fair(q){
 const no=status=>({fair_probability_percent:null,fair_probability_status:status,market_overround_percent:null,fair_probability_method:null});
 const ctx=market(q),e=q.full_market;if(!ctx)return no('unsupported_or_nonexclusive_market');if(!e)return no('complete_market_not_saved');
 if(!ctx.event_id||!ctx.observed_at||ctx.bookmaker_id==null||Object.keys(ctx).some(k=>e[k]!==ctx[k]))return no('market_identity_mismatch');
 const selections={HOME_AWAY:['HOME','AWAY'],HOME_DRAW_AWAY:['HOME','DRAW','AWAY'],OVER_UNDER:['OVER','UNDER'],ASIAN_HANDICAP:['HOME','AWAY'],BOTH_TEAMS_TO_SCORE:['YES','NO']}[ctx.type],a=e.outcomes;
 if(!Array.isArray(a)||a.length!==selections.length||new Set(a.map(x=>x.selection)).size!==selections.length||!selections.every(s=>a.some(x=>x.selection===s)))return no('incomplete_or_ambiguous_market');
 if(a.some(x=>x.active!==true||!Number.isFinite(x.decimal_odds)||x.decimal_odds<=1))return no('inactive_or_invalid_market');
 if(['HOME_AWAY','HOME_DRAW_AWAY','ASIAN_HANDICAP'].includes(ctx.type)){
  if(!Array.isArray(e.participant_ids)||e.participant_ids.length!==2||new Set(e.participant_ids).size!==2||e.participant_ids.some(x=>typeof x!=='string'||!x))return no('invalid_participant_identity');
  if(a.some(x=>x.event_participant_id!==(x.selection==='HOME'?e.participant_ids[0]:x.selection==='AWAY'?e.participant_ids[1]:null)))return no('invalid_participant_identity');
 }else if(a.some(x=>x.event_participant_id!==null))return no('invalid_participant_identity');
 if(a.some(x=>x.line!==(ctx.type==='ASIAN_HANDICAP'?(x.selection==='HOME'?ctx.line:-ctx.line):ctx.line)))return no('line_mismatch');
 const selected=a.find(x=>x.selection===q.canonical.selection);
 if(!selected||selected.decimal_odds!==q.decimal_odds||selected.event_participant_id!==(q.event_participant_id??null)||q.active!==true)return no('selected_quote_mismatch');
 const sum=a.reduce((n,x)=>n+1/x.decimal_odds,0);
 return {fair_probability_percent:100/q.decimal_odds/sum,fair_probability_status:'available',market_overround_percent:(sum-1)*100,fair_probability_method:'proportional_complete_market'};
}
function withFair(q){const result=fair(q);return {...q,...result,display:`${q.bookmaker_name} ${q.decimal_odds.toFixed(2)} (${result.fair_probability_percent===null?'—':result.fair_probability_percent.toFixed(1)+'%'})`};}
module.exports={attachMarkets,fair,withFair};
