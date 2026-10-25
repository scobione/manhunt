import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

/** Native modal dialog provides focus containment and makes the page inert. */
export function FullScreenNotice({title,tone,children}:{title:string;tone:'danger'|'returned';children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current!;const previous=document.activeElement as HTMLElement|null;dialog.showModal();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{dialog.close();document.body.style.overflow=old;previous?.focus();};},[]);
 return createPortal(<dialog ref={ref} className={`safety-dialog safety-${tone}`} aria-label={title} onCancel={e=>e.preventDefault()}><div className="safety-content">{children}</div></dialog>,document.body);
}
export function SwipeConfirm({label,disabled,onConfirm}:{label:string;disabled:boolean;onConfirm:()=>Promise<unknown>}){
 const [value,setValue]=useState(0);const submitting=useRef(false);
 useEffect(()=>{if(disabled)setValue(0);},[disabled]);
 return <label className="safety-swipe"><span>{label} →</span><input aria-label={label} type="range" min="0" max="100" value={value} disabled={disabled} onChange={async e=>{const next=Number(e.target.value);setValue(next);if(next===100&&!disabled&&!submitting.current){submitting.current=true;try{await onConfirm();}finally{submitting.current=false;setValue(0);}}}}/><small>Nach rechts wischen · Tastatur: Ende</small></label>;
}
