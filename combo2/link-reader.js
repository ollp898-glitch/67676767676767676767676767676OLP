// Add navigation only. Update manifest hashes without rebuilding/changing reader outcomes.
const fs=require('node:fs'),path=require('node:path');
const {hash,read}=require('./storage');
function link(dir){if(!fs.existsSync(path.join(dir,'combo-2/index.json')))return;const url='https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/combo-2/index.json';
 const manifestPath=path.join(dir,'chat-manifest.json'),manifest=fs.existsSync(manifestPath)?read(manifestPath):null;
 for(const name of ['CHAT-START.md','README.md']){const file=path.join(dir,name);if(!fs.existsSync(file))continue;let text=fs.readFileSync(file,'utf8');if(!text.includes(url))text+=`\n## Combo Layer 2.0 Beta\n\n[Open grouped Combo outcomes and external odds](${url}). External odds are timestamped snapshots; standalone collector status is separate.\n`;fs.writeFileSync(file,text);const entry=manifest?.files.find(f=>f.path===name);if(entry){entry.bytes=Buffer.byteLength(text);entry.sha256=hash(text);}}
 if(manifest)fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
}
module.exports={link};if(require.main===module)link(process.argv[2]||'out');
