import {useEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

/** Native modal dialog provides focus containment and makes the page inert. */
export function FullScreenNotice({title,tone,children}:{title:string;tone:'danger'|'returned'|'start';children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current!;const previous=document.activeElement as HTMLElement|null;dialog.showModal();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{dialog.close();document.body.style.overflow=old;previous?.focus();};},[]);
 return createPortal(<dialog ref={ref} className={`safety-dialog safety-${tone}`} aria-label={title} onCancel={e=>e.preventDefault()}><div className="safety-content">{children}</div></dialog>,document.body);
}
