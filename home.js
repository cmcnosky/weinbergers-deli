'use strict';
// Keep existing menu shares and hosted-payment return URLs working after the
// home/menu split. Stay on this origin and do not read or transmit saved orders.
(() => {
  const url = new URL(location.href);
  const routed = ['q','include','exclude','max','category','compare','item','sort','saved','checkout','payment','session_id','embedded'];
  const isHome = /(?:\/|\/index\.html)$/.test(url.pathname);
  if (isHome && routed.some(key => url.searchParams.has(key))) {
    const target = new URL('menu.html', url);
    target.search = url.search;
    target.hash = url.hash;
    location.replace(target.href);
  }
})();
