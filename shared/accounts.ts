export type SetupStage = 0 | 1 | 2 | 3;
export interface AccountState {
 disabled:boolean;
 setupStage:SetupStage;
 isAdmin:boolean;
 source:'self'|'admin'|'legacy';
 emailVerified:boolean;
 email?:string;
 username?:string;
 avatarUrl?:string|null;
}
export const USERNAME_PATTERN=/^[A-Za-z0-9_.]{3,20}$/;
export const PASSWORD_MIN_LENGTH=12;

/** Existing guest aliases include a server-verified user-id suffix and may be 24
 * characters. Keep them compatible; newly chosen registered names remain 3–20. */
export function validGuestAlias(name:string,id:string){return /^Gast_[A-Za-z0-9_]{1,10}_[a-f0-9]{8}$/.test(name)&&name.endsWith('_'+id.replace(/-/g,'').slice(0,8));}
