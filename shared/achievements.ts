export const ROMAN_LEVELS=['I','II','III','IV','V','VI','VII','VIII','IX','X'] as const;
export type BadgeMetric='feedback'|'captures'|'hiderWins'|'games'|'huntPoints'|'wins'|'survivals';
export interface BadgeDefinition {id:string;name:string;description:string;icon:'flask'|'hunter'|'shield'|'trophy'|'pin';metric:BadgeMetric;thresholds:number[];stageNames:string[];unit:string;}
export interface EquippedBadge {id:string;name:string;icon:BadgeDefinition['icon'];level:number;stageName:string;}
export interface PlayerBadge extends BadgeDefinition {level:number;progress:number;unlockedAt:string|null;upgradedAt:string|null;}
export interface BadgeNotice {id:string;badgeId:string;name:string;level:number;at:string;}
export interface BadgeOverview {badges:PlayerBadge[];selected:EquippedBadge|null;notices:BadgeNotice[];registered:boolean;visibleBadgeIds?:string[];}
export type AchievementCounters=Record<BadgeMetric,number>;
export const emptyCounters=():AchievementCounters=>({feedback:0,captures:0,hiderWins:0,games:0,huntPoints:0,wins:0,survivals:0});
export const DEFAULT_BADGES:BadgeDefinition[]=[
 {id:'beta-tester',name:'Beta-Tester',description:'Sende Feedback ab. Einzelne Fragen dürfen übersprungen werden; jede Bewertung zählt gleichermaßen.',icon:'flask',metric:'feedback',thresholds:[1],stageNames:['Beta-Tester'],unit:'Feedback',},
 {id:'hunter',name:'Hunter',description:'Fange Spieler in gültig abgeschlossenen Matches.',icon:'hunter',metric:'captures',thresholds:[1,20,50,100,200,350,550,800,1200,2000],stageNames:['Erster Fang','Spurenleser','Verfolger','Jäger','Pro Hunter','Fährtenmeister','Nachtjäger','Elite Hunter','Meisterjäger','Ultimate Hunter'],unit:'Fänge'},
 {id:'hider',name:'Hider',description:'Gewinne als überlebender Hider gültig abgeschlossene Matches.',icon:'shield',metric:'hiderWins',thresholds:[1,5,10,20,35,55,80,120,175,250],stageNames:['Entkommen','Unentdeckt','Leise Schritte','Schatten','Pro Hider','Phantom','Unsichtbar','Elite Hider','Schattenmeister','Ultimate Hider'],unit:'Hider-Siege'},
 {id:'veteran',name:'Veteran',description:'Spiele gültige Matches bis zum Ende mit.',icon:'trophy',metric:'games',thresholds:[1,5,10,20,35,50,75,100,150,250],stageNames:['Debüt','Wieder dabei','Erfahren','Stammspieler','Ausdauernd','Veteran','Routinier','Feldprofi','Legende','Manhunt X'],unit:'Matches'},
 {id:'winner',name:'Sieger',description:'Gewinne gültig abgeschlossene Matches als Hunter, Hider oder im Team.',icon:'trophy',metric:'wins',thresholds:[1,5,10,20,35,55,80,120,175,250],stageNames:['Erster Sieg','Auf Erfolgskurs','Siegesserie','Durchstarter','Champion','Titelträger','Spitzenklasse','Elite Champion','Triumphator','Ultimate Champion'],unit:'Siege'},
 {id:'survivor',name:'Überlebenskünstler',description:'Beende gültige Matches als überlebender Hider – auch wenn dein Team das Spiel nicht gewinnt.',icon:'shield',metric:'survivals',thresholds:[1,5,10,20,35,55,80,120,175,250],stageNames:['Durchgehalten','Standhaft','Zäh','Unbeugsam','Survival Pro','Überlebensprofi','Unerschütterlich','Elite Survivor','Unsterbliche Legende','Ultimate Survivor'],unit:'Überlebte Runden'},
 {id:'xp-scout',name:'XP-Scout',description:'Sammle XP-Jagd-Punkte in gültig abgeschlossenen Matches. Account-XP zählen hierfür nicht.',icon:'pin',metric:'huntPoints',thresholds:[1,10,25,50,100,175,275,400,600,1000],stageNames:['Erster Punkt','Entdecker','Pfadfinder','Sammler','Scout','Navigator','Zielsicher','Wegmeister','Elite Scout','Ultimate Scout'],unit:'XP-Jagd-Punkte'},
];
export function badgeLevel(definition:BadgeDefinition,progress:number){return Math.min(10,definition.thresholds.filter(value=>progress>=value).length);}
export function equippedBadge(badge:PlayerBadge):EquippedBadge|null{return badge.level>0?{id:badge.id,name:badge.name,icon:badge.icon,level:badge.level,stageName:badge.stageNames[badge.level-1]??badge.name}:null;}
export function badgeLabel(badge:Pick<EquippedBadge,'name'|'id'|'level'>){return badge.id==='beta-tester'?badge.name:`${badge.name} ${ROMAN_LEVELS[badge.level-1]??''}`;}
export function badgeProgress(badge:Pick<PlayerBadge,'thresholds'|'level'|'progress'|'unit'|'id'|'name'>){const next=badge.thresholds[badge.level];return next===undefined?'Maximale Stufe erreicht':`${badge.progress}/${next} ${badge.unit} bis ${badge.id==='beta-tester'?badge.name:`${badge.name} ${ROMAN_LEVELS[badge.level]}`}`;}

/** Used for isolated simulation state as well; never writes to live accounts. */
export function advanceBadges(definitions:BadgeDefinition[],counters:AchievementCounters,previous:PlayerBadge[],now:number):PlayerBadge[]{
 return definitions.map(def=>{const old=previous.find(b=>b.id===def.id),progress=counters[def.metric]??0,level=Math.max(old?.level??0,badgeLevel(def,progress)),date=new Date(now).toISOString();return{...def,progress,level,unlockedAt:old?.unlockedAt??(level?date:null),upgradedAt:level>(old?.level??0)?date:old?.upgradedAt??null};});
}
