import type {EquippedBadge} from './achievements';
import type {AccountProgress} from './types';
/** Authenticated friend-profile projection. Never includes hidden/locked badges,
 * exact achievement counters, contact details, friend codes or locations. */
export interface PublicProfileBadge extends EquippedBadge {
 description:string;
 unlockedAt:string;
 upgradedAt?:string;
}
export interface FriendProfile {
 id:string;
 username:string;
 avatar_url:string|null;
 created_at?:string;
 progress:AccountProgress|null;
 badges:PublicProfileBadge[];
 customization?:ProfileCustomization;
}

export const PROFILE_COLORS=[
 {id:'violet',name:'Violett',color:'#9c87ff'},
 {id:'mint',name:'Mint',color:'#51dfb3'},
 {id:'ocean',name:'Ozean',color:'#53c6f5'},
 {id:'amber',name:'Gold',color:'#f4bf69'},
 {id:'rose',name:'Rosé',color:'#ef8eb7'},
 {id:'slate',name:'Graphit',color:'#a3b4c8'},
] as const;
export type ProfileColor=typeof PROFILE_COLORS[number]['id'];
export interface ProfileCustomization {color:ProfileColor;banner_url:string|null;badgeOrder:string[];}
export const DEFAULT_PROFILE_CUSTOMIZATION:ProfileCustomization={color:'violet',banner_url:null,badgeOrder:[]};
export function orderedBadges<T extends {id:string}>(badges:readonly T[],order:readonly string[]=[]):T[]{
 const ranks=new Map(order.map((id,index)=>[id,index]));
 return badges.map((badge,index)=>({badge,index})).sort((a,b)=>(ranks.get(a.badge.id)??order.length+a.index)-(ranks.get(b.badge.id)??order.length+b.index)).map(value=>value.badge);
}
