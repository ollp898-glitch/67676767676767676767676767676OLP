'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'BETX_TEST_SYNC.gs'),'utf8');
const ctx={
  Utilities:{formatDate(date,_tz,fmt){
    const d=new Date(date);
    const parts=[String(d.getUTCDate()).padStart(2,'0'),String(d.getUTCMonth()+1).padStart(2,'0')];
    if(fmt==='yyyy-MM-dd')return d.getUTCFullYear()+'-'+parts[1]+'-'+parts[0];
    return parts.join('.')+' '+String((d.getUTCHours()+3)%24).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0');
  }},
  LockService:{getDocumentLock:()=>({tryLock:()=>true,releaseLock(){}})},
};
vm.createContext(ctx);vm.runInContext(source,ctx);
const row=(match,token,price,combo='available')=>{
 const a=Array(27).fill('');
 a[0]='hockey';a[1]=match==='matchA'?'Canadiens vs Blackhawks':'Other match';
 a[2]='2026-11-02T00:00:00.000Z';a[3]='totals';a[4]='Over';a[6]=price;
 a[7]=price+0.01;a[9]=0.02;a[10]=4000;a[13]=combo;
 a[16]='https://polymarket.com/event/demo';a[19]=match;a[20]='market-'+token;
 a[22]=token;a[24]='Total Over 4.5';a[25]='classified';a[26]='NHL';
 return a;
};
const cfg={sport:'hockey',type:'',combo:true,minPrice:.8,maxPrice:.95,maxAsk:1,
  maxSpread:1,minLiquidity:0,event:'',league:'',market:'',outcome:'',
  sort:'Цена ↓',limit:200,from:null,until:null,typesRu:new Map([['totals','Тоталы']])};
const model=ctx.betxGroupedModel_([
 row('matchA','tok1',.91),row('matchA','tok2',.86),row('matchA','out-of-range',.3),
 row('matchB','tok3',.9),row('matchB','not-combo',.92,'unavailable')
],cfg,Date.parse('2026-10-25T00:00:00Z'));
assert.equal(model.totalMatches,2);
assert.equal(model.matchedCount,3);
assert.deepEqual(Array.from(model.groupRanges,x=>Array.from(x)),[[20,2],[23,1]]);
assert.deepEqual(Array.from(model.display.filter(x=>x[15]==='outcome'),x=>x[13]),['tok1','tok2','tok3']);
const limited=ctx.betxGroupedModel_([row('matchA','tok1',.91),row('matchA','tok2',.86),row('matchB','tok3',.9)],{...cfg,limit:1},Date.parse('2026-10-25T00:00:00Z'));
assert.equal(limited.shownMatches,1);
assert.equal(limited.display.length,3,'One whole match + both filtered outcomes');
assert.equal(ctx.betxMskBound_('02.11.2026','00:00',false),Date.UTC(2026,10,1,21));
assert.equal(ctx.betxMskBound_('02.11.2026','23:00',true),Date.UTC(2026,10,2,21));
assert.equal(ctx.betxOutcomeMatches_(row('matchA','tok1',.91),{...cfg,event:'other'},Date.parse('2026-10-25')),false);

// Minimal spreadsheet model to test genuine on-edit -> PICKS persistence and dedup.
class Range {
 constructor(sheet,r,c,h=1,w=1){Object.assign(this,{sheet,r,c,h,w});}
 getValue(){return this.sheet.cells.get(this.r+':'+this.c)??'';}
 getValues(){return Array.from({length:this.h},(_,i)=>Array.from({length:this.w},(_,j)=>this.sheet.cells.get((this.r+i)+':'+(this.c+j))??''));}
 setValue(v){this.sheet.cells.set(this.r+':'+this.c,v);return this;}
 setValues(v){v.forEach((a,i)=>a.forEach((s,j)=>this.sheet.cells.set((this.r+i)+':'+(this.c+j),s)));return this;}
 setNumberFormat(){return this;}
 getRow(){return this.r;}
 getColumn(){return this.c;}
 getNumRows(){return this.h;}
 getNumColumns(){return this.w;}
 getSheet(){return this.sheet;}
}
class Sheet {
 constructor(name){this.name=name;this.cells=new Map();this.maxRows=200;}
 getName(){return this.name;}
 getParent(){return workbook;}
 getMaxRows(){return this.maxRows;}
 insertRowsAfter(_at,n){this.maxRows+=n;}
 getRange(r,c,h,w){return new Range(this,r,c,h,w);}
 getLastRow(){return Math.max(0,...[...this.cells].filter(([,v])=>v!==''&&v!==null).map(([k])=>Number(k.split(':')[0])));}
}
const grouped=new Sheet('SEARCH'),picks=new Sheet('PICKS');
const workbook={getSheetByName:n=>n==='PICKS'?picks:grouped,toast:()=>{}};
ctx.SpreadsheetApp={getActiveSpreadsheet:()=>workbook};
model.display.forEach((v,i)=>grouped.getRange(i+19,1,1,19).setValues([v]));
picks.getRange(1,1).setValue('Добавлено UTC');
picks.getRange(2,1).setValue('Избранное будет сохраняться отдельно от DATA.');
const click=r=>{const range=grouped.getRange(r,1);range.setValue(true);ctx.onBETXGroupedEdit({range,value:'TRUE'});assert.equal(range.getValue(),false);};
click(19);
assert.equal(picks.getLastRow(),3);
assert.equal(picks.getRange(2,7).getValue(),'tok1');
assert.equal(picks.getRange(3,7).getValue(),'tok2');
click(19); // clicking the same match again must not duplicate
assert.equal(picks.getLastRow(),3);
click(23); // a different single outcome
assert.equal(picks.getLastRow(),4);
assert.equal(picks.getRange(4,7).getValue(),'tok3');
picks.getRange(2,9).setValue('Keep my analysis');
click(20); // already saved individual outcome
assert.equal(picks.getLastRow(),4);
assert.equal(picks.getRange(2,9).getValue(),'Keep my analysis');

// The installed onEdit route must ignore non-checkbox cells and changes on other tabs.
const beforeUnrelated=picks.getLastRow();
ctx.onBETXGroupedEdit({range:grouped.getRange(3,3),value:'TRUE'});
ctx.onBETXGroupedEdit({range:picks.getRange(2,1),value:'TRUE'});
assert.equal(picks.getLastRow(),beforeUnrelated);

console.log('BET-X grouped search / PICKS regression tests passed');


const removalRequests=ctx.betxGroupRequests_(101,[[20,2],[25,3]],true);
assert.equal(removalRequests.length,4);
assert.equal(removalRequests[0].updateDimensionGroup.dimensionGroup.collapsed,false);
assert.equal(removalRequests[1].deleteDimensionGroup.range.startIndex,24);
assert.equal(removalRequests[3].deleteDimensionGroup.range.startIndex,19);
const creationRequests=ctx.betxGroupRequests_(101,[[20,2],[25,3]],false);
assert.equal(creationRequests.length,6);
assert.equal(creationRequests[0].addDimensionGroup.range.startIndex,19);
assert.equal(creationRequests[0].addDimensionGroup.range.endIndex,21);
assert.equal(creationRequests[2].updateDimensionGroup.dimensionGroup.collapsed,true);
assert.equal(creationRequests[3].updateDimensionGroup.dimensionGroup.depth,1);
assert.equal(creationRequests[4].updateDimensionProperties.range.startIndex,18); // match header row 19
assert.equal(creationRequests[5].updateDimensionProperties.range.startIndex,23); // match header row 24
assert.equal(creationRequests[4].updateDimensionProperties.properties.hiddenByUser,false);
console.log('BET-X batched group request regression checks passed');


const visibilityCalls=[];
ctx.betxRevealSearchResults_({showRows(start,count){visibilityCalls.push([start,count]);}},120);
ctx.betxRevealSearchResults_({showRows(start,count){visibilityCalls.push([start,count]);}},18);
assert.deepEqual(visibilityCalls,[[19,102]],'unhide only SEARCH result rows before regrouping');
console.log('SEARCH parent visibility reset test passed');
