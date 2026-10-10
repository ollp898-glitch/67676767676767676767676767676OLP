const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');

const MAX_FILE_BYTES=100*1024*1024;
const PART_BYTES=80*1024*1024;
const FILES=['markets.jsonl','combo-markets.jsonl','high-probability-outcomes.jsonl','index.json','events.json','catalog.json','high-probability-markets.json','line-ladders.json','unclassified-outcomes.json','candidate-audit.json','combo-summary.json','combo-corners.jsonl','CHAT-START.md','README.md','chat-manifest.json'];
const DIRECTORIES=['chat','events','scanner-audit','combo-2'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function allFiles(source){
  const result=FILES.filter(name=>fs.existsSync(path.join(source,name)));
  for(const dir of DIRECTORIES){
    const root=path.join(source,dir);if(!fs.existsSync(root))continue;
    const visit=(folder)=>{for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
      const name=path.relative(source,path.join(folder,entry.name)).replaceAll('\\','/');
      if(entry.isDirectory())visit(path.join(folder,entry.name));else if(entry.isFile())result.push(name);
    }};visit(root);
  }
  for(const name of FILES)if(!fs.existsSync(path.join(source,name)))throw new Error(`Missing snapshot file: ${name}`);
  return result;
}
function prepareSnapshot(source,destination,{maxFileBytes=MAX_FILE_BYTES,partBytes=PART_BYTES}={}){
  if(partBytes<=0||partBytes>=maxFileBytes)throw new Error('Part size must be below the Git file limit');
  fs.mkdirSync(destination,{recursive:true});
  const manifest={schema_version:2,max_file_bytes:maxFileBytes,files:{},split_files:{}};
  for(const name of allFiles(source)){
    const input=path.join(source,name),output=path.join(destination,name),size=fs.statSync(input).size;
    fs.mkdirSync(path.dirname(output),{recursive:true});
    if(size<=maxFileBytes){fs.copyFileSync(input,output);manifest.files[name]={bytes:size,sha256:digest(fs.readFileSync(input))};continue;}
    const fd=fs.openSync(input,'r'),hash=createHash('sha256'),parts=[];
    try{let offset=0,index=0;while(offset<size){
      const count=Math.min(partBytes,size-offset),bytes=Buffer.allocUnsafe(count),read=fs.readSync(fd,bytes,0,count,offset);
      if(read!==count)throw new Error(`Incomplete read: ${name}`);
      const part=`${name}.part-${String(++index).padStart(3,'0')}`;
      fs.writeFileSync(path.join(destination,part),bytes);hash.update(bytes);parts.push({file:part,bytes:count,sha256:digest(bytes)});offset+=count;
    }}finally{fs.closeSync(fd);}
    manifest.split_files[name]={bytes:size,sha256:hash.digest('hex'),parts};
    manifest.files[name]={bytes:size,sha256:manifest.split_files[name].sha256};
  }
  fs.writeFileSync(path.join(destination,'publication-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  for(const name of Object.keys(manifest.split_files)){
    const restored=readPreparedFile(destination,name);if(restored.length!==manifest.split_files[name].bytes||digest(restored)!==manifest.split_files[name].sha256)throw new Error(`Publication verification failed: ${name}`);
  }
  return manifest;
}
function readPreparedFile(directory,name){
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'publication-manifest.json'),'utf8'));
  const split=manifest.split_files[name];
  if(!split){const bytes=fs.readFileSync(path.join(directory,name));const expected=manifest.files?.[name];if(expected&&(bytes.length!==expected.bytes||digest(bytes)!==expected.sha256))throw new Error(`Corrupt snapshot: ${name}`);return bytes;}
  const parts=split.parts.map(p=>{const bytes=fs.readFileSync(path.join(directory,p.file));if(bytes.length!==p.bytes||digest(bytes)!==p.sha256)throw new Error(`Corrupt snapshot part: ${p.file}`);return bytes;});
  const bytes=Buffer.concat(parts);if(bytes.length!==split.bytes||digest(bytes)!==split.sha256)throw new Error(`Corrupt snapshot: ${name}`);return bytes;
}
function materializeSnapshot(directory){
  const manifestFile=path.join(directory,'publication-manifest.json');
  if(!fs.existsSync(manifestFile))return [];
  const names=Object.keys(JSON.parse(fs.readFileSync(manifestFile,'utf8')).split_files);
  for(const name of Object.keys(JSON.parse(fs.readFileSync(manifestFile,'utf8')).files||{}))readPreparedFile(directory,name);
  for(const name of names){
    const target=path.join(directory,name);
    if(fs.existsSync(target))throw new Error(`Canonical file already exists: ${name}`);
    fs.writeFileSync(target,readPreparedFile(directory,name));
  }
  return names;
}
function repackSnapshot(directory,options){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'betx-repack-'));
  try{
    const manifest=prepareSnapshot(directory,temp,options);
    for(const entry of fs.readdirSync(directory))if(entry!=='.git')fs.rmSync(path.join(directory,entry),{recursive:true,force:true});
    fs.cpSync(temp,directory,{recursive:true});
    return manifest;
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
function gitShow(ref,name){
  const result=spawnSync('git',['show',`${ref}:${name}`],{encoding:null,maxBuffer:MAX_FILE_BYTES+1024*1024});
  if(result.status!==0)throw new Error(`Cannot read ${ref}:${name}: ${result.stderr?.toString('utf8')||result.error}`);
  return result.stdout;
}
function restoreFromGit(ref,name,target,{read=gitShow,exists=(r,n)=>spawnSync('git',['cat-file','-e',`${r}:${n}`]).status===0}={}){
  const manifest=exists(ref,'publication-manifest.json')?JSON.parse(read(ref,'publication-manifest.json').toString('utf8')):null;
  const split=manifest?.split_files?.[name];
  const bytes=split?Buffer.concat(split.parts.map(p=>{const data=read(ref,p.file);if(data.length!==p.bytes||digest(data)!==p.sha256)throw new Error(`Corrupt published part: ${p.file}`);return data;})):read(ref,name);
  const expected=manifest?.files?.[name]||split;
  if(expected&&(bytes.length!==expected.bytes||digest(bytes)!==expected.sha256))throw new Error(`Corrupt published file: ${name}`);
  fs.writeFileSync(target,bytes);return bytes.length;
}
if(require.main===module){
  const [command,...args]=process.argv.slice(2);
  if(command==='prepare'){const manifest=prepareSnapshot(args[0],args[1]);console.log(JSON.stringify(manifest));}
  else if(command==='restore')console.log(`Restored ${args[1]}: ${restoreFromGit(args[0],args[1],args[2])} bytes`);
  else if(command==='materialize')console.log(JSON.stringify(materializeSnapshot(args[0])));
  else if(command==='repack')console.log(JSON.stringify(repackSnapshot(args[0])));
  else throw new Error('Usage: node snapshot-publication.js prepare SOURCE DEST | restore REF NAME TARGET | materialize DIR | repack DIR');
}
module.exports={prepareSnapshot,readPreparedFile,materializeSnapshot,repackSnapshot,restoreFromGit,MAX_FILE_BYTES,PART_BYTES};
