const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const LINK='https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/wide-combo/PROMPT.md';
const hash=value=>createHash('sha256').update(value).digest('hex');
function linkReader(source) {
  const manifestFile=path.join(source,'chat-manifest.json');
  if(!fs.existsSync(manifestFile)) return false;
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  for(const name of ['CHAT-START.md','README.md']) {
    const file=path.join(source,name);
    if(!fs.existsSync(file)) continue;
    let body=fs.readFileSync(file,'utf8');
    if(!body.includes(LINK)) body+=`\n## Wide Combo — анализ\n\n[Правила чтения и ответа](${LINK}). Начни с этой страницы, затем открой candidates.csv или slim.csv из того же снимка.\n`;
    if(Buffer.byteLength(body)>60000) throw new Error(`Chat reader too large: ${name}`);
    fs.writeFileSync(file,body);
    const entry=manifest.files.find(item=>item.path===name);
    if(entry){entry.bytes=Buffer.byteLength(body);entry.sha256=hash(body);}
  }
  fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
  return true;
}
module.exports={linkReader};
