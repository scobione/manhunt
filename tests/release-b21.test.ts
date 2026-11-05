/** Request-boundary tests with an isolated store. SQL and real Storage are tested separately. */
import {describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';
import {CommunityService,type CommunityStore} from '../server/community';
import type {BugReport,BugReportInput,SaveZoneInput,SavedGameZone} from '../shared/community';
import type {Identity} from '../server/auth';
import {DEFAULT_SETTINGS} from '../shared/types';
const actor:Identity={id:randomUUID(),username:'QACommunity',expiresAt:Date.now()+60000};
function fixture(){
 const state:{zones:SavedGameZone[];reports:BugReport[];screenshots:string[];quotas:number}={zones:[],reports:[],screenshots:[],quotas:0};
 const store:CommunityStore={
  zones:async()=>structuredClone(state.zones),
  saveZone:async(_user:string,input:SaveZoneInput)=>{const value:SavedGameZone={id:input.id!,name:input.name,zone:input.zone,settings:input.settings??null,favorite:input.favorite??false,tags:input.tags??[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};state.zones.push(value);return value;},
  deleteZone:async()=>{},favoriteRules:async()=>[],favoriteRule:async()=>{},reports:async()=>structuredClone(state.reports),
  screenshot:async(_user,path)=>{state.screenshots.push(path);},
  submit:async(_user:string,input:BugReportInput)=>{const value:BugReport={id:input.id,category:input.category,description:input.description,build:input.build,matchId:input.matchId??null,status:'new',createdAt:new Date().toISOString(),screenshotUrl:null};state.reports.push(value);return value;},
  adminReports:async()=>({reports:[]}),quota:async()=>{state.quotas++;},
 };
 return{state,service:new CommunityService(store)};
}
const zone=()=>({feature:circle([13.405,52.52],.4),excluded:[],confirmed:true,name:'QA VALIDATED ZONE'});
describe('B21 community request boundaries',()=>{
 it('B21-LIBRARY-01 saves a valid zone unconfirmed and validates attached rules',async()=>{const t=fixture();const saved=await t.service.player(actor,'/library/zones','POST',{name:'QA playground',zone:zone(),settings:DEFAULT_SETTINGS,tags:['Park','Park'],favorite:true}) as SavedGameZone;expect(saved.zone.confirmed).toBe(false);expect(saved.settings).toEqual(DEFAULT_SETTINGS);expect(saved.tags).toEqual(['Park']);expect(t.state.quotas).toBe(1);});
 it('B21-LIBRARY-02 guest accounts cannot write cloud library data',async()=>{const t=fixture();await expect(t.service.player({...actor,isGuest:true},'/library/zones','POST',{name:'QA guest',zone:zone()})).rejects.toMatchObject({status:403});expect(t.state.zones).toEqual([]);});
 it('B21-LIBRARY-03 injected owners and mismatching update IDs are rejected',async()=>{const t=fixture();await expect(t.service.player(actor,'/library/zones','POST',{name:'QA zone',zone:zone(),userId:randomUUID()})).rejects.toThrow();await expect(t.service.player(actor,`/library/zones/${randomUUID()}`,'PATCH',{id:randomUUID(),name:'QA zone',zone:zone()})).rejects.toMatchObject({status:400});expect(t.state.zones).toEqual([]);});
 it('B21-REPORT-01 a manual report contains no automatic GPS or chat data',async()=>{const t=fixture(),id=randomUUID();const saved=await t.service.player(actor,'/reports','POST',{id,category:'map',description:'Der Kartenmarker war nach dem Vergrößern schwer lesbar.',build:'0.B2.1'}) as BugReport;expect(saved.id).toBe(id);expect(saved.screenshotUrl).toBeNull();expect(saved).not.toHaveProperty('location');expect(saved).not.toHaveProperty('chat');expect(t.state.screenshots).toEqual([]);});
 it('B21-REPORT-02 location, foreign-owner and unsupported metadata payloads are rejected',async()=>{const t=fixture(),base={id:randomUUID(),category:'map',description:'Eine verständliche Fehlermeldung für diesen Test.',build:'0.B2.1'};for(const extra of [{location:{longitude:13.4,latitude:52.5}},{userId:randomUUID()},{chat:'Private team message'}])await expect(t.service.player(actor,'/reports','POST',{...base,...extra})).rejects.toThrow();expect(t.state.reports).toEqual([]);});
 it('B21-REPORT-03 screenshot validation runs only for a path owned by the authenticated user',async()=>{const t=fixture(),base={id:randomUUID(),category:'gameplay',description:'Bei diesem Test wird ein manuelles Bild angehängt.',build:'0.B2.1'};await expect(t.service.player(actor,'/reports','POST',{...base,screenshotPath:`${randomUUID()}/${randomUUID()}.webp`})).rejects.toMatchObject({status:400});expect(t.state.screenshots).toEqual([]);const path=`${actor.id}/${randomUUID()}.webp`;await t.service.player(actor,'/reports','POST',{...base,screenshotPath:path});expect(t.state.screenshots).toEqual([path]);expect(t.state.reports).toHaveLength(1);});
});
