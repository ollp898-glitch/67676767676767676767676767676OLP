/**
 * BET-X Google Sheets sync — bind this script to TEST LAB only.
 * Run installBETXSync once. It performs an immediate sync and installs an hourly trigger.
 * DATA sync preserves SEARCH filters and saved PICKS; it rebuilds grouped SEARCH results.
 */
const BETX_FEED_URL='https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/sheets.json';

function installBETXSync(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(ss.getName()!=='BET-X | TEST LAB')throw new Error('This script is for BET-X | TEST LAB only');
  const existing=ScriptApp.getProjectTriggers().filter(t=>['syncBETX','onBETXRankingEdit','onBETXGroupedEdit'].includes(t.getHandlerFunction()));
  existing.forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncBETX').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('onBETXRankingEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('onBETXGroupedEdit').forSpreadsheet(ss).onEdit().create();
  syncBETX();
}
function onOpen(){
  SpreadsheetApp.getUi().createMenu('BET-X').addItem('Обновить исходы','syncBETX').addItem('Обновить группировку','refreshBETXGroupedSearch').addItem('Проверить автообновление','checkBETXAutomation').addItem('Настроить автообновление','installBETXSync').addToUi();
}
function syncBETX(){
 const lock=LockService.getDocumentLock()||LockService.getScriptLock();
 if(!lock.tryLock(30000))throw new Error('Another BET-X synchronization is running');
 const ss=SpreadsheetApp.getActiveSpreadsheet();
 if(ss.getName()!=='BET-X | TEST LAB')throw new Error('This script is for BET-X | TEST LAB only');
 const status=ss.getSheetByName('SEARCH');
 try{
   const sh=ss.getSheetByName('DATA');
   if(!sh)throw new Error('DATA tab not found');
   const rsp=UrlFetchApp.fetch(BETX_FEED_URL+'?ts='+Date.now(),{muteHttpExceptions:true,followRedirects:true});
   if(rsp.getResponseCode()!==200)throw new Error('GitHub feed HTTP '+rsp.getResponseCode());
   const feed=JSON.parse(rsp.getContentText('UTF-8'));
   if(feed.schema_version!==1||!Array.isArray(feed.columns)||feed.columns.length!==27||!Array.isArray(feed.rows)||
      feed.row_count!==feed.rows.length||!feed.source_sha256||!feed.snapshot_at)throw new Error('Invalid source schema or count');
   const existingHead=sh.getRange(1,1,1,27).getValues()[0];
   if(JSON.stringify(existingHead)!==JSON.stringify(feed.columns))throw new Error('Unexpected DATA columns. Not overwriting.');
   if(feed.rows.some(r=>!Array.isArray(r)||r.length!==27||!(r[7]>0)||!r[22]))throw new Error('Malformed source row');
   const state=PropertiesService.getDocumentProperties();
   const dataChanged=state.getProperty('betx_source_sha256')!==feed.source_sha256;

   if(dataChanged){
   // Stage and validate before touching DATA.
   let stage=ss.getSheetByName('DATA_STAGING');
   if(!stage)stage=ss.insertSheet('DATA_STAGING');
   if(stage.getMaxColumns()<27)stage.insertColumnsAfter(stage.getMaxColumns(),27-stage.getMaxColumns());
   if(stage.getMaxRows()<feed.row_count+1)stage.insertRowsAfter(stage.getMaxRows(),feed.row_count+1-stage.getMaxRows());
   stage.clearContents();
   stage.getRange(1,1,1,27).setValues([feed.columns]);
   if(feed.row_count){
     stage.getRange(2,19,feed.row_count,5).setNumberFormat('@');
     stage.getRange(2,1,feed.row_count,27).setValues(feed.rows);
   }
   SpreadsheetApp.flush();
   if(stage.getLastRow()!==feed.row_count+1||(feed.row_count>0&&String(stage.getRange(feed.row_count+1,23).getDisplayValue())!==String(feed.rows[feed.row_count-1][22])))
     throw new Error('Staging verification failed; DATA unchanged');

   // Commit verified rows to DATA. SEARCH and PICKS are never overwritten.
   if(sh.getMaxRows()<feed.row_count+1)sh.insertRowsAfter(sh.getMaxRows(),feed.row_count+1-sh.getMaxRows());
   if(feed.row_count){
     sh.getRange(2,19,feed.row_count,5).setNumberFormat('@');
     sh.getRange(2,1,feed.row_count,27).setValues(feed.rows);
   }
   if(sh.getLastRow()>feed.row_count+1)sh.getRange(feed.row_count+2,1,sh.getLastRow()-feed.row_count-1,27).clearContent();
   SpreadsheetApp.flush();
   if(sh.getLastRow()!==feed.row_count+1)throw new Error('DATA row count mismatch after write');
   state.setProperty('betx_source_sha256',feed.source_sha256);
   state.setProperty('betx_snapshot_at',feed.snapshot_at);
   }
   // Ranking errors never stop DATA synchronization or the scanner publication.
   if(feed.rankings_status==='complete'&&feed.rankings_sha256){
     try{
       if(feed.rankings_sha256!==state.getProperty('betx_rankings_sha256')){
         syncBETXRankings_(ss,feed.rankings);
         state.setProperty('betx_rankings_sha256',feed.rankings_sha256);
       }
     }catch(rankingError){Logger.log('RANKINGS sync failed: '+rankingError);}
   }
   if(status)status.getRange('B14').setValue((dataChanged?'Обновлено':'Без изменений')+' · '+feed.snapshot_at+' · '+feed.row_count+' исходов');
   try{refreshBETXGroupedSearch({locked:true});}catch(groupError){Logger.log('Grouped SEARCH refresh failed: '+groupError);}
 }catch(e){
   if(status)status.getRange('B14').setValue('ОШИБКА синхронизации: '+String(e.message||e).slice(0,130));
   throw e;
 }finally{lock.releaseLock();}
}

function betxCell_(value){
 if(value===null||value===undefined)return '';
 if(typeof value==='number')return value;
 const s=String(value);return /^[=+@]/.test(s)?"'"+s:s;
}
function betxSorted_(items,sport,sort){
 return items.filter(x=>sport==='Все'||x.sport===sport).slice().sort((a,b)=>{
   const first=sort==='Filtered Liquidity'?'filtered_liquidity_usd':'total_liquidity_usd';
   const second=sort==='Filtered Liquidity'?'total_liquidity_usd':'filtered_liquidity_usd';
   const ranked=(x,key)=>x[key]===null||x[key]===undefined||
     x[key==='total_liquidity_usd'?'total_missing_liquidity_markets':'filtered_missing_liquidity_markets']>0?-1:x[key];
   return ranked(b,first)-ranked(a,first)||ranked(b,second)-ranked(a,second)||
     String(a.title||a.tournament).localeCompare(String(b.title||b.tournament));
 });
}
function betxLiquidityDisplay_(value,missing){
 return missing>0||value===null||value===undefined?'Неполные данные':value;
}
function betxMissingMarkets_(count){
 const n=Number(count)||0,ones=n%10,tens=n%100;
 return n+' '+(ones===1&&tens!==11?'рынок':ones>=2&&ones<=4&&(tens<12||tens>14)?'рынка':'рынков');
}
function betxHomeLiquidity_(value,missing){
 return missing>0||value===null||value===undefined
   ?'Неполные данные · '+betxMissingMarkets_(missing):Math.round(value).toLocaleString('ru-RU')+' USD';
}
function betxEventCells_(x){return [x.sport,x.title,x.tournament||'Неизвестный турнир',x.market_count,
 x.saved_outcomes_count,x.markets_with_ask,
 betxLiquidityDisplay_(x.total_liquidity_usd,x.total_missing_liquidity_markets),
 betxLiquidityDisplay_(x.filtered_liquidity_usd,x.filtered_missing_liquidity_markets),
 x.total_missing_liquidity_markets,x.filtered_missing_liquidity_markets];}
function betxTournamentCells_(x){return [x.sport,x.tournament,x.match_count,x.market_count,
 x.saved_outcomes_count,x.markets_with_ask,
 betxLiquidityDisplay_(x.total_liquidity_usd,x.total_missing_liquidity_markets),
 betxLiquidityDisplay_(x.filtered_liquidity_usd,x.filtered_missing_liquidity_markets),
 x.total_missing_liquidity_markets,x.filtered_missing_liquidity_markets];}
function renderBETXRankings_(sh,rankings){
 const sport=String(sh.getRange('B2').getValue()||'Все');
 const sort=String(sh.getRange('E2').getValue()||'Total Liquidity');
 const sports=['Все',...new Set(rankings.events.map(x=>x.sport))].sort();
 const selectedSport=sports.includes(sport)?sport:'Все';
 const selectedSort=['Total Liquidity','Filtered Liquidity'].includes(sort)?sort:'Total Liquidity';
 const events=betxSorted_(rankings.events,selectedSport,selectedSort);
 const tournaments=betxSorted_(rankings.tournaments,selectedSport,selectedSort);
 const needed=Math.max(events.length,tournaments.length)+5;
 if(sh.getMaxColumns()<21)sh.insertColumnsAfter(sh.getMaxColumns(),21-sh.getMaxColumns());
 if(sh.getMaxRows()<needed)sh.insertRowsAfter(sh.getMaxRows(),needed-sh.getMaxRows());
 sh.clearContents();
 sh.getRange('A1').setValue('BET-X RANKINGS');
 sh.getRange('A2').setValue('Вид спорта');sh.getRange('B2').setValue(selectedSport);
 sh.getRange('D2').setValue('Сортировка');sh.getRange('E2').setValue(selectedSort);
 sh.getRange('B2').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(sports,true).build());
 sh.getRange('E2').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Total Liquidity','Filtered Liquidity'],true).build());
 sh.getRange('A3').setValue('Снимок: '+rankings.snapshot_at+' · событий: '+rankings.event_count+
  ' · турниров: '+rankings.tournament_count+' · без названия турнира: '+rankings.unknown_tournament_events);
 sh.getRange('A4').setValue('ТОП событий');sh.getRange('L4').setValue('ТОП турниров');
 sh.getRange(5,1,1,10).setValues([['Спорт','Событие','Турнир','Рынки','Исходы','Рынки с Ask','Total Liquidity USD','Filtered Liquidity USD','Без ликв. Total','Без ликв. Filtered']]);
 sh.getRange(5,12,1,10).setValues([['Спорт','Турнир','Матчи','Рынки','Исходы','Рынки с Ask','Total Liquidity USD','Filtered Liquidity USD','Без ликв. Total','Без ликв. Filtered']]);
 if(events.length)sh.getRange(6,1,events.length,10).setValues(events.map(x=>betxEventCells_(x).map(betxCell_)));
 if(tournaments.length)sh.getRange(6,12,tournaments.length,10).setValues(tournaments.map(x=>betxTournamentCells_(x).map(betxCell_)));
 sh.getRange(5,1,1,10).setFontWeight('bold');sh.getRange(5,12,1,10).setFontWeight('bold');
 sh.setFrozenRows(5);
}
function syncBETXRankings_(ss,rankings){
 if(!rankings||rankings.schema_version!==1||!Array.isArray(rankings.events)||!Array.isArray(rankings.tournaments)||
    rankings.event_count!==rankings.events.length||rankings.tournament_count!==rankings.tournaments.length)
   throw new Error('Invalid rankings feed');
 let sh=ss.getSheetByName('RANKINGS');
 if(sh&&sh.getRange('A1').getValue()&&!String(sh.getRange('A1').getValue()).startsWith('BET-X RANKINGS'))
   throw new Error('RANKINGS belongs to another user; refusing to overwrite');
 if(!sh)sh=ss.insertSheet('RANKINGS');
 renderBETXRankings_(sh,rankings);
 const home=ss.getSheetByName('HOME');
 if(!home)return;
 renderBETXHome_(home,rankings,PropertiesService.getDocumentProperties());
}
function renderBETXHome_(home,rankings,state){
 // TEST LAB HOME is twelve columns wide; its dashboard occupies rows 1–53.
 const designColumns=12,sectionRows=15;
 if(home.getMaxColumns()<designColumns)throw new Error('HOME design is narrower than expected');
 const oldCol=Number(state.getProperty('betx_home_rankings_col'));
 if(Number.isInteger(oldCol)&&oldCol>0&&oldCol+12<=home.getMaxColumns()&&
    home.getRange(1,oldCol).getValue()==='BET-X RANKINGS HOME'){
   home.getRange(1,oldCol,8,13).clearContent();
   state.deleteProperty('betx_home_rankings_col');
   if(home.getMaxColumns()>designColumns){
     const extra=home.getRange(1,designColumns+1,home.getMaxRows(),home.getMaxColumns()-designColumns);
     if(extra.getValues().every(line=>line.every(value=>value===''||value===null)))
       home.deleteColumns(designColumns+1,home.getMaxColumns()-designColumns);
   }
 }
 let row=Number(state.getProperty('betx_home_rankings_row'));
 if(!Number.isInteger(row)||row<54||row>home.getMaxRows()||
    home.getRange(row,2).getNote()!=='BET-X RANKINGS HOME'){
   row=home.getLastRow()+2;
   state.setProperty('betx_home_rankings_row',String(row));
 }
 const last=row+sectionRows-1;
 if(home.getMaxRows()<last)home.insertRowsAfter(home.getMaxRows(),last-home.getMaxRows());
 const area=home.getRange(row,2,sectionRows,10);
 area.breakApart();area.clearContent();
 area.setBackground('#08101b').setFontFamily('Roboto').setFontSize(9).setFontColor('#eff7ff');
 function section(at,title,subject){
   const heading=home.getRange(at,2,1,10);heading.merge().setValue(title).setBackground('#142030')
     .setFontColor('#26dba8').setFontWeight('bold');
   home.setRowHeight(at,28);
   const header=home.getRange(at+1,2,1,10);header.setBackground('#142030')
     .setFontColor('#849fbc').setFontWeight('bold');
   home.getRange(at+1,2).setValue('#');
   home.getRange(at+1,3,1,4).merge().setValue(subject);
   home.getRange(at+1,7).setValue(subject==='Событие / турнир'?'Спорт':'Матчей');
   home.getRange(at+1,8,1,2).merge().setValue('TOTAL USD');
   home.getRange(at+1,10,1,2).merge().setValue('FILTERED USD');
   home.setRowHeight(at+1,25);
 }
 section(row,'ЛИКВИДНОСТЬ  /  ТОП-5 СОБЫТИЙ','Событие / турнир');
 section(row+8,'ЛИКВИДНОСТЬ  /  ТОП-5 ТУРНИРОВ','Турнир');
 home.getRange(row,2).setNote('BET-X RANKINGS HOME');
 function line(at,rank,title,detail,total,totalMissing,filtered,filteredMissing){
   home.getRange(at,2).setValue(rank);
   home.getRange(at,3,1,4).merge().setValue(betxCell_(title)).setWrap(true);
   home.getRange(at,7).setValue(betxCell_(detail));
   const totalCell=home.getRange(at,8,1,2).merge().setValue(betxHomeLiquidity_(total,totalMissing)).setWrap(true);
   const filteredCell=home.getRange(at,10,1,2).merge().setValue(betxHomeLiquidity_(filtered,filteredMissing)).setWrap(true);
   if(totalMissing>0||total===null)totalCell.setFontColor('#ffcc66');
   if(filteredMissing>0||filtered===null)filteredCell.setFontColor('#ffcc66');
   home.setRowHeight(at,42);
 }
 const events=betxSorted_(rankings.events,'Все','Total Liquidity').slice(0,5);
 const tournaments=betxSorted_(rankings.tournaments,'Все','Total Liquidity').slice(0,5);
 events.forEach((x,i)=>line(row+2+i,i+1,x.title+' · '+(x.tournament||'Неизвестный турнир'),x.sport,
   x.total_liquidity_usd,x.total_missing_liquidity_markets,
   x.filtered_liquidity_usd,x.filtered_missing_liquidity_markets));
 tournaments.forEach((x,i)=>line(row+10+i,i+1,x.tournament,x.match_count,
   x.total_liquidity_usd,x.total_missing_liquidity_markets,
   x.filtered_liquidity_usd,x.filtered_missing_liquidity_markets));
}
function onBETXRankingEdit(e){
 if(!e||!e.range||e.range.getSheet().getName()!=='RANKINGS'||!['B2','E2'].includes(e.range.getA1Notation()))return;
 const ss=e.source;
 if(ss.getName()!=='BET-X | TEST LAB')return;
 const lock=LockService.getDocumentLock()||LockService.getScriptLock();
 if(!lock.tryLock(30000))return;
 try{
   const rsp=UrlFetchApp.fetch(BETX_FEED_URL+'?ts='+Date.now(),{muteHttpExceptions:true});
   if(rsp.getResponseCode()!==200)throw new Error('Ranking feed HTTP '+rsp.getResponseCode());
   const feed=JSON.parse(rsp.getContentText('UTF-8'));
   if(feed.rankings_status==='complete'&&feed.rankings)renderBETXRankings_(e.range.getSheet(),feed.rankings);
 }finally{lock.releaseLock();}
}


/**
 * BET-X grouped results inside the ORIGINAL SEARCH tab, not a second search.
 * Header checkbox adds every FILTERED outcome from that match; child adds one.
 * Row groups provide native expand/collapse controls in the left sheet gutter.
 * PICKS is append-only, deduplicated by token ID.
 */
const BETX_GROUP_TAB='SEARCH';
const BETX_GROUP_HEADERS=['➕ В PICKS','Матч / рынок','Спорт','Лига','Начало (МСК)','Тип рынка','Исход','Цена','Best Ask','Спред','Ликвидность USD','Combo','Polymarket','Token ID','Match ID','Kind','Market ID','Event title','Sport code'];

function betxNumber_(value,otherwise=NaN){
  if(value===''||value===null||value===undefined)return otherwise;
  const n=typeof value==='number'?value:Number(String(value).replace(/\s/g,'').replace(',','.'));
  return Number.isFinite(n)?n:otherwise;
}
function betxSafeText_(value){
  const s=value===null||value===undefined?'':String(value);
  return /^[=+@]/.test(s)?"'"+s:s;
}
function betxDateParts_(v){
  if(v===''||v===null||v===undefined)return null;
  if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime())){
    return Utilities.formatDate(v,'Europe/Moscow','yyyy-MM-dd').split('-').map(Number);
  }
  const str=String(v),m=str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if(m)return [+m[3],+m[2],+m[1]];
  const y=str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return y?[+y[1],+y[2],+y[3]]:null;
}
function betxMskBound_(date,time,isEnd){
  const parts=betxDateParts_(date);
  if(!parts)return null;
  let hh=0,mm=0;
  if(time!==''&&time!==null&&time!==undefined){
    if(Object.prototype.toString.call(time)==='[object Date]'){
      hh=Number(Utilities.formatDate(time,'Europe/Moscow','HH'));
      mm=Number(Utilities.formatDate(time,'Europe/Moscow','mm'));
    }else if(typeof time==='number'){hh=Math.floor(time*24);mm=Math.round((time*24-hh)*60);}
    else {const match=String(time).match(/^(\d{1,2}):(\d{2})/);if(match){hh=+match[1];mm=+match[2];}}
  }
  if(isEnd)hh+=time===''||time===null||time===undefined?24:1;
  return Date.UTC(parts[0],parts[1]-1,parts[2],hh-3,mm);
}
function betxSearchConfig_(ss){
 const search=ss.getSheetByName('SEARCH');
 if(!search)throw Error('SEARCH missing');
 const left=search.getRange('B4:B12').getValues().map(r=>r[0]);
 const right=search.getRange('E4:E11').getValues().map(r=>r[0]);
 const hours=search.getRange('G10:G11').getValues().map(r=>r[0]);
 const dictionary=ss.getSheetByName('СЛОВАРЬ');
 const map=new Map();
 if(dictionary)dictionary.getRange('A6:B350').getValues().forEach(r=>{if(r[0]&&r[1])map.set(String(r[1]),String(r[0]));});
 const sport=String(left[0]||'Все').replace(/^[^ ]+ /,'');
 return {
  sport:sport==='Все'?'':sport,
  type:left[1]==='Все'?'':(map.get(String(left[1]))||String(left[1]||'')),
  combo:left[2]===true||String(left[2]).toUpperCase()==='TRUE',
  minPrice:betxNumber_(left[4],0),maxPrice:betxNumber_(left[5],1),
  maxAsk:betxNumber_(left[6],1),maxSpread:betxNumber_(left[7],1),
  minLiquidity:betxNumber_(left[8],0),
  event: String(right[0]||'').toLocaleLowerCase(),
  league:right[1]==='Все'?'':String(right[1]||''),
  market:String(right[2]||'').toLocaleLowerCase(),
  outcome:String(right[3]||'').toLocaleLowerCase(),
  sort:String(right[4]||'Ликвидность ↓'),
  limit:Math.min(200,Math.max(1,Math.floor(betxNumber_(right[5],200)))),
  from:betxMskBound_(right[6],hours[0],false),
  until:betxMskBound_(right[7],hours[1],true),
  typesRu:new Map([...map].map(([ru,code])=>[code,ru]))
 };
}
function betxOutcomeMatches_(row,cfg,now){
 const start=Date.parse(String(row[2]||''));
 if(!Number.isFinite(start)||start<=now||row[25]!=='classified')return false;
 if(cfg.from!==null&&start<cfg.from)return false;
 if(cfg.until!==null&&start>=cfg.until)return false;
 if(cfg.sport&&String(row[0])!==cfg.sport)return false;
 if(cfg.type&&String(row[3])!==cfg.type)return false;
 if(cfg.combo&&row[13]!=='available')return false;
 const price=betxNumber_(row[6]),ask=betxNumber_(row[7]),spread=betxNumber_(row[9]),liq=betxNumber_(row[10]);
 if(!(price>=cfg.minPrice&&price<=cfg.maxPrice))return false;
 if(cfg.maxAsk<1&&!(ask<=cfg.maxAsk))return false;
 if(cfg.maxSpread<1&&!(spread<=cfg.maxSpread))return false;
 if(cfg.minLiquidity>0&&!(liq>=cfg.minLiquidity))return false;
 if(cfg.event&&!String(row[1]).toLocaleLowerCase().includes(cfg.event))return false;
 if(cfg.league&&String(row[26])!==cfg.league)return false;
 if(cfg.market&&!String(row[24]).toLocaleLowerCase().includes(cfg.market))return false;
 if(cfg.outcome&&!String(row[4]).toLocaleLowerCase().includes(cfg.outcome))return false;
 return true;
}
function betxSortMatches_(rows,sort){
 const key=sort==='Цена ↑'?6:sort==='Цена ↓'?6:sort==='Скоро начнутся'?2:10;
 const dir=sort==='Цена ↑'||sort==='Скоро начнутся'?1:-1;
 return rows.sort((a,b)=>{
   const x=key===2?Date.parse(String(a[key])):betxNumber_(a[key],0);
   const y=key===2?Date.parse(String(b[key])):betxNumber_(b[key],0);
   return dir*(x-y)||String(a[19]).localeCompare(String(b[19]))||String(a[22]).localeCompare(String(b[22]));
 });
}
/**
 * Sport symbols are display-only. Stable sport codes remain in SEARCH!C,
 * and the original event title in SEARCH!R (both safe for PICKS and filters).
 */
function betxSportEmoji_(sport){
 const symbols={
  'soccer':'⚽','tennis':'🎾','american-football':'🏈','esports':'🎮',
  'basketball':'🏀','hockey':'🏒','table-tennis':'🏓','chess':'♟️',
  'darts':'🎯','baseball':'⚾','cricket':'🏏','golf':'⛳',
  'mma':'🥊','boxing':'🥊','motorsport':'🏎️','rugby':'🏉',
  'volleyball':'🏐','handball':'🤾','badminton':'🏸','cycling':'🚴',
  'swimming':'🏊','athletics':'🏃','lacrosse':'🥍','snooker':'🎱',
  'other':'🏅'
 };
 return symbols[String(sport||'').trim().toLowerCase()]||'🏅';
}
function betxMatchTitle_(event,sport){
 const title=String(event||'');
 const emoji=betxSportEmoji_(sport);
 return emoji+' '+title.replace(/^(?:⚽|🎾|🏈|🎮|🏀|🏒|🏓|♟️|🎯|⚾|🏏|⛳|🥊|🏎️|🏉|🏐|🤾|🏸|🚴|🏊|🏃|🥍|🎱|🏅)\s+/u,'');
}

function betxGroupedModel_(data,cfg,now){
 const groups=new Map();
 const matched=betxSortMatches_(data.filter(r=>betxOutcomeMatches_(r,cfg,now)),cfg.sort);
 for(const r of matched){
   const key=String(r[19]||r[18]||[r[0],r[1],r[2]].join('|'));
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(r);
 }
 const selected=[...groups].slice(0,cfg.limit);
 const display=[],groupRanges=[];let row=19;
 for(const [matchId,items] of selected){
  const first=items[0];
  const date=Utilities.formatDate(new Date(first[2]),'Europe/Moscow','dd.MM HH:mm');
  display.push([false,betxSafeText_(betxMatchTitle_(first[1],first[0])),first[0],betxSafeText_(first[26]),date,items.length+' исх.','','','','','','','','',matchId,'match','',betxSafeText_(first[1]),first[0]]);
  row++;
  const childStart=row;
  for(const r of items){
    display.push([false,betxSafeText_('↳ '+(r[24]||r[3])),r[0],betxSafeText_(r[26]),date,cfg.typesRu.get(String(r[3]))||r[3],betxSafeText_(r[4]),betxNumber_(r[6],''),betxNumber_(r[7],''),betxNumber_(r[9],''),betxNumber_(r[10],''),r[13],
      /^https:\/\/polymarket\.com\//.test(String(r[16]))?String(r[16]):'',String(r[22]),matchId,'outcome',String(r[20]),betxSafeText_(r[1]),r[0]]);
    row++;
  }
  if(items.length)groupRanges.push([childStart,items.length]);
 }
 return {display,groupRanges,matchedCount:matched.length,shownMatches:selected.length,totalMatches:groups.size};
}

/** Group requests are batched to avoid hundreds of individual sheet mutations on each edit. */
function betxGroupRange_(sheetId,pair){
 return {sheetId:sheetId,dimension:'ROWS',startIndex:pair[0]-1,endIndex:pair[0]-1+pair[1]};
}
function betxGroupRequests_(sheetId,ranges,remove){
 const requests=[];
 if(remove){
   ranges.slice().reverse().forEach(pair=>{
     const range=betxGroupRange_(sheetId,pair);
     requests.push({updateDimensionGroup:{dimensionGroup:{range:range,depth:1,collapsed:false},fields:'collapsed'}});
     requests.push({deleteDimensionGroup:{range:range}});
   });
 }else{
   ranges.forEach(pair=>requests.push({addDimensionGroup:{range:betxGroupRange_(sheetId,pair)}}));
   ranges.forEach(pair=>requests.push({updateDimensionGroup:{dimensionGroup:{
     range:betxGroupRange_(sheetId,pair),depth:1,collapsed:true},fields:'collapsed'}}));
   // A row that used to be a child can now be a match header; force it visible.
   // Google Sheets can retain hiddenByUser even after deleting old collapsed groups.
   ranges.forEach(pair=>requests.push({updateDimensionProperties:{
     range:{sheetId:sheetId,dimension:'ROWS',startIndex:pair[0]-2,endIndex:pair[0]-1},
     properties:{hiddenByUser:false},fields:'hiddenByUser'
   }}));
 }
 return requests;
}
function betxBatchGroupOperation_(ss,sh,ranges,remove){
 if(!ranges.length)return;
 const requests=betxGroupRequests_(sh.getSheetId(),ranges,remove);
 try{
   // The batch endpoint can collapse/delete/create all 200 groups in one request.
   const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(ss.getId())+':batchUpdate';
   const resp=UrlFetchApp.fetch(url,{
     method:'post',contentType:'application/json',muteHttpExceptions:true,
     headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
     payload:JSON.stringify({requests:requests})
   });
   if(resp.getResponseCode()!==200)throw Error('Sheets API HTTP '+resp.getResponseCode()+
     ' '+resp.getContentText().slice(0,240));
 }catch(error){
   Logger.log('BET-X batched grouping not available; native fallback: '+error);
   if(remove){
     // Use a single range to remove old row-group depth, rather than ~200 lookups.
     const last=Math.max.apply(null,ranges.map(p=>p[0]+p[1]-1));
     const count=Math.max(0,last-18);
     if(count)sh.getRange(19,1,count,1).shiftRowGroupDepth(-1);
   }else{
     ranges.forEach(pair=>sh.getRange(pair[0],1,pair[1],1).shiftRowGroupDepth(1));
     ranges.forEach(pair=>{const group=sh.getRowGroup(pair[0],1);if(group)group.collapse();});
     ranges.forEach(pair=>sh.showRows(pair[0]-1)); // header remains visible
   }
 }
}
function betxGroupedEditStatus_(sheet,message){
 sheet.getRange('B15').setValue(message);
}
/**
 * Deleting or rebuilding collapsed groups can leave parent rows hiddenByUser.
 * Restore all old/new SEARCH result rows before collapsing only current children.
 */
function betxRevealSearchResults_(sh,lastRow){
 if(lastRow>=19)sh.showRows(19,lastRow-18);
}
function refreshBETXGroupedSearch(options){
 const lockRequired=!(options&&options.locked);
 const lock=lockRequired?(LockService.getDocumentLock()||LockService.getScriptLock()):null;
 if(lockRequired&&!lock.tryLock(30000))throw Error('BET-X SEARCH is busy (lock)');
 let sh=null;
 try{
   const ss=SpreadsheetApp.getActiveSpreadsheet();
   if(ss.getName()!=='BET-X | TEST LAB')throw Error('Only TEST LAB');
   const source=ss.getSheetByName('DATA');
   sh=ss.getSheetByName('SEARCH');
   if(!source||!sh)throw Error('Missing DATA or SEARCH');
   betxGroupedEditStatus_(sh,'Обновление фильтров… '+Utilities.formatDate(new Date(),'Europe/Moscow','HH:mm:ss'));
   const cfg=betxSearchConfig_(ss);
   const values=source.getLastRow()>1?source.getRange(2,1,source.getLastRow()-1,27).getValues():[];
   const model=betxGroupedModel_(values,cfg,Date.now());
   const props=PropertiesService.getDocumentProperties();
   const oldGroups=JSON.parse(props.getProperty('betx_search_group_ranges')||'[]');
   // Delete collapsed groups before clearing and changing the row layout.
   betxBatchGroupOperation_(ss,sh,oldGroups,true);
   props.deleteProperty('betx_search_group_ranges');
   const oldLast=sh.getLastRow();
   if(sh.getMaxColumns()<19)sh.insertColumnsAfter(sh.getMaxColumns(),19-sh.getMaxColumns());
   const needed=18+Math.max(1,model.display.length);
   if(sh.getMaxRows()<needed)sh.insertRowsAfter(sh.getMaxRows(),needed-sh.getMaxRows());
   // Undo stale hidden parent rows from previous collapses before creating new groups.
   betxRevealSearchResults_(sh,Math.max(oldLast,needed));
   // Clear only results; do not touch SEARCH controls, or any PICKS / DATA cells.
   if(oldLast>=19){
     sh.getRange(19,1,oldLast-18,19).clearContent();
     sh.getRange(19,1,oldLast-18,1).clearDataValidations();
   }
   sh.getRange('D9').setValue('Показать матчей');
   sh.getRange('G9').setValue('До 200 матчей; внутри — все подходящие исходы');
   sh.getRange('A17').setValue('РЕЗУЛЬТАТЫ / '+model.totalMatches+' матчей · '+model.matchedCount+' исходов · показано матчей: '+model.shownMatches);
   sh.getRange(18,1,1,19).setValues([BETX_GROUP_HEADERS]);
   if(model.display.length){
     sh.getRange(19,14,model.display.length,1).setNumberFormat('@');
     sh.getRange(19,1,model.display.length,19).setValues(model.display);
     sh.getRange(19,1,model.display.length,1).insertCheckboxes();
     sh.getRange(19,8,model.display.length,3).setNumberFormat('0.000');
     sh.getRange(19,11,model.display.length,1).setNumberFormat('#,##0.00');
     // Record planned groups before execution so a retry can clear partial work.
     props.setProperty('betx_search_group_ranges',JSON.stringify(model.groupRanges));
     betxBatchGroupOperation_(ss,sh,model.groupRanges,false);
     const headerRows=model.groupRanges.map(pair=>pair[0]-1);
     if(headerRows.length)sh.getRangeList(headerRows.map(row=>'A'+row+':M'+row))
       .setBackground('#E6F0F9').setFontWeight('bold');
   }else{
     sh.getRange('B19').setValue('Нет совпадений — измените фильтры');
   }
   sh.getRange('D14').setFormula('=COUNTIF(P19:P;"match")');
   sh.getRange(18,1,1,19).setBackground('#193752').setFontColor('#FFFFFF').setFontWeight('bold');
   sh.hideColumns(3); // Sport code: retained but no longer shown as a separate column.
   sh.hideColumns(14,6);
   betxGroupedEditStatus_(sh,'Готово · '+Utilities.formatDate(new Date(),'Europe/Moscow','HH:mm:ss')+
     ' · '+model.totalMatches+' матчей · '+model.matchedCount+' исходов');
   SpreadsheetApp.flush();
   return model;
 }catch(err){
   if(sh)try{betxGroupedEditStatus_(sh,'⚠ ОШИБКА группировки: '+String(err.message||err).slice(0,110));}catch(ignored){}
   throw err;
 }finally{if(lockRequired)lock.releaseLock();}
}

function betxAddGroupedPick_(event){
 const sh=event.range.getSheet(),ss=sh.getParent(),index=event.range.getRow();
 if(index<19||event.range.getColumn()!==1||event.range.getNumRows()!==1)return;
 if(event.value!=='TRUE'&&event.value!==true)return;
 const lock=LockService.getDocumentLock()||LockService.getScriptLock();
 if(!lock.tryLock(30000))throw Error('BET-X PICKS is busy');
 let added=0,skipped=0;
 try{
  const kind=String(sh.getRange(index,16).getValue());
  if(kind!=='match'&&kind!=='outcome')return;
  let candidates=[];
  if(kind==='outcome'){candidates=sh.getRange(index,1,1,19).getValues();}
  else{
   const first=index+1,last=sh.getLastRow(),rows=[];
   if(first<=last){const chunk=sh.getRange(first,1,last-first+1,19).getValues();for(const item of chunk){if(item[15]==='match')break;if(item[15]==='outcome')rows.push(item);}}
   candidates=rows;
  }
  const picks=ss.getSheetByName('PICKS');if(!picks)throw Error('PICKS missing');
  let last=picks.getLastRow();
  const placeholder=last===2&&String(picks.getRange(2,1).getValue()).startsWith('Избранное будет');
  const seen=new Set(last>=2&&!placeholder?picks.getRange(2,7,last-1,1).getValues().map(r=>String(r[0])):[]);
  const stamp=new Date().toISOString(),out=[];
  for(const r of candidates){
    const token=String(r[13]||'');
    if(!token||seen.has(token)){skipped++;continue;}
    seen.add(token);
    const title=String(r[1]||'').replace(/^↳\s*/,'');
    const choice=[title,r[6]].filter(Boolean).join(' — ');
    out.push([stamp,r[18],r[17],betxSafeText_(choice),r[7],r[11],token,String(r[16]||''),'','',r[12]]);
  }
  if(out.length){
    const start=placeholder?2:last+1, required=start+out.length-1;
    if(picks.getMaxRows()<required)picks.insertRowsAfter(picks.getMaxRows(),required-picks.getMaxRows());
    picks.getRange(start,7,out.length,2).setNumberFormat('@');
    picks.getRange(start,1,out.length,11).setValues(out);
  }
  added=out.length;
  ss.toast('В PICKS добавлено: '+added+' · дубликатов пропущено: '+skipped,'BET-X',5);
 }finally{
  event.range.setValue(false);
  lock.releaseLock();
 }
}
function onBETXGroupedEdit(e){
 if(!e||!e.range||e.range.getSheet().getName()!=='SEARCH')return;
 const r=e.range.getRow(),c=e.range.getColumn();
 if(r>=19){if(c===1)betxAddGroupedPick_(e);return;}
 const h=e.range.getNumRows(),w=e.range.getNumColumns(),r2=r+h-1,c2=c+w-1;
 const includes=(row,col)=>r<=row&&row<=r2&&c<=col&&col<=c2;
 const filter=[4,5,6,8,9,10,11,12].some(row=>includes(row,2))||
   [4,5,6,7,8,9,10,11].some(row=>includes(row,5))||
   [10,11].some(row=>includes(row,7));
 if(filter)refreshBETXGroupedSearch();
}
function checkBETXAutomation(){
 const ss=SpreadsheetApp.getActiveSpreadsheet(),s=ss.getSheetByName('SEARCH');
 const handlers=ScriptApp.getProjectTriggers().map(t=>t.getHandlerFunction());
 const ok=handlers.includes('onBETXGroupedEdit')&&handlers.includes('syncBETX');
 const message=ok?'Автообновление: триггеры установлены':'⚠ Нет триггера фильтров или синхронизации. Запустите installBETXSync';
 if(s)s.getRange('B15').setValue(message);
 ss.toast(message,'BET-X',6);
 return ok;
}
