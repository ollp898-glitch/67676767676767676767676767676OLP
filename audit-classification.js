// Offline, reproducible audit. Optional Gamma evidence can add missing resolution
// descriptions only; it never replaces historical prices, lines or identities.
const fs=require('node:fs');
const {classifyMarket}=require('./event-catalog');
const norm=s=>String(s??'').replace(/\s+/g,' ').trim();
function auditClassification(rows,evidence=[]){
  const source=new Map(evidence.map(m=>[String(m.id),m])),groups=new Map();let descriptionsAdded=0;
  for(const row of rows){
    const raw={...row.raw_market};const supplied=source.get(String(row.market_id));
    if(supplied&&supplied.question===row.question&&supplied.sportsMarketType===row.market_type&&Number(supplied.line)===Number(row.line)){
      let names;try{names=JSON.parse(supplied.outcomes);}catch{names=supplied.outcomes;}
      if(JSON.stringify(names)===JSON.stringify(raw.outcomes)&&!raw.description&&supplied.description){raw.description=supplied.description;descriptionsAdded++;}
    }
    const outcomes=(raw.outcomes||[]).map((outcome,i)=>({outcome:typeof outcome==='string'?outcome:outcome.outcome,price:Number(raw.prices?.[i])}));
    const classification=classifyMarket({...row,source_market:raw,outcomes});
    const shape=text=>{
      let value=norm(text);
      for(const identity of [classification.player_name,classification.team_name])if(identity)value=value.replace(identity,'{subject}');
      if(value.includes(' vs. '))value=value.replace(/^.+? vs\. .+?(?=: |$)/,'{event}');
      return value.replace(/([+-]?\d+(?:\.\d+)?)/g,'{number}');
    };
    const structure=(raw.outcomes||[]).map(o=>/^(?:yes|no|over|under|odd|even)$/i.test(String(o))?String(o):'{named participant}');
    const descriptor={sport:row.sport,sportsMarketType:row.market_type??null,question_format:shape(row.question),groupItemTitle_format:shape(row.group_item_title),
      source_period:row.period,inferred_period:classification.period,outcomes_structure:structure,family:classification.family,
      classification_source:classification.classification_source,reason:classification.classification_note??null};
    const key=JSON.stringify(descriptor);
    if(!groups.has(key))groups.set(key,{...descriptor,market_ids:new Set(),outcomes:0,lines:new Map(),example:{market_id:row.market_id,question:row.question,groupItemTitle:row.group_item_title,raw_outcomes:raw.outcomes}});
    const g=groups.get(key);g.market_ids.add(String(row.market_id));g.outcomes++;
    const line=JSON.stringify(row.line??null);if(!g.lines.has(line))g.lines.set(line,new Set());g.lines.get(line).add(String(row.market_id));
  }
  const list=[...groups.values()].map(g=>({...g,markets:g.market_ids.size,market_ids:[...g.market_ids].sort(),lines:[...g.lines].map(([line,ids])=>({line:JSON.parse(line),markets:ids.size}))}));
  return {input_outcomes:rows.length,input_markets:new Set(rows.map(r=>String(r.market_id))).size,descriptions_added_to_outcomes:descriptionsAdded,
    recognized_outcomes:list.filter(g=>g.family!=='other').reduce((n,g)=>n+g.outcomes,0),remaining_outcomes:list.filter(g=>g.family==='other').reduce((n,g)=>n+g.outcomes,0),groups:list};
}
if(require.main===module){
  const doc=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  const evidence=process.argv[3]?JSON.parse(fs.readFileSync(process.argv[3],'utf8')):[];
  console.log(JSON.stringify(auditClassification(doc.outcomes||doc,evidence),null,2));
}
module.exports={auditClassification};
