'use strict';
// The original HTML remains a complete, script-free fallback. A connected site
// refreshes it from the exact published menu used for ordering.
(() => {
 const root=String(window.WEINBERGERS_RUNTIME?.contentApiBaseUrl||window.WEINBERGERS_RUNTIME?.ownerApiBaseUrl||window.WEINBERGERS_RUNTIME?.apiBaseUrl||'').replace(/\/$/,'');if(!root)return;
 const main=document.querySelector('main');if(!main)return;
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;};
 async function refresh(){try{const response=await fetch(root+'/menu',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});if(!response.ok)return;const menu=await response.json();if(!Array.isArray(menu.items))return;const fragment=document.createDocumentFragment();const nav=node('nav',null,'categories');nav.id='categories';nav.setAttribute('aria-label','Menu categories');const categories=[...new Set(menu.items.map(i=>i.category))];
  for(const [index,category]of categories.entries()){const id='category-'+index,link=node('a',category);link.href='#'+id;nav.append(link);const section=node('section',null,'menu-category');section.id=id;const items=menu.items.filter(i=>i.category===category);const header=node('div',null,'category-heading');const back=node('a','All categories ↑');back.href='#categories';header.append(node('p',items.length+' items'),node('h2',category),back);section.append(header);const grid=node('div',null,'menu-grid');for(const item of items){const article=node('article',null,'menu-item');const heading=node('div',null,'item-heading'),title=node('h3'),itemLink=node('a',item.name);itemLink.href='menu.html?item='+encodeURIComponent(item.id);title.append(itemLink);heading.append(title,node('strong',item.base_price_cents==null?'Price to confirm':'$'+(item.base_price_cents/100).toFixed(2)));article.append(heading);if(item.description)article.append(node('p',item.description));if(item.sold_out)article.append(node('strong','Currently sold out'));const choose=node('a','See choices ↗','customize');choose.href='menu.html?item='+encodeURIComponent(item.id);article.append(choose);grid.append(article);}section.append(grid);fragment.append(section);}
  main.querySelectorAll('.menu-category,nav.categories').forEach(el=>el.remove());main.append(nav,fragment);
 }catch{/* Keep the last readable menu on a temporary network error. */}}
 refresh();window.addEventListener('focus',refresh);
})();
