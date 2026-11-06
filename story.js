'use strict';
// The original deli film loads only after a visitor asks to play it.
document.addEventListener('click',event=>{
  const play=event.target.closest('[data-play-deli-film]'),stop=event.target.closest('[data-stop-deli-film]');
  const block=(play||stop)?.closest('[data-deli-film]');if(!block)return;
  const launch=block.querySelector('[data-play-deli-film]'),player=block.querySelector('.film-player'),close=block.querySelector('[data-stop-deli-film]');
  if(play){const frame=document.createElement('iframe');const id=/^[\w-]{11}$/.test(block.dataset.cmsVideoId||'')?block.dataset.cmsVideoId:'PW00HmRJZfg';frame.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0&cc_load_policy=1';frame.title=(window.DeliContent?.current?.site?.name||'Weinberger’s Deli')+' film';frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';player.replaceChildren(frame);launch.hidden=true;player.hidden=false;close.hidden=false;frame.focus();}
  else{player.replaceChildren();player.hidden=true;launch.hidden=false;close.hidden=true;launch.focus();}
});
