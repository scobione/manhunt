interface Options {
 cadence:()=>number;
 position:(value:GeolocationPosition,force:boolean)=>void;
 error:(value:GeolocationPositionError)=>void;
}
/** One foreground watch. A one-shot is only needed when that watch has stopped
 * delivering fresh samples, or when the player explicitly requests a new fix. */
export function observeGps({cadence,position,error}:Options){
 let active=true,watch:number|null=null,version=0,request=0,pending=false,lastFix=0;
 const allowed=()=>active&&!document.hidden&&cadence()>0;
 const valid=(generation:number)=>allowed()&&generation===version;
 const suspend=()=>{version++;request++;pending=false;if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;};
 const received=(value:GeolocationPosition,force:boolean,generation:number)=>{
  if(!valid(generation))return;
  lastFix=Number.isFinite(value.timestamp)?Math.min(Date.now(),value.timestamp):0;
  position(value,force);
 };
 const refresh=(force=false)=>{
  if(!allowed()||pending)return;
  pending=true;const generation=version,id=++request;
  navigator.geolocation.getCurrentPosition(value=>{if(id===request)pending=false;received(value,force,generation);},value=>{
   if(id===request)pending=false;if(valid(generation))error(value);
  },{enableHighAccuracy:true,maximumAge:0,timeout:12000});
 };
 const configure=()=>{
  if(!allowed()){if(watch!==null||pending)suspend();return;}
  if(watch!==null)return;
  const generation=++version;lastFix=0;
  const id=navigator.geolocation.watchPosition(value=>received(value,false,generation),value=>{if(valid(generation))error(value);},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  if(valid(generation))watch=id;else navigator.geolocation.clearWatch(id);
 };
 const visibility=()=>{configure();if(allowed())refresh();};
 document.addEventListener('visibilitychange',visibility);
 const timer=window.setInterval(()=>{configure();if(allowed()&&!pending&&Date.now()-lastFix>=cadence())refresh();},1000);
 configure();
 return{refresh,reconfigure:configure,stop:()=>{if(!active)return;active=false;suspend();clearInterval(timer);document.removeEventListener('visibilitychange',visibility);}};
}
