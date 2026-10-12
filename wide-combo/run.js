const fs=require('node:fs');
const path=require('node:path');
const {build}=require('./build');
const {validate}=require('./validate');
function run(source,{buildLayer=build,validateLayer=validate}={}) {
  const root=path.join(source,'wide-combo'),marker=path.join(source,'wide-combo-error.json');
  try {
    const index=buildLayer(source,root);
    validateLayer(source,root);
    if(fs.existsSync(marker))fs.unlinkSync(marker);
    return {status:'ready',source_outcomes:index.source_outcomes,outcomes:index.outcomes,snapshot_at:index.snapshot_at};
  } catch(error) {
    if(fs.existsSync(root))fs.rmSync(root,{recursive:true,force:true});
    const snapshotFile=path.join(source,'index.json');
    let snapshotAt=null;
    try {snapshotAt=JSON.parse(fs.readFileSync(snapshotFile,'utf8')).snapshot_at??null;} catch {}
    const result={status:'failed',snapshot_at:snapshotAt,error:String(error.stack||error)};
    fs.writeFileSync(marker,JSON.stringify(result,null,2)+'\n');
    return result;
  }
}
if(require.main===module){
  const result=run(process.argv[2]??'out');
  (result.status==='failed'?console.error:console.log)(JSON.stringify(result));
}
module.exports={run};
