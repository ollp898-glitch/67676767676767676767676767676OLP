const {normalize}=require('./matching');
const {fair}=require('./fair-probability');
// Explicit brands only; punctuation normalization is not fuzzy matching.
const aliases={'betonline ag':'betonline','bookmaker eu':'bookmaker','heritage':'heritage sports','williamhill':'william hill'};
const brand=n=>aliases[normalize(n)]||normalize(n);
function mergeBookmakers(quotes){
  if(!quotes.some(q=>q.source==='bmr'))return quotes;
  const groups=[];
  for(const q of quotes){
    const ids=new Set([q.bookmaker_name,...(q.bookmaker_aliases||[])].map(brand));
    if(q.source==='bmr')ids.add(`paid:${q.paid}`);
    const hits=groups.filter(g=>[...ids].some(x=>g.ids.has(x)));
    const values=[q,...hits.flatMap(g=>g.quotes)];for(const h of hits)for(const id of h.ids)ids.add(id);
    for(const h of hits)groups.splice(groups.indexOf(h),1);groups.push({ids,quotes:values});
  }
  // Complete market evidence wins; otherwise retain the existing Flashscore quote.
  return groups.map(g=>g.quotes.sort((a,b)=>(fair(b).fair_probability_percent!==null)-(fair(a).fair_probability_percent!==null)||(a.source==='bmr')-(b.source==='bmr')||String(a.bookmaker_id).localeCompare(String(b.bookmaker_id)))[0]).sort((a,b)=>String(a.bookmaker_id).localeCompare(String(b.bookmaker_id)));
}
module.exports={mergeBookmakers};
