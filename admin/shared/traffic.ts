export const NETWORKS=['wifi','cellular','ethernet','unknown'] as const;
export type Network=typeof NETWORKS[number];
export const NETWORK_LABELS:Record<Network,string>={wifi:'WLAN',cellular:'Mobilfunk',ethernet:'Kabel',unknown:'Nicht erkennbar'};
export interface TrafficBytes {down:number;estimated:number;up:number;requests:number;unmeasured:number;cached:number}
export const emptyBytes=():TrafficBytes=>({down:0,estimated:0,up:0,requests:0,unmeasured:0,cached:0});
export const emptyBuckets=():Record<Network,TrafficBytes>=>Object.fromEntries(NETWORKS.map(n=>[n,emptyBytes()])) as Record<Network,TrafficBytes>;
export interface TrafficReport {matchId:string;clientId:string;sequence:number;buckets:Record<Network,TrafficBytes>}
export interface TrafficRow extends TrafficBytes {network:Network;userId?:string}
export interface TrafficMatch {id:string;code:string;status:string;startedAt:string;endedAt:string|null;players:number;reporters:number;bytes:number;updatedAt:string|null}
export interface TrafficPlayer {id:string;username:string;avatarUrl:string|null;updatedAt:string|null}
export interface TrafficDetail {match:TrafficMatch;players:TrafficPlayer[];rows:TrafficRow[]}
export interface TrafficList {matches:TrafficMatch[];page:number;hasMore:boolean}
export const totalBytes=(v:TrafficBytes)=>v.down+v.estimated+v.up;
export function sumBytes(values:TrafficBytes[]):TrafficBytes {return values.reduce((sum,v)=>{for(const k of Object.keys(sum) as (keyof TrafficBytes)[])sum[k]+=Number(v[k])||0;return sum;},emptyBytes());}
export function formatBytes(bytes:number){if(bytes<1000)return `${Math.round(bytes)} B`;if(bytes<1e6)return `${(bytes/1000).toLocaleString('de-DE',{maximumFractionDigits:1})} kB`;return `${(bytes/1e6).toLocaleString('de-DE',{maximumFractionDigits:2})} MB`;}
export const TRAFFIC_EXPLANATION='Näherungswerte des Browsers, keine Mobilfunkabrechnung. Gemessene Downloads plus geschätzte Nutzdaten; Protokoll-Overhead, nicht sichtbare Worker-Anfragen und andere Apps sind nicht enthalten. Safari/iPhone meldet meist keinen Verbindungstyp. Unmessbare Anfragen fehlen in der Byte-Summe. Messung ab Matchbeginn mit dieser Version; Aktualisierung etwa alle 30 Sekunden, Aufbewahrung 30 Tage.';
