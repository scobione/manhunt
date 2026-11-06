/** ISOLATED CAMERA TESTS: a canvas MediaStream supplies pixels locally. The
 * hardware torch capability/constraint responses are explicit browser mocks.
 * No real camera, account, production service or GPS sample is used. */
import {test,expect,type Page} from '@playwright/test';
import QRCode from 'qrcode';

interface CameraTrackFixture {track:MediaStreamTrack;canvas:HTMLCanvasElement;applied:boolean[];light:boolean;stopped:number;}
interface CameraFixture {calls:MediaStreamConstraints[];tracks:CameraTrackFixture[];rejectNext:boolean;holdTorchNext:boolean;holdCameraNext:boolean;releaseTorch?:()=>void;releaseCamera?:()=>void;}
declare global {interface Window {__qrCamera:CameraFixture;}}

async function camera(page:Page,supported=true){
 await page.addInitScript(supported=>{
  const state:CameraFixture={calls:[],tracks:[],rejectNext:false,holdTorchNext:false,holdCameraNext:false};window.__qrCamera=state;
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async(constraints:MediaStreamConstraints)=>{
   state.calls.push(constraints);
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
   const context=canvas.getContext('2d')!;context.fillStyle='white';context.fillRect(0,0,640,480);
   const stream=canvas.captureStream(15),track=stream.getVideoTracks()[0],nativeStop=track.stop.bind(track),nativeSettings=track.getSettings.bind(track);
   const item:CameraTrackFixture={track,canvas,applied:[],light:false,stopped:0};state.tracks.push(item);
   // Request frames without changing the fixture pixels drawn by the test.
   const frames=setInterval(()=>{const s=track as CanvasCaptureMediaStreamTrack;s.requestFrame?.();},80);
   Object.defineProperty(track,'getCapabilities',{value:()=>({torch:supported})});
   Object.defineProperty(track,'getSettings',{value:()=>({...nativeSettings(),torch:item.light})});
   Object.defineProperty(track,'applyConstraints',{value:async(value:MediaTrackConstraints)=>{
    for(const constraint of value.advanced??[]){
     const on=(constraint as MediaTrackConstraintSet&{torch?:boolean}).torch;if(typeof on!=='boolean')continue;
     item.applied.push(on);
     if(on&&state.rejectNext){state.rejectNext=false;throw new DOMException('ISOLATED torch rejection','NotSupportedError');}
     if(on&&state.holdTorchNext){state.holdTorchNext=false;await new Promise<void>(resolve=>{state.releaseTorch=resolve;});}
     if(track.readyState!=='live')throw new DOMException('ISOLATED ended track','InvalidStateError');
     item.light=on;
    }
   }});
   Object.defineProperty(track,'stop',{value:()=>{item.stopped++;item.light=false;clearInterval(frames);nativeStop();}});
   if(state.holdCameraNext){state.holdCameraNext=false;await new Promise<void>(resolve=>{state.releaseCamera=resolve;});}
   return stream;
  }});
 },supported);
 await page.goto('/join');await page.getByLabel('Dein Gastname').fill('TorchTest');await page.getByRole('button',{name:'Lobby-QR scannen',exact:true}).click();
}
const torch=(page:Page)=>page.getByRole('button',{name:'Taschenlampe',exact:true});
const stopped=(page:Page)=>page.evaluate(()=>window.__qrCamera.tracks.every(item=>item.track.readyState==='ended'&&!item.light));

test('QR-TORCH-01: actual track capability enables a touch-sized toggle and stop/restart/close release it',async({page})=>{
 await page.setViewportSize({width:320,height:844});await camera(page);
 await expect(torch(page)).toHaveCount(0);await page.getByRole('button',{name:'Kamera starten',exact:true}).click();
 await expect(torch(page)).toHaveAttribute('aria-pressed','false');await torch(page).click();await expect(torch(page)).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>window.__qrCamera.tracks[0].light)).toBe(true);
 const size=await torch(page).boundingBox();expect(size!.height).toBeGreaterThanOrEqual(44);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 const videoConstraints=await page.evaluate(()=>window.__qrCamera.calls[0].video as MediaTrackConstraints);
 expect(videoConstraints.frameRate).toEqual({ideal:15});expect(videoConstraints.width).toEqual({ideal:960});
 await page.getByRole('button',{name:'Kamera stoppen',exact:true}).click();await expect(torch(page)).toHaveCount(0);expect(await stopped(page)).toBe(true);
 await page.getByRole('button',{name:'Kamera starten',exact:true}).click();await expect(torch(page)).toHaveAttribute('aria-pressed','false');await torch(page).click();await expect(torch(page)).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Scanner schließen',exact:true}).click();expect(await stopped(page)).toBe(true);await expect(page.locator('.qr-scanner')).toHaveCount(0);
});

test('QR-TORCH-02: an unsupported camera never displays or applies torch controls',async({page})=>{
 await camera(page,false);await page.getByRole('button',{name:'Kamera starten',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>document.querySelector('video')?.readyState??0)).toBeGreaterThanOrEqual(2);
 await expect(torch(page)).toHaveCount(0);expect(await page.evaluate(()=>window.__qrCamera.tracks[0].applied)).toEqual([]);
 await page.getByRole('button',{name:'Kamera stoppen',exact:true}).click();expect(await stopped(page)).toBe(true);
});

test('QR-TORCH-03: device rejection retains the camera and offers a deliberate retry without an unhandled error',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await camera(page);
 await page.getByRole('button',{name:'Kamera starten',exact:true}).click();await expect(torch(page)).toBeVisible();
 await page.evaluate(()=>{window.__qrCamera.rejectNext=true;});await torch(page).click();
 await expect(page.getByRole('status').filter({hasText:'Die Taschenlampe konnte nicht umgeschaltet werden.'})).toBeVisible();
 await expect(torch(page)).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(()=>window.__qrCamera.tracks[0].track.readyState)).toBe('live');
 await torch(page).click();await expect(torch(page)).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Scanner schließen',exact:true}).click();
 expect(await stopped(page)).toBe(true);expect(errors).toEqual([]);
});

test('QR-TORCH-04: closing during an outstanding torch request cannot revive the old light or state',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await camera(page);
 await page.getByRole('button',{name:'Kamera starten',exact:true}).click();await expect(torch(page)).toBeVisible();
 await page.evaluate(()=>{window.__qrCamera.holdTorchNext=true;});await torch(page).click();await expect(torch(page)).toBeDisabled();
 await page.getByRole('button',{name:'Scanner schließen',exact:true}).click();expect(await stopped(page)).toBe(true);
 await page.evaluate(()=>window.__qrCamera.releaseTorch?.());await page.getByRole('button',{name:'Lobby-QR scannen',exact:true}).click();await page.getByRole('button',{name:'Kamera starten',exact:true}).click();
 await expect(torch(page)).toHaveAttribute('aria-pressed','false');await page.getByRole('button',{name:'Scanner schließen',exact:true}).click();expect(await stopped(page)).toBe(true);expect(errors).toEqual([]);
});

test('QR-TORCH-05: a late camera permission response cannot replace a restarted preview',async({page})=>{
 await camera(page);await page.evaluate(()=>{window.__qrCamera.holdCameraNext=true;});await page.getByRole('button',{name:'Kamera starten',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__qrCamera.tracks.length)).toBe(1);
 await page.getByRole('button',{name:'Kamera stoppen',exact:true}).click();await page.getByRole('button',{name:'Kamera starten',exact:true}).click();await expect(torch(page)).toBeVisible();
 await page.evaluate(()=>window.__qrCamera.releaseCamera?.());
 await expect.poll(()=>page.evaluate(()=>window.__qrCamera.tracks[0].track.readyState)).toBe('ended');expect(await page.evaluate(()=>window.__qrCamera.tracks[1].track.readyState)).toBe('live');
 await torch(page).click();await expect(torch(page)).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Scanner schließen',exact:true}).click();expect(await stopped(page)).toBe(true);
});

test('QR-TORCH-06: real QR pixel decoding still validates the content and releases the lit camera',async({page})=>{
 await camera(page);await page.getByRole('button',{name:'Kamera starten',exact:true}).click();await expect(torch(page)).toBeVisible();await torch(page).click();await expect(torch(page)).toHaveAttribute('aria-pressed','true');
 const image=await QRCode.toDataURL('https://example.invalid/join?code=ABC234',{width:400,margin:4});
 await page.evaluate(async image=>{const img=new Image();img.src=image;await img.decode();const canvas=window.__qrCamera.tracks[0].canvas,context=canvas.getContext('2d')!;context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,120,40,400,400);},image);
 await expect(page.getByRole('alert')).toHaveText('Das ist kein Lobby-QR-Code dieser MANHUNT-App.');await expect(torch(page)).toHaveCount(0);expect(await stopped(page)).toBe(true);
});
