'use strict';
if('serviceWorker' in navigator&&location.protocol!=='file:')window.addEventListener('load',async()=>{
 const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 if(local&&!new URLSearchParams(location.search).has('offline-test')){
  const scope=new URL('./',location.href).href;
  for(const registration of await navigator.serviceWorker.getRegistrations())if(registration.scope===scope)await registration.unregister();
  return;
 }
 navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
});
window.addEventListener('online',()=>{if(typeof refresh==='function')refresh();if(typeof toast==='function')toast('Connection restored. Checking the menu again.')});
window.addEventListener('offline',()=>{if(typeof toast==='function')toast('You’re offline. Your bag is saved. Reconnect before checkout.')});
