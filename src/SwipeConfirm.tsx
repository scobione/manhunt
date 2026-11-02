import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties,type KeyboardEvent,type PointerEvent} from 'react';
import {ArrowRight,Check,LoaderCircle} from 'lucide-react';
import './swipe-confirm.css';

type Phase='idle'|'dragging'|'confirming'|'pending'|'success'|'error';
type Drag={id:number;x:number;progress:number};
interface Props {
 label:string;
 tone?:'danger'|'return'|'zombie';
 disabled:boolean;
 disabledHint?:string;
 onConfirm:()=>Promise<unknown>;
}
const clamp=(value:number)=>Math.min(1,Math.max(0,value));

/** Only a completed grip gesture (or deliberate keyboard movement) confirms.
 * Pointer capture keeps tracking outside the grip. The server remains authoritative.
 */
export default function SwipeConfirm({label,tone='return',disabled,disabledHint,onConfirm}:Props){
 const track=useRef<HTMLDivElement>(null),grip=useRef<HTMLDivElement>(null);
 const drag=useRef<Drag|null>(null),position=useRef(0),travel=useRef(0),locked=useRef(false);
 const mounted=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const latest=useRef({disabled,onConfirm});
 const [progress,setProgress]=useState(0),[distance,setDistance]=useState(0),[phase,setPhase]=useState<Phase>('idle'),[error,setError]=useState('');
 const hintId=useId(),statusId=useId();
 const processing=phase==='confirming'||phase==='pending';
 const unavailable=disabled||processing||phase==='success';

 function move(value:number){position.current=clamp(value);setProgress(position.current);}
 function releasePointer(){
  const pointer=drag.current;drag.current=null;
  if(pointer&&grip.current?.hasPointerCapture(pointer.id))grip.current.releasePointerCapture(pointer.id);
 }
 function cancel(){releasePointer();if(!locked.current){move(0);setPhase('idle');}}

 useLayoutEffect(()=>{latest.current={disabled,onConfirm};if(disabled)cancel();},[disabled,onConfirm]);
 useLayoutEffect(()=>{
  const measure=()=>{
   if(!track.current||!grip.current)return;
   const inset=parseFloat(getComputedStyle(grip.current).left)||0;
   const next=Math.max(0,track.current.clientWidth-inset*2-grip.current.offsetWidth);
   if(next!==travel.current){cancel();travel.current=next;setDistance(next);}
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(track.current!);observer.observe(grip.current!);
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  mounted.current=true;
  const interrupt=()=>cancel();
  const visibility=()=>{if(document.hidden)cancel();};
  window.addEventListener('blur',interrupt);document.addEventListener('visibilitychange',visibility);
  return()=>{mounted.current=false;clearTimeout(timer.current);releasePointer();window.removeEventListener('blur',interrupt);document.removeEventListener('visibilitychange',visibility);};
 },[]);

 function confirm(){
  if(latest.current.disabled||locked.current||position.current<.95||travel.current<=0)return;
  locked.current=true;move(1);setError('');setPhase('confirming');
  // Brief acknowledgement of the completed gesture before the server response
  // removes this view. "Bestätigt" is reserved for an actually successful request.
  timer.current=setTimeout(()=>{void (async()=>{
   if(!mounted.current)return;
   if(latest.current.disabled){locked.current=false;move(0);setPhase('idle');return;}
   setPhase('pending');
   try{await latest.current.onConfirm();if(mounted.current)setPhase('success');}
   catch(cause){
    if(!mounted.current)return;
    locked.current=false;move(0);setPhase('error');
    setError(cause instanceof Error?cause.message:'Bestätigung fehlgeschlagen. Bitte erneut versuchen.');
   }
  })();},180);
 }
 function pointerDown(event:PointerEvent<HTMLDivElement>){
  if(unavailable||locked.current||drag.current||!event.isPrimary||event.button!==0||travel.current<=0)return;
  event.preventDefault();event.currentTarget.focus({preventScroll:true});
  drag.current={id:event.pointerId,x:event.clientX,progress:position.current};
  event.currentTarget.setPointerCapture(event.pointerId);setError('');setPhase('dragging');
 }
 function pointerMove(event:PointerEvent<HTMLDivElement>){
  const pointer=drag.current;if(!pointer||pointer.id!==event.pointerId||latest.current.disabled||locked.current)return;
  event.preventDefault();move(pointer.progress+(event.clientX-pointer.x)/travel.current);
 }
 function pointerUp(event:PointerEvent<HTMLDivElement>){
  if(drag.current?.id!==event.pointerId)return;
  pointerMove(event);releasePointer();
  if(position.current>=.95&&!latest.current.disabled)confirm();else{move(0);setPhase('idle');}
 }
 function keyDown(event:KeyboardEvent<HTMLDivElement>){
  const changes:Record<string,number>={ArrowRight:.1,ArrowUp:.1,ArrowLeft:-.1,ArrowDown:-.1,PageUp:.25,PageDown:-.25};
  if(!(event.key in changes)&&event.key!=='Home'&&event.key!=='End'&&event.key!=='Escape')return;
  event.preventDefault();
  if(unavailable||locked.current||drag.current)return;
  setError('');setPhase('idle');
  move(event.key==='Home'||event.key==='Escape'?0:event.key==='End'?1:position.current+changes[event.key]);
 }
 function keyUp(event:KeyboardEvent<HTMLDivElement>){
  if(['ArrowRight','ArrowUp','PageUp','End'].includes(event.key)&&!unavailable&&!drag.current){event.preventDefault();confirm();}
 }
 const status=processing?'Bestätigung wird gesendet.':phase==='success'?'Bestätigt.':error;
 const copy=processing?'Wird bestätigt…':phase==='success'?'Bestätigt':label;
 const style={'--swipe-offset':`${progress*distance}px`,'--swipe-copy-opacity':processing||phase==='success'?1:Math.max(0,1-progress*3)} as CSSProperties;
 return <div className={`swipe-confirm swipe-${tone}`} data-phase={phase} data-disabled={disabled||undefined} style={style}>
  <div ref={track} className="swipe-track" data-testid="swipe-track">
   <span className="swipe-fill" aria-hidden="true"/>
   <span className="swipe-copy" aria-hidden="true">{copy}</span>
   <div ref={grip} className="swipe-grip" role="slider" tabIndex={0} aria-label={label}
    aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress*100)}
    aria-valuetext={disabled?(disabledHint??'Momentan gesperrt'):status||`${Math.round(progress*100)} Prozent`}
    aria-disabled={unavailable} aria-busy={processing} aria-describedby={`${hintId} ${statusId}`}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
    onPointerCancel={cancel} onLostPointerCapture={()=>{if(drag.current)cancel();}}
    onKeyDown={keyDown} onKeyUp={keyUp} onBlur={()=>{if(!drag.current)cancel();}}
    onDragStart={event=>event.preventDefault()}>
    {phase==='pending'?<LoaderCircle className="swipe-spinner" aria-hidden="true"/>:phase==='confirming'||phase==='success'?<Check aria-hidden="true"/>:<ArrowRight aria-hidden="true"/>}
   </div>
  </div>
  <span id={hintId} className={disabled&&disabledHint?'swipe-hint':'sr-only'}>{disabled&&disabledHint?disabledHint:'Griff nach rechts ziehen und loslassen. Tastatur: Pfeile bewegen, Ende bestätigt, Escape setzt zurück.'}</span>
  <span id={statusId} role="status" aria-live="polite" className={error?'swipe-error':'sr-only'}>{status}</span>
 </div>;
}
