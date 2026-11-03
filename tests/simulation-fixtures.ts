import {randomUUID} from 'node:crypto';
import type {SimulationStore,SimulationRecord,SimulationState} from '../server/simulations';
/** Isolated test persistence, never imported by application entrypoints. */
export class TestSimulationStore implements SimulationStore{
 rows=new Map<string,SimulationRecord>();
 async get(owner:string,id?:string){return structuredClone([...this.rows.values()].find(r=>r.owner===owner&&(!id||r.id===id))??null);}
 async create(owner:string,state:SimulationState){const r={id:randomUUID(),owner,revision:1,state:structuredClone(state)};this.rows.set(r.id,r);return structuredClone(r);}
 async save(r:SimulationRecord){const old=this.rows.get(r.id);if(!old||old.owner!==r.owner||old.revision!==r.revision)return false;this.rows.set(r.id,structuredClone({...r,revision:r.revision+1}));return true;}
 async remove(owner:string,id:string){if(this.rows.get(id)?.owner===owner)this.rows.delete(id);}
}
