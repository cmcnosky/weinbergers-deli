'use strict';
// Cache public browsing assets only. Payments, private order lookups, runtime
// configuration prefers the network; staff operations never enter this cache.
const CACHE='weinbergers-public-v20261105-27';
const ROOT=new URL('./',self.location).pathname;
const PUBLIC_PAGES=['','index.html','menu.html','mobile.html','visit.html','readable-menu.html','story.html','group.html','catering.html'];
const SHELL=['story.html','group.html','catering.html','story.css?v=20261105-27','story.js?v=20261105-27','expansion.css?v=20261105-27','customer-usuals.js?v=20261105-27','group-order.js?v=20261105-27','catering.js?v=20261105-27','guest.css?v=20261105-27','home.js?v=20261105-27','index.html','menu.html','mobile.html','visit.html','readable-menu.html','readable-menu.css?v=20261105-27','style.css?v=20261105-27','discovery.css?v=20261105-27','brand.css?v=20261105-27','experience.css?v=20261105-27','runtime-config.js?v=20261105-27','demo-menu.js?v=20261105-27','data.js?v=20261105-27','discovery.js?v=20261105-27','customer.js?v=20261105-27','media.js?v=20261105-27','offline.js?v=20261105-27','fonts.css','barlow.css','assets/weinbergers-logo-original.png','assets/weinbergers-logo-smooth.svg','assets/optimized/gayles-super-reuben-8U3W-800.webp'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('weinbergers-public-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(ROOT)||request.headers.has('Authorization'))return;
 const path=url.pathname.slice(ROOT.length);
 if(path.startsWith('api/')||path==='staff.html'||path.startsWith('operations')||path.startsWith('staff'))return;
 if(path==='runtime-config.js'||request.mode==='navigate'&&PUBLIC_PAGES.includes(path)){
  const canonical=path==='runtime-config.js'?request.url:new URL(path||'index.html',self.registration.scope).href;
  event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(canonical,copy)))}return response}).catch(async()=>{const cached=await caches.match(canonical);return cached||Response.error()}));return;
 }
 if(path.startsWith('assets/')||/\.(?:css|js|woff2?)$/.test(path))event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(request);if(cached)return cached;const response=await fetch(request);if(response.ok){await cache.put(request,response.clone());const keys=await cache.keys();const photos=keys.filter(key=>new URL(key.url).pathname.includes('/assets/optimized/'));if(photos.length>160)await Promise.all(photos.slice(0,photos.length-160).map(key=>cache.delete(key)))}return response}));
});
