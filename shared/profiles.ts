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
}
