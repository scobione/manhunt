import {useId} from 'react';
import {Check,Minus,Plus,Skull,Target,Radio,Shield} from 'lucide-react';
import type {Settings,Rules} from '../shared/types';
import {rules} from '../shared/rules';
export function Slider({label,value,min,max,step=1,unit='',onChange,disabled=false}:{label:string;value:number;min:number;max:number;step?:number;unit?:string;onChange:(v:number)=>void;disabled?:boolean}){
 const id=useId(),set=(v:number)=>onChange(Math.max(min,Math.min(max,Math.round(v/step)*step)));
 return <div className="tactical-slider"><label htmlFor={id}>{label}<output htmlFor={id}>{Number(value.toFixed(2))} {unit}</output></label><div><button type="button" aria-label={`${label} verringern`} disabled={disabled||value<=min} onClick={()=>set(value-step)}><Minus size={17}/></button><input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e=>set(Number(e.target.value))} style={{'--slider-progress':`${100*(value-min)/(max-min)}%`} as React.CSSProperties}/><button type="button" aria-label={`${label} erhöhen`} disabled={disabled||value>=max} onClick={()=>set(value+step)}><Plus size={17}/></button></div></div>;
}
export function ModeCards({settings,onChange}:{settings:Settings;onChange:(s:Settings)=>void}){
 const current=rules(settings);const toggle=(key:keyof Rules)=>onChange({...settings,mode:'normal',winCondition:'survival',rules:{...current,[key]:!current[key]}});
 return <div className="module-grid" role="group" aria-label="Spielmodi kombinieren"><div className="module-card base"><Shield/><strong>NORMAL</strong><p>Hunter verfolgen Hider. Die Grundlage für jede Kombination.</p><span>IMMER AKTIV</span></div>{([{key:'zombie',title:'ZOMBIE',Icon:Skull,text:'Ein Fang wechselt die Seiten. Nach dem Swipe jagst du mit den Huntern.'},{key:'apocalypse',title:'APOKALYPSE',Icon:Radio,text:'Die Zone schrumpft phasenweise bis zur ausgewählten Endzone.'},{key:'xpHunt',title:'XP-JAGD',Icon:Target,text:'Sammelt sichere Wegpunkte, bevor die Hunter euch fangen.'}] as const).map(({key,title,Icon,text})=><button type="button" className={`module-card ${current[key]?'selected':''}`} key={key} aria-pressed={current[key]} onClick={()=>toggle(key)}><Icon/><strong>{title}</strong><p>{text}</p><span>{current[key]?<><Check size={14}/> AKTIV</>:<><Plus size={14}/> HINZUFÜGEN</>}</span></button>)}</div>;
}

export function PhaseSchedule({settings,onChange}:{settings:Settings;onChange:(s:Settings)=>void}){
 const phases=settings.phases,count=Math.max(1,phases.length-1),delay=phases[1]?.afterSeconds??60,interval=count>1?(phases.at(-1)!.afterSeconds-delay)/(count-1):60,end=phases.at(-1)?.scale??.1;
 const build=(n=count,d=delay,t=interval,last=end)=>onChange({...settings,phases:[{afterSeconds:0,scale:1},...Array.from({length:n},(_,i)=>({afterSeconds:Math.round(d+i*t),scale:1-(1-last)*(i+1)/n}))]});
 return <div className="form-grid"><Slider label="Apokalypse-Startverzögerung" value={delay} min={1} max={1800} unit="s" onChange={v=>build(count,v)}/><Slider label="Apokalypse-Phasendauer" value={interval} min={1} max={900} unit="s" onChange={v=>build(count,delay,v)}/><Slider label="Anzahl Schrumpfphasen" value={count} min={1} max={19} onChange={v=>build(v)}/><Slider label="Endgröße" value={Math.round(end*100)} min={5} max={95} unit="%" onChange={v=>build(count,delay,interval,v/100)}/></div>;
}
