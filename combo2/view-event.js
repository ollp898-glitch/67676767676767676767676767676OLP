// Read the current odds overlay locally; never fetches analytics or Polymarket.
const path=require('node:path');
const {read,key}=require('./storage');
const {currentComparison}=require('./collector');
function viewEvent(root,matchId){const event=read(path.join(root,'events',key(matchId),'index.json'));const parents=event.markets||event.market_pages.flatMap(p=>read(path.join(root,p)).markets);
 return {...event,markets:parents.map(parent=>({...parent,outcomes:parent.parts.flatMap(p=>read(path.join(root,p.path)).market.outcomes).map(out=>({...out,...currentComparison(root,event,out)}))}))};}
module.exports={viewEvent};if(require.main===module)console.log(JSON.stringify(viewEvent(process.argv[2],process.argv[3]),null,2));
