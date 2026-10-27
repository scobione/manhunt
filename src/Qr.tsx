import {useEffect,useRef,useState} from 'react';
import {Camera, X, ScanLine} from 'lucide-react';
import type {IScannerControls} from '@zxing/browser';

export function QrCode({value,label}:{value:string;label:string}) {
  const [source,setSource]=useState(''),[error,setError]=useState('');
  useEffect(()=>{let live=true;setSource('');setError('');void import('qrcode').then(q=>q.toString(value,{type:'svg',margin:4,errorCorrectionLevel:'M',color:{dark:'#080B0D',light:'#FFFFFF'}})).then(svg=>{if(live)setSource(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);}).catch(()=>{if(live)setError('QR-Code konnte nicht geladen werden. Bitte erneut öffnen.');});return()=>{live=false;};},[value]);
  return <div className="qr-code">{source?<img src={source} alt={label} width="320" height="320"/>:<p role="status">{error||'QR-Code wird erstellt…'}</p>}</div>;
}

export function QrScanner({onScan,onClose,label='QR-Code scannen'}:{onScan:(value:string)=>Promise<void>;onClose:()=>void;label?:string}) {
  const video=useRef<HTMLVideoElement>(null),controls=useRef<IScannerControls|null>(null),generation=useRef(0),pending=useRef(false);
  const [active,setActive]=useState(false),[error,setError]=useState('');
  const handler=useRef(onScan);handler.current=onScan;
  function stop(){generation.current++;controls.current?.stop();controls.current=null;const stream=video.current?.srcObject;if(stream instanceof MediaStream)stream.getTracks().forEach(track=>track.stop());if(video.current)video.current.srcObject=null;}
  useEffect(()=>{const hide=()=>{if(document.hidden){stop();setActive(false);}};document.addEventListener('visibilitychange',hide);return()=>{stop();document.removeEventListener('visibilitychange',hide);};},[]);
  async function accept(raw:string){if(pending.current)return;pending.current=true;stop();setActive(false);try{await handler.current(raw);}catch(e){setError(e instanceof Error?e.message:'Dieser QR-Code ist ungültig.');}finally{pending.current=false;}}
  async function start(){stop();const current=generation.current;setError('');setActive(true);try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('Kamera nicht verfügbar. Öffne MANHUNT über HTTPS oder wähle ein QR-Bild.');const {BrowserQRCodeReader}=await import('@zxing/browser');if(current!==generation.current)return;const reader=new BrowserQRCodeReader();const next=await reader.decodeFromConstraints({video:{facingMode:{ideal:'environment'}},audio:false},video.current!,result=>{if(result&&current===generation.current)void accept(result.getText());});if(current!==generation.current)next.stop();else controls.current=next;}catch(e){if(current===generation.current){stop();setActive(false);setError(e instanceof Error&&e.name==='NotAllowedError'?'Kamerazugriff abgelehnt. Erlaube die Kamera in den Geräteeinstellungen oder wähle ein QR-Bild.':'Kamera konnte nicht gestartet werden. Versuche es erneut oder wähle ein QR-Bild.');}}}
  async function scanFile(file:File){
    stop();const current=generation.current;setActive(false);setError('');
    if(file.size>10*1024*1024){setError('Das Bild darf höchstens 10 MB groß sein.');return;}
    const url=URL.createObjectURL(file);
    try{
      const {BrowserQRCodeReader}=await import('@zxing/browser');
      const image=new Image();image.src=url;await image.decode();
      const scale=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(!context)throw new Error('Bild konnte nicht gelesen werden.');
      context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(image,0,0,canvas.width,canvas.height);
      let raw:string;
      try{
        raw=(await new BrowserQRCodeReader().decodeFromCanvas(canvas)).getText();
      }catch{
        // A second detector handles uneven module widths in mobile screenshots.
        // Both decoders only read pixels locally; the same strict QR contracts
        // and server-side capture authorization still validate their result.
        const {default:jsQR}=await import('jsqr');
        const pixels=context.getImageData(0,0,canvas.width,canvas.height);
        const result=jsQR(pixels.data,pixels.width,pixels.height);
        if(!result)throw new Error('Kein QR-Code erkannt.');
        raw=result.data;
      }
      if(current===generation.current)await accept(raw);
    }catch{
      if(current===generation.current)setError('Kein lesbarer QR-Code im Bild. Bitte näher und scharf aufnehmen.');
    }finally{URL.revokeObjectURL(url);}
  }
  return <section className="panel qr-scanner" aria-label={label}><div className="panel-heading"><h3><ScanLine size={20}/> {label}</h3><button className="icon-button" aria-label="Scanner schließen" onClick={()=>{stop();onClose();}}><X size={20}/></button></div><video ref={video} muted playsInline aria-label="Kameravorschau" hidden={!active}/><p>Halte die Kamera ruhig vor den QR-Code. Die Bilder werden nur auf deinem Gerät ausgewertet.</p>{error&&<p role="alert" className="inline-warning">{error}</p>}<div className="button-row"><button type="button" className="button primary" onClick={active?()=>{stop();setActive(false);}:start}><Camera size={18}/>{active?'Kamera stoppen':'Kamera starten'}</button><label className="button qr-upload">QR-Bild auswählen<input type="file" accept="image/*" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';if(f)void scanFile(f);}}/></label></div></section>;
}
