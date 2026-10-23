import type { Zone } from '../shared/types';
import { validZone } from './zoneFiles';
export const PLANNED_ZONE_KEY='manhunt:planned-zone';
export function loadPlannedZone():Zone|null{
  try{const value:unknown=JSON.parse(localStorage.getItem(PLANNED_ZONE_KEY)||'null');return validZone(value)?{...value,confirmed:false}:null;}catch{return null;}
}
