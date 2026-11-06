/** A connected transport is not enough: only the acknowledged state from this
 * connection generation may enable commands and announce a successful return. */
export function reconnectState(connection:(connected:boolean)=>void,restored:()=>void){
 let generation=0,synchronized=false,interrupted=false;
 return{
  begin(){connection(false);return ++generation;},
  disconnected(){generation++;if(synchronized)interrupted=true;connection(false);},
  accept(version:number,apply:()=>void){
   if(version!==generation)return false;
   apply();connection(true);
   if(synchronized&&interrupted){interrupted=false;restored();}
   synchronized=true;return true;
  },
  current(version:number){return version===generation;},
 };
}
