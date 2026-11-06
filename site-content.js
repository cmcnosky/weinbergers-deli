'use strict';
(() => {
 const core=window.DeliContentCore;if(!core)return;
 const preview=new URLSearchParams(location.search).get('cms-preview')==='1';
 const root=String(window.WEINBERGERS_RUNTIME?.apiBaseUrl||'').replace(/\/$/,'');
 const previewKey='wd-site-studio-preview-v1',cacheKey='wd-published-content-v1:'+root;
 let current=null,etag='',loading=false;
 const contactDefaults={name:'Weinberger’s Deli',phone:'(817) 670-5729',address:'601 S Main Street',city:'Grapevine, Texas 76051'};
 let previousContact={...contactDefaults};
 const clean=v=>String(v||'').replace(/[ \t]+/g,' ').trim();
 const base=location.href;
 function url(value,media=false){return core.safeURL(value,value.startsWith('/api/site-assets/')&&root?new URL(root,location.href).origin:base,media);}
 function setImage(el,field){const source=url(field.value,true);if(!source)return;if(el.getAttribute('src')!==field.value&&el.src!==source){el.removeAttribute('srcset');el.removeAttribute('sizes');el.src=source;}if(field.alt!=null)el.alt=field.alt;}
 function writeText(el,value){if(clean(el.innerText||el.textContent)!==clean(value)){el.textContent=value;el.style.whiteSpace='pre-line';}}
 function fields(section,element){
  const data=new Map(section.fields.map(f=>[f.id,f]));
  element.querySelectorAll(':scope > [data-cms-added-fields]').forEach(el=>el.remove());
  const bound=new Set();
  for(const el of [element,...element.querySelectorAll('[data-cms-field],[data-cms-text-nodes],[data-cms-image],[data-cms-link],[data-cms-placeholder]')]){
   for(const key of ['cmsField','cmsImage','cmsLink','cmsPlaceholder'])if(el.dataset[key])bound.add(el.dataset[key]);
   let f=data.get(el.dataset.cmsField);if(el.dataset.cmsField){el.toggleAttribute('data-cms-removed',!f);if(f)writeText(el,f.value);}
   if(el.dataset.cmsTextNodes){try{for(const[index,id]of JSON.parse(el.dataset.cmsTextNodes)){bound.add(id);f=data.get(id);const node=el.childNodes[index];if(node?.nodeType===3&&clean(node.textContent)!==clean(f?.value)){const before=node.textContent;node.textContent=f?( /^\s/.test(before)?' ':'')+f.value+(/\s$/.test(before)?' ':''):'';}}}catch{}}
   f=data.get(el.dataset.cmsImage);if(el.dataset.cmsImage&&el.tagName==='IMG'){el.toggleAttribute('data-cms-removed',!f);if(f)setImage(el,f);}
   f=data.get(el.dataset.cmsLink);if(el.dataset.cmsLink&&el.tagName==='A'){const value=f?url(f.value):'';if(value)el.href=value;else el.removeAttribute('href');}
   f=data.get(el.dataset.cmsPlaceholder);if(el.dataset.cmsPlaceholder)el.setAttribute('placeholder',f?.value||'');
  }
  const added=section.fields.filter(f=>!bound.has(f.id));if(added.length){const block=genericSection({id:section.id+'-extras',title:'',fields:added});block.removeAttribute('data-cms-section');block.removeAttribute('data-cms-generated');block.setAttribute('data-cms-added-fields','true');block.querySelector('h2')?.remove();element.append(block);}
 }
 function genericSection(section){
  const el=document.createElement('section');el.className='cms-custom-section guest-section';el.dataset.cmsSection=section.id;el.dataset.cmsGenerated='true';
  const heading=document.createElement('h2');heading.textContent=section.title;el.append(heading);
  for(const field of section.fields){let node;if(field.type==='image'){node=document.createElement('img');node.loading='lazy';node.dataset.cmsImage=field.id;setImage(node,field);}else if(field.type==='link'){node=document.createElement('a');node.className='guest-text-link';node.dataset.cmsLink=field.id;node.textContent=field.label;const target=url(field.value);if(target)node.href=target;}else if(field.type==='video'){node=document.createElement('a');node.dataset.cmsLink=field.id;node.className='guest-text-link';node.textContent=field.label;const target=url(field.value);if(target)node.href=target;node.target='_blank';node.rel='noopener';}else{node=document.createElement(field.type==='multiline'?'p':'h3');node.textContent=field.value;node.dataset.cmsField=field.id;}el.append(node);}return el;
 }
 function contact(site){
  document.querySelectorAll('[data-cms-site="logo"]').forEach(el=>setImage(el,{value:site.logo,alt:site.name}));
  document.querySelectorAll('[data-cms-site="phone"]').forEach(el=>{const digits=String(site.phone||'').replace(/[^\d+]/g,'');if(!digits)return;el.href='tel:'+digits;const old=el.textContent;el.textContent=old.split(previousContact.phone).join(site.phone).replace(/\(?817\)?[ -]?670[ -]?5729/g,site.phone);});
  const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
  while((node=walk.nextNode())){if(node.parentElement?.closest('script,style,textarea,input,[data-cms-generated]'))continue;let v=node.textContent;for(const key of ['address','city','name']){for(const from of new Set([previousContact[key],contactDefaults[key]])){if(!from)continue;v=v.split(from).join(site[key]||contactDefaults[key]);v=v.split(from.toUpperCase()).join((site[key]||contactDefaults[key]).toUpperCase());}}if(v!==node.textContent)node.textContent=v;}
  const film=core.videoID(site.video_url);if(film){document.querySelectorAll('[data-deli-film]').forEach(el=>el.dataset.cmsVideoId=film);document.querySelectorAll('a[href*="youtube.com/watch"]').forEach(el=>el.href='https://www.youtube.com/watch?v='+film);document.querySelectorAll('.film-launch img').forEach(el=>{if(!el.dataset.cmsFilmOriginal)el.dataset.cmsFilmOriginal=el.getAttribute('src');el.src=film==='PW00HmRJZfg'?el.dataset.cmsFilmOriginal:'https://img.youtube.com/vi/'+film+'/hqdefault.jpg';});}
  previousContact={...contactDefaults,...site};
 }
 function apply(content){
  if(!core.validate(content))return false;current=content;
  const style=document.documentElement.style;for(const[k,v]of Object.entries(core.themeVars(content.theme)))style.setProperty(k,v);
  document.documentElement.dataset.cmsStyled='true';
  const scale=Number(content.theme.font_scale);style.setProperty('--cms-font-scale',String(scale>=.8&&scale<=1.5?scale:1));
  const spacing=Number(content.theme.spacing);style.setProperty('--cms-spacing',String(spacing>=.75&&spacing<=2?spacing:1));
  const page=content.pages.find(p=>p.id===document.body.dataset.cmsPage);
  if(page){document.title=page.seo?.title||document.title;for(const q of ['meta[name="description"]','meta[property="og:description"]','meta[name="twitter:description"]']){const m=document.querySelector(q);if(m&&page.seo)m.content=page.seo.description;}for(const q of ['meta[property="og:title"]','meta[name="twitter:title"]']){const m=document.querySelector(q);if(m&&page.seo)m.content=page.seo.title;}
   if(page.seo?.image){const shareImage=url(page.seo.image,true);if(shareImage)for(const q of ['meta[property="og:image"]','meta[property="og:image:secure_url"]','meta[name="twitter:image"]']){const m=document.querySelector(q);if(m)m.content=shareImage;}for(const q of ['meta[property="og:image:alt"]','meta[name="twitter:image:alt"]']){const m=document.querySelector(q);if(m)m.content=page.seo.image_alt||'';}}
   const container=document.querySelector('[data-cms-container]');const existing=new Map([...document.querySelectorAll('[data-cms-section]')].map(el=>[el.dataset.cmsSection,el]));
   for(const section of page.sections){let el=existing.get(section.id);if(el?.dataset.cmsGenerated){const replacement=genericSection(section);el.replaceWith(replacement);el=replacement;}if(!el&&container){el=genericSection(section);container.append(el);}if(!el)continue;el.toggleAttribute('data-cms-section-hidden',!section.visible);el.dataset.cmsLayout=section.layout;fields(section,el);if(el.parentElement===container)container.append(el);existing.delete(section.id);}
   // Removed editorial sections disappear; core order forms and menu functionality are retained in source.
   for(const el of existing.values())el.setAttribute('data-cms-section-hidden','');
  }
  const nav=document.querySelector('.guest-header nav');
  const navIDs=new Set(content.navigation.map(item=>item.id));
  document.querySelectorAll('[data-cms-nav]').forEach(el=>{if(!navIDs.has(el.dataset.cmsNav))el.hidden=true;});
  for(const item of content.navigation){if(!/^[a-z0-9-]+$/.test(item.id))continue;let el=document.querySelector('[data-cms-nav="'+item.id+'"]');if(!el&&nav&&!['saved','orders'].includes(item.id)){el=document.createElement('a');el.dataset.cmsNav=item.id;nav.append(el);}if(!el)continue;el.hidden=!item.visible;el.textContent=item.label;const target=url(item.url);if(target)el.href=target;if(el.parentElement===nav)nav.append(el);}
  if(nav?.querySelector('.guest-order'))nav.append(nav.querySelector('.guest-order'));
  contact(content.site);window.dispatchEvent(new CustomEvent('weinbergers-content',{detail:content}));return true;
 }
 async function refresh(){if(loading||preview)return;loading=true;
  try{const endpoint=root?root+'/site-content':'site-content-defaults.json';const c=new AbortController(),timer=setTimeout(()=>c.abort(),8000);let response;try{response=await fetch(endpoint,{cache:'no-store',credentials:'omit',signal:c.signal,headers:etag?{'If-None-Match':etag}:{}});}finally{clearTimeout(timer);}if(response.status===304)return;if(!response.ok)throw Error('content');const payload=await response.json();const content=payload.content||payload;if(apply(content)){etag=response.headers.get('etag')||'';if(root)try{localStorage.setItem(cacheKey,JSON.stringify(content));}catch{}}}catch{/* Keep the approved HTML or the last published content while offline. */}finally{loading=false;}}
 window.DeliContent={get current(){return current;},refresh,applyPreview:content=>preview&&apply(content)};
 if(preview){try{apply(JSON.parse(sessionStorage.getItem(previewKey)||'null'));}catch{}window.addEventListener('message',event=>{if(event.origin!==location.origin||![window.parent,window.opener].includes(event.source)||event.data?.type!=='weinbergers-site-preview')return;apply(event.data.content);});if(window.parent!==window)window.parent.postMessage({type:'weinbergers-site-preview-ready'},location.origin);}
 else if(root){try{apply(JSON.parse(localStorage.getItem(cacheKey)||'null'));}catch{}refresh();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});setInterval(()=>{if(!document.hidden)refresh();},60000);}
})();
