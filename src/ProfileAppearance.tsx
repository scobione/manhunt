import {useState} from 'react';
import {Check,ImagePlus,Trash2} from 'lucide-react';
import {supabase} from './context';
import {useApp} from './game-context';
import {PROFILE_COLORS,type ProfileCustomization} from '../shared/profiles';
import {customizationChanged,useProfileCustomization} from './profile-customization-client';
import './player-profiles.css';

export async function prepareBanner(file:File):Promise<Blob>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2097152)throw new Error('Wähle ein JPEG-, PNG- oder WebP-Banner bis 2 MB.');
 const image=await createImageBitmap(file),ratio=32/9;
 const sourceWidth=Math.min(image.width,image.height*ratio),sourceHeight=sourceWidth/ratio,scale=Math.min(1,1280/sourceWidth);
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sourceWidth*scale));canvas.height=Math.max(1,Math.round(sourceHeight*scale));const context=canvas.getContext('2d');
 if(!context){image.close();throw new Error('Das Banner konnte nicht verarbeitet werden.');}
 context.drawImage(image,(image.width-sourceWidth)/2,(image.height-sourceHeight)/2,sourceWidth,sourceHeight,0,0,canvas.width,canvas.height);image.close();
 // Pixel re-encoding strips original file metadata. Private Storage contains the prepared image only.
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Das Banner konnte nicht gespeichert werden.')),'image/webp',.87));
}
export function ProfileAppearance(){
 const {api,profile,identity}=useApp(),{value,error:loadError,retry}=useProfileCustomization();const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 async function save(patch:unknown){if(!profile)return;const updated=await api<ProfileCustomization>('/profile/customization',{method:'PATCH',body:JSON.stringify(patch)});customizationChanged(profile.id,updated);setStatus('Profilgestaltung gespeichert.');}
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setStatus('');try{await action();}catch(error){setError(error instanceof Error?error.message:'Die Änderung konnte nicht gespeichert werden.');}finally{setBusy(false);}}
 return <section className="panel profile-appearance-panel"><h2>Profil gestalten</h2>
  <p>Wähle deine Farbe und ein eigenes Banner.</p>
  {identity?.isGuest?<p className="fineprint">Ein eigenes Banner und dauerhafte Profilfarben benötigen ein registriertes Konto.</p>:<>
   <div className="profile-color-options" role="group" aria-label="Profilfarbe">{PROFILE_COLORS.map(color=><button type="button" key={color.id} className="profile-color-choice" data-profile-color={color.id} aria-label={`${color.name} als Profilfarbe`} aria-pressed={value.color===color.id} disabled={busy} onClick={()=>void run(()=>save({color:color.id}))}><span className="profile-color-swatch">{value.color===color.id&&<Check size={16}/>}</span><span>{color.name}</span></button>)}</div>
   <div className="profile-banner-preview" data-profile-color={value.color}>{value.banner_url?<img src={value.banner_url} alt="Dein aktuelles Profilbanner"/>:<span>Dein Profilbanner</span>}</div>
   <label className={`button ${busy?'is-disabled':''}`} htmlFor="profile-banner-file"><ImagePlus size={17}/> Eigenes Profilbanner auswählen</label><input className="sr-only" id="profile-banner-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||!supabase} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(!file||!profile||!supabase)return;void run(async()=>{const blob=await prepareBanner(file),path=`${profile.id}/${crypto.randomUUID()}.webp`,storage=supabase!.storage.from('profile-banners');const uploaded=await storage.upload(path,blob,{contentType:'image/webp',cacheControl:'3600',upsert:false});if(uploaded.error)throw uploaded.error;try{await save({bannerPath:path});}catch(error){await storage.remove([path]);throw error;}});}}/>
   {value.banner_url&&<button type="button" className="button subtle" disabled={busy} onClick={()=>void run(()=>save({bannerPath:null}))}><Trash2 size={16}/> Banner entfernen</button>}
   <p className="fineprint">JPEG, PNG oder WebP bis 2 MB. Das Bild wird mittig zugeschnitten; gespeicherte Dateimetadaten werden entfernt.</p>
  </>}
  {(error||loadError)&&<p role="alert" className="form-error">{error||loadError}{loadError&&<button type="button" className="text-link" onClick={retry}>Erneut laden</button>}</p>}
  <p role="status" className="profile-appearance-status" aria-live="polite">{busy?'Wird gespeichert…':status}</p>
 </section>;
}
