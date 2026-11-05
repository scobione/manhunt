import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {HttpError,type Identity} from './auth';
import {DEFAULT_PROFILE_CUSTOMIZATION,orderedBadges,type FriendProfile,type ProfileColor,type ProfileCustomization} from '../shared/profiles';

export const profileColorSchema=z.enum(['violet','mint','ocean','amber','rose','slate']);
export const profileCustomizationPatch=z.object({color:profileColorSchema.optional(),bannerPath:z.string().min(1).max(120).nullable().optional()}).strict().refine(value=>Object.keys(value).length>0,'Wähle eine Änderung aus.');
export const badgeOrderSchema=z.object({badgeIds:z.array(z.string().regex(/^[a-z0-9_-]{1,40}$/)).max(100)}).strict().refine(value=>new Set(value.badgeIds).size===value.badgeIds.length,'Jedes Badge darf nur einmal vorkommen.');
export interface StoredProfileCustomization {color:ProfileColor;bannerPath:string|null;badgeOrder:string[];}
export function validBannerPath(user:string,path:string){return path.startsWith(user+'/')&&new RegExp('^'+user+'/[a-f0-9-]{36}\\.(webp|png|jpg|jpeg)$').test(path);}
export function imageMimeFromHeader(bytes:Uint8Array):string|null{
 if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value))return 'image/png';
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 return null;
}
export interface ProfileCustomizationStore {
 read(user:string):Promise<StoredProfileCustomization>;
 save(user:string,patch:{color?:ProfileColor;bannerPath?:string|null}):Promise<StoredProfileCustomization>;
 order(user:string,ids:string[]):Promise<StoredProfileCustomization>;
 verifyBanner(user:string,path:string):Promise<void>;
 signedBanner(user:string,path:string):Promise<string|null>;
 removeBanner(path:string):Promise<void>;
}
function checked(error:{message?:string}|null){
 if(!error)return;
 if(error.message?.includes('registered_required'))throw new HttpError(403,'Profilgestaltung benötigt ein registriertes Konto.');
 if(error.message?.includes('badge_order_invalid'))throw new HttpError(409,'Die Reihenfolge darf nur deine freigeschalteten Badges enthalten.');
 if(error.message?.includes('invalid_profile_customization'))throw new HttpError(400,'Diese Profileinstellung ist ungültig.');
 throw new HttpError(503,'Deine Profileinstellungen sind gerade nicht erreichbar.');
}
export class SupabaseProfileCustomizationStore implements ProfileCustomizationStore {
 private signed=new Map<string,{url:string;expires:number}>();
 constructor(private db:SupabaseClient){}
 private async rpc(name:string,args:Record<string,unknown>){const result=await this.db.rpc(name,args);checked(result.error);return result.data as StoredProfileCustomization;}
 read(user:string){return this.rpc('read_profile_customization',{p_user:user});}
 save(user:string,patch:{color?:ProfileColor;bannerPath?:string|null}){return this.rpc('save_profile_customization',{p_user:user,p_color:patch.color??null,p_banner_path:patch.bannerPath??null,p_update_banner:Object.hasOwn(patch,'bannerPath')});}
 order(user:string,ids:string[]){return this.rpc('order_profile_badges',{p_user:user,p_badges:ids});}
 async verifyBanner(user:string,path:string){
  if(!validBannerPath(user,path))throw new HttpError(400,'Wähle eine eigene Bannerdatei aus.');
  const file=path.slice(user.length+1),bucket=this.db.storage.from('profile-banners');
  const listing=await bucket.list(user,{limit:100,search:file});checked(listing.error);
  const item=listing.data?.find(value=>value.name===file),mime=String(item?.metadata?.mimetype??''),size=Number(item?.metadata?.size??0);
  if(!item)throw new HttpError(404,'Lade dein Banner zuerst hoch.');
  if(!['image/jpeg','image/png','image/webp'].includes(mime)||size<1||size>2097152)throw new HttpError(400,'Das Banner muss ein JPEG-, PNG- oder WebP-Bild bis 2 MB sein.');
  const download=await bucket.download(path);checked(download.error);
  if(!download.data||download.data.size>2097152||download.data.size===0)throw new HttpError(400,'Die Bannerdatei ist ungültig.');
  const header=new Uint8Array(await download.data.slice(0,12).arrayBuffer());
  if(imageMimeFromHeader(header)!==mime)throw new HttpError(400,'Der Dateiinhalt passt nicht zum Bildformat.');
 }
 async signedBanner(user:string,path:string){
  if(!validBannerPath(user,path))return null;
  const now=Date.now(),cached=this.signed.get(path);if(cached&&cached.expires>now)return cached.url;
  const value=await this.db.storage.from('profile-banners').createSignedUrl(path,3600);
  if(value.error||!value.data?.signedUrl)return null;
  if(this.signed.size>=128)this.signed.delete(this.signed.keys().next().value!);
  this.signed.set(path,{url:value.data.signedUrl,expires:now+5*60000});return value.data.signedUrl;
 }
 async removeBanner(path:string){this.signed.delete(path);await this.db.storage.from('profile-banners').remove([path]);}
}
/** AccountService must authenticate, requireGame and apply its durable per-user
 * request quota before calling handle. No target user is accepted from clients. */
export class ProfileCustomizationService {
 readonly store:ProfileCustomizationStore;
 constructor(storeOrDb:ProfileCustomizationStore|SupabaseClient){this.store='verifyBanner'in storeOrDb?storeOrDb:new SupabaseProfileCustomizationStore(storeOrDb);}
 private async publicValue(user:string,value:StoredProfileCustomization):Promise<ProfileCustomization>{return{color:value.color??DEFAULT_PROFILE_CUSTOMIZATION.color,banner_url:value.bannerPath?await this.store.signedBanner(user,value.bannerPath):null,badgeOrder:value.badgeOrder??[]};}
 async read(user:string){return this.publicValue(user,await this.store.read(user));}
 async decorateFriend(profile:FriendProfile):Promise<FriendProfile>{
  // Caller has already checked friendship and blocking. Never expose hidden IDs through order metadata.
  const customization=await this.read(profile.id),allowed=new Set(profile.badges.map(b=>b.id));
  customization.badgeOrder=customization.badgeOrder.filter(id=>allowed.has(id));
  return{...profile,customization,badges:orderedBadges(profile.badges,customization.badgeOrder)};
 }
 async handle(identity:Identity,path:string,method:string,body:unknown){
  if(path==='/profile/customization'&&method==='GET')return this.read(identity.id);
  if(identity.isGuest)throw new HttpError(403,'Profilgestaltung benötigt ein registriertes Konto.');
  if(path==='/profile/customization'&&method==='PATCH'){
   const patch=profileCustomizationPatch.parse(body),previous=await this.store.read(identity.id);
   if(patch.bannerPath)await this.store.verifyBanner(identity.id,patch.bannerPath);
   const result=await this.store.save(identity.id,patch);
   if(Object.hasOwn(patch,'bannerPath')&&previous.bannerPath&&previous.bannerPath!==result.bannerPath&&validBannerPath(identity.id,previous.bannerPath)){
    try{await this.store.removeBanner(previous.bannerPath);}catch{/* Saved preference remains valid when old-object cleanup is temporarily unavailable. */}
   }
   return this.publicValue(identity.id,result);
  }
  if(path==='/badges/order'&&method==='PUT'){const {badgeIds}=badgeOrderSchema.parse(body);return this.publicValue(identity.id,await this.store.order(identity.id,badgeIds));}
  throw new HttpError(404,'Diese Profileinstellung existiert nicht.');
 }
}
