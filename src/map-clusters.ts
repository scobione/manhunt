import type {Pin} from '../shared/types';
export interface MapPinGroup {id:string;pins:Pin[];longitude:number;latitude:number;}
/** Groups only the already-authorized pins supplied by the server. GPS and XP
 * markers are deliberately not inputs. Coordinates of individual pins never change. */
export function groupMapPins(pins:readonly Pin[],project:(pin:Pin)=>{x:number;y:number},radius=52,minimum=3):{singles:Pin[];groups:MapPinGroup[]}{
 const sorted=[...pins].sort((a,b)=>a.id.localeCompare(b.id)),points=sorted.map(project),parent=sorted.map((_,i)=>i),buckets=new Map<string,number[]>();
 const root=(i:number):number=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 for(let i=0;i<points.length;i++){
  const p=points[i];if(!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
  const x=Math.floor(p.x/radius),y=Math.floor(p.y/radius);
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const j of buckets.get(`${x+dx}:${y+dy}`)??[]){const q=points[j];if(Math.hypot(p.x-q.x,p.y-q.y)<=radius)parent[root(i)]=root(j);}
  const key=`${x}:${y}`,bucket=buckets.get(key)??[];bucket.push(i);buckets.set(key,bucket);
 }
 const grouped=new Map<number,Pin[]>();sorted.forEach((pin,i)=>{const key=root(i),set=grouped.get(key)??[];set.push(pin);grouped.set(key,set);});
 const singles:Pin[]=[],groups:MapPinGroup[]=[];
 for(const members of grouped.values())if(members.length<minimum)singles.push(...members);else groups.push({id:members.map(p=>p.id).join('|'),pins:members,longitude:Math.atan2(members.reduce((sum,p)=>sum+Math.sin(p.longitude*Math.PI/180),0),members.reduce((sum,p)=>sum+Math.cos(p.longitude*Math.PI/180),0))*180/Math.PI,latitude:members.reduce((sum,p)=>sum+p.latitude,0)/members.length});
 return{singles,groups};
}
