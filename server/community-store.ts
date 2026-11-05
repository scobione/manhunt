import type {SupabaseClient} from '@supabase/supabase-js';
import type {BugReport,BugReportInput,SaveZoneInput,SavedGameZone} from '../shared/community';
import type {CommunityStore} from './community';
import {HttpError} from './auth';
function checked(error:{message?:string;code?:string}|null){
 if(!error)return;
 if(error.message?.includes('report_limit'))throw new HttpError(429,'Du kannst höchstens fünf Fehlerberichte pro Stunde senden.');
 if(error.message?.includes('zone_limit'))throw new HttpError(409,'Du kannst bis zu 30 Zonen in deiner Bibliothek speichern.');
 if(error.message?.includes('match_forbidden'))throw new HttpError(403,'Du kannst nur ein eigenes Match melden.');
 if(error.message?.includes('not_available'))throw new HttpError(404,'Dieser Eintrag ist nicht verfügbar.');
 if(error.message?.includes('registered_required'))throw new HttpError(403,'Dafür benötigst du ein registriertes Konto.');
 throw new HttpError(503,'Die Bibliothek und Fehlerberichte sind gerade nicht erreichbar. Bitte versuche es erneut.');
}
const zoneColumns='id,name,zone,settings,favorite,tags,createdAt:created_at,updatedAt:updated_at';
const reportColumns='id,category,description,build,matchId:match_id,status,createdAt:created_at,screenshot_path';
export class SupabaseCommunityStore implements CommunityStore {
 constructor(private db:SupabaseClient){}
 async quota(user:string){const r=await this.db.rpc('edge_quota',{p_user:user,p_scope:'community',p_limit:30});checked(r.error);if(!r.data)throw new HttpError(429,'Bitte warte kurz vor der nächsten Änderung.');}
 async zones(user:string){const r=await this.db.from('saved_game_zones').select(zoneColumns).eq('user_id',user).order('favorite',{ascending:false}).order('updated_at',{ascending:false}).limit(30);checked(r.error);return r.data as SavedGameZone[];}
 async saveZone(user:string,input:SaveZoneInput){const r=await this.db.rpc('save_library_zone',{p_user:user,p_id:input.id,p_name:input.name,p_zone:input.zone,p_settings:input.settings??null,p_favorite:input.favorite??false,p_tags:input.tags??[]});checked(r.error);return r.data as SavedGameZone;}
 async deleteZone(user:string,id:string){const r=await this.db.from('saved_game_zones').delete().eq('user_id',user).eq('id',id);checked(r.error);}
 async favoriteRules(user:string){const r=await this.db.from('favorite_rule_sets').select('preset_id').eq('user_id',user);checked(r.error);return(r.data??[]).map(v=>v.preset_id as string);}
 async favoriteRule(user:string,id:string,favorite:boolean){const r=await this.db.rpc('set_rule_favorite',{p_user:user,p_preset:id,p_favorite:favorite});checked(r.error);}
 private async withScreenshot(record:Record<string,any>):Promise<BugReport>{const {screenshot_path,...report}=record;let screenshotUrl=null;if(screenshot_path){const r=await this.db.storage.from('bug-report-images').createSignedUrl(screenshot_path,600);checked(r.error);screenshotUrl=r.data?.signedUrl??null;}return{...report,screenshotUrl} as BugReport;}
 async reports(user:string){const r=await this.db.from('bug_reports').select(reportColumns).eq('user_id',user).order('created_at',{ascending:false}).limit(50);checked(r.error);return Promise.all((r.data??[]).map(v=>this.withScreenshot(v)));}
 async screenshot(user:string,path:string){
  const file=path.slice(user.length+1);if(!path.startsWith(user+'/')||!/^[-a-f0-9]{36}\.webp$/i.test(file))throw new HttpError(400,'Ungültiger Screenshot-Pfad.');
  const listed=await this.db.storage.from('bug-report-images').list(user,{limit:100,search:file});checked(listed.error);const item=listed.data?.find(v=>v.name===file);
  if(!item||item.metadata?.mimetype!=='image/webp'||Number(item.metadata?.size)>2097152||Number(item.metadata?.size)<12)throw new HttpError(400,'Wähle ein verarbeitetes WebP-Bild bis 2 MB.');
  const downloaded=await this.db.storage.from('bug-report-images').download(path);checked(downloaded.error);if(!downloaded.data||downloaded.data.size>2097152)throw new HttpError(400,'Der Screenshot ist ungültig.');
  const bytes=new Uint8Array(await downloaded.data.slice(0,12).arrayBuffer());if(String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||String.fromCharCode(...bytes.slice(8,12))!=='WEBP')throw new HttpError(400,'Die Screenshot-Datei ist kein WebP-Bild.');
 }
 async submit(user:string,input:BugReportInput){const r=await this.db.rpc('submit_bug_report',{p_user:user,p_id:input.id,p_category:input.category,p_description:input.description,p_build:input.build,p_match:input.matchId??null,p_screenshot:input.screenshotPath??null});checked(r.error);return this.withScreenshot(r.data);}
 async adminReports(page:number){const r=await this.db.from('bug_reports').select(reportColumns).order('created_at',{ascending:false}).range(page*50,page*50+49);checked(r.error);return{reports:await Promise.all((r.data??[]).map(v=>this.withScreenshot(v)))};}
}
