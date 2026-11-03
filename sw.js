'use strict';
// Cache public browsing assets only. Payments, private order lookups, runtime
// configuration prefers the network; staff operations never enter this cache.
const CACHE='weinbergers-public-v20261103-19';
const ROOT=new URL('./',self.location).pathname;
const SHELL=['index.html','mobile.html','style.css?v=20261103-19','discovery.css?v=20261103-19','brand.css?v=20261103-19','experience.css?v=20261103-19','runtime-config.js?v=20261103-19','demo-menu.js?v=20261103-19','data.js?v=20261103-19','discovery.js?v=20261103-19','customer.js?v=20261103-19','media.js?v=20261103-19','offline.js?v=20261103-19','fonts.css','barlow.css','assets/weinbergers-logo-original.png','assets/weinbergers-logo-smooth.svg','assets/food-03.jpg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('weinbergers-public-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(ROOT)||request.headers.has('Authorization'))return;
 const path=url.pathname.slice(ROOT.length);
 if(path.startsWith('api/')||path==='staff.html'||path.startsWith('operations')||path.startsWith('staff.'))return;
 if(path==='runtime-config.js'||request.mode==='navigate'&&['','index.html','mobile.html'].includes(path)){
  const canonical=path==='runtime-config.js'?request.url:new URL(path||'index.html',self.registration.scope).href;
  event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(canonical,copy)))}return response}).catch(async()=>{const cached=await caches.match(canonical);return cached||Response.error()}));return;
 }
 if(path.startsWith('assets/')||/\.(?:css|js|woff2?)$/.test(path))event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(request);if(cached)return cached;const response=await fetch(request);if(response.ok){await cache.put(request,response.clone());const keys=await cache.keys();const photos=keys.filter(key=>new URL(key.url).pathname.includes('/assets/optimized/'));if(photos.length>160)await Promise.all(photos.slice(0,photos.length-160).map(key=>cache.delete(key)))}return response}));
});
