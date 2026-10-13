const journal=require('./journal');
function manual(logFile,legId,result,sourceUrl,settledAt=new Date().toISOString()) {
  if(!['win','loss','void'].includes(result)) throw new Error('Result must be win, loss or void');
  if(!/^https:\/\//.test(sourceUrl)) throw new Error('Verified source URL is required');
  if(!Number.isFinite(Date.parse(settledAt))) throw new Error('Invalid settled_at');
  const rows=journal.read(logFile),leg=rows.find(row=>row.leg_id===legId);
  if(!leg) throw new Error('Unknown leg ID');
  if(leg.result) throw new Error('Leg already settled');
  leg.result=result;leg.settled_at=settledAt;leg.settlement_source=sourceUrl;
  journal.write(logFile,rows);
  return {leg_id:legId,result,settlement_source:sourceUrl};
}
if(require.main===module){
  try{const [file,legId,result,url]=process.argv.slice(2);
    if(!file||!legId||!result||!url) throw new Error('Usage: node wide-combo/log/manual.js LOG.csv LEG_ID win|loss|void VERIFIED_SOURCE_URL');
    console.log(JSON.stringify(manual(file,legId,result,url)));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={manual};
