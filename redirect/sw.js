// Replace the old shell worker; never transfer sessions or cache location data.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(key=>key.startsWith('manhunt-')).map(key=>caches.delete(key)));await self.clients.claim();})()));
