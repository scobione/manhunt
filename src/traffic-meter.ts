import {emptyBuckets,NETWORKS,type Network,type TrafficReport} from '../shared/traffic';

/** Browser diagnostics, never a billing/security authority. Payloads and URLs
 * are inspected transiently for length/filtering; only counters leave this module. */
export function networkType(connection:{type?:string}|undefined):Network {
 return connection?.type==='wifi'?'wifi':connection?.type==='cellular'?'cellular':connection?.type==='ethernet'?'ethernet':'unknown';
}
export function resourceBytes(e:Pick<PerformanceResourceTiming,'transferSize'|'encodedBodySize'|'decodedBodySize'>){
 if(e.transferSize>0)return{down:e.transferSize,estimated:0,cached:0,unmeasured:0};
 if(e.decodedBodySize>0||e.encodedBodySize>0)return{down:0,estimated:0,cached:1,unmeasured:0};
 return{down:0,estimated:0,cached:0,unmeasured:1};
}
export class TrafficCounter {
 readonly buckets=emptyBuckets();sequence=0;
 constructor(readonly matchId:string,readonly clientId:string){}
 resource(network:Network,e:Pick<PerformanceResourceTiming,'transferSize'|'encodedBodySize'|'decodedBodySize'>){const b=this.buckets[network],v=resourceBytes(e);b.requests++;for(const k of ['down','estimated','cached','unmeasured'] as const)b[k]+=v[k];}
 payload(network:Network,down:number,up:number){const b=this.buckets[network];b.requests++;b.estimated+=down;b.up+=up;}
 snapshot():TrafficReport{return{matchId:this.matchId,clientId:this.clientId,sequence:++this.sequence,buckets:structuredClone(this.buckets)};}
}
const byteLength=(s:string)=>new TextEncoder().encode(s).byteLength;
interface Running {counter:TrafficCounter;apiPrefix:string;started:number;networkAt:(start:number,end:number)=>Network;accepting:boolean;permitted:()=>boolean;cancel:()=>void;flush:()=>Promise<void>;stop:()=>void;}
let active:Running|undefined;
/** Capture ownership at request START, so late results cannot enter another match. */
export function beginTraffic(url:string,body?:BodyInit|null){
 const owner=active;
 if(!owner?.accepting||!owner.permitted()||url.includes('/api/traffic'))return()=>{};
 const start=performance.now();
 const up=typeof body==='string'?byteLength(body):body instanceof Blob?body.size:0;
 return(text:string)=>{
  if(!owner.accepting||!owner.permitted())return;
  const e=(performance.getEntriesByName(new URL(url,window.location.href).href,'resource') as PerformanceResourceTiming[]).filter(e=>e.startTime>=start-1&&e.responseEnd>=start).at(-1);
  const network=owner.networkAt(start,performance.now());
  if(e&&!(e.transferSize===0&&e.decodedBodySize===0&&e.encodedBodySize===0)){owner.counter.resource(network,e);owner.counter.buckets[network].up+=up;}
  else owner.counter.payload(network,byteLength(text),up);
 };
}
export function socketTraffic(data:unknown,direction:'up'|'down'){
 if(!active?.accepting||!active.permitted())return;let size=0;try{size=byteLength(JSON.stringify(data)??'');}catch{return;}
 const n=performance.now();active.counter.payload(active.networkAt(n,n),direction==='down'?size:0,direction==='up'?size:0);
}
export function cancelTraffic(){active?.cancel();}
export function startTraffic(matchId:string,apiPrefix:string,send:(report:TrafficReport,signal:AbortSignal)=>Promise<unknown>,permitted:()=>boolean){
 if(!permitted())return undefined;
 active?.cancel();apiPrefix=new URL(apiPrefix||window.location.origin,window.location.href).href.replace(/\/$/,'');
 const connection=(navigator as Navigator&{connection?:EventTarget&{type?:string}}).connection;
 const changes:{at:number;network:Network}[]=[{at:performance.now(),network:networkType(connection)}];
 const abort=new AbortController();
 const counter=new TrafficCounter(matchId,crypto.randomUUID());let sending=false,stopping=false;
 const owner:Running={counter,apiPrefix,started:performance.now(),accepting:true,permitted,cancel:()=>{owner.accepting=false;stopping=false;abort.abort();clearInterval(timer);observer?.disconnect();connection?.removeEventListener('change',changed);window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',visibility);if(active===owner)active=undefined;},networkAt(start,end){
  const startNetwork=changes.filter(x=>x.at<=start).at(-1)?.network??'unknown';
  return changes.some(x=>x.at>start&&x.at<=end)?'unknown':startNetwork;
 },flush:async()=>{
  if(!permitted()){owner.cancel();return;}if(sending||abort.signal.aborted)return;sending=true;
  // Cumulative snapshots make retries and late/out-of-order reports idempotent.
  try{await send(counter.snapshot(),abort.signal);}catch{/* A later snapshot retries all counters. Gameplay remains independent. */}finally{sending=false;if(stopping){stopping=false;void owner.flush();}}
 },stop:()=>{if(!owner.accepting||!owner.permitted())return;drain(observer?.takeRecords()??[]);owner.accepting=false;clearInterval(timer);observer?.disconnect();connection?.removeEventListener('change',changed);window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',visibility);if(active===owner)active=undefined;if(sending)stopping=true;else void owner.flush();}};
 const changed=()=>{if(permitted())changes.push({at:performance.now(),network:networkType(connection)});else owner.cancel();};
 const drain=(entries:PerformanceEntry[])=>{for(const entry of entries){const e=entry as PerformanceResourceTiming;if(!owner.accepting||!permitted()||e.startTime<owner.started||!/^https?:/.test(e.name)||e.name.startsWith(apiPrefix+'/api')||e.name.includes('/socket.io/'))continue;counter.resource(owner.networkAt(e.startTime,e.responseEnd),e);}};
 let observer:PerformanceObserver|undefined;
 try{observer=new PerformanceObserver(list=>drain(list.getEntries()));observer.observe({type:'resource',buffered:false});}catch{/* Unsupported timing API: explicit API payload estimates still work. */}
 const flush=()=>{drain(observer?.takeRecords()??[]);void owner.flush();};
 const visibility=()=>{if(document.hidden)flush();};
 const timer=setInterval(flush,30000);
 connection?.addEventListener('change',changed);window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',visibility);
 active=owner;return owner;
}
