// Cinema Mode: cache only versioned static files, never private video or API responses.
const CACHE='cinema-projector-shell-v1';
self.addEventListener('install', event=>self.skipWaiting());
self.addEventListener('activate', event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin || url.pathname.startsWith('/api/'))return;
  if(!url.pathname.startsWith('/assets/') && !['/cinema-icon.svg','/manifest.webmanifest'].includes(url.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const result=await fetch(request);
    if(result.ok)cache.put(request,result.clone()).catch(()=>{});
    return result;
  })());
});
