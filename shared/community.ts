import type {Settings,Zone} from './types';
export interface SavedGameZone {id:string;name:string;zone:Zone;settings:Settings|null;favorite:boolean;tags:string[];createdAt:string;updatedAt:string;}
export type ReportCategory='gameplay'|'gps'|'map'|'account'|'other';
export interface BugReport {id:string;category:ReportCategory;description:string;build:string;matchId:string|null;status:'new'|'reviewing'|'resolved';createdAt:string;screenshotUrl:string|null;}
export interface SaveZoneInput {id?:string;name:string;zone:Zone;settings?:Settings|null;favorite?:boolean;tags?:string[];}
export interface BugReportInput {id:string;category:ReportCategory;description:string;build:string;matchId?:string|null;screenshotPath?:string|null;}
export interface RulePreset {id:string;name:string;settings:Settings;}
