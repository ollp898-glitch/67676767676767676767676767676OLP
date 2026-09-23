// This process imports neither scanner nor discovery. Its only network client is FlashscoreOdds.
const fs=require('node:fs'),path=require('node:path');
const {FlashscoreOdds}=require('./providers');
const {read,write,key,hash,saveQuotes}=require('./storage');
const {comparison}=require('./matching');
function integer(value,fallback,min,max){const n=Number(value??fallback);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`Expected integer ${min}..${max}`);return n;}
class Collector{
 constructor(root,{client=new FlashscoreOdds(),interval=process.env.FLASHSCORE_ODDS_POLL_INTERVAL_MS,concurrency=process.env.FLASHSCORE_ODDS_CONCURRENCY,now=Date.now,onUpdate=()=>{}}={}){
  this.root=path.resolve(root);this.index=read(path.join(root,'index.json'));this.meta={snapshot_id:this.index.snapshot_id,snapshot_at:this.index.snapshot_at};this.client=client;this.now=now;this.onUpdate=onUpdate;
  this.interval=integer(interval,2000,250,3600000);this.concurrency=integer(concurrency,2,1,8);this.stopped=false;this.running=false;this.cooldownUntil=0;
  const registry=read(path.join(root,'registry/index.json'));if(registry.snapshot_id!==this.meta.snapshot_id)throw new Error('Mixed collector registry snapshot');
  this.events=new Map();for(const p of registry.events){const doc=read(path.join(root,p));if(doc.snapshot_id!==this.meta.snapshot_id)throw new Error('Mixed registry event');const event=doc.event;if(!this.events.has(event.event_id))this.events.set(event.event_id,{event,next:0,failures:0,lastGood:null,inflight:false,error:null,signature:null});}
  for(const s of this.events.values()){const file=path.join(root,'runtime/history',key(s.event.event_id)+'.jsonl');if(fs.existsSync(file)){const lines=fs.readFileSync(file,'utf8').trim().split('\n');try{const last=JSON.parse(lines.at(-1));if(last.snapshot_id===this.meta.snapshot_id)s.signature=last.signature;}catch{/* An interrupted final history line is not a trusted baseline. */}}}
  this.health={...this.meta,mode:'standalone_odds_only',status:'created',poll_interval_ms:this.interval,concurrency:this.concurrency,events:this.events.size,last_poll:null,successes:0,errors:0,rate_limits:0};
 }
 async tick(){if(this.stopped||this.running)return;this.running=true;try{
   if(read(path.join(this.root,'index.json')).snapshot_id!==this.meta.snapshot_id){this.stop();throw new Error('Snapshot changed; restart collector against the new registry');}
   const due=[...this.events.values()].filter(s=>!s.inflight&&s.next<=this.now()&&this.cooldownUntil<=this.now()).sort((a,b)=>a.next-b.next);
   let cursor=0;const worker=async()=>{while(cursor<due.length&&!this.stopped&&this.cooldownUntil<=this.now()){const s=due[cursor++];await this.poll(s);}};
   await Promise.all(Array.from({length:Math.min(this.concurrency,due.length)},worker));
   this.health.status=this.stopped?'stopped':'running';this.health.updated_at=new Date(this.now()).toISOString();this.health.parked_events=[...this.events.values()].filter(s=>s.next===Infinity).length;
   write(path.join(this.root,'runtime/health.json'),this.health);
  }finally{this.running=false;}}
 async poll(s){s.inflight=true;const started=this.now(),abort=new AbortController();s.abort=abort;const timeout=setTimeout(()=>abort.abort(),15000);this.health.last_poll=new Date(started).toISOString();
  try{const result=await this.client.fetchEvent(s.event,abort.signal);if(this.stopped)return;s.failures=0;s.error=null;s.lastGood=result.observed_at;this.health.successes++;
   const stable=result.quotes.map(q=>{const {external_odds_observed_at,source_timestamp,...rest}=q;return rest;}).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   const signature=hash(JSON.stringify(stable));
   if(signature!==s.signature){const history=path.join(this.root,'runtime/history',key(s.event.event_id)+'.jsonl');fs.mkdirSync(path.dirname(history),{recursive:true});
    if(fs.existsSync(history)&&fs.statSync(history).size>5*1024*1024){const old=history+'.previous';fs.rmSync(old,{force:true});fs.renameSync(history,old);}
    const changes=stable.map(q=>({bookmaker_id:q.bookmaker_id,type:q.betting_type,scope:q.betting_scope,selection:q.selection,line:q.line,participant:q.event_participant_id,odds:q.decimal_odds,active:q.active}));
    fs.appendFileSync(history,JSON.stringify({...this.meta,event_id:s.event.event_id,observed_at:result.observed_at,signature,quotes:changes})+'\n');s.signature=signature;}
   saveQuotes(this.root,this.meta,s.event.event_id,result);
   await this.onUpdate(s.event,result);
   // Never overlap an event request; slower requests make actual cadence slower than the target.
   s.next=Math.max(started+this.interval,this.now());
  }catch(e){if(this.stopped)return;this.health.errors++;if(e.http_status===429)this.health.rate_limits++;s.failures++;s.error=e.message;
   const backoff=Math.min(300000,this.interval*2**Math.min(s.failures,16));s.next=e.permanent?Infinity:this.now()+Math.max(backoff,e.retryAfterMs||0);
   if(e.http_status===429){this.cooldownUntil=Math.max(this.cooldownUntil,s.next);this.health.provider_cooldown_until=new Date(this.cooldownUntil).toISOString();}
   const file=path.join(this.root,'runtime/current',key(s.event.event_id),'index.json');const previous=fs.existsSync(file)?read(file):{};
   write(file,{...previous,...this.meta,event_id:s.event.event_id,status:previous.external_odds_observed_at?'stale':'unavailable',error:e.message,http_status:e.http_status??null,last_attempt_at:this.health.last_poll,next_attempt_at:Number.isFinite(s.next)?new Date(s.next).toISOString():null,external_odds_observed_at:previous.external_odds_observed_at||null,parts:previous.parts||[]});
  }finally{clearTimeout(timeout);s.inflight=false;delete s.abort;}}
 stop(){this.stopped=true;clearTimeout(this.timer);for(const s of this.events.values())s.abort?.abort();this.health.status='stopped';this.health.stopped_at=new Date(this.now()).toISOString();const file=path.join(this.root,'index.json');if(fs.existsSync(file)&&read(file).snapshot_id===this.meta.snapshot_id)write(path.join(this.root,'runtime/health.json'),this.health);}
 async start(){const loop=async()=>{if(this.stopped)return;try{await this.tick();}catch(e){this.stop();this.health.status='stopped';this.health.error=e.message;write(path.join(this.root,'runtime/health.json'),this.health);return;}if(!this.stopped){const next=Math.max(this.cooldownUntil,Math.min(...[...this.events.values()].map(s=>s.next)));this.timer=setTimeout(loop,Number.isFinite(next)?Math.max(25,next-this.now()):this.interval);}};await loop();}
}
function currentComparison(root,event,outcome){
 const file=event.odds_source.live_file;if(!file)return {status:'unavailable',...comparison(outcome.polymarket,[],event.facts)};
 if(!fs.existsSync(path.join(root,file)))return {status:'unavailable',...comparison(outcome.polymarket,[],event.facts)};
 const state=read(path.join(root,file));if(state.snapshot_id!==event.snapshot_id)throw new Error('Mixed live odds snapshot');const dir=path.dirname(path.join(root,file));const quotes=state.parts.flatMap(p=>{const d=read(path.join(dir,p));if(d.snapshot_id!==event.snapshot_id||d.observed_at!==state.external_odds_observed_at)throw new Error('Mixed quote snapshot');return d.quotes;});
 return {status:Date.now()-Date.parse(state.external_odds_observed_at)>30000?'stale':state.status,external_odds_observed_at:state.external_odds_observed_at,...comparison(outcome.polymarket,quotes,event.facts)};
}
module.exports={Collector,currentComparison};
if(require.main===module){const root=process.argv[2]||'out/combo-2',lock=path.join(root,'.collector.lock');fs.mkdirSync(root,{recursive:true});let fd;
 try{fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,String(process.pid));}catch{console.error('Collector lock exists. Stop the other collector; remove a stale lock only after verifying its PID.');process.exit(1);}
 let collector;const cleanup=()=>{collector?.stop();if(fd!==undefined){fs.closeSync(fd);fd=undefined;fs.rmSync(lock,{force:true});}};
 process.on('SIGINT',cleanup);process.on('SIGTERM',cleanup);process.on('exit',cleanup);
 try{collector=new Collector(root);collector.start().catch(e=>{console.error(e);cleanup();process.exitCode=1;});}catch(e){console.error(e);cleanup();process.exitCode=1;}
}
