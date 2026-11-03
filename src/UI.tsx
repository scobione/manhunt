import type {ReactNode} from 'react';
import {Radar} from 'lucide-react';
export function PageHeader({eyebrow,title,description,action}:{eyebrow?:string;title:string;description?:string;action?:ReactNode}){return <div className="page-heading"><div>{eyebrow&&<div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</div>;}
export function EmptyState({icon:Icon=Radar,title,children,action}:{icon?:typeof Radar;title:string;children?:ReactNode;action?:ReactNode}){return <div className="empty-state"><Icon size={32}/><h3>{title}</h3>{children&&<p>{children}</p>}{action}</div>;}
export function Avatar({name,url,size=''}:{name:string;url?:string|null;size?:string}){return <span className={`avatar ${size}`}>{url?<img src={url} referrerPolicy="no-referrer" alt=""/>:name.slice(0,2).toUpperCase()}</span>;}
