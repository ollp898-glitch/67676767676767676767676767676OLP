// Read the saved scanner snapshot and its one-time odds, without network requests.
const path=require('node:path');
const {read,key}=require('./storage');
function viewEvent(root,matchId){const event=read(path.join(root,'events',key(matchId),'index.json'));const parents=event.markets||event.market_pages.flatMap(p=>read(path.join(root,p)).markets);
 return {...event,markets:parents.map(parent=>({...parent,outcomes:parent.parts.flatMap(p=>read(path.join(root,p.path)).market.outcomes)}))};}
module.exports={viewEvent};if(require.main===module)console.log(JSON.stringify(viewEvent(process.argv[2],process.argv[3]),null,2));
