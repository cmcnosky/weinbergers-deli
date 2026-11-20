'use strict';
// Cache public browsing assets only. Payments, private order lookups, runtime
// configuration prefers the network; staff operations never enter this cache.
const CACHE='weinbergers-public-v20261120-48';
const ROOT=new URL('./',self.location).pathname;
const PUBLIC_PAGES=['','index.html','menu.html','mobile.html','visit.html','readable-menu.html','story.html','group.html','catering.html'];
const SHELL=['counter-layout.css?v=20261120-47','house-style.css?v=20261120-44','home-counter.css?v=20261120-44','site-content-core.js?v=20261120-48','site-content.js?v=20261120-43','site-content.css?v=20261117-41','account-menu.css?v=20261117-41','account-menu.js?v=20261120-45','readable-content.js?v=20261117-41','storefront.css?v=20261117-41','readability.css?v=20261117-41','boundaries.css?v=20261117-41','story.html','group.html','catering.html','story.css?v=20261117-41','story.js?v=20261117-41','expansion.css?v=20261117-41','customer-usuals.js?v=20261117-41','group-order.js?v=20261117-42','catering.js?v=20261117-42','guest.css?v=20261117-41','home.js?v=20261120-45','index.html','menu.html','mobile.html','visit.html','readable-menu.html','readable-menu.css?v=20261117-41','style.css?v=20261117-41','discovery.css?v=20261120-45','brand.css?v=20261117-41','experience.css?v=20261120-46','runtime-config.js?v=20261117-41','demo-menu.js?v=20261117-41','data.js?v=20261117-41','discovery.js?v=20261117-41','customer.js?v=20261120-46','media.js?v=20261120-48','offline.js?v=20261117-41','fonts.css','barlow.css','assets/weinbergers-logo-original.png','assets/weinbergers-logo-smooth.svg','assets/hero/gayles-super-reuben-corrected-20261120-580.webp','assets/hero/gayles-super-reuben-corrected-20261120-1160.webp','assets/hero/gayles-super-reuben-corrected-20261120-1448.png','assets/counter-edition/mark-cuban-760.webp','assets/editorial/dan-weinberger-768-20261120-r1.png','assets/editorial/dan-weinberger-1440-20261120-r1.png','assets/editorial/weinbergers-film-poster-1280-20261120-r1.jpg','assets/optimized/weinbergers-main-street-20261105-800-20261120-r1.webp','assets/optimized/weinbergers-main-street-20261105-1600-20261120-r1.webp'];
async function cachePublicShell() {
 const cache = await caches.open(CACHE);
 // First-time visits should not request the entire offline menu and its assets at once.
 for (let offset = 0; offset < SHELL.length; offset += 4) {
  await cache.addAll(SHELL.slice(offset, offset + 4));
 }
}
self.addEventListener('install', event => event.waitUntil(cachePublicShell()));
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('weinbergers-public-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(ROOT)||request.headers.has('Authorization'))return;
 const path=url.pathname.slice(ROOT.length);
 if(path.startsWith('api/')||path==='staff.html'||path.startsWith('owner-studio')||path.startsWith('site-studio')||path.startsWith('operations')||path.startsWith('staff'))return;
 if(path==='runtime-config.js'||request.mode==='navigate'&&PUBLIC_PAGES.includes(path)){
  const canonical=path==='runtime-config.js'?request.url:new URL(path||'index.html',self.registration.scope).href;
  event.respondWith(fetch(request,{cache:'no-cache'}).then(async response => {
   if (response.ok) {
    const copy = response.clone();
    event.waitUntil(caches.open(CACHE).then(cache => cache.put(canonical, copy)));
   } else if (request.mode === 'navigate' && (response.status === 429 || response.status >= 500)) {
    const current = await caches.open(CACHE);
    return await current.match(canonical) || response;
   }
   return response;
  }).catch(async () => await caches.match(canonical) || Response.error()));
  return;
 }
 if(path.startsWith('assets/') || /\.(?:css|js|woff2?)$/.test(path)) {
  event.respondWith(caches.open(CACHE).then(async cache => {
   const hit = await cache.match(request);
   if (hit) return hit;
   const response = await fetch(request);
   if (!response.ok) return response;
   const isMenuPhoto = value => /\/assets\/(?:optimized|menu-sharp-[^/]+)\//.test(value);
   try {
    if (isMenuPhoto(url.pathname)) {
     const photos = (await cache.keys()).filter(key => isMenuPhoto(new URL(key.url).pathname));
     if (photos.length >= 160) await Promise.all(photos.slice(0, photos.length - 159).map(key => cache.delete(key)));
    }
    await cache.put(request, response.clone());
   } catch {
    // A full device cache should still show a photograph just received from the network.
   }
   return response;
  }));
 }
});
