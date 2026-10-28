export async function prepareAvatar(file:File):Promise<Blob>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024)throw new Error('Wähle ein JPEG-, PNG- oder WebP-Bild bis 2 MB.');
 const bitmap=await createImageBitmap(file);const scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');if(!ctx){bitmap.close();throw new Error('Das Bild konnte nicht verarbeitet werden.');}ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 // Re-encoding strips uploaded metadata; only the selected image pixels leave the device.
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Das Bild konnte nicht gespeichert werden.')),'image/webp',.86));
}
