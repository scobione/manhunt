import {useEffect,useId,useState,type InputHTMLAttributes} from 'react';
import {Eye,EyeOff} from 'lucide-react';
import './password-field.css';

export function PasswordField({label,id:providedId,...input}:Omit<InputHTMLAttributes<HTMLInputElement>,'type'> & {label:string}){
 const generatedId=useId(),id=providedId||generatedId;
 const [visible,setVisible]=useState(false);
 useEffect(()=>{const hide=()=>{if(document.hidden)setVisible(false);};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide);},[]);
 useEffect(()=>{if(!input.value||input.disabled)setVisible(false);},[input.value,input.disabled]);
 return <div className="password-field"><label htmlFor={id}>{label}</label><div className="password-input-row"><input {...input} id={id} type={visible?'text':'password'}/><button className="password-toggle" type="button" aria-label={`${label} ${visible?'verbergen':'anzeigen'}`} aria-controls={id} aria-pressed={visible} disabled={input.disabled} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={20}/>:<Eye size={20}/>}</button></div></div>;
}
