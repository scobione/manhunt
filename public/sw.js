/* Only the app shell is cached. Never cache API, OAuth, player, GPS or map-tile requests. */
const CACHE='manhunt-shell-v3';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/offline.html','/icon.svg','/icon-192.png','/icon-512.png']))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin||event.request.method!=='GET'||url.pathname.startsWith('/api')||url.pathname.startsWith('/socket.io')||url.pathname.startsWith('/auth'))return;
 if(event.request.mode==='navigate') event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));
 else if(['/icon.svg','/icon-192.png','/icon-512.png'].includes(url.pathname)) event.respondWith(caches.match(event.request).then(c=>c||fetch(event.request)));
});
self.addEventListener('push',event=>{
 const data={title:'MANHUNT',body:'Es gibt Neuigkeiten. Öffne die App.',url:'/notifications',tag:'manhunt-update'};
 try{const payload=event.data.json();if(typeof payload.title==='string')data.title=payload.title.slice(0,80);if(typeof payload.body==='string')data.body=payload.body.slice(0,180);if(typeof payload.tag==='string')data.tag=payload.tag.slice(0,120);const url=new URL(payload.url,self.location.origin);if(url.origin===self.location.origin&&['/game','/settings','/notifications','/lobby'].includes(url.pathname))data.url=url.pathname;}catch{}
 event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'/icon-192.png',badge:'/icon-192.png',data:{url:data.url},tag:data.tag}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const raw=event.notification.data?.url;const path=['/game','/settings','/notifications','/lobby'].includes(raw)?raw:'/notifications';const url=new URL(path,self.location.origin).href;const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.navigate(url);return client.focus();}}return self.clients.openWindow(url);})());});
