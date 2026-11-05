/** Isolated adapters for the real extension services. Never imported in production. */
import {randomUUID} from 'node:crypto';
import type {ProfileCustomizationStore,StoredProfileCustomization} from '../server/profile-customization';
import {imageMimeFromHeader,validBannerPath} from '../server/profile-customization';
import type {CommunityStore} from '../server/community';
import type {BugReport,BugReportInput,SaveZoneInput,SavedGameZone} from '../shared/community';
import type {MemoryRepository} from '../server/repository';
import type {TestFeatureStore} from './feature-fixtures';
import {HttpError} from '../server/auth';
export const testImages=new Map<string,{bytes:Buffer;mime:string}>();
export class TestCustomizationStore implements ProfileCustomizationStore{
 values=new Map<string,StoredProfileCustomization>();constructor(private features:TestFeatureStore){}
 async read(user:string):Promise<StoredProfileCustomization>{return structuredClone(this.values.get(user)??{color:'violet',bannerPath:null,badgeOrder:[]});}
 async save(user:string,patch:Parameters<ProfileCustomizationStore['save']>[1]){const v={...await this.read(user),...patch};this.values.set(user,v);return structuredClone(v);}
 async order(user:string,ids:string[]){const earned=(await this.features.badges(user)).badges.filter(b=>b.level>0).map(b=>b.id);if(ids.some(id=>!earned.includes(id))||new Set(ids).size!==ids.length)throw new HttpError(409,'Nur freigeschaltete Badges sind erlaubt.');return this.save(user,{...await this.read(user),badgeOrder:ids} as any);}
 async verifyBanner(user:string,path:string){const image=testImages.get('profile-banners/'+path);if(!validBannerPath(user,path)||!image||image.bytes.length>2097152||imageMimeFromHeader(image.bytes)!==image.mime)throw new HttpError(400,'Ungültiges Banner.');}
 async signedBanner(_user:string,path:string){return testImages.has('profile-banners/'+path)?'http://127.0.0.1:3003/storage/v1/object/sign/profile-banners/'+path+'?token=isolated-test-image':null;}
 async removeBanner(path:string){testImages.delete('profile-banners/'+path);}
}
export class TestCommunityStore implements CommunityStore{
 saved=new Map<string,SavedGameZone&{user:string}>();favorites=new Map<string,Set<string>>();items=new Map<string,BugReport&{user:string}>();constructor(private repo:MemoryRepository){}
 async quota(_user:string){}
 async zones(user:string){return [...this.saved.values()].filter(z=>z.user===user).map(({user,...z})=>structuredClone(z));}
 async saveZone(user:string,input:SaveZoneInput){const id=input.id??randomUUID(),old=this.saved.get(id);if(old&&old.user!==user)throw new HttpError(404,'Zone nicht verfügbar.');if(!old&&(await this.zones(user)).length>=30)throw new HttpError(409,'Maximal 30 Zonen.');const now=new Date().toISOString(),record={user,id,name:input.name,zone:structuredClone(input.zone),settings:input.settings??null,favorite:!!input.favorite,tags:input.tags??[],createdAt:old?.createdAt??now,updatedAt:now};this.saved.set(id,record);const {user:_,...result}=record;return structuredClone(result);}
 async deleteZone(user:string,id:string){if(this.saved.get(id)?.user===user)this.saved.delete(id);}
 async favoriteRules(user:string){return [...(this.favorites.get(user)??[])];}
 async favoriteRule(user:string,id:string,favorite:boolean){if(!(await this.repo.presets(user)).some(p=>p.id===id))throw new HttpError(404,'Regeln nicht verfügbar.');const ids=this.favorites.get(user)??new Set<string>();favorite?ids.add(id):ids.delete(id);this.favorites.set(user,ids);}
 async reports(user:string){return [...this.items.values()].filter(r=>r.user===user).map(({user,...r})=>structuredClone(r));}
 async screenshot(user:string,path:string){const image=testImages.get('bug-report-images/'+path);if(!path.startsWith(user+'/')||!image||image.bytes.length>2097152||imageMimeFromHeader(image.bytes)!=='image/webp')throw new HttpError(400,'Ungültiger Screenshot.');}
 async submit(user:string,input:BugReportInput){const old=this.items.get(input.id);if(old){if(old.user!==user)throw new HttpError(404,'Bericht nicht verfügbar.');const {user:_,...r}=old;return structuredClone(r);}if((await this.reports(user)).filter(r=>Date.now()-Date.parse(r.createdAt)<3600000).length>=5)throw new HttpError(429,'Höchstens fünf Berichte pro Stunde.');if(input.matchId&&!this.repo.checkpoints.get(input.matchId)?.players.some(p=>p.id===user))throw new HttpError(403,'Nur eigene Matches.');const r={user,id:input.id,category:input.category,description:input.description,build:input.build,matchId:input.matchId??null,status:'new' as const,createdAt:new Date().toISOString(),screenshotUrl:input.screenshotPath?'http://127.0.0.1:3003/storage/v1/object/sign/bug-report-images/'+input.screenshotPath+'?token=isolated-test-image':null};this.items.set(r.id,r);const {user:_,...result}=r;return structuredClone(result);}
 async adminReports(page:number){return{reports:[...this.items.values()].slice(page*50,page*50+50).map(({user,...r})=>structuredClone(r))};}
}
