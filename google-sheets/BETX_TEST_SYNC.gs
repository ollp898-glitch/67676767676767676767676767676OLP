/**
 * BET-X Google Sheets sync — bind this script to TEST LAB only.
 * Run installBETXSync once. It performs an immediate sync and installs an hourly trigger.
 * It never edits SEARCH or PICKS except SEARCH!B14 status.
 */
const BETX_FEED_URL='https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/sheets.json';

function installBETXSync(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(ss.getName()!=='BET-X | TEST LAB')throw new Error('This script is for BET-X | TEST LAB only');
  const existing=ScriptApp.getProjectTriggers().filter(t=>['syncBETX','onBETXRankingEdit'].includes(t.getHandlerFunction()));
  existing.forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncBETX').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('onBETXRankingEdit').forSpreadsheet(ss).onEdit().create();
  syncBETX();
}
function onOpen(){
  SpreadsheetApp.getUi().createMenu('BET-X').addItem('Обновить исходы','syncBETX').addItem('Настроить автообновление','installBETXSync').addToUi();
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
   return (b[first]??-1)-(a[first]??-1)||(b[second]??-1)-(a[second]??-1)||
     String(a.title||a.tournament).localeCompare(String(b.title||b.tournament));
 });
}
function betxEventCells_(x){return [x.sport,x.title,x.tournament||'Неизвестный турнир',x.market_count,
 x.saved_outcomes_count,x.markets_with_ask,x.total_liquidity_usd,x.filtered_liquidity_usd,x.total_missing_liquidity_markets];}
function betxTournamentCells_(x){return [x.sport,x.tournament,x.match_count,x.market_count,
 x.saved_outcomes_count,x.markets_with_ask,x.total_liquidity_usd,x.filtered_liquidity_usd,x.total_missing_liquidity_markets];}
function renderBETXRankings_(sh,rankings){
 const sport=String(sh.getRange('B2').getValue()||'Все');
 const sort=String(sh.getRange('E2').getValue()||'Total Liquidity');
 const sports=['Все',...new Set(rankings.events.map(x=>x.sport))].sort();
 const selectedSport=sports.includes(sport)?sport:'Все';
 const selectedSort=['Total Liquidity','Filtered Liquidity'].includes(sort)?sort:'Total Liquidity';
 const events=betxSorted_(rankings.events,selectedSport,selectedSort);
 const tournaments=betxSorted_(rankings.tournaments,selectedSport,selectedSort);
 const needed=Math.max(events.length,tournaments.length)+5;
 if(sh.getMaxColumns()<19)sh.insertColumnsAfter(sh.getMaxColumns(),19-sh.getMaxColumns());
 if(sh.getMaxRows()<needed)sh.insertRowsAfter(sh.getMaxRows(),needed-sh.getMaxRows());
 sh.clearContents();
 sh.getRange('A1').setValue('BET-X RANKINGS');
 sh.getRange('A2').setValue('Вид спорта');sh.getRange('B2').setValue(selectedSport);
 sh.getRange('D2').setValue('Сортировка');sh.getRange('E2').setValue(selectedSort);
 sh.getRange('B2').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(sports,true).build());
 sh.getRange('E2').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Total Liquidity','Filtered Liquidity'],true).build());
 sh.getRange('A3').setValue('Снимок: '+rankings.snapshot_at+' · событий: '+rankings.event_count+
  ' · турниров: '+rankings.tournament_count+' · без названия турнира: '+rankings.unknown_tournament_events);
 sh.getRange('A4').setValue('ТОП событий');sh.getRange('K4').setValue('ТОП турниров');
 sh.getRange(5,1,1,9).setValues([['Спорт','Событие','Турнир','Рынки','Исходы','Рынки с Ask','Total Liquidity USD','Filtered Liquidity USD','Без ликвидности']]);
 sh.getRange(5,11,1,9).setValues([['Спорт','Турнир','Матчи','Рынки','Исходы','Рынки с Ask','Total Liquidity USD','Filtered Liquidity USD','Без ликвидности']]);
 if(events.length)sh.getRange(6,1,events.length,9).setValues(events.map(x=>betxEventCells_(x).map(betxCell_)));
 if(tournaments.length)sh.getRange(6,11,tournaments.length,9).setValues(tournaments.map(x=>betxTournamentCells_(x).map(betxCell_)));
 sh.getRange(5,1,1,9).setFontWeight('bold');sh.getRange(5,11,1,9).setFontWeight('bold');
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
 const state=PropertiesService.getDocumentProperties();
 let col=Number(state.getProperty('betx_home_rankings_col'));
 if(!Number.isInteger(col)||col<1||home.getRange(1,col).getValue()!=='BET-X RANKINGS HOME'){
   col=home.getLastColumn()+2;
   if(home.getMaxColumns()<col+12)home.insertColumnsAfter(home.getMaxColumns(),col+12-home.getMaxColumns());
   state.setProperty('betx_home_rankings_col',String(col));
 }
 home.getRange(1,col,8,13).clearContent();
 home.getRange(1,col).setValue('BET-X RANKINGS HOME');
 home.getRange(2,col).setValue('ТОП-5 событий · Total Liquidity');
 home.getRange(2,col+7).setValue('ТОП-5 турниров · Total Liquidity');
 home.getRange(3,col,1,6).setValues([['Спорт','Событие','Турнир','Рынки','Total USD','Filtered USD']]);
 home.getRange(3,col+7,1,6).setValues([['Спорт','Турнир','Матчи','Рынки','Total USD','Filtered USD']]);
 const events=betxSorted_(rankings.events,'Все','Total Liquidity').slice(0,5);
 const tournaments=betxSorted_(rankings.tournaments,'Все','Total Liquidity').slice(0,5);
 if(events.length)home.getRange(4,col,events.length,6).setValues(events.map(x=>
   [x.sport,x.title,x.tournament||'Неизвестный турнир',x.market_count,x.total_liquidity_usd,x.filtered_liquidity_usd].map(betxCell_)));
 if(tournaments.length)home.getRange(4,col+7,tournaments.length,6).setValues(tournaments.map(x=>
   [x.sport,x.tournament,x.match_count,x.market_count,x.total_liquidity_usd,x.filtered_liquidity_usd].map(betxCell_)));
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
