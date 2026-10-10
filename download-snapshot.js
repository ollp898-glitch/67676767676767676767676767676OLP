// Resolve logical data-branch filenames through the publication manifest.
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const BASE='https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
function safeName(name){if(typeof name!=='string'||name.startsWith('/')||name.includes('\\')||name.split('/').some(x=>x==='..'||x==='.'||!x))throw Error(`Unsafe snapshot path: ${name}`);return name;}
async function downloadSnapshotFile(name,{ref='data',fetcher=fetch,base=BASE}={}){
  safeName(name);safeName(ref);
  const get=async file=>{safeName(file);const response=await fetcher(`${base}${ref}/${file}`);if(!response.ok)throw Error(`Snapshot download failed: ${file} (HTTP ${response.status})`);return Buffer.from(await response.arrayBuffer());};
  const manifest=JSON.parse((await get('publication-manifest.json')).toString('utf8'));
  const expected=manifest.files?.[name]||manifest.split_files?.[name];
  if(!expected)throw Error(`File absent from publication manifest: ${name}`);
  const split=manifest.split_files?.[name];
  const chunks=split?await Promise.all(split.parts.map(async part=>{
    const bytes=await get(part.file);if(bytes.length!==part.bytes||sha256(bytes)!==part.sha256)throw Error(`Corrupt snapshot part: ${part.file}`);return bytes;
  })):[await get(name)];
  const bytes=Buffer.concat(chunks);
  if(bytes.length!==expected.bytes||sha256(bytes)!==expected.sha256)throw Error(`Corrupt snapshot file: ${name}`);
  return bytes;
}
if(require.main===module){
  const [name,target,ref='data']=process.argv.slice(2);
  if(!name||!target)throw Error('Usage: node download-snapshot.js LOGICAL_NAME OUTPUT_PATH [REF]');
  downloadSnapshotFile(name,{ref}).then(bytes=>{fs.writeFileSync(target,bytes);console.log(`Verified ${name}: ${bytes.length} bytes`);}).catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={downloadSnapshotFile};
