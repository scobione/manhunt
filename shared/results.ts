import type {LobbyView} from './types';
export function personalResult(lobby:LobbyView):'won'|'lost'|'neutral'{
 const winner=lobby.result?.winner,self=lobby.self;
 if(!winner||['draw','aborted','deleted_player'].includes(winner)||self.role==='spectator')return'neutral';
 if(winner===self.id)return'won';
 if(['A','B','team_A','team_B'].includes(winner))return winner.replace('team_','')===self.team?'won':'lost';
 if(winner==='hiders')return self.role==='hider'&&!!lobby.result?.survivors.includes(self.id)?'won':'lost';
 if(winner==='hunters')return self.role==='hunter'?'won':'lost';
 if(['infected','zombies'].includes(winner))return['hunter','zombie'].includes(self.role)?'won':'lost';
 return'lost';
}
