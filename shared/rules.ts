import type {Settings,Rules,Player,Zone} from './types.js';
export const DEFAULT_XP={target:10,radiusMeters:30,minDistanceMeters:100,boundaryBufferMeters:20,exclusionBufferMeters:20,goal:'team' as const,timeout:'draw' as const};
/** Explicit modules override legacy presets. Old checkpoints keep their exact rules. */
export function rules(s:Settings):Rules{return s.rules??{zombie:['zombie','infection_rush'].includes(s.mode)||s.mode==='custom'&&s.winCondition==='infection',apocalypse:['apocalypse','custom'].includes(s.mode),xpHunt:false};}
export function modeLabel(s:Settings){if(!s.rules)return ({normal:'NORMAL',zombie:'ZOMBIE',apocalypse:'APOKALYPSE',hide_seek:'HIDE & SEEK',last_survivor:'LAST SURVIVOR',team_hunt:'TEAM HUNT',infection_rush:'INFECTION RUSH',custom:'CUSTOM'})[s.mode];const r=rules(s);return [r.xpHunt?'XP-JAGD':'NORMAL',...(r.zombie?['ZOMBIE']:[]),...(r.apocalypse?['APOKALYPSE']:[])].join(' + ');}
export function teamChannel(p:Player,s:Settings):'hunters'|'hiders'|'A'|'B'|null{if(p.eliminated||p.role==='spectator'||p.infectionPending)return null;if(s.mode==='team_hunt')return p.team;return p.role==='hider'?'hiders':'hunters';}
export function activeExclusions(z:Zone|null|undefined){return z?.excluded.filter((_,i)=>!z.disabledExcluded?.includes(i))??[];}
export function levelProgress(total:number){total=Math.max(0,Math.floor(total));const level=Math.floor(Math.sqrt(total/100))+1;const start=100*(level-1)**2,next=100*level**2;return{level,total,current:total-start,needed:next-start,remaining:next-total,percent:100*(total-start)/(next-start)};}
