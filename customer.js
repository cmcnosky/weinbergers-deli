'use strict';
const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])), money=c=>'$'+(c/100).toFixed(2), read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
let items=[],settings={accepting_orders:true,prep_minutes:20},category='All',query='',savedOnly=false,cart=read('wd-platform-bag',[]),favorites=new Set(read('wd-platform-favorites',[])),history=read('wd-platform-history',[]),quote=null,checkoutKey=null,activeProduct=null,activeQuantity=1,editIndex=null,toastTimer,lastFocus,trackedOrder=null,trackedOrderSignature='',menuSignature='';
const discoveryParams=new URLSearchParams(location.search);
let discoveryFilters={include:discoveryParams.get('include')||'',exclude:discoveryParams.get('exclude')||'',max:discoveryParams.get('max')||''},sortMode='menu',compared=(discoveryParams.get('compare')?discoveryParams.get('compare').split(','):read('wd-comparison',[]));
query=discoveryParams.get('q')||'';category=discoveryParams.get('category')||'All';
let initialComparison=discoveryParams.has('compare');
const item=id=>items.find(p=>p.id===id);const dialog=$('#dialog');if(new URLSearchParams(location.search).has('embedded'))document.body.classList.add('embedded');
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('visible');const feedback=$('#dialog-feedback');if(dialog.open&&feedback){feedback.textContent=s;feedback.hidden=false}clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500)}
function replaceDialog(html){const active=document.activeElement,activeId=active?.id,activeAction=active?.dataset?.action;$('#dialog-content').innerHTML=html;const feedback=document.createElement('p');feedback.id='dialog-feedback';feedback.className='info-line';feedback.setAttribute('role','alert');feedback.hidden=true;const modalHead=dialog.querySelector('.modal-head');modalHead?.insertAdjacentElement('afterend',feedback);const target=(activeId&&dialog.querySelector('#'+activeId))||(activeAction&&dialog.querySelector(`[data-action="${activeAction}"]`))||dialog.querySelector('[data-action="close"],button,input');target?.focus({preventScroll:true})}
function open(html,view){const wasOpen=dialog.open;if(!wasOpen)lastFocus=document.activeElement;replaceDialog(html);dialog.dataset.view=view;if(!wasOpen)dialog.showModal();dialog.querySelector('button,input')?.focus({preventScroll:true})}function close(){dialog.close();trackedOrder=null;trackedOrderSignature='';lastFocus?.focus?.({preventScroll:true})}
const head=title=>`<div class="modal-head"><h2 id="dialog-title">${title}</h2><button class="close" data-action="close" aria-label="Close dialog">×</button></div>`;
function goMenu(){close();$('#menu').scrollIntoView({behavior:'smooth'});}
function unit(line){const p=item(line.menu_item_id);return(p?.base_price_cents||0)+(line.option_ids||[]).reduce((sum,id)=>sum+((p?.option_groups||[]).flatMap(g=>g.options).find(o=>o.id===id)?.price_delta_cents||0),0)}
function bagSave(){save('wd-platform-bag',cart);renderBag()}
function renderMenu(){
 const filtersList=['All','Popular',...new Set(items.map(p=>p.category))];
 const categoryMatches=(p,c)=>c==='All'||(c==='Popular'?p.popular:p.category===c);
 $('#categories').innerHTML=filtersList.map(c=>`<button class="chip ${category===c&&!savedOnly?'active':''}" data-category="${esc(c)}" aria-pressed="${category===c&&!savedOnly}">${c==='All'?'All items':c==='Popular'?'Popular':esc(c)}<span>${items.filter(p=>categoryMatches(p,c)).length}</span></button>`).join('');
 let visible=items.filter(p=>(!savedOnly||favorites.has(p.id))&&categoryMatches(p,category));
 if(query)visible=visible.filter(p=>DeliDiscovery.normalize(p.name+' '+p.category+' '+p.description).includes(DeliDiscovery.normalize(query)));
 visible=DeliDiscovery.sort(visible.filter(p=>DeliDiscovery.matches(p,discoveryFilters)),sortMode,query);
 $('#section-title').textContent=savedOnly?'SAVED ITEMS':'FIND YOUR SANDWICH';
 $('#catalogue-count').textContent=`${items.length} ITEMS / ${new Set(items.map(p=>p.category)).size} CATEGORIES`;
 $('#category-label').textContent=category==='All'?'All items':category==='Popular'?'Popular':category;
 $('#result-count').textContent=`${visible.length} ${visible.length===1?'ITEM':'ITEMS'}`+(query?` / “${query}”`:savedOnly?' / SAVED':` / ${category==='All'?'ALL ITEMS':category.toUpperCase()}`);
 $('#clear-search').hidden=!query;
 const active=[];
 if(discoveryFilters.include)active.push('Includes '+discoveryFilters.include);
 if(discoveryFilters.exclude)active.push('Excludes '+discoveryFilters.exclude);
 if(discoveryFilters.max)active.push('Starting price '+money(+discoveryFilters.max)+' or less');
 $('#active-filters').hidden=!active.length;
 $('#active-filters').innerHTML=active.map(t=>`<span>${esc(t)}</span>`).join('')+`<button data-action="clear-filters">Clear ×</button>`;
 $('#filter-summary').textContent=active.length?active.length+' active':'Narrow the menu +';
 document.querySelectorAll('[data-ingredient]').forEach(b=>b.setAttribute('aria-pressed',discoveryFilters.include===b.dataset.ingredient));
 $('#products').innerHTML=visible.length?visible.map(p=>`<article class="product ${p.sold_out?'sold-out':''} ${p.image?'':'text-product'}"><button class="product-main" data-product="${p.id}" aria-label="Customize ${esc(p.name)}, ${esc(p.price_label)}${p.sold_out?', sold out':''}">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`:''}<div class="product-copy"><span class="product-index">${esc(p.category.toUpperCase())}</span><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p>${p.sold_out||p.popular?`<span class="tag">${p.sold_out?'SOLD OUT':'POPULAR ITEM'}</span>`:''}</div><span class="price">${esc(p.price_label)}<b aria-hidden="true">+</b></span></button><div class="product-tools"><button class="compare-toggle" data-compare="${p.id}" aria-pressed="${compared.includes(p.id)}" aria-label="${compared.includes(p.id)?'Remove from comparison':'Compare'} ${esc(p.name)}"><span aria-hidden="true">${compared.includes(p.id)?'✓':'+'}</span> ${compared.includes(p.id)?'Added to comparison':'Compare'}</button><button class="save-item" data-favorite="${p.id}" aria-pressed="${favorites.has(p.id)}" aria-label="${favorites.has(p.id)?'Unsave':'Save'} ${esc(p.name)}">${favorites.has(p.id)?'♥ Saved':'♡ Save'}</button></div></article>`).join(''):`<div class="empty-state"><h3>${savedOnly?'NO SAVED MATCHES':'NO MATCHES'}</h3><p>${savedOnly?'Save an item from the menu, or clear your filters.':'Try a broader ingredient or a higher price limit.'}</p><button class="secondary" data-action="reset-menu">Show the full menu</button></div>`;
 renderComparisonTray();
 syncDiscoveryURL();
}

function optionNames(line){
 const options=(item(line.menu_item_id)?.option_groups||[]).flatMap(g=>g.options),counts=new Map();
 (line.option_ids||[]).forEach(id=>counts.set(id,(counts.get(id)||0)+1));
 return [...counts].map(([id,n])=>{const o=options.find(x=>x.id===id);return o?(n>1?n+' × ':'')+o.name:''}).filter(Boolean).join(', ');
}

function lineNeedsReview(line){const p=item(line.menu_item_id);if(!p||p.sold_out)return true;try{Deli.validateOptions(p,line.option_ids||[]);return false}catch{return true}}
function bagHTML(){const n=cart.reduce((s,l)=>s+l.quantity,0),subtotal=cart.reduce((s,l)=>s+unit(l)*l.quantity,0),unavailable=cart.some(lineNeedsReview);return `<div class="bag-top"><h2>YOUR ORDER</h2><span>${n} ${n===1?'item':'items'}</span></div>${!n?`<div class="empty-bag"><span class="bag-art" aria-hidden="true">—</span><strong>YOUR ORDER IS EMPTY</strong><p>Choose an item from the menu to get started.</p></div>`:cart.map((l,i)=>`<div class="cart-row"><div class="row-title"><span>${esc(item(l.menu_item_id)?.name||'Unavailable item')}${lineNeedsReview(l)?'<small> · Review choices</small>':''}</span><span>${money(unit(l)*l.quantity)}</span></div>${optionNames(l)?`<p>${esc(optionNames(l))}</p>`:''}${l.note?`<p>${esc(l.note)}</p>`:''}<div class="cart-tools"><div class="quantity"><button data-qty="${i}" data-delta="-1" aria-label="Decrease ${esc(item(l.menu_item_id)?.name)} quantity">−</button><span>${l.quantity}</span><button data-qty="${i}" data-delta="1" ${l.quantity>=20?'disabled':''} aria-label="Increase ${esc(item(l.menu_item_id)?.name)} quantity">+</button></div><div class="cart-edit-actions">${item(l.menu_item_id)?`<button data-edit="${i}">Edit</button>`:''}<button data-remove="${i}">Remove</button></div></div></div>`).join('')+`<div class="money-row"><span>Subtotal</span><strong>${money(subtotal)}</strong></div><p class="fine">${unavailable?'An item or choice changed. Edit or remove the affected items before continuing.':'Tax is shown before you confirm.'}</p><button class="primary full" data-action="checkout" ${!settings.accepting_orders||unavailable?'disabled':''}>${unavailable?'Review item choices':'Review your order ↗'}</button>`}<div class="bag-meta">Pickup · 601 S Main Street</div>`;}
function renderBag(){const before=cart.length;cart=cart.filter(l=>Number.isInteger(l.quantity)&&l.quantity>0&&l.quantity<=20);if(cart.length!==before)save('wd-platform-bag',cart);$('#bag-panel').innerHTML=bagHTML();const n=cart.reduce((s,l)=>s+l.quantity,0);$('#bag-count').textContent=n;$('#bag-button').setAttribute('aria-label','Open bag, '+n+(n===1?' item':' items'));$('#mobile-bag').hidden=!n;$('#mobile-bag span').textContent=n+(n===1?' item · ':' items · ')+money(cart.reduce((s,l)=>s+unit(l)*l.quantity,0));if(dialog.open&&dialog.dataset.view==='bag')replaceDialog(`<div class="modal-pad">${head('Your order')}${bagHTML()}</div>`);}
function openBag(){open(`<div class="modal-pad">${head('Your order')}${bagHTML()}</div>`,'bag')}
function openProduct(id,index=null){
 const p=item(id);if(!p)return;activeProduct=p;editIndex=index;
 const existing=index===null?null:cart[index];activeQuantity=existing?.quantity||1;
 const selected=existing?.option_ids||p.option_groups.flatMap(g=>g.preselected_option_ids||[]);
 const groups=(p.option_groups||[]).map(g=>`<fieldset class="option-group" data-group="${g.id}"><legend>${esc(g.name)} <span>${g.selection_min?'Required':'Optional'}${g.selection_max?' · '+(g.selection_min===g.selection_max?'choose '+g.selection_max:'up to '+g.selection_max):''}</span></legend>${g.options.map(o=>{
 const n=selected.filter(id=>id===o.id).length;
 return g.display_type==='quantity-select'?`<div class="option-quantity-row"><label for="option-${o.id}">${esc(o.name)} <small>${o.price_delta_cents?'+'+money(o.price_delta_cents):'Included'}</small></label><input class="modifier-count" id="option-${o.id}" data-option="${o.id}" aria-label="${esc(o.name)} quantity" type="number" inputmode="numeric" min="0" max="${o.selection_max??99}" value="${n}"></div>`:`<label class="option-label"><input class="option-choice" type="${g.selection_min>0&&(g.display_type==='single-select'||g.selection_max===1)?'radio':'checkbox'}" name="${esc(g.id)}" value="${esc(o.id)}" ${n?'checked':''}><span>${esc(o.name)}</span><small>${o.price_delta_cents?'+'+money(o.price_delta_cents):''}</small></label>`;
 }).join('')}</fieldset>`).join('');
 open(`${p.image?`<img class="detail-image" src="${esc(p.image)}" alt="${esc(p.name)}">`:''}<div class="modal-pad">${head(esc(p.name))}<div class="detail-meta"><span>${esc(p.category)}</span><strong>${esc(p.price_label)}</strong></div><p class="detail-copy">${esc(p.description)}</p>${groups}<label class="field" for="special-note">Special request <span class="fine">Optional</span></label><textarea id="special-note" maxlength="180" placeholder="For example, sauce on the side">${esc(existing?.note||'')}</textarea><p class="fine" style="margin-top:8px">Requests may need confirmation. For allergies, speak with the deli before ordering.</p><div class="selection-review"><strong>Your choices</strong><p id="selection-summary"></p></div></div><div class="modal-bottom"><div class="quantity"><button data-action="minus" aria-label="Decrease quantity">−</button><span id="item-quantity">${activeQuantity}</span><button data-action="plus" aria-label="Increase quantity">+</button></div><button class="primary" data-action="add" ${p.sold_out?'disabled':''}><span id="item-submit-label">${p.sold_out?'Sold out':index===null?'Add to order':'Save changes'}</span> <span id="item-total"></span></button></div>`,'product');updateProductPrice();
}

function updateProductPrice(){
 if(!activeProduct||dialog.dataset.view!=='product')return;
 const ids=selectedOptionIDs();
 $('#item-quantity').textContent=activeQuantity;
 $('#item-total').textContent=money(unit({menu_item_id:activeProduct.id,option_ids:ids})*activeQuantity);
 const missing=(activeProduct.option_groups||[]).filter(g=>ids.filter(id=>g.options.some(o=>o.id===id)).length<(g.selection_min||0));
 const chosen=optionNames({menu_item_id:activeProduct.id,option_ids:ids});
 $('#selection-summary').textContent=(chosen||(!missing.length?'As listed on the menu.':''))+(missing.length?' Still needed: '+missing.map(g=>g.name).join(', ')+'.':'');
 const submit=dialog.querySelector('[data-action="add"]');
 submit.disabled=activeProduct.sold_out||missing.length>0;
 $('#item-submit-label').textContent=activeProduct.sold_out?'Sold out':missing.length?'Choose '+missing[0].name:editIndex===null?'Add to order':'Save changes';
 for(const g of activeProduct.option_groups||[]){
  const count=ids.filter(id=>g.options.some(o=>o.id===id)).length;
  if(g.selection_max>1)dialog.querySelectorAll(`[data-group="${g.id}"] .option-choice`).forEach(input=>{input.disabled=!input.checked&&count>=g.selection_max});
 }

 dialog.querySelector('[data-action="minus"]').disabled=activeQuantity===1;
 dialog.querySelector('[data-action="plus"]').disabled=activeQuantity===20;
}

function addProduct(){
 const ids=selectedOptionIDs();
 for(const g of activeProduct.option_groups||[]){
  const n=ids.filter(id=>g.options.some(o=>o.id===id)).length;
  if(n<(g.selection_min||0)||(g.selection_max!==null&&g.selection_max!==undefined&&n>g.selection_max)){
   toast('Please review '+g.name.toLowerCase()+'.');dialog.querySelector(`[data-group="${g.id}"] input`)?.focus();return;
  }
  for(const o of g.options){const count=ids.filter(id=>id===o.id).length;if(o.selection_max!=null&&count>o.selection_max){toast('Please review '+o.name.toLowerCase()+' quantity.');return}}
 }
 const line={menu_item_id:activeProduct.id,quantity:activeQuantity,option_ids:ids,note:$('#special-note').value.trim()};
 if(editIndex===null)cart.push(line);else cart[editIndex]=line;
 bagSave();close();toast(editIndex===null?'Added to your order.':'Your order is updated.');
}

async function checkout(){if(!cart.length)return;open(`<div class="modal-pad">${head('Review your order')}<p>Checking your order…</p></div>`,'checkout');try{quote=await Deli.request('/quotes','POST',{fulfillment:'pickup',items:cart});checkoutKey=Deli.uid('checkout_');replaceDialog(`<div class="modal-pad">${head('Review your order')}<p class="fine">Pickup at 601 S Main Street · About ${quote.prep_minutes} minutes</p><div class="checkout-lines">${quote.items.map(l=>`<p><span>${l.quantity} × ${esc(l.name)}<small>${esc([...(l.option_names||[]),l.note].filter(Boolean).join(' · '))}</small></span><strong>${money(l.line_cents)}</strong></p>`).join('')}</div><div class="money-row"><span>Subtotal</span><span>${money(quote.subtotal_cents)}</span></div><div class="money-row"><span>Estimated sales tax</span><span>${money(quote.tax_cents)}</span></div><div class="money-row"><span>Service fee</span><span>$0.00</span></div><div class="money-row total"><span>Total</span><span>${money(quote.total_cents)}</span></div><button class="primary full" data-action="place-demo">Place order · ${money(quote.total_cents)}</button></div>`);}catch(e){replaceDialog(`<div class="modal-pad">${head('Update your order')}<p>${esc(e.message)}</p><button class="primary full" style="margin-top:20px" data-action="bag">Back to your bag</button></div>`);await refresh()}}
async function placeDemo(button){button.disabled=true;button.textContent='Placing your order…';try{const r=await Deli.request('/orders','POST',{quote_id:quote.quote_id,idempotency_key:checkoutKey,pickup_name:'Guest'});const o=r.order;history.unshift({id:o.id,token:r.lookup_token,lines:structuredClone(cart),time:new Date().toISOString(),total:o.total_cents});history=history.slice(0,20);save('wd-platform-history',history);cart=[];bagSave();await showOrder(history[0]);}catch(e){button.disabled=false;if(['quote_expired','item_sold_out','ordering_paused','quote_already_used'].includes(e.code)){button.dataset.action='bag';button.textContent='Review updated bag';await refresh()}else button.textContent='Retry order';toast(e.message)}}
async function showOrder(h){if(!h)return;trackedOrder=h;try{const r=await Deli.request('/orders/'+h.id+'?token='+encodeURIComponent(h.token));const o=r.order||r,signature=JSON.stringify([o.status,o.updated_at,o.refunded_cents,o.timeline]);if(dialog.open&&dialog.dataset.view==='status'&&signature===trackedOrderSignature){trackedOrder=h;return}const states=['new','preparing','ready','completed'],names=['Order received','Preparing your order','Ready for pickup','Picked up'],idx=states.indexOf(o.status);const html=`<div class="modal-pad">${head(o.status==='cancelled'?'Order cancelled.':o.status==='ready'?'Your order is ready.':o.status==='completed'?'Pickup complete.':'Order received')}<div class="success-circle" aria-hidden="true">✓</div><p><strong>${esc(o.id)}</strong> · Guest</p><p class="fine">${money(o.total_cents)} · Main Street pickup</p>${o.status==='cancelled'?'<p class="info-line">This order was cancelled.</p>':`<ol class="step-list">${states.map((s,i)=>`<li class="${i<idx?'done':i===idx?'current':''}">${names[i]}<small>${i===idx?'Current kitchen status':i<idx?'Complete':'Waiting'}</small></li>`).join('')}</ol>`}<button class="primary full" data-action="refresh-order">Refresh status</button><button class="text-link full" data-action="close" style="margin-top:10px">Back to the menu</button></div>`;if(dialog.open&&dialog.dataset.view==='status')replaceDialog(html);else open(html,'status');trackedOrder=h;trackedOrderSignature=signature;}catch(e){toast(e.message)}}
function orders(){open(`<div class="modal-pad">${head('Your orders.')}<p class="fine">Your past orders. Prices and availability are checked when you reorder.</p>${history.length?history.map((h,i)=>`<div class="order-history"><header><span>${esc(h.id)}</span><span>${money(h.total)}</span></header><p>${h.lines.reduce((s,l)=>s+l.quantity,0)} items · ${new Date(h.time).toLocaleDateString()}</p><div class="actions"><button class="secondary" data-status="${i}">View status</button><button class="secondary" data-reorder="${i}">Order again ↗</button></div></div>`).join(''):'<div class="empty-state"><h3>No past orders</h3><p>Your orders will appear here.</p><button class="primary" data-action="browse">Browse menu</button></div>'}</div>`,'orders')}
function visit(){open(`<div class="modal-pad">${head('Location and contact')}<p class="eyebrow">WEINBERGER’S DELI</p><h3>601 S Main Street<br>Grapevine, TX 76051</h3><p class="detail-copy">Pickup at our Main Street location in Grapevine.</p><div class="visit-actions"><a class="primary" href="https://www.google.com/maps/search/?api=1&query=Weinbergers+Deli+601+S+Main+St+Grapevine+TX" target="_blank" rel="noopener">Directions ↗</a><a class="secondary" href="tel:+18176705729">Call the deli</a></div><p class="fine">Check current opening hours and allergy questions directly with the deli.</p><a class="text-link" href="https://weinbergersdeli.com/" target="_blank" rel="noopener">Official website ↗</a></div>`,'visit')}
function choose(){
 $('#filter-panel').open=true;
 $('#filter-panel').scrollIntoView({behavior:'smooth',block:'center'});
 $('#include-ingredients').focus({preventScroll:true});
}

function selectedOptionIDs(){
 const ids=[...dialog.querySelectorAll('.option-choice:checked')].map(n=>n.value);
 dialog.querySelectorAll('.modifier-count').forEach(n=>{const qty=Math.max(0,Math.min(99,Number.parseInt(n.value,10)||0));for(let i=0;i<qty;i++)ids.push(n.dataset.option)});
 return ids;
}

function clearDiscovery(){
 discoveryFilters={include:'',exclude:'',max:''};
 $('#include-ingredients').value='';$('#exclude-ingredients').value='';$('#max-price').value='';
 renderMenu();
}

function syncDiscoveryURL(){
 const params=new URLSearchParams(location.search);
 for(const [key,value] of Object.entries({q:query,include:discoveryFilters.include,exclude:discoveryFilters.exclude,max:discoveryFilters.max,category:category==='All'?'':category,compare:compared.join(',')}))value?params.set(key,value):params.delete(key);
 const suffix=params.toString();window.history.replaceState(null,'',location.pathname+(suffix?'?'+suffix:'')+location.hash);
}

function renderComparisonTray(){
 compared=[...new Set((Array.isArray(compared)?compared:[]).filter(id=>item(id)))].slice(0,3);save('wd-comparison',compared);
 document.querySelectorAll('.compare-count').forEach(el=>el.textContent=compared.length);
 $('#compare-tray').hidden=!compared.length;
 $('#compare-names').innerHTML=compared.map(id=>`<button data-compare="${id}" aria-label="Remove ${esc(item(id).name)} from comparison">${esc(item(id).name)} ×</button>`).join('');
 document.body.classList.toggle('has-comparison',!!compared.length);
}

function toggleComparison(id){
 if(compared.includes(id))compared=compared.filter(x=>x!==id);
 else {if(compared.length===3)return toast('Compare up to three items. Remove one to add another.');compared.push(id)}
 renderMenu();
 if(dialog.open&&dialog.dataset.view==='compare')showComparison();
}

function showComparison(){
 const chosen=compared.map(item).filter(Boolean);
 if(!chosen.length)return open(`<div class="modal-pad">${head('Compare sandwiches')}<p class="detail-copy">Choose up to three items from the menu. Compare their ingredients, starting prices, and available choices in one place.</p><button class="primary full" data-action="browse">Choose from the menu</button></div>`,'compare');
 const cells=chosen.map(p=>`<section class="comparison-card"><div class="comparison-image">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}">`:''}<button data-compare="${p.id}" aria-label="Remove ${esc(p.name)} from comparison">×</button></div><p class="eyebrow">${esc(p.category)}</p><h3>${esc(p.name)}</h3><p class="comparison-price">${esc(p.price_label)}${p.variable_price?'<small>Starting price</small>':''}</p><div class="comparison-description"><h4>Ingredients & bread</h4><p>${esc(p.description)||'No description listed. Ask the deli for details.'}</p></div><button class="primary full" data-product="${p.id}">Choose ${esc(p.short_name||p.name)} ↗</button></section>`).join('');
 open(`<div class="modal-pad">${head('Compare your choices')}<p class="comparison-intro">Keep the ingredients and prices side by side. Choose an item to set its options.</p><div class="comparison-grid" style="--compare-columns:${chosen.length}">${cells}</div><div class="comparison-footer"><button class="text-link" data-action="browse">Back to the menu</button><button class="secondary" data-action="share-comparison">Copy comparison link ↗</button></div><p class="fine">Prices marked + vary with options. Menu descriptions may not list every ingredient. For allergies, speak with the deli.</p></div>`,'compare');
}

function showCategories(){
 const categories=['All','Popular',...new Set(items.map(p=>p.category))];
 open(`<div class="modal-pad">${head('Menu categories')}<div class="category-grid">${categories.map(c=>`<button class="secondary" data-category="${esc(c)}">${esc(c==='All'?'All items':c==='Popular'?'Popular':c)}</button>`).join('')}</div></div>`,'categories');
}

async function refresh(){try{const r=await Deli.request('/menu'),signature=JSON.stringify([r.items,r.ordering]);if(signature===menuSignature)return;menuSignature=signature;items=r.items;settings=r.ordering;$('#prep-label').textContent=settings.accepting_orders?'About '+settings.prep_minutes+' minutes':'Orders paused';$('#ordering-alert').hidden=settings.accepting_orders;$('#ordering-alert').textContent='Ordering is paused. Your items are saved.';renderMenu();renderBag();if(initialComparison){initialComparison=false;showComparison()}}catch(e){toast(e.message)}}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.compare)return toggleComparison(b.dataset.compare);if(b.dataset.ingredient){discoveryFilters.include=b.dataset.ingredient;$('#include-ingredients').value=discoveryFilters.include;category='All';savedOnly=false;query='';$('#search').value='';renderMenu();return goMenu()}if(b.dataset.product)return openProduct(b.dataset.product);if(b.dataset.favorite){const id=b.dataset.favorite;favorites.has(id)?favorites.delete(id):favorites.add(id);save('wd-platform-favorites',[...favorites]);renderMenu();return toast(favorites.has(id)?'Saved for next time.':'Removed from saved.')}if(b.dataset.category){category=b.dataset.category;savedOnly=false;renderMenu();if(dialog.open&&dialog.dataset.view==='categories')goMenu();return}if(b.dataset.choice){category=b.dataset.choice;savedOnly=false;query='';$('#search').value='';renderMenu();return goMenu()}if(b.dataset.remove!==undefined){cart.splice(+b.dataset.remove,1);return bagSave()}if(b.dataset.qty!==undefined){cart[+b.dataset.qty].quantity+=+b.dataset.delta;cart=cart.filter(l=>l.quantity>0);return bagSave()}if(b.dataset.edit!==undefined)return openProduct(cart[+b.dataset.edit].menu_item_id,+b.dataset.edit);if(b.dataset.status!==undefined)return showOrder(history[+b.dataset.status]);if(b.dataset.reorder!==undefined){cart=structuredClone(history[+b.dataset.reorder].lines);bagSave();openBag();return toast('Review your bag. Availability will be checked at checkout.')}if(b.dataset.view){document.querySelectorAll('.bottom-nav button').forEach(x=>x.classList.toggle('selected',x.dataset.view===b.dataset.view));if(b.dataset.view==='visit')return visit();if(b.dataset.view==='orders')return orders();savedOnly=b.dataset.view==='saved';category='All';query='';$('#search').value='';renderMenu();return goMenu()}switch(b.dataset.action){case'compare':return showComparison();case'clear-compare':compared=[];renderMenu();return;case'clear-filters':return clearDiscovery();case'reset-menu':category='All';query='';savedOnly=false;$('#search').value='';return clearDiscovery();case'categories':return showCategories();case'share-comparison':navigator.clipboard.writeText(location.href).then(()=>toast('Comparison link copied.')).catch(()=>toast('Copy the address from your browser to share this comparison.'));return;case'close':return close();case'bag':return openBag();case'browse':return goMenu();case'plus':activeQuantity=Math.min(20,activeQuantity+1);return updateProductPrice();case'minus':activeQuantity=Math.max(1,activeQuantity-1);return updateProductPrice();case'add':return addProduct();case'checkout':return checkout();case'place-demo':return placeDemo(b);case'refresh-order':return showOrder(trackedOrder)}});
$('#include-ingredients').value=discoveryFilters.include;$('#exclude-ingredients').value=discoveryFilters.exclude;$('#max-price').value=discoveryFilters.max;$('#search').value=query;
for(const [selector,key] of [['#include-ingredients','include'],['#exclude-ingredients','exclude'],['#max-price','max']])$(selector).addEventListener('input',e=>{discoveryFilters[key]=e.target.value.trim();renderMenu()});
$('#sort-menu').addEventListener('change',e=>{sortMode=e.target.value;renderMenu()});
dialog.addEventListener('input',e=>{if(e.target.classList.contains('modifier-count'))updateProductPrice()});
$('#search').addEventListener('input',e=>{query=e.target.value.trim();renderMenu()});$('#clear-search').onclick=()=>{query='';$('#search').value='';renderMenu();$('#search').focus()};$('#bag-button').onclick=openBag;$('#mobile-bag').onclick=openBag;$('#start-order').onclick=goMenu;$('#help-choose').onclick=choose;dialog.addEventListener('change',e=>{if(e.target.classList.contains('option-choice')&&e.target.checked){const group=activeProduct?.option_groups.find(g=>g.id===e.target.name);if(group?.selection_max===1)dialog.querySelectorAll(`[name="${group.id}"]`).forEach(other=>{if(other!==e.target)other.checked=false})}updateProductPrice()});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}});window.addEventListener('storage',e=>{if(e.key==='wd-platform-favorites'){favorites=new Set(read('wd-platform-favorites',[]));renderMenu()}if(e.key==='wd-platform-bag'){cart=read('wd-platform-bag',[]);renderBag()}if(e.key==='wd-platform-history')history=read('wd-platform-history',[]);refresh()});window.addEventListener('focus',refresh);Deli.init().then(refresh);setInterval(()=>{if(!document.hidden){if(dialog.open&&dialog.dataset.view==='status'&&trackedOrder)showOrder(trackedOrder);else refresh()}},12000);
