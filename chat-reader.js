const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {isHighCandidate}=require('./candidate-policy');
const BASE='https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/';
const MAX_BYTES=60000, PAGE_ROWS=8;
const hash=s=>createHash('sha256').update(s).digest('hex');
const safe=s=>String(s??'unknown').replace(/[^a-zA-Z0-9_-]/g,'_');
const escape=s=>String(s??'—').replace(/[\r\n|]/g,' ').replace(/[<>]/g,'');
function writeChatReader(rows,dir,metadata,verification){
  const snapshot=metadata.snapshot_at, snapshotId=hash(JSON.stringify([snapshot,rows])).slice(0,20);
  const root=`chat/${snapshotId}`, files=[];
  fs.mkdirSync(path.join(dir,root),{recursive:true});
  const write=(name,text)=>{
    const bytes=Buffer.byteLength(text);if(bytes>MAX_BYTES)throw new Error(`Chat page too large: ${name} (${bytes})`);
    const target=path.join(dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);
    files.push({path:name,bytes,sha256:hash(text)});return BASE+name;
  };
  const json=(name,obj)=>write(name,JSON.stringify(obj,null,2)+'\n');
  const heading=title=>`# ${title}\n\nСнимок: ${snapshot}. ID: ${snapshotId}.\n\n`;
  const scopes={};
  for(const [scope,selected] of [['all',rows],['combo',rows.filter(isHighCandidate)]]){
    const sports=[];
    for(const sport of [...new Set(selected.map(r=>r.sport))].sort()){
      const groups=[];
      const sportRows=selected.filter(r=>r.sport===sport);
      for(const family of [...new Set(sportRows.map(r=>r.family))].sort()){
        const group=sportRows.filter(r=>r.family===family),pages=[];
        const folder=`${root}/${scope}/${safe(sport)}/${safe(family)}`;
        let batch=[];
        const flush=()=>{
          if(!batch.length)return;
          const n=pages.length+1,name=`${folder}/${n}`;
          const dataUrl=json(name+'.json',{snapshot_at:snapshot,snapshot_id:snapshotId,scope,sport,family,page:n,outcomes:batch});
          const text=heading(`${sport} / ${family} / ${scope} — страница ${n}`)+
            `Всего в группе: ${group.length} исходов. На странице: ${batch.length}.\n\n`+
            `[Полные записи этой страницы](${dataUrl})\n\n`+
            'Цена — из снимка; combo_verified относится к одному исходу. Перед использованием цены требуется обновление.\n\n'+
            '| Событие | Начало UTC | Рынок / исход | Цена | Combo | ID исхода |\n|---|---|---|---|---|---|\n'+
            batch.map(r=>`| ${escape(r.match_title||r.event_title)} | ${escape(r.game_start_time)} | ${escape(r.outcome_label||`${r.question} — ${r.outcome}`)} | ${r.price} | ${r.combo_verified===true} | ${escape(r.outcome_id)} |`).join('\n')+'\n';
          const url=write(name+'.md',text);pages.push({page:n,outcomes:batch.length,url,data_url:dataUrl});batch=[];
        };
        for(const row of group){
          const candidate={snapshot_at:snapshot,snapshot_id:snapshotId,scope,sport,family,page:pages.length+1,outcomes:[...batch,row]};
          if(batch.length && (batch.length>=PAGE_ROWS||Buffer.byteLength(JSON.stringify(candidate,null,2))+1>MAX_BYTES))flush();
          batch.push(row);
        }
        flush();
        const pageIndexes=[];
        for(let i=0;i<pages.length;i+=40){
          const part=pages.slice(i,i+40);
          const url=json(`${folder}/pages-${i/40+1}.json`,{snapshot_at:snapshot,snapshot_id:snapshotId,scope,sport,family,pages:part});
          pageIndexes.push({first_page:part[0].page,last_page:part.at(-1).page,url});
        }
        const url=json(folder+'/index.json',{snapshot_at:snapshot,snapshot_id:snapshotId,scope,sport,family,outcomes:group.length,page_count:pages.length,page_indexes:pageIndexes});
        groups.push({family,outcomes:group.length,pages:pages.length,url});
      }
      const url=json(`${root}/${scope}/${safe(sport)}/index.json`,{snapshot_at:snapshot,snapshot_id:snapshotId,scope,sport,outcomes:sportRows.length,groups});
      sports.push({sport,outcomes:sportRows.length,url});
    }
    const url=json(`${root}/${scope}/index.json`,{snapshot_at:snapshot,snapshot_id:snapshotId,scope,outcomes:selected.length,sports});
    scopes[scope]={outcomes:selected.length,url};
  }
  const combo=rows.filter(isHighCandidate),cornerCount=combo.filter(r=>['corners_totals','corners_team_totals'].includes(r.family)).length;
  const start=heading('BET-X — вход для чтения сканера')+
    `Все сохранённые исходы: **${rows.length}**. Отбор Combo 65%+: **${combo.length}**. Угловые в этом отборе: **${cornerCount}**.\n\n`+
    `Полнота проверки Combo: **${verification.coverage_complete===true?'подтверждена для запрошенного набора':'неполная'}** (${verification.status}).\n\n`+
    `- [Сводка: количества и разбивка](${BASE}combo-summary.json)\n`+
    `- [Читать Combo 65%+ по спорту и типу рынка](${scopes.combo.url})\n`+
    `- [Читать все сохранённые исходы](${scopes.all.url})\n\n`+
    '## Как читать\n\nДля количества используй числа выше или сводку; скачивать большой JSONL не нужно. Для списка выбери спорт, затем family и нужные страницы. Каждая страница содержит не более 8 исходов и ссылку на их полные записи. Никакие поля в полных записях не удалены.\n\n'+
    'Для угловых в soccer нужны обе группы: corners_totals и corners_team_totals. Итог группы указан в индексе; не считай только первую страницу.\n\n'+
    'Сверяй snapshot_at и snapshot_id между файлами. Если ссылка старого снимка вернула 404, заново открой эту стартовую страницу: данные обновились. Не смешивай снимки и не подменяй недоступный файл поисковой выдачей. При отказе инструмента укажи конкретную ссылку и ошибку.\n\n'+
    '## Границы данных\n\nCombo — только подтверждённые отдельные исходы 65%–<96%, прошедшие правила стратегии, а не все рынки площадки. Снимок не является текущей ценой покупки; подтверждение отдельных исходов не означает совместимость экспресса.\n';
  write('CHAT-START.md',start);
  // A README at the data root makes the entry discoverable when a chat opens the repository branch.
  write('README.md',start);
  const manifest={snapshot_at:snapshot,snapshot_id:snapshotId,max_file_bytes:MAX_BYTES,scopes,files};
  fs.writeFileSync(path.join(dir,'chat-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {file:'CHAT-START.md',url:BASE+'CHAT-START.md',snapshot_id:snapshotId,scopes};
}
function validateChatReader(dir,rows){
  const assert=require('node:assert/strict');
  const m=JSON.parse(fs.readFileSync(path.join(dir,'chat-manifest.json'),'utf8'));
  const seen={all:[],combo:[]};
  for(const f of m.files){
    const text=fs.readFileSync(path.join(dir,f.path),'utf8');assert.equal(hash(text),f.sha256);assert.equal(Buffer.byteLength(text),f.bytes);assert(f.bytes<=MAX_BYTES);
    if(f.path.endsWith('.json')){
      const doc=JSON.parse(text);assert.equal(doc.snapshot_id,m.snapshot_id);assert.equal(doc.snapshot_at,m.snapshot_at);
      if(Array.isArray(doc.outcomes)){assert(doc.outcomes.length<=PAGE_ROWS);seen[doc.scope].push(...doc.outcomes);}
    }
    for(const match of text.matchAll(/https:\/\/raw\.githubusercontent\.com\/ollp898-glitch\/67676767676767676767676767676OLP\/data\/([^\s"\)]+)/g)){
      assert(fs.existsSync(path.join(dir,match[1])),`Missing reader link: ${match[1]}`);
    }
  }
  for(const scope of ['all','combo']){
    const expected=scope==='all'?rows:rows.filter(isHighCandidate);
    const sort=a=>a.slice().sort((a,b)=>a.outcome_id.localeCompare(b.outcome_id));
    assert.deepEqual(sort(seen[scope]),sort(expected));assert.equal(m.scopes[scope].outcomes,expected.length);
  }
  return m;
}
module.exports={writeChatReader,validateChatReader,MAX_BYTES};
if(require.main===module){
  const dir=process.argv[2];if(!dir)throw new Error('Usage: node chat-reader.js SNAPSHOT_DIR');
  const rows=fs.readFileSync(path.join(dir,'markets.jsonl'),'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const index=JSON.parse(fs.readFileSync(path.join(dir,'index.json'),'utf8'));
  index.chat_reader=writeChatReader(rows,dir,index,index.combo_verification);
  validateChatReader(dir,rows);
  fs.writeFileSync(path.join(dir,'index.json'),JSON.stringify(index,null,2)+'\n');
  console.log(JSON.stringify(index.chat_reader));
}
