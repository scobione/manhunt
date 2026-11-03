import type {LobbyView,LocationSample,Player,Settings,Zone} from './types';
import type {BadgeOverview} from './achievements';
export type SimulationEvent='outside'|'inside'|'move'|'pin'|'capture'|'revive'|'heal'|'advance'|'next_phase'|'timeout'|'xp_collect'|'feedback'|'badge'|'disconnect'|'reconnect';
export interface SimulationLog {at:number;playerId?:string;message:string;}
export interface SimulationView {id:string;revision:number;generation:number;view:LobbyView;roster:Player[];events:SimulationEvent[];available:Record<string,SimulationEvent[]>;log:SimulationLog[];position:LocationSample|null;badges:BadgeOverview;simulation:true;}
export interface SimulationSetup {settings:Settings;zone:Zone;players:number;}
