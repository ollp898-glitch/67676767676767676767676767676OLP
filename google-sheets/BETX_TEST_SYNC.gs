/**
 * BET-X Google Sheets sync — bind this script to TEST LAB only.
 * Run installBETXSync once. It performs an immediate sync and installs an hourly trigger.
 * It never edits SEARCH or PICKS except SEARCH!B14 status.
 */
const BETX_FEED_URL='https://raw.githubusercontent.com/ollp898-glitch/67676767676767676767676767676OLP/data/sheets.json';

function installBETXSync(){
  const existing=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='syncBETX');
  existing.forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncBETX').timeBased().everyHours(1).create();
  syncBETX();
}
function onOpen(){
  SpreadsheetApp.getUi().createMenu('BET-X').addItem('Обновить исходы','syncBETX').addItem('Настроить автообновление','installBETXSync').addToUi();
}
function syncBETX(){
 const lock=LockService.getDocumentLock()||LockService.getScriptLock();
 if(!lock.tryLock(30000))throw new Error('Another BET-X synchronization is running');
 const ss=SpreadsheetApp.getActiveSpreadsheet();
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
   if(state.getProperty('betx_source_sha256')===feed.source_sha256){
     if(status)status.getRange('B14').setValue('Без изменений · '+feed.snapshot_at+' · '+feed.row_count+' исходов');
     return;
   }

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
   if(status)status.getRange('B14').setValue('Обновлено · '+feed.snapshot_at+' · '+feed.row_count+' исходов');
 }catch(e){
   if(status)status.getRange('B14').setValue('ОШИБКА синхронизации: '+String(e.message||e).slice(0,130));
   throw e;
 }finally{lock.releaseLock();}
}
