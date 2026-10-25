/** Strict QR contracts. Scans never navigate to an arbitrary URL. */
export function lobbyQrUrl(code:string, origin:string):string {
  if(!/^[A-Z2-9]{6}$/.test(code))throw new Error('Ungültiger Lobbycode.');
  return `${origin}/join?code=${code}`;
}
export function readLobbyQr(raw:string, origin:string):string {
  try {
    const url=new URL(raw);
    const code=url.searchParams.get('code')??'';
    if(url.origin!==origin||url.pathname!=='/join'||url.username||url.password||! /^[A-Z2-9]{6}$/.test(code))throw new Error();
    return code;
  } catch {throw new Error('Das ist kein Lobby-QR-Code dieser MANHUNT-App.');}
}
export interface CaptureQr {v:1;kind:'manhunt-capture';lobbyId:string;playerId:string;token:string;expiresAt:number}
export function readCaptureQr(raw:string,lobbyId:string):CaptureQr {
  try {
    if(raw.length>1024)throw new Error();
    const data=JSON.parse(raw) as CaptureQr;
    if(data.v!==1||data.kind!=='manhunt-capture'||data.lobbyId!==lobbyId||typeof data.playerId!=='string'||data.playerId.length>80||! /^[A-Za-z0-9_-]{43}$/.test(data.token)||!Number.isSafeInteger(data.expiresAt))throw new Error();
    return data;
  }catch{throw new Error('Kein gültiger Fang-QR-Code aus diesem Match.');}
}
