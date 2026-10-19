'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'BETX_TEST_SYNC.gs'),'utf8');
const ctx={};vm.createContext(ctx);vm.runInContext(script,ctx);

class Range{
 constructor(sheet,row,col,rows=1,cols=1){Object.assign(this,{sheet,row,col,rows,cols});}
 key(r=this.row,c=this.col){return `${r}:${c}`;}
 getValue(){return this.sheet.cells.get(this.key())??'';}
 getNote(){return this.sheet.notes.get(this.key())??'';}
 setNote(v){this.sheet.notes.set(this.key(),v);return this;}
 setValue(v){this.sheet.cells.set(this.key(),v);return this;}
 getValues(){return Array.from({length:this.rows},(_,i)=>Array.from({length:this.cols},(_,j)=>
   this.sheet.cells.get(this.key(this.row+i,this.col+j))??''));}
 setValues(values){values.forEach((line,i)=>line.forEach((v,j)=>this.sheet.cells.set(this.key(this.row+i,this.col+j),v)));return this;}
 clearContent(){for(let i=0;i<this.rows;i++)for(let j=0;j<this.cols;j++)this.sheet.cells.delete(this.key(this.row+i,this.col+j));return this;}
 breakApart(){return this;}merge(){return this;}
 setBackground(){return this;}setFontFamily(){return this;}setFontSize(){return this;}
 setFontColor(){return this;}setFontWeight(){return this;}setWrap(){return this;}
}
class Sheet{
 constructor(cols=12){this.cols=cols;this.rows=55;this.cells=new Map([['53:2','Источники']]);this.notes=new Map();this.insertedColumns=0;}
 getRange(r,c,rows=1,cols=1){return new Range(this,r,c,rows,cols);}
 getMaxColumns(){return this.cols;}getMaxRows(){return this.rows;}
 getLastRow(){return Math.max(0,...[...this.cells].filter(([,v])=>v!==''&&v!==null).map(([key])=>Number(key.split(':')[0])));}
 insertRowsAfter(_after,count){this.rows+=count;}
 insertColumnsAfter(_after,count){this.insertedColumns+=count;this.cols+=count;}
 deleteColumns(from,count){assert.equal(from,13);this.cols-=count;}
 setRowHeight(){}
}
class State{
 constructor(){this.values=new Map();}
 getProperty(k){return this.values.get(k)??null;}
 setProperty(k,v){this.values.set(k,v);}
 deleteProperty(k){this.values.delete(k);}
}
const complete={sport:'soccer',title:'A vs B',tournament:'Premier League',match_count:2,
 market_count:4,saved_outcomes_count:2,markets_with_ask:1,
 total_liquidity_usd:100,filtered_liquidity_usd:40,
 total_missing_liquidity_markets:0,filtered_missing_liquidity_markets:0};
const incomplete={...complete,title:'C vs D',tournament:'Other League',
 total_liquidity_usd:null,filtered_liquidity_usd:null,
 total_missing_liquidity_markets:3,filtered_missing_liquidity_markets:1};
const rankings={events:[complete,incomplete],tournaments:[{...complete,tournament:'Premier League'},
 {...incomplete,tournament:'Other League'}]};
assert.equal(ctx.betxEventCells_(incomplete)[6],'Неполные данные');
assert.equal(ctx.betxEventCells_(incomplete)[8],3);
assert.equal(ctx.betxEventCells_(incomplete)[9],1);
assert.equal(ctx.betxTournamentCells_(incomplete)[7],'Неполные данные');
assert.match(ctx.betxHomeLiquidity_(null,3),/Неполные данные · 3 рынка/);
assert.equal(ctx.betxSorted_([incomplete,complete],'Все','Total Liquidity')[0].title,'A vs B');
assert.equal(ctx.betxSorted_([{...incomplete,total_liquidity_usd:9999},complete],'Все','Total Liquidity')[0].title,'A vs B');

const home=new Sheet(),state=new State();
ctx.renderBETXHome_(home,rankings,state);
assert.equal(home.cols,12);
assert.equal(home.insertedColumns,0);
assert.equal(home.getRange(53,2).getValue(),'Источники');
assert.equal(state.getProperty('betx_home_rankings_row'),'55');
assert.equal(home.getRange(55,2).getNote(),'BET-X RANKINGS HOME');
assert.match(home.getRange(55,2).getValue(),/ТОП-5 СОБЫТИЙ/);
assert.match(home.getRange(63,2).getValue(),/ТОП-5 ТУРНИРОВ/);
assert.equal(home.getRange(57,8).getValue(),'100 USD');
assert.match(home.getRange(58,8).getValue(),/Неполные данные · 3 рынка/);
assert.match(home.getRange(58,10).getValue(),/Неполные данные · 1 рынок/);
assert.equal(home.getRange(65,8).getValue(),'100 USD');
ctx.renderBETXHome_(home,rankings,state);
assert.equal(home.getLastRow(),66);
assert.equal(home.cols,12);

const legacy=new Sheet(24),legacyState=new State();
legacy.getRange(1,12).setValue('BET-X RANKINGS HOME');
legacyState.setProperty('betx_home_rankings_col','12');
ctx.renderBETXHome_(legacy,rankings,legacyState);
assert.equal(legacy.cols,12);
assert.equal(legacy.getRange(53,2).getValue(),'Источники');
assert.equal(legacyState.getProperty('betx_home_rankings_col'),null);
console.log('TEST LAB display tests passed');
