'use strict';
const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])), money=c=>'$'+(c/100).toFixed(2), read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},save=(k,v)=>{try{const encoded=JSON.stringify(v);localStorage.setItem(k,encoded);return localStorage.getItem(k)===encoded}catch{return false}};
const recoveryRetentionMs=90*24*60*60*1000,recoveryCutoff=()=>Date.now()-recoveryRetentionMs,recordTime=value=>{const time=new Date(value?.updated_at||value?.time||value?.created_at||0).valueOf();return Number.isFinite(time)?time:0};
function retainedHistory(entries){const seen=new Set();return (Array.isArray(entries)?entries:[]).filter(entry=>{if(!entry||typeof entry!=='object'||typeof entry.id!=='string'||seen.has(entry.id))return false;seen.add(entry.id);return true}).map(entry=>{if(recordTime(entry)>=recoveryCutoff())return entry;const {token,pickup_name,checkout_url,checkout_expires_at,cart_fingerprint,...retained}=entry;return retained}).slice(0,50)}
const storedFavorites=read('wd-platform-favorites',[]);
let items=[],settings={accepting_orders:false,checkout_enabled:false,prep_minutes:20},category='All',query='',savedOnly=false,cart=read('wd-platform-bag',[]),favorites=new Set(Array.isArray(storedFavorites)?storedFavorites:[]),usuals=window.DeliUsuals?.load?.()||[],groupContext=read('wd-group-context-v1',null),history=read('wd-connected-orders-v1',[]),pending=read('wd-pending-checkout-v1',null),checkoutAttempt=read('wd-checkout-attempt-v1',null),quote=null,checkoutKey=null,selectedPickupAt=undefined,activeProduct=null,activeQuantity=1,editIndex=null,toastTimer,lastFocus,trackedOrder=null,trackedOrderSignature='',statusRequestGeneration=0,statusInFlight=null,viewRequestGeneration=0,menuSignature='',removedLine=null;
if(!Array.isArray(cart))cart=[];history=retainedHistory(history);save('wd-connected-orders-v1',history);if(!pending||typeof pending!=='object'||recordTime(pending)<recoveryCutoff()){pending=null;save('wd-pending-checkout-v1',null)}if(!checkoutAttempt||typeof checkoutAttempt!=='object'||recordTime(checkoutAttempt)<recoveryCutoff()){checkoutAttempt=null;save('wd-checkout-attempt-v1',null)}
const menuImage=(path,size=320)=>window.DELI_MEDIA?.[path]?.[String(size)]||path;
const officialOrderURL='https://weinbergersdeli.com/menu';
const discoveryParams=new URLSearchParams(location.search),initialState=DeliDiscovery.readURLState(location.search),checkoutReturnRequested=['checkout','payment','session_id'].some(key=>discoveryParams.has(key)),specificOrderRequested=discoveryParams.has('order'),requestedOrderValue=discoveryParams.get('order')||'',requestedOrderID=/^WD-[0-9A-F]{20}$/.test(requestedOrderValue)?requestedOrderValue:'';
if(specificOrderRequested){discoveryParams.delete('order');const remaining=discoveryParams.toString();window.history.replaceState(null,'',location.pathname+(remaining?'?'+remaining:'')+location.hash)}
let discoveryFilters={include:initialState.include,exclude:initialState.exclude,max:initialState.max},sortMode=initialState.sort,compared=(discoveryParams.has('compare')?initialState.compare:read('wd-comparison',[])),urlItem=initialState.item;
query=initialState.q;category=initialState.category;savedOnly=initialState.saved;
let initialComparison=discoveryParams.has('compare'),initialItem=urlItem;
const item=id=>items.find(p=>p.id===id);const dialog=$('#dialog');if(new URLSearchParams(location.search).has('embedded'))document.body.classList.add('embedded');
let searchMetricTimer,lastSearchMetric='',lastNoResultsState='';
function discoveryEvent(event){if(!Deli.connected)return;Deli.request('/events/discovery','POST',{event}).catch(()=>{})}
function queueSearchEvent(){clearTimeout(searchMetricTimer);const committed=query.trim();if(committed.length<2)return;searchMetricTimer=setTimeout(()=>{if(committed===query.trim()&&committed!==lastSearchMetric){lastSearchMetric=committed;discoveryEvent('search')}},700)}
function toast(s){const notice=$('#toast');notice.hidden=false;notice.textContent=s;notice.classList.add('visible');const feedback=$('#dialog-feedback');if(dialog.open&&feedback){feedback.textContent=s;feedback.hidden=false}clearTimeout(toastTimer);toastTimer=setTimeout(()=>notice.classList.remove('visible'),3500)}
function removalToast(name){
 const notice=$('#toast'),feedback=$('#dialog-feedback'),inDialog=dialog.open&&feedback;
 notice.classList.remove('visible');const host=inDialog?feedback:notice;host.textContent=`Removed ${name}. `;
 const undo=document.createElement('button');undo.type='button';undo.className='toast-action';undo.dataset.action='undo-remove';undo.textContent='Undo';host.append(undo);host.hidden=false;if(!inDialog)notice.classList.add('visible');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>{removedLine=null;if(host.isConnected){if(host===notice)notice.classList.remove('visible');else host.hidden=true}},6000);
}
function replaceDialog(html){const active=document.activeElement,activeId=active?.id,focusKeys=['action','qty','delta','edit','remove','compare','reorder','status'].filter(key=>active?.dataset?.[key]!==undefined),focusValues=Object.fromEntries(focusKeys.map(key=>[key,active.dataset[key]]));$('#dialog-content').innerHTML=html;const feedback=document.createElement('p');feedback.id='dialog-feedback';feedback.className='info-line';feedback.setAttribute('role','alert');feedback.hidden=true;const modalHead=dialog.querySelector('.modal-head');modalHead?.insertAdjacentElement('afterend',feedback);const target=[...dialog.querySelectorAll('button,input,select,textarea,a[href]')].find(node=>activeId?node.id===activeId:focusKeys.length&&focusKeys.every(key=>node.dataset?.[key]===focusValues[key]))||dialog.querySelector('[data-action="close"],button,input');target?.focus({preventScroll:true})}
function open(html,view){viewRequestGeneration++;if(view!=='product'&&urlItem){urlItem='';syncDiscoveryURL('replace')}if(view!=='status'&&trackedOrder){statusRequestGeneration++;trackedOrder=null;trackedOrderSignature=''}const wasOpen=dialog.open;if(!wasOpen)lastFocus=document.activeElement;replaceDialog(html);dialog.dataset.view=view;if(!wasOpen){dialog.showModal();dialog.querySelector('button,input')?.focus({preventScroll:true})}if(removedLine)removalToast(removedLine.name)}function close(fromHistory=false){const closesSharedItem=dialog.dataset?.view==='product'&&urlItem,rehomeUndo=removedLine;viewRequestGeneration++;statusRequestGeneration++;dialog.close();trackedOrder=null;trackedOrderSignature='';if(closesSharedItem&&!fromHistory){urlItem='';syncDiscoveryURL('replace')}if(rehomeUndo)removalToast(rehomeUndo.name);lastFocus?.focus?.({preventScroll:true})}
function cancelDialog(event){event.preventDefault();close()}
dialog.addEventListener('cancel',cancelDialog);
const head=title=>`<div class="modal-head"><h2 id="dialog-title">${title}</h2><button class="close" data-action="close" aria-label="Close dialog">×</button></div>`;
function goMenu(){close();$('#menu').scrollIntoView({behavior:'smooth'});}
function lineState(line){const p=item(line.menu_item_id);return p?Deli.selectionState(p,line.option_ids||[]):{pendingPrice:true,pendingAvailability:true,requiresConfirmation:true,unitCents:null,selected:[]}}
function unit(line){return lineState(line).unitCents}
function itemPriceLabel(p){return p?.base_price_cents==null||p?.price_status==='unknown'||p?.requires_price_approval===true?'PRICE TO CONFIRM':p?.price_label||money(p?.base_price_cents||0)}
function optionPriceLabel(option){if(option.price_delta_cents==null||option.price_status==='unknown'||option.requires_price_approval===true)return'Price to confirm';if(option.availability_status==='needs_confirmation'||option.requires_availability_approval===true||option.requires_confirmation===true)return'Availability to confirm';if(option.price_delta_cents>0)return'+'+money(option.price_delta_cents);if(option.action==='omit')return'No price change';if(option.action==='preparation'||option.action==='substitute')return'No charge';return''}
function lineTotalLabel(line){const value=unit(line);return value==null?'Price to confirm':money(value*line.quantity)}
function confirmationReason(state){if(state.pendingPrice&&state.pendingAvailability)return'Price and availability to confirm';if(state.pendingPrice)return'Price to confirm';if(state.pendingAvailability)return'Availability to confirm';return''}
function bagSave(){selectedPickupAt=undefined;save('wd-platform-bag',cart);renderBag()}
function removeCartLine(index){
 if(!Number.isInteger(index)||!cart[index])return;const [line]=cart.splice(index,1),name=item(line.menu_item_id)?.name||'item';
 removedLine={line:structuredClone(line),index,name};bagSave();removalToast(name);
}
function undoCartRemoval(){
 if(!removedLine)return;const restored=removedLine;removedLine=null;cart.splice(Math.min(restored.index,cart.length),0,restored.line);bagSave();toast(`Restored ${restored.name}.`);
}
function captureMenuFocus(){
 const active=document.activeElement,scope=active?.closest?.('#products,#categories,#compare-tray');if(!scope)return null;
 const keys=['product','favorite','compare','category','action'],values={};for(const key of keys)if(active.dataset?.[key]!==undefined)values[key]=active.dataset[key];
 const primary=Object.keys(values)[0],peers=primary?[...scope.querySelectorAll('button')].filter(button=>button.dataset[primary]!==undefined):[];
 return primary?{scope:scope.id,values,primary,position:Math.max(0,peers.indexOf(active))}:null;
}
function restoreMenuFocus(state){
 if(!state)return;const scope=document.getElementById(state.scope);if(!scope)return;
 const buttons=[...scope.querySelectorAll('button')],exact=buttons.find(button=>Object.entries(state.values).every(([key,value])=>button.dataset[key]===value)),peers=buttons.filter(button=>button.dataset[state.primary]!==undefined),target=exact||peers[Math.min(state.position,peers.length-1)];
 target?.focus({preventScroll:true});
}
function renderMenu(historyMode='replace'){
 const focusState=captureMenuFocus();
 const builder=item('custom-build-your-own'),shortcuts=document.querySelector('.quick-ingredients');
 if(builder&&shortcuts&&!shortcuts.querySelector('[data-product="custom-build-your-own"]'))shortcuts.insertAdjacentHTML('beforeend','<button class="build-own-shortcut" data-product="custom-build-your-own">Build your own ↗</button>');
 const filtersList=['All','Popular',...new Set(items.map(p=>p.category))];
 const categoryMatches=(p,c)=>c==='All'||(c==='Popular'?p.popular:p.category===c);
 $('#categories').innerHTML=filtersList.map(c=>`<button class="chip ${category===c&&!savedOnly?'active':''}" data-category="${esc(c)}" aria-pressed="${category===c&&!savedOnly}">${c==='All'?'All items':c==='Popular'?'Popular':esc(c)}<span>${items.filter(p=>categoryMatches(p,c)).length}</span></button>`).join('');
 let visible=items.filter(p=>(!savedOnly||favorites.has(p.id))&&categoryMatches(p,category));
 if(query)visible=visible.filter(p=>DeliDiscovery.queryMatches(p,query));
 visible=DeliDiscovery.sort(visible.filter(p=>DeliDiscovery.matches(p,discoveryFilters)),sortMode,query);
 const noResultsState=query&&visible.length===0?JSON.stringify([query,discoveryFilters,category,savedOnly]):'';
 if(noResultsState&&noResultsState!==lastNoResultsState){lastNoResultsState=noResultsState;discoveryEvent('search_no_results')}else if(!noResultsState)lastNoResultsState='';
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
 const productsMarkup=visible.length?visible.map(p=>`<article class="product ${p.sold_out?'sold-out':''} ${p.image?'':'text-product'} ${p.id==='custom-build-your-own'?'build-own-product':''}"><button class="product-main" data-product="${p.id}" aria-label="Customize ${esc(p.name)}, ${esc(itemPriceLabel(p))}${p.sold_out?', sold out':''}">${p.image?`<img src="${esc(menuImage(p.image))}" alt="" loading="lazy" decoding="async" width="320" height="320">`:''}<div class="product-copy"><span class="product-index">${esc(p.category.toUpperCase())}</span><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p>${p.sold_out||p.popular||p.id==='custom-build-your-own'?`<span class="tag">${p.sold_out?'SOLD OUT':p.id==='custom-build-your-own'?'EVERY BREAD, MEAT, CHEESE & TOPPING':'POPULAR ITEM'}</span>`:''}</div><span class="price">${esc(itemPriceLabel(p))}<b aria-hidden="true">+</b></span></button><div class="product-tools"><button class="compare-toggle" data-compare="${p.id}" aria-pressed="${compared.includes(p.id)}" aria-label="${compared.includes(p.id)?'Remove from comparison':'Compare'} ${esc(p.name)}"><span aria-hidden="true">${compared.includes(p.id)?'✓':'+'}</span> ${compared.includes(p.id)?'Added to comparison':'Compare'}</button><button class="save-item" data-favorite="${p.id}" aria-pressed="${favorites.has(p.id)}" aria-label="${favorites.has(p.id)?'Unsave':'Save'} ${esc(p.name)}">${favorites.has(p.id)?'♥ Saved':'♡ Save'}</button></div></article>`).join(''):`<div class="empty-state"><h3>${savedOnly?'NO SAVED MENU ITEMS':'NO MATCHES'}</h3><p>${savedOnly?'Save a menu item with the heart, or save a complete order as one of My Usuals.':'Try a broader ingredient or a higher price limit.'}</p><button class="secondary" data-action="reset-menu">Show the full menu</button></div>`;
 $('#products').innerHTML=(savedOnly?usualsMarkup():'')+productsMarkup;
 $('#products').setAttribute('aria-busy','false');
 renderComparisonTray();
 syncDiscoveryURL(historyMode);
 restoreMenuFocus(focusState);
}

function optionNames(line){
 const options=(item(line.menu_item_id)?.option_groups||[]).flatMap(g=>g.options),counts=new Map();
 (line.option_ids||[]).forEach(id=>counts.set(id,(counts.get(id)||0)+1));
 return [...counts].map(([id,n])=>{const o=options.find(x=>x.id===id);return o?(n>1?n+' × ':'')+o.name:''}).filter(Boolean).join(', ');
}

function lineNeedsReview(line){const p=item(line.menu_item_id);if(!p||p.sold_out)return true;try{Deli.validateOptions(p,line.option_ids||[]);return false}catch{return true}}
function usualStatus(entry){return window.DeliUsuals?.revalidate?.(entry,items,Deli.validateOptions)||{ok:false,reason:'Saved sandwiches are unavailable.'}}
function usualsMarkup(){
 if(!usuals.length)return`<section class="usuals-panel"><div class="usuals-heading"><div><p class="eyebrow">EXACTLY HOW YOU ORDER IT</p><h3>MY USUALS</h3></div></div><p class="fine">Customize a sandwich, add it to your bag, then choose “Save as usual.” Its bread, toasting, additions, removals, note, and quantity stay together.</p></section>`;
 return`<section class="usuals-panel"><div class="usuals-heading"><div><p class="eyebrow">EXACTLY HOW YOU ORDER IT</p><h3>MY USUALS</h3></div><span>${usuals.length}/${window.DeliUsuals.maximum}</span></div><div class="usuals-list">${usuals.map(entry=>{const status=usualStatus(entry),product=status.product||item(entry.line.menu_item_id),options=optionNames(entry.line);return`<article class="usual-card"><div><p class="eyebrow">${esc(product?.name||'Menu item')}</p><h4>${esc(entry.name)}</h4><p>${esc(options||'As listed')}${entry.line.note?` · ${esc(entry.line.note)}`:''}</p><small>${status.ok?'Current price and availability are checked again when added.':esc(status.reason)}</small></div><div class="usual-actions"><button class="secondary" data-usual-add="${esc(entry.id)}" ${status.ok?'':'disabled'}>Add to order</button><button class="text-link" data-usual-rename="${esc(entry.id)}">Rename</button><button class="text-link" data-usual-delete="${esc(entry.id)}">Delete</button></div></article>`}).join('')}</div></section>`;
}
function bagHTML(showHeading=true){
 const n=cart.reduce((s,l)=>s+l.quantity,0),states=cart.map(lineState),confirmationNeeded=states.some(state=>state.requiresConfirmation),pricePending=states.some(state=>state.pendingPrice),subtotal=pricePending?null:cart.reduce((s,l)=>s+(unit(l)||0)*l.quantity,0),unavailable=cart.some(lineNeedsReview);
 const hasPending=Boolean(pending?.id&&pending?.token),hasAttempt=Boolean(checkoutAttempt?.body),integrationReady=Deli.connected&&Deli.config.checkout_enabled===true,canCheckout=integrationReady&&settings.checkout_enabled===true&&settings.accepting_orders!==false&&settings.open_now!==false,paused=integrationReady&&!canCheckout;
 const action=hasPending?'pending-order':hasAttempt||integrationReady?'checkout':'official-order',label=hasPending?'Check pending order ↗':hasAttempt?'Continue secure checkout ↗':unavailable?'Review item choices':confirmationNeeded?'Confirmation needed before checkout':canCheckout?'Review your order ↗':paused?(settings.open_now===false?'Online pickup is closed':'Online ordering paused'):'Order through the current site ↗';
 const recoveryButton=hasPending?'<button class="primary full" data-action="pending-order">Check pending order ↗</button>':hasAttempt?'<button class="primary full" data-action="checkout">Continue secure checkout ↗</button>':'';
 return `<div class="bag-top">${showHeading?'<h2>YOUR ORDER</h2>':''}<span>${n} ${n===1?'item':'items'}</span></div>${!n?`<div class="empty-bag"><span class="bag-art" aria-hidden="true">—</span><strong>${hasPending?'ORDER STATUS PENDING':hasAttempt?'CHECKOUT SAVED':'YOUR ORDER IS EMPTY'}</strong><p>${hasPending?'Check payment and kitchen status before starting another order.':hasAttempt?'Continue the saved secure checkout request, or choose more items from the menu.':'Choose an item from the menu to get started.'}</p>${recoveryButton}</div>`:cart.map((l,i)=>{const state=lineState(l),reason=confirmationReason(state);return`<div class="cart-row"><div class="row-title"><span>${esc(item(l.menu_item_id)?.name||'Unavailable item')}${lineNeedsReview(l)?'<small> · Review choices</small>':reason?`<small class="confirmation-needed"> · ${esc(reason)}</small>`:''}</span><span>${lineTotalLabel(l)}</span></div>${optionNames(l)?`<p>${esc(optionNames(l))}</p>`:''}${l.note?`<p>${esc(l.note)}</p>`:''}<div class="cart-tools"><div class="quantity"><button data-qty="${i}" data-delta="-1" aria-label="Decrease ${esc(item(l.menu_item_id)?.name)} quantity">−</button><span>${l.quantity}</span><button data-qty="${i}" data-delta="1" ${l.quantity>=20?'disabled':''} aria-label="Increase ${esc(item(l.menu_item_id)?.name)} quantity">+</button></div><div class="cart-edit-actions">${item(l.menu_item_id)?`<button data-edit="${i}">Edit</button><button data-usual-save="${i}">Save as usual</button>`:''}<button data-remove="${i}">Remove</button></div></div></div>`}).join('')+`<div class="money-row"><span>${pricePending?'Order total':'Menu subtotal'}</span><strong>${pricePending?'Price to confirm':money(subtotal)}</strong></div><p class="fine">${hasPending?'Check the pending order before starting another checkout.':hasAttempt?'The saved secure checkout uses the total already shown.':unavailable?'An item or choice changed. Edit or remove the affected items before continuing.':confirmationNeeded?'Your custom choices are saved. The deli must confirm availability and price before this order can be charged.':canCheckout?'Tax and the final total are confirmed by the order service.':'Your bag is saved here. Final availability and pricing are confirmed before you place it.'}</p><button class="primary full" data-action="${action}" ${(unavailable||confirmationNeeded||paused)&&!hasAttempt&&!hasPending?'disabled':''}>${label}</button>`}<div class="bag-meta">Pickup · 601 S Main Street</div>`;
}
function renderBag(){const before=cart.length;cart=cart.filter(l=>l&&typeof l==='object'&&typeof l.menu_item_id==='string'&&Number.isInteger(l.quantity)&&l.quantity>0&&l.quantity<=20&&Array.isArray(l.option_ids||[]));if(cart.length!==before)save('wd-platform-bag',cart);$('#bag-panel').innerHTML=bagHTML();const n=cart.reduce((s,l)=>s+l.quantity,0),pricePending=cart.some(line=>lineState(line).pendingPrice),subtotal=pricePending?null:cart.reduce((s,l)=>s+(unit(l)||0)*l.quantity,0);$('#bag-count').textContent=n;$('#bag-button').setAttribute('aria-label','Open bag, '+n+(n===1?' item':' items'));$('#mobile-bag').hidden=!n;$('#mobile-bag span').textContent=n+(n===1?' item · ':' items · ')+(pricePending?'Price to confirm':money(subtotal));if(dialog.open&&dialog.dataset.view==='bag'){replaceDialog(`<div class="modal-pad">${head('Your order')}${bagHTML(false)}</div>`);if(removedLine)removalToast(removedLine.name)}}
function openBag(){open(`<div class="modal-pad">${head('Your order')}${bagHTML(false)}</div>`,'bag')}

function requirementLabel(group){
 const min=group.selection_min||0,max=group.selection_max;
 if(min&&max===min)return'Required · choose '+(max===1?'one':max);
 if(min)return'Required · at least '+min;
 if(max===1)return'Optional · choose one';
 if(max!=null)return'Optional · up to '+max;
 return'Optional · choose any';
}

function choiceMarkup(group,option,count,controlId){
 const price=optionPriceLabel(option),disabled=option.ui_selectable===false?'disabled':'',status=option.ui_selectable===false?'Unavailable':price;
 if(group.display_type==='quantity-select')return`<div class="option-quantity-row customization-choice" data-option-search="${esc(option.name.toLowerCase())}"><label for="${controlId}">${esc(option.name)} <small>${esc(status||'Included')}</small></label><input class="modifier-count" id="${controlId}" data-option="${esc(option.id)}" aria-label="${esc(option.name)} quantity" type="number" inputmode="numeric" min="0" max="${option.selection_max??99}" value="${count}" ${disabled}></div>`;
 const type=group.selection_min>0&&(group.display_type==='single-select'||group.selection_max===1)?'radio':'checkbox';
 return`<label class="option-label customization-choice" data-option-search="${esc(option.name.toLowerCase())}"><input class="option-choice" id="${controlId}" type="${type}" name="${esc(group.id)}" value="${esc(option.id)}" ${count?'checked':''} ${disabled}><span>${esc(option.name)}</span><small class="${/confirm$/i.test(price)?'price-pending':''}">${esc(status)}</small></label>`;
}

function groupMarkup(group,selected,index){
 const choices=(group.options||[]).map((option,optionIndex)=>choiceMarkup(group,option,selected.filter(id=>id===option.id).length,`option-${index}-${optionIndex}`)).join('');
 if(!group.customization)return`<fieldset class="option-group" data-group="${esc(group.id)}"><legend>${esc(group.name)} <span>${esc(requirementLabel(group))}</span></legend>${choices}</fieldset>`;
 const count=selected.filter(id=>group.options.some(option=>option.id===id)).length,open=(group.selection_min||count||group.kind==='toasting'||group.kind==='bread')?'open':'';
 return`<details class="option-group customization-group" data-group="${esc(group.id)}" data-kind="${esc(group.kind||'other')}" ${open}><summary><span>${esc(group.name)}<small>${esc(requirementLabel(group))}</small></span><strong data-group-count>${count?count+' selected':group.options.length+' choices'}</strong></summary><div class="customization-options">${choices}</div></details>`;
}
function openProduct(id,index=null,historyMode='push'){
 const p=item(id);if(!p)return;activeProduct=p;editIndex=index;if(index===null){urlItem=id;if(historyMode!=='none')syncDiscoveryURL(historyMode)}
 const existing=index===null?null:cart[index];activeQuantity=existing?.quantity||1;
 const selected=existing?.option_ids||(p.option_groups||[]).flatMap(group=>group.preselected_option_ids||[]),hasCustomization=(p.option_groups||[]).some(group=>group.customization);
 const groups=(p.option_groups||[]).map((group,groupIndex)=>groupMarkup(group,selected,groupIndex)).join('');
 const controls=hasCustomization?`<section class="customization-control"><div><div><p class="eyebrow">COMPLETE CUSTOMIZATION</p><h3>Choose your ingredients.</h3></div><button class="text-link" data-action="clear-customization">Reset custom choices</button></div><label for="customization-search">Find an ingredient or instruction<input id="customization-search" type="search" autocomplete="off" placeholder="Bread, turkey, Swiss, peppers…"></label><p id="customization-search-status" class="fine" aria-live="polite">Open a section below or search every available choice.</p></section>`:'';
 open(`${p.image?`<img class="detail-image" src="${esc(menuImage(p.image,800))}" alt="${esc(p.name)}">`:''}<div class="modal-pad">${head(esc(p.name))}<div class="detail-meta"><span>${esc(p.category)}</span><strong>${esc(itemPriceLabel(p))}</strong></div><p class="detail-copy">${esc(p.description)}</p>${index===null?`<div class="product-share"><button class="text-link" data-action="share-item">Copy sandwich link ↗</button><div id="item-share" class="comparison-share" hidden><label for="item-url">Link to ${esc(p.name)}</label><input id="item-url" type="url" readonly value="${esc(publicItemURL(p.id))}"><p>Select and copy this link.</p></div></div>`:''}${controls}${groups}<label class="field" for="special-note">Special request <span class="fine">Optional</span></label><textarea id="special-note" maxlength="180" placeholder="For example, sauce on the side">${esc(existing?.note||'')}</textarea><p class="fine allergy-note">Removing an ingredient does not make an item allergen-free. For allergies, speak with the deli before ordering.</p><div class="selection-review"><strong>Your choices</strong><p id="selection-summary"></p><p id="selection-confirmation" class="selection-confirmation" hidden></p></div></div><div class="modal-bottom"><div class="quantity"><button data-action="minus" aria-label="Decrease quantity">−</button><span id="item-quantity">${activeQuantity}</span><button data-action="plus" aria-label="Increase quantity">+</button></div><button class="primary" data-action="add" ${p.sold_out?'disabled':''}><span id="item-submit-label">${p.sold_out?'Sold out':index===null?'Add to order':'Save changes'}</span> <span id="item-total"></span></button></div>`,'product');updateProductPrice();
}

function updateProductPrice(){
 if(!activeProduct||dialog.dataset.view!=='product')return;
 const ids=selectedOptionIDs();
 const state=Deli.selectionState(activeProduct,ids);
 $('#item-quantity').textContent=activeQuantity;
 $('#item-total').textContent=state.pendingPrice?'Price to confirm':money(state.unitCents*activeQuantity);
 const missing=(activeProduct.option_groups||[]).filter(g=>ids.filter(id=>g.options.some(o=>o.id===id)).length<(g.selection_min||0));
 const chosenNames=state.selected.map(option=>option.name),chosen=chosenNames.slice(0,12).join(', ')+(chosenNames.length>12?` and ${chosenNames.length-12} more`:''),confirmation=$('#selection-confirmation');
 $('#selection-summary').textContent=(chosen||(!missing.length?'As listed on the menu.':''))+(missing.length?' Still needed: '+missing.map(g=>g.name).join(', ')+'.':'');
 if(confirmation){confirmation.hidden=!state.requiresConfirmation;confirmation.textContent=state.expandedSelectionPending?'This combination uses more choices than the current published limit. You can save it now; the deli must confirm availability and the total before checkout.':state.requiresConfirmation?confirmationReason(state)+'. You can save these choices now; the deli must confirm them before checkout.':''}
 let validationError='';try{Deli.validateOptions(activeProduct,ids)}catch(error){validationError=error.message}
 if(validationError&&!missing.length){$('#selection-summary').textContent+=(chosen?' ':'')+validationError;}
 const submit=dialog.querySelector('[data-action="add"]');
 submit.disabled=activeProduct.sold_out||missing.length>0||Boolean(validationError);
 $('#item-submit-label').textContent=activeProduct.sold_out?'Sold out':missing.length?(/^choose\b/i.test(missing[0].name)?missing[0].name:'Choose '+missing[0].name):validationError?'Review required choices':editIndex===null?'Add to order':'Save changes';
 for(const g of activeProduct.option_groups||[]){
  const count=ids.filter(id=>g.options.some(o=>o.id===id)).length;
  if(g.selection_max>1)dialog.querySelectorAll(`[data-group="${g.id}"] .option-choice`).forEach(input=>{const option=g.options.find(value=>value.id===input.value);input.disabled=option?.ui_selectable===false||(!input.checked&&count>=g.selection_max)});
  const counter=dialog.querySelector(`[data-group="${g.id}"] [data-group-count]`);if(counter)counter.textContent=count?count+' selected':g.options.length+' choices';
 }

 dialog.querySelector('[data-action="minus"]').disabled=activeQuantity===1;
 dialog.querySelector('[data-action="plus"]').disabled=activeQuantity===20;
}

function addProduct(){
 const ids=selectedOptionIDs();
 try{Deli.validateOptions(activeProduct,ids)}catch(error){toast(error.message);return}
 for(const g of activeProduct.option_groups||[]){
  const n=ids.filter(id=>g.options.some(o=>o.id===id)).length;
  if(n<(g.selection_min||0)||(g.selection_max!==null&&g.selection_max!==undefined&&n>g.selection_max)){
   toast('Please review '+g.name.toLowerCase()+'.');dialog.querySelector(`[data-group="${g.id}"] input`)?.focus();return;
  }
  for(const o of g.options){const count=ids.filter(id=>id===o.id).length;if(o.selection_max!=null&&count>o.selection_max){toast('Please review '+o.name.toLowerCase()+' quantity.');return}}
 }
 const line={menu_item_id:activeProduct.id,quantity:activeQuantity,option_ids:ids,note:$('#special-note').value.trim()};
 if(editIndex===null)cart.push(line);else cart[editIndex]=line;
 const state=Deli.selectionState(activeProduct,ids);bagSave();close();toast(state.requiresConfirmation?'Saved. Price or availability will be confirmed before checkout.':editIndex===null?'Added to your order.':'Your order is updated.');
}

function persistUsuals(next,message){
 if(!window.DeliUsuals?.write(next))return toast('This browser could not save My Usuals. Allow site storage and try again.');
 usuals=next;if(savedOnly)renderMenu();if(message)toast(message);
}
function openSaveUsual(index){
 const line=cart[index],product=line&&item(line.menu_item_id);if(!line||!product)return toast('Review this sandwich before saving it.');
 if(usuals.length>=window.DeliUsuals.maximum)return toast('My Usuals is full. Delete one before saving another.');
 open(`<div class="modal-pad">${head('Save as My Usual')}<p class="detail-copy">Keep ${esc(product.name)} with this exact bread, toasting, toppings, removals, note, and quantity.</p><label class="field" for="usual-name">Name this order</label><input id="usual-name" maxlength="50" autocomplete="off" placeholder="My regular" value="${esc(product.name)}"><button class="primary full" data-action="usual-save-confirm" data-line-index="${index}">Save exact order</button><p class="fine">Current price and availability will still be checked each time you add it.</p></div>`,'usual');
 $('#usual-name')?.select();
}
function saveUsual(index){
 const line=cart[index];if(!line)return toast('That bag item is no longer available.');
 try{const entry=window.DeliUsuals.create({name:$('#usual-name')?.value,line});persistUsuals(window.DeliUsuals.upsert(usuals,entry),'Saved to My Usuals.');close()}catch(error){toast(error.message);$('#usual-name')?.focus()}
}
function openRenameUsual(id){
 const entry=usuals.find(value=>value.id===id);if(!entry)return;
 open(`<div class="modal-pad">${head('Rename My Usual')}<label class="field" for="usual-name">Name</label><input id="usual-name" maxlength="50" autocomplete="off" value="${esc(entry.name)}"><button class="primary full" data-action="usual-rename-confirm" data-usual-id="${esc(id)}">Save name</button></div>`,'usual');$('#usual-name')?.select();
}
function renameUsual(id){try{persistUsuals(window.DeliUsuals.rename(usuals,id,$('#usual-name')?.value),'Name updated.');close()}catch(error){toast(error.message);$('#usual-name')?.focus()}}
function deleteUsual(id){
 const entry=usuals.find(value=>value.id===id);if(!entry)return;
 if(!confirm(`Delete “${entry.name}” from My Usuals?`))return;
 persistUsuals(usuals.filter(value=>value.id!==id),'Removed from My Usuals.');
}
function addUsual(id){
 const entry=usuals.find(value=>value.id===id),status=usualStatus(entry);if(!status.ok)return toast(status.reason);
 cart.push(structuredClone(status.line));bagSave();toast(entry.name+' added. Current price will be confirmed at checkout.');
}
function groupBagMarkup(){
 if(!groupContext?.group_id||!groupContext?.participant_id||!groupContext?.participant_token||!cart.length)return'';
 const blocked=cart.some(line=>lineNeedsReview(line)||lineState(line).requiresConfirmation);
 return`<div class="group-bag-action"><p><strong>GROUP LUNCH</strong><br>${esc(groupContext.display_name||'Your sandwich')}</p><button class="secondary full" data-action="group-contribution" ${blocked?'disabled':''}>Save this bag to the group</button><button class="text-link full" data-action="leave-group">Leave this group</button>${blocked?'<p class="fine">Review unavailable or unconfirmed choices before saving this contribution.</p>':''}</div>`;
}
function decorateGroupBags(){
 document.querySelectorAll('#bag-panel,.modal-pad').forEach(host=>{const existing=host.querySelector(':scope > .group-bag-action, .bag-meta + .group-bag-action');if(existing&&!groupContext)existing.remove();if(existing||!groupContext||!cart.length)return;const anchor=host.querySelector('.bag-meta');if(anchor)anchor.insertAdjacentHTML('beforebegin',groupBagMarkup())});
}
async function saveGroupContribution(button){
 if(!groupContext||!Deli.connected)return toast('Open this group on the connected ordering address before saving your sandwich.');
 button.disabled=true;button.textContent='Saving to group…';
 try{
  const body={expected_version:Number(groupContext.version||0),display_name:groupContext.display_name,items:structuredClone(cart)},response=await Deli.request(`/groups/${encodeURIComponent(groupContext.group_id)}/participants/${encodeURIComponent(groupContext.participant_id)}`,'PUT',body,groupContext.participant_token),participant=response.participant||response;
  groupContext={...groupContext,display_name:participant.display_name||groupContext.display_name,version:Number(participant.version??response.version??groupContext.version)};
  if(!save('wd-group-context-v1',groupContext))throw new Error('The contribution was accepted, but this browser could not save its updated private access. Keep this page open and contact the organizer.');
  open(`<div class="modal-pad">${head('Saved to the group')}<p class="info-line">The organizer can now see your order under ${esc(groupContext.display_name||'your name')}.</p><p class="fine">Saving again replaces your contribution with the current bag. The organizer makes the single payment after contributions close.</p><button class="primary full" data-action="close">Keep browsing</button></div>`,'group');
 }catch(error){toast(error.message);button.disabled=false;button.textContent='Save this bag to the group'}
}
function leaveGroup(){if(!groupContext||!confirm('Leave this group on this device? Your last saved contribution stays with the organizer.'))return;groupContext=null;save('wd-group-context-v1',null);decorateGroupBags();renderBag();toast('Group access removed from this device.')}

function officialOrder(){window.open(officialOrderURL,'_blank','noopener,noreferrer')}
function cartFingerprint(lines=cart){return JSON.stringify(lines.map(line=>({menu_item_id:line.menu_item_id,quantity:line.quantity,option_ids:line.option_ids||[],note:line.note||''})))}
function saveHistory(entry){const index=history.findIndex(item=>item.id===entry.id);if(index>=0)history[index]={...history[index],...entry};else history.unshift(entry);history=retainedHistory(history);return save('wd-connected-orders-v1',history)}
function privateOrderEntry(orderID){if(!orderID)return null;if(pending?.id===orderID&&pending?.token)return pending;return history.find(entry=>entry?.id===orderID&&entry?.token)||null}
function unavailableRequestedOrder(){open(`<div class="modal-pad">${head('Private order status unavailable')}<p class="info-line">This browser does not have private access to that order. Open it from the browser that started payment, or call the deli for help.</p><a class="secondary full" href="tel:+18176705729">Call the deli</a><button class="text-link full" data-action="close" style="margin-top:10px">Back to the menu</button></div>`,'status-unavailable')}
function saveCheckoutAttempt(value){checkoutAttempt=value;return save('wd-checkout-attempt-v1',value)}
function persistPendingRecovery(value){if(!save('wd-pending-checkout-v1',value))return false;const stored=read('wd-pending-checkout-v1',null);return stored?.id===value.id&&stored?.token===value.token}
function attemptStorageWarning(){replaceDialog(`<div class="modal-pad">${head('Browser storage needed')}<p class="info-line">No checkout request was sent. This browser must be able to save the protected retry record before an order can be opened.</p><p class="fine">Allow site data or free browser storage, then try saving again. The same checkout request will be used.</p><button class="primary full" data-action="retry-attempt-save">Try saving again</button><button class="text-link full" data-action="close" style="margin-top:10px">Keep browsing</button></div>`)}
function recoveryStorageWarning(){replaceDialog(`<div class="modal-pad">${head('Save order recovery')}<p class="info-line">The ordering service returned this order, but the browser could not save its private recovery key. The payment page has not been opened by this action.</p><p class="fine">Do not start another order. Allow site data or free browser storage, then save this same order response and continue. This does not request a new checkout.</p><button class="primary full" data-action="retry-recovery-save">Try saving again</button><button class="text-link full" data-action="close" style="margin-top:10px">Keep this page open</button></div>`)}
const loopbackHosts=['localhost','127.0.0.1','[::1]'];
function loopbackAPI(){try{return loopbackHosts.includes(new URL(Deli.apiRoot||location.origin,location.href).hostname)}catch{return false}}
function secureCheckoutURL(value){if(typeof value!=='string'||!value.trim())return'';try{const url=new URL(value,location.href),localCheckout=loopbackHosts.includes(url.hostname),stripeCheckout=url.protocol==='https:'&&url.hostname==='checkout.stripe.com',localTest=loopbackAPI()&&localCheckout&&['http:','https:'].includes(url.protocol);return !url.username&&!url.password&&(stripeCheckout||localTest)?url.href:''}catch{return''}}
function pickupTimeLabel(value){const date=value?new Date(value):null;return date&&!Number.isNaN(date.valueOf())?date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):''}
function quotePickupLabel(currentQuote){const pickup=currentQuote?.pickup,promised=pickupTimeLabel(pickup?.promised_at);return promised?'Pickup promised for '+promised:'About '+Number(currentQuote?.prep_minutes||pickup?.estimate_minutes||settings.prep_minutes||20)+' minutes'}
async function choosePickupTime(){
 open(`<div class="modal-pad">${head('Choose a pickup time')}<p>Checking what the kitchen can reasonably promise…</p></div>`,'checkout');
 const requestGeneration=viewRequestGeneration,itemCount=cart.reduce((sum,line)=>sum+line.quantity,0),complexity=Math.min(200,cart.reduce((sum,line)=>sum+line.quantity*(1+Math.min(4,Math.ceil((line.option_ids||[]).length/4))),0));
 try{
  const params=new URLSearchParams({item_count:String(Math.max(1,itemCount)),complexity_units:String(Math.max(1,complexity))}),response=await Deli.request('/pickup/slots?'+params);
  if(requestGeneration!==viewRequestGeneration||!dialog.open||dialog.dataset.view!=='checkout')return;
  const slots=(Array.isArray(response.slots)?response.slots:[]).filter(slot=>slot?.available&&slot.promised_at).slice(0,9),publishedPromise=response.mode==='automatic'?response.recommendation||slots[0]?.promised_at||'':slots[0]?.promised_at||response.recommendation||'',visibility=response.external_workload_visible===false?'<p class="fine">Walk-in or phone demand may not be visible yet. Staff can add a rush delay or pause ordering at any time.</p>':'';
  const asap=publishedPromise?`<button class="pickup-choice" data-pickup-at="${esc(publishedPromise)}"><strong>ASAP</strong><span>Ready by ${esc(pickupTimeLabel(publishedPromise))}</span></button>`:'',scheduled=slots.filter(slot=>slot.promised_at!==publishedPromise).slice(0,7).map(slot=>{const start=pickupTimeLabel(slot.starts_at),promise=pickupTimeLabel(slot.promised_at),window=start&&promise?start+'–'+promise:promise;return`<button class="pickup-choice" data-pickup-at="${esc(slot.promised_at)}"><strong>${esc(window)}</strong><span>Pickup window · ready by ${esc(promise)}</span></button>`}).join(''),choices=asap+scheduled;
  replaceDialog(`<div class="modal-pad">${head('Choose a pickup time')}<p class="detail-copy">Choose the live ASAP promise or a later pickup window. The kitchen reserves capacity only when secure checkout creates your order.</p>${choices?`<div class="pickup-choices">${choices}</div>`:'<p class="info-line">No pickup window is available in the current schedule. Keep your bag and try again later, or call the deli.</p><a class="secondary full" href="tel:+18176705729">Call the deli</a>'}${visibility}<p class="fine">A paid order keeps the promise recorded at checkout. If the kitchen later reports a delay, the updated status is shown separately.</p></div>`);
 }catch(error){
  if(requestGeneration!==viewRequestGeneration)return;selectedPickupAt=null;toast('Live pickup windows are unavailable. The kitchen’s current estimate will be used.');checkout();
 }
}
function checkoutLines(currentQuote){return `<div class="checkout-lines">${currentQuote.items.map(line=>`<p><span>${line.quantity} × ${esc(line.name)}<small>${esc([...(line.option_names||[]),line.note].filter(Boolean).join(' · '))}</small></span><strong>${money(line.line_cents)}</strong></p>`).join('')}</div><div class="money-row"><span>Subtotal</span><span>${money(currentQuote.subtotal_cents)}</span></div><div class="money-row"><span>Sales tax</span><span>${money(currentQuote.tax_cents)}</span></div><div class="money-row total"><span>Total</span><span>${money(currentQuote.total_cents)}</span></div>`}
function renderCheckoutReview(message=''){
 const attempt=checkoutAttempt;if(!attempt?.quote)return;
 quote=attempt.quote;checkoutKey=attempt.idempotency_key;
 if(attempt.body){
  replaceDialog(`<div class="modal-pad">${head('Continue secure checkout')}<p class="fine">Pickup for ${esc(attempt.body.pickup_name)} · ${esc(quotePickupLabel(attempt.quote))}</p>${checkoutLines(attempt.quote)}${message?`<p class="info-line">${esc(message)}</p>`:'<p class="info-line">This exact checkout is saved. Retrying sends the same checkout, so it cannot create a second order.</p>'}<button class="primary full" data-action="retry-payment">Continue to secure payment · ${money(attempt.quote.total_cents)}</button><button class="text-link full" data-action="close" style="margin-top:10px">Keep browsing</button></div>`);
  return;
 }
 replaceDialog(`<div class="modal-pad">${head('Review your order')}<p class="fine">Pickup at 601 S Main Street · ${esc(quotePickupLabel(quote))}</p><button class="secondary full" data-action="change-pickup">Change pickup time</button>${checkoutLines(quote)}<div class="checkout-customer"><label class="field" for="pickup-name">Pickup name</label><input id="pickup-name" autocomplete="name" maxlength="80" required><div class="checkout-contact"><label class="field" for="pickup-email">Email <span class="fine">Optional</span></label><input id="pickup-email" type="email" autocomplete="email" maxlength="254"><label class="field" for="pickup-phone">Phone <span class="fine">Optional</span></label><input id="pickup-phone" type="tel" autocomplete="tel" maxlength="30"></div></div><p class="fine">Continue to the secure payment page. Your order reaches the kitchen only after payment is confirmed.</p><button class="primary full" data-action="start-payment">Continue to secure payment · ${money(quote.total_cents)}</button></div>`);
}

function changePickupTime(){
 if(checkoutAttempt?.body)return;
 const previous=checkoutAttempt;if(!saveCheckoutAttempt(null)){checkoutAttempt=previous;toast('Allow site storage before changing the saved pickup time.');return}
 quote=null;checkoutKey=null;selectedPickupAt=undefined;choosePickupTime();
}

async function checkout(){
 if(!cart.length&&!checkoutAttempt?.body)return;
 if(!checkoutAttempt?.body&&cart.some(line=>lineState(line).requiresConfirmation)){open(`<div class="modal-pad">${head('Confirmation needed')}<p class="detail-copy">One or more custom choices still need the deli to confirm availability or price. Your choices are saved, but this order cannot be charged until those details are approved.</p><button class="primary full" data-action="bag">Review your order</button></div>`,'checkout');return}
 if(!Deli.connected){if(checkoutAttempt?.body){open(`<div class="modal-pad">${head('Checkout saved')}<p>Your secure checkout request is saved, but online ordering cannot be reached right now.</p><p class="info-line">Try again when the connection is restored. No order is treated as paid until payment is confirmed.</p><button class="secondary full" data-action="close">Back to the menu</button></div>`,'checkout');return}return officialOrder()}
 if(Deli.config.checkout_enabled!==true&&!checkoutAttempt?.body)return officialOrder();
 if(!checkoutAttempt?.body&&(settings.checkout_enabled!==true||settings.accepting_orders===false||settings.open_now===false)){open(`<div class="modal-pad">${head(settings.open_now===false?'Online pickup is closed':'Online ordering paused')}<p>Your bag is saved. Check back when online pickup is accepting orders.</p><button class="secondary full" data-action="close">Back to the menu</button></div>`,'checkout');return}
 if(!checkoutAttempt?.quote&&selectedPickupAt===undefined)return choosePickupTime();
 open(`<div class="modal-pad">${head('Review your order')}<p>Checking current prices and availability…</p></div>`,'checkout');
 const requestGeneration=viewRequestGeneration;
 try{
  const validAttempt=checkoutAttempt?.quote&&checkoutAttempt?.idempotency_key&&Array.isArray(checkoutAttempt?.lines),sameBag=validAttempt&&checkoutAttempt.cart_fingerprint===cartFingerprint(),notExpired=!checkoutAttempt?.quote?.expires_at||new Date(checkoutAttempt.quote.expires_at)>new Date();
  if(validAttempt&&(checkoutAttempt.body||sameBag&&notExpired))renderCheckoutReview();
  else{
   saveCheckoutAttempt(null);
   const requestedLines=structuredClone(cart),requestedFingerprint=cartFingerprint(requestedLines);
   const quoteRequest={fulfillment:'pickup',items:requestedLines};if(selectedPickupAt)quoteRequest.requested_pickup_at=selectedPickupAt;
   const response=await Deli.request('/quotes','POST',quoteRequest);
   if(requestGeneration!==viewRequestGeneration||!dialog.open||dialog.dataset.view!=='checkout')return;
   if(requestedFingerprint!==cartFingerprint()){
    replaceDialog(`<div class="modal-pad">${head('Your bag changed')}<p class="info-line">Your bag changed while prices were being checked. Review the updated items before continuing.</p><button class="primary full" data-action="bag">Review your bag</button></div>`);return;
   }
   quote=response;checkoutKey=Deli.uid('checkout_');
   saveCheckoutAttempt({quote,idempotency_key:checkoutKey,cart_fingerprint:requestedFingerprint,lines:requestedLines,body:null,created_at:new Date().toISOString()});renderCheckoutReview();
  }
 }catch(e){if(requestGeneration!==viewRequestGeneration||!dialog.open||dialog.dataset.view!=='checkout')return;discoveryEvent('checkout_error');replaceDialog(`<div class="modal-pad">${head('Update your order')}<p>${esc(e.message)}</p><button class="primary full" style="margin-top:20px" data-action="bag">Back to your bag</button></div>`);await refresh()}
}

async function submitCheckout(button){
 const attempt=checkoutAttempt;if(!attempt?.body)return checkout();
 if(!saveCheckoutAttempt(attempt)){attemptStorageWarning();return}
 button.disabled=true;button.textContent='Opening secure payment…';
 try{
  const response=await Deli.request('/checkouts','POST',attempt.body),paymentURL=response.checkout_url===null?'':secureCheckoutURL(response.checkout_url);
  if(!response.order_id||!response.lookup_token||(response.checkout_url!==null&&!paymentURL))throw Object.assign(new Error('The payment service returned an incomplete or unsafe response.'),{code:'invalid_checkout_response'});
  pending={id:response.order_id,token:response.lookup_token,checkout_url:paymentURL,checkout_expires_at:response.checkout_expires_at,payment_status:response.payment_status,status:response.status,lines:structuredClone(attempt.lines),cart_fingerprint:attempt.cart_fingerprint,time:new Date().toISOString(),total:attempt.quote.total_cents,pickup_name:attempt.body.pickup_name,email:attempt.body.email||'',phone:attempt.body.phone||''};
  if(!persistPendingRecovery(pending)){recoveryStorageWarning();return}
  saveHistory(pending);saveCheckoutAttempt(null);if(paymentURL)location.assign(paymentURL);else await showOrder(pending);
 }catch(error){
  discoveryEvent('checkout_error');
  if(['quote_expired','item_sold_out','ordering_paused'].includes(error.code)){saveCheckoutAttempt(null);replaceDialog(`<div class="modal-pad">${head('Review your order')}<p>${esc(error.message)}</p><p class="info-line">Your bag is unchanged. Review it to get a new total before trying again.</p><button class="primary full" data-action="bag">Back to your bag</button></div>`);return}
  renderCheckoutReview(error.message+' Retrying uses the same protected request, so it will not create a second order.');
 }
}

async function startPayment(button){
 const name=$('#pickup-name')?.value.trim(),email=$('#pickup-email')?.value.trim(),phone=$('#pickup-phone')?.value.trim();
 if(!name){toast('Enter the name for pickup.');$('#pickup-name')?.focus();return}
 if(email&&!$('#pickup-email').checkValidity()){toast('Enter a valid email address.');$('#pickup-email').focus();return}
 const body={quote_id:quote.quote_id,idempotency_key:checkoutKey,pickup_name:name};if(email)body.email=email;if(phone)body.phone=phone;
 if(!saveCheckoutAttempt({...checkoutAttempt,body})){attemptStorageWarning();return}await submitCheckout(button);
}

async function retryAttemptSave(button){if(!checkoutAttempt?.body)return checkout();button.disabled=true;if(!saveCheckoutAttempt(checkoutAttempt)){button.disabled=false;attemptStorageWarning();return}await submitCheckout(button)}
async function retryRecoverySave(button){if(!pending?.id||!pending?.token)return;button.disabled=true;if(!persistPendingRecovery(pending)){button.disabled=false;recoveryStorageWarning();return}saveHistory(pending);saveCheckoutAttempt(null);const paymentURL=secureCheckoutURL(pending.checkout_url);if(paymentURL)location.assign(paymentURL);else await showOrder(pending)}

function paidStatus(value){return ['paid','partially_refunded','refunded'].includes(value)}
function paymentDetails(order){
 const totalCents=Math.max(0,Number(order?.total_cents)||0),refundedCents=Math.max(0,Math.min(totalCents,Number(order?.refunded_cents)||0)),fullyRefunded=order?.payment_status==='refunded',partiallyRefunded=order?.payment_status==='partially_refunded'||(!fullyRefunded&&refundedCents>0);
 return {totalCents,refundedCents,remainingCents:Math.max(0,totalCents-refundedCents),fullyRefunded,partiallyRefunded};
}
function isCateringDeposit(entry,order){return order?.fulfillment==='catering_deposit'||entry?.fulfillment==='catering_deposit'||[...(order?.items||[]),...(entry?.lines||[])].some(line=>line?.menu_item_id==='catering-deposit')}
function customerStatusName(status){return({pending_payment:'Waiting for payment',payment_failed:'Payment failed',expired:'Expired',new:'Received',preparing:'Preparing',ready:'Ready for pickup',completed:'Picked up',cancelled:'Cancelled'}[status]||String(status||'Unknown').replaceAll('_',' '))}
function refundNotice(order){
 const payment=paymentDetails(order);
 if(payment.fullyRefunded)return `<p class="info-line"><strong>Full refund recorded: ${money(payment.refundedCents||payment.totalCents)}.</strong> The payment record shows no paid balance remaining.</p>`;
 if(payment.partiallyRefunded)return `<p class="info-line"><strong>Partial refund recorded: ${money(payment.refundedCents)}.</strong> Remaining paid amount: ${money(payment.remainingCents)}.</p>`;
 return'';
}
function notificationsMarkup(entry,order){
 const preferences=order?.notifications||order?.notification_preferences||entry?.notifications||{},email=Boolean(entry?.email),phone=Boolean(entry?.phone);
 return`<details class="notification-settings"><summary>Ready-for-pickup alerts</summary><div><label><input id="ready-email" type="checkbox" ${preferences.email_ready?'checked':''} ${email?'':'disabled'}> Email me when it is ready</label>${email?'':'<p class="fine">No email was provided for this order.</p>'}<label><input id="ready-sms" type="checkbox" ${preferences.sms_ready?'checked':''} ${phone?'':'disabled'}> Text me when it is ready</label>${phone?'':'<p class="fine">No phone number was provided for this order.</p>'}<button class="secondary full" data-action="save-notifications">Save alert choices</button><p class="fine">The service reports whether each channel is connected. App notifications are managed in the iPhone or Android app. Only a kitchen update to Ready sends a ready alert.</p></div></details>`;
}
async function saveNotifications(button){
 if(!trackedOrder?.id||!trackedOrder?.token)return toast('Private order access is unavailable.');
 const body={email_ready:Boolean($('#ready-email')?.checked),sms_ready:Boolean($('#ready-sms')?.checked),push_ready:false};button.disabled=true;
 try{
  const response=await Deli.request('/orders/'+encodeURIComponent(trackedOrder.id)+'/notifications','PUT',body,trackedOrder.token),result=response.notifications||response,channels=result.channels||{};
  trackedOrder.notifications={email_ready:Boolean(result.email_ready),sms_ready:Boolean(result.sms_ready),push_ready:Boolean(result.push_ready)};saveHistory(trackedOrder);
  const labels=Object.entries(channels).filter(([,value])=>typeof value==='string').map(([key,value])=>key.replace('_',' ')+': '+value.replaceAll('_',' '));toast(labels.length?labels.join(' · '):'Alert choices saved.');
 }catch(error){toast(error.message)}finally{if(button.isConnected)button.disabled=false}
}
async function showOrder(entry){
 if(!entry?.id||!entry?.token)return;
 if(statusInFlight?.id===entry.id&&statusInFlight.generation===statusRequestGeneration)return;
 const requestGeneration=++statusRequestGeneration,requestedOrderID=entry.id;trackedOrder=entry;statusInFlight={id:entry.id,generation:requestGeneration};
 try{
  const response=await Deli.request('/orders/'+encodeURIComponent(entry.id),'GET',undefined,entry.token),order=response.order||response;
  if(requestGeneration!==statusRequestGeneration||trackedOrder?.id!==requestedOrderID)return;
  const current={...entry,status:order.status,payment_status:order.payment_status,total:order.total_cents??entry.total,pickup_name:order.pickup_name||entry.pickup_name,fulfillment:order.fulfillment||entry.fulfillment,lines:Array.isArray(order.items)?order.items:entry.lines,checkout_url:Object.prototype.hasOwnProperty.call(order,'checkout_url')?secureCheckoutURL(order.checkout_url):entry.checkout_url,checkout_expires_at:Object.prototype.hasOwnProperty.call(order,'checkout_expires_at')?order.checkout_expires_at:entry.checkout_expires_at,updated_at:order.updated_at,time:entry.time||order.created_at};
  const historySaved=saveHistory(current),paid=paidStatus(order.payment_status),failed=['payment_failed','failed','expired'].includes(order.payment_status)||['payment_failed','expired'].includes(order.status),disputed=order.payment_status==='disputed',payment=paymentDetails(order),refund=refundNotice(order),cateringDeposit=isCateringDeposit(current,order);
  if((paid||disputed)&&pending?.id===entry.id){if(cartFingerprint()===pending.cart_fingerprint){cart=[];save('wd-platform-bag',cart)}if(historySaved){pending=null;save('wd-pending-checkout-v1',null)}renderBag()}
  if(failed&&pending?.id===entry.id&&historySaved){pending=null;save('wd-pending-checkout-v1',null);renderBag()}
  const signature=JSON.stringify([order.id,order.status,order.payment_status,order.fulfillment,order.updated_at,order.refunded_cents,order.timeline,order.checkout_url,order.checkout_expires_at]);
  if(dialog.open&&dialog.dataset.view==='status'&&signature===trackedOrderSignature)return;
  trackedOrder=current;trackedOrderSignature=signature;
  const states=['new','preparing','ready','completed'],names=['Order received','Preparing your order','Ready for pickup','Picked up'],index=states.indexOf(order.status);
  const returnURL=secureCheckoutURL(current.checkout_url);
  const expiry=current.checkout_expires_at?new Date(current.checkout_expires_at):null,expiryText=expiry&&!Number.isNaN(expiry.valueOf())?expiry.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'';
  let title=cateringDeposit?'Catering deposit pending':'Payment confirmation pending',body=`<p class="info-line">${cateringDeposit?'The deposit is waiting for payment confirmation.':'The kitchen has not received this order yet. Payment confirmation can take a moment.'}</p>${returnURL?`<a class="primary full" href="${esc(returnURL)}">Return to secure payment ↗</a><p class="fine">This payment page remains available ${expiryText?'until '+esc(expiryText):'until it expires'}, even if new orders are paused.</p>`:`<p class="info-line">The secure payment link is no longer available. ${cateringDeposit?'Check the catering request before trying again.':'Your bag remains saved while this status is checked.'}</p>`}`;
  if(failed){title=cateringDeposit?'Catering deposit not completed':'Payment not completed';body=cateringDeposit?'<p class="info-line">No deposit payment was confirmed. Open the catering request to review the current quote before trying again.</p><a class="primary full" href="catering.html">View catering request</a>':'<p class="info-line">Your bag is still saved. Review it before trying payment again.</p><button class="primary full" data-action="bag">Review your bag</button>'}
  if(disputed){title=cateringDeposit?'Catering deposit under review':'Payment under review';body=`<p class="info-line">The payment processor reported a dispute on this ${cateringDeposit?'deposit':'order'}. Call the deli if you need help with the payment record.</p>${refund}<a class="secondary full" href="tel:+18176705729">Call the deli</a>`}
  if(paid&&cateringDeposit){const remaining=Math.max(0,Number(current.catering_quote_total||0)-Number(order.total_cents??entry.total??0));title=payment.fullyRefunded?'Catering deposit refunded':'Catering deposit confirmed';body=`<div class="success-circle" aria-hidden="true">${payment.fullyRefunded?'↩':'✓'}</div>${refund}${payment.fullyRefunded?'':`<p class="info-line">The deli has a confirmed deposit for this catering request.</p>${remaining?`<p class="fine">Quote amount remaining after this deposit: <strong>${money(remaining)}</strong>. Check the request for the agreed payment terms.</p>`:''}`}<p class="fine">This confirms payment only. It does not mean the catering order is ready for pickup or delivery.</p><a class="primary full" href="catering.html">View catering request</a>`}
  else if(paid){title=payment.fullyRefunded?'Order refunded':order.status==='cancelled'?'Order cancelled':order.status==='ready'?'Your order is ready':order.status==='completed'?'Pickup complete':'Order received';body=payment.fullyRefunded?`<div class="success-circle" aria-hidden="true">↩</div>${refund}<p class="fine">Kitchen record: ${esc(customerStatusName(order.status))}.</p>`:`<div class="success-circle" aria-hidden="true">✓</div>${order.status==='cancelled'?'<p class="info-line">This order was cancelled.</p>':`<ol class="step-list">${states.map((state,i)=>`<li class="${i<index?'done':i===index?'current':''}">${names[i]}<small>${i===index?'Current kitchen status':i<index?'Complete':'Waiting'}</small></li>`).join('')}</ol>`}${refund}`}
  const html=`<div class="modal-pad">${head(title)}<p><strong>${esc(order.id)}</strong> · ${esc(order.pickup_name||entry.pickup_name||'Pickup')}</p><p class="fine">${money(order.total_cents??entry.total??0)} · ${cateringDeposit?'Catering request payment':'Main Street pickup'}</p>${body}${cateringDeposit?'':notificationsMarkup(current,order)}<button class="secondary full" data-action="refresh-order">Refresh status</button><button class="text-link full" data-action="close" style="margin-top:10px">Back to the menu</button></div>`;
  if(dialog.open&&dialog.dataset.view==='status')replaceDialog(html);else open(html,'status');
 }catch(e){
  if(requestGeneration!==statusRequestGeneration||trackedOrder?.id!==requestedOrderID)return;
  const returnURL=secureCheckoutURL(entry.checkout_url),expiry=entry.checkout_expires_at?new Date(entry.checkout_expires_at):null,expired=expiry&&!Number.isNaN(expiry.valueOf())&&expiry<=new Date(),cateringDeposit=isCateringDeposit(entry);
  const html=`<div class="modal-pad">${head('Status temporarily unavailable')}<p class="info-line">${cateringDeposit?'We could not refresh the deposit payment status. Your private catering request remains saved on this device.':'We could not refresh payment or kitchen status. Your bag and order details are still saved.'}</p>${returnURL&&!expired?`<a class="primary full" href="${esc(returnURL)}">Return to secure payment ↗</a>`:''}${cateringDeposit?'<a class="secondary full" href="catering.html">View catering request</a>':''}<button class="secondary full" data-action="refresh-order">Try status again</button><button class="text-link full" data-action="close" style="margin-top:10px">Back to the menu</button></div>`;
  if(dialog.open&&dialog.dataset.view==='status')replaceDialog(html);else open(html,'status');toast(e.message)
 }finally{if(statusInFlight?.generation===requestGeneration)statusInFlight=null}
}

function orders(){open(`<div class="modal-pad">${head('Your orders')}<p class="fine">We securely check each order’s current status. Menu prices and availability are checked again when you reorder.</p>${history.length?history.map((entry,i)=>{const catering=isCateringDeposit(entry),summary=catering?'Catering deposit':(entry.lines||[]).reduce((sum,line)=>sum+line.quantity,0)+' items';return`<div class="order-history"><header><span>${esc(entry.id)}</span><span>${money(entry.total||0)}</span></header><p>${summary} · ${new Date(entry.time).toLocaleDateString()} · ${esc((entry.payment_status||entry.status||'pending').replaceAll('_',' '))}</p><div class="actions">${entry.token?`<button class="secondary" data-status="${i}">View status</button>`:'<span class="fine">Private status access expired</span>'}${paidStatus(entry.payment_status)&&!catering?`<button class="secondary" data-reorder="${i}">Order again ↗</button>`:''}</div></div>`}).join(''):'<div class="empty-state"><h3>No online orders yet</h3><p>Orders placed here will appear after secure checkout begins.</p><button class="primary" data-action="browse">Browse menu</button></div>'}</div>`,'orders')}
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

function optionByID(id){return(activeProduct?.option_groups||[]).flatMap(group=>group.options||[]).find(option=>option.id===id)}

function choicesConflict(first,second){
 if(!first||!second||first.id===second.id)return false;
 if((activeProduct?.option_groups||[]).some(group=>(group.exclusive_option_sets||[]).some(set=>set.includes(first.id)&&set.includes(second.id))))return true;
 if(first.ingredient_kind==='bread'&&second.ingredient_kind==='bread'&&first.action==='substitute'&&second.action==='substitute')return true;
 if(!first.ingredient_id||first.ingredient_id!==second.ingredient_id)return false;
 return first.action==='omit'||second.action==='omit'||(['add','substitute'].includes(first.action||'add')&&['add','substitute'].includes(second.action||'add'));
}

function reconcileIngredientChoice(input){
 if(!input.checked)return;
 const selected=optionByID(input.value);if(!selected)return;
 dialog.querySelectorAll('.option-choice:checked').forEach(other=>{if(other!==input&&choicesConflict(selected,optionByID(other.value)))other.checked=false});
}

function clearCustomization(){
 const defaults=new Set((activeProduct?.option_groups||[]).filter(group=>group.customization).flatMap(group=>group.preselected_option_ids||[]));
 dialog.querySelectorAll('.customization-group .option-choice').forEach(input=>{input.checked=defaults.has(input.value)});
 dialog.querySelectorAll('.customization-group .modifier-count').forEach(input=>{input.value=[...defaults].filter(id=>id===input.dataset.option).length});
 const search=$('#customization-search');if(search){search.value='';filterCustomization('')}
 updateProductPrice();toast('Custom choices reset.');
}

function filterCustomization(value){
 const term=DeliDiscovery.normalize(value),groups=[...dialog.querySelectorAll('.option-group')];let visible=0;
 for(const group of groups){let groupMatches=0;group.querySelectorAll('.customization-choice').forEach(choice=>{const match=!term||DeliDiscovery.normalize(choice.dataset.optionSearch).includes(term);choice.hidden=!match;if(match){groupMatches+=1;visible+=1}});group.hidden=groupMatches===0;if(term&&groupMatches&&group.tagName==='DETAILS')group.open=true}
 const status=$('#customization-search-status');if(status)status.textContent=term?visible+(visible===1?' matching choice.':' matching choices.'):'Open a section below or search every available choice.';
}

function clearDiscovery(historyMode='push'){
 discoveryFilters={include:'',exclude:'',max:''};
 $('#include-ingredients').value='';$('#exclude-ingredients').value='';$('#max-price').value='';
 renderMenu(historyMode);
}

function syncDiscoveryURL(historyMode='replace'){
 const params=new URLSearchParams(location.search);
 for(const [key,value] of Object.entries({q:query,include:discoveryFilters.include,exclude:discoveryFilters.exclude,max:discoveryFilters.max,category:category==='All'?'':category,compare:compared.join(','),sort:sortMode==='menu'?'':sortMode,saved:savedOnly?'1':'',item:urlItem}))value?params.set(key,value):params.delete(key);
 const suffix=params.toString(),next=location.pathname+(suffix?'?'+suffix:'')+location.hash,current=location.pathname+location.search+location.hash;
 if(historyMode==='none'||next===current)return;
 window.history[historyMode==='push'?'pushState':'replaceState'](null,'',next);
}

function publicMenuPath(){return location.pathname.replace(/[^/]*$/,'menu.html')}
function publicItemURL(id){return DeliDiscovery.publicURL(location.origin,publicMenuPath(),{item:id})}
function publicComparisonURL(){return DeliDiscovery.publicURL(location.origin,publicMenuPath(),{q:query,include:discoveryFilters.include,exclude:discoveryFilters.exclude,max:discoveryFilters.max,category,compare:compared,sort:sortMode,saved:savedOnly})}

function applyDiscoveryURL(){
 const state=DeliDiscovery.readURLState(location.search);query=state.q;discoveryFilters={include:state.include,exclude:state.exclude,max:state.max};category=state.category;compared=state.compare;savedOnly=state.saved;sortMode=state.sort;urlItem=state.item;
 const validItem=urlItem&&item(urlItem);
 $('#search').value=query;$('#include-ingredients').value=discoveryFilters.include;$('#exclude-ingredients').value=discoveryFilters.exclude;$('#max-price').value=discoveryFilters.max;$('#sort-menu').value=sortMode;
 document.querySelectorAll('.bottom-nav button').forEach(button=>button.classList.toggle('selected',button.dataset.view===(savedOnly?'saved':'menu')));
 if(!validItem&&dialog.open&&dialog.dataset.view==='product')close(true);
 renderMenu('none');
 if(validItem)openProduct(urlItem,null,'none');else if(urlItem){urlItem='';syncDiscoveryURL('replace')}
 if(dialog.open&&dialog.dataset.view==='compare')showComparison();
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
 renderMenu('push');
 if(dialog.open&&dialog.dataset.view==='compare')showComparison();
}

function showComparison(){
 const chosen=compared.map(item).filter(Boolean);
 if(!chosen.length)return open(`<div class="modal-pad">${head('Compare sandwiches')}<p class="detail-copy">Choose up to three items from the menu. Compare their ingredients, starting prices, and available choices in one place.</p><button class="primary full" data-action="browse">Choose from the menu</button></div>`,'compare');
 const cells=chosen.map(p=>`<section class="comparison-card"><div class="comparison-image">${p.image?`<img src="${esc(menuImage(p.image,800))}" alt="${esc(p.name)}" decoding="async">`:''}<button data-compare="${p.id}" aria-label="Remove ${esc(p.name)} from comparison">×</button></div><p class="eyebrow">${esc(p.category)}</p><h3>${esc(p.name)}</h3><p class="comparison-price">${esc(itemPriceLabel(p))}${p.base_price_cents!=null&&p.variable_price?'<small>Starting price</small>':p.base_price_cents==null?'<small>Set choices, then confirm with the deli</small>':''}</p><div class="comparison-description"><h4>Ingredients & bread</h4><p>${esc(p.description)||'No description listed. Ask the deli for details.'}</p></div><button class="primary full" data-product="${p.id}">Choose ${esc(p.short_name||p.name)} ↗</button></section>`).join('');
 open(`<div class="modal-pad">${head('Compare your choices')}<p class="comparison-intro">Keep the ingredients and prices side by side. Choose an item to set its options.</p><div class="comparison-grid" style="--compare-columns:${chosen.length}">${cells}</div><div class="comparison-footer"><button class="text-link" data-action="browse">Back to the menu</button><button class="secondary" data-action="share-comparison">Copy comparison link ↗</button></div><div id="comparison-share" class="comparison-share" hidden><label for="comparison-url">Comparison link</label><input id="comparison-url" type="url" readonly value="${esc(publicComparisonURL())}"><p>Select and copy this link.</p></div><p class="fine">Prices marked + vary with options. Menu descriptions may not list every ingredient. For allergies, speak with the deli.</p></div>`,'compare');
}

function shareComparison(){
 const box=$('#comparison-share'),field=$('#comparison-url');
 if(!box||!field)return;
 box.hidden=false;field.value=publicComparisonURL();field.focus();field.select();
 const message=box.querySelector('p');
 message.textContent='Copy this address to share these choices and filters.';
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(field.value).then(()=>{if(box.isConnected)message.textContent='Link copied. Share it to open this same comparison.'}).catch(()=>{});
}

function shareItem(){
 const box=$('#item-share'),field=$('#item-url');if(!box||!field||!activeProduct)return;
 box.hidden=false;field.value=publicItemURL(activeProduct.id);field.focus();field.select();
 const message=box.querySelector('p');message.textContent='Select and copy this link.';
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(field.value).then(()=>{if(box.isConnected)message.textContent='Link copied. It opens this sandwich directly.'}).catch(()=>{});
}

function showCategories(){
 const categories=['All','Popular',...new Set(items.map(p=>p.category))];
 open(`<div class="modal-pad">${head('Menu categories')}<div class="category-grid">${categories.map(c=>`<button class="secondary" data-category="${esc(c)}">${esc(c==='All'?'All items':c==='Popular'?'Popular':c)}</button>`).join('')}</div></div>`,'categories');
}

let refreshingMenu=false,lastMenuResponse=null,lastCapabilities='';
async function refresh(){
 if(refreshingMenu)return;refreshingMenu=true;
 try{
  const response=await Deli.menu();
  const capabilities=Deli.mode+':'+Deli.config.checkout_enabled;
  if(response===lastMenuResponse&&capabilities===lastCapabilities)return;
  lastMenuResponse=response;lastCapabilities=capabilities;
  const signature=JSON.stringify([response.revision||response.items,response.ordering,response.connection_error,capabilities]);
  if(signature===menuSignature)return;
  menuSignature=signature;items=response.items;settings={checkout_enabled:false,...response.ordering};
  const browsingOnly=!Deli.connected||Deli.config.checkout_enabled!==true,closed=Deli.connected&&settings.open_now===false,paused=Deli.connected&&Deli.config.checkout_enabled===true&&(settings.accepting_orders===false||settings.checkout_enabled!==true);
  $('#prep-label').textContent=browsingOnly?'Browse the menu':closed?'Online pickup closed':paused?'Orders paused':'About '+settings.prep_minutes+' minutes';
  $('#ordering-alert').hidden=!response.connection_error&&!browsingOnly&&!closed&&!paused;
  $('#ordering-alert').textContent=response.connection_error?'Live ordering is temporarily unavailable. Your bag is saved.':browsingOnly?'Browse and customize here. For current ordering, use Weinberger’s ordering site.':closed?'Online pickup is currently closed. Your bag stays saved.':'New checkouts are paused. Your bag stays saved, and any secure payment page you already opened remains available until it expires.';
  renderMenu();renderBag();if(initialItem){const id=initialItem;initialItem='';initialComparison=false;if(item(id))openProduct(id,null,'none');else{urlItem='';syncDiscoveryURL('replace')}}else if(initialComparison){initialComparison=false;showComparison()}
 }catch(e){toast(e.message)}finally{refreshingMenu=false}
}
document.addEventListener('click',event=>{const button=event.target.closest('button[data-action="group-contribution"],button[data-action="leave-group"]');if(!button||button.disabled)return;if(button.dataset.action==='group-contribution')saveGroupContribution(button);else leaveGroup()},true);
document.addEventListener('click',event=>{const button=event.target.closest('button[data-action="save-notifications"]');if(button&&!button.disabled)saveNotifications(button)},true);
document.addEventListener('click',event=>{const button=event.target.closest('button[data-pickup-at]');if(!button||button.disabled)return;selectedPickupAt=button.dataset.pickupAt||null;checkout()},true);
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.usualSave!==undefined)return openSaveUsual(+b.dataset.usualSave);if(b.dataset.usualAdd)return addUsual(b.dataset.usualAdd);if(b.dataset.usualRename)return openRenameUsual(b.dataset.usualRename);if(b.dataset.usualDelete)return deleteUsual(b.dataset.usualDelete);if(b.dataset.compare)return toggleComparison(b.dataset.compare);if(b.dataset.ingredient){discoveryFilters.include=b.dataset.ingredient;$('#include-ingredients').value=discoveryFilters.include;category='All';savedOnly=false;query='';$('#search').value='';renderMenu('push');return goMenu()}if(b.dataset.product)return openProduct(b.dataset.product);if(b.dataset.favorite){const id=b.dataset.favorite;favorites.has(id)?favorites.delete(id):favorites.add(id);save('wd-platform-favorites',[...favorites]);renderMenu();return toast(favorites.has(id)?'Saved for next time.':'Removed from saved.')}if(b.dataset.category){category=b.dataset.category;savedOnly=false;renderMenu('push');if(dialog.open&&dialog.dataset.view==='categories')goMenu();return}if(b.dataset.choice){category=b.dataset.choice;savedOnly=false;query='';$('#search').value='';renderMenu('push');return goMenu()}if(b.dataset.remove!==undefined)return removeCartLine(+b.dataset.remove);if(b.dataset.qty!==undefined){cart[+b.dataset.qty].quantity+=+b.dataset.delta;cart=cart.filter(l=>l.quantity>0);return bagSave()}if(b.dataset.edit!==undefined)return openProduct(cart[+b.dataset.edit].menu_item_id,+b.dataset.edit);if(b.dataset.status!==undefined)return showOrder(history[+b.dataset.status]);if(b.dataset.reorder!==undefined){cart=structuredClone(history[+b.dataset.reorder].lines||[]);bagSave();openBag();return toast('Review your bag. Availability will be checked at checkout.')}if(b.dataset.view){document.querySelectorAll('.bottom-nav button').forEach(x=>x.classList.toggle('selected',x.dataset.view===b.dataset.view));if(b.dataset.view==='visit')return visit();if(b.dataset.view==='orders')return orders();savedOnly=b.dataset.view==='saved';category='All';query='';$('#search').value='';renderMenu('push');return goMenu()}switch(b.dataset.action){case'compare':return showComparison();case'clear-compare':compared=[];return renderMenu('push');case'clear-filters':return clearDiscovery();case'reset-menu':category='All';query='';savedOnly=false;$('#search').value='';return clearDiscovery();case'clear-customization':return clearCustomization();case'categories':return showCategories();case'share-comparison':return shareComparison();case'share-item':return shareItem();case'usual-save-confirm':return saveUsual(+b.dataset.lineIndex);case'usual-rename-confirm':return renameUsual(b.dataset.usualId);case'undo-remove':return undoCartRemoval();case'close':return close();case'bag':return openBag();case'browse':return goMenu();case'official-order':return officialOrder();case'pending-order':return showOrder(pending);case'plus':activeQuantity=Math.min(20,activeQuantity+1);return updateProductPrice();case'minus':activeQuantity=Math.max(1,activeQuantity-1);return updateProductPrice();case'add':return addProduct();case'checkout':return checkout();case'change-pickup':return changePickupTime();case'start-payment':return startPayment(b);case'retry-attempt-save':return retryAttemptSave(b);case'retry-recovery-save':return retryRecoverySave(b);case'retry-payment':return submitCheckout(b);case'refresh-order':return showOrder(trackedOrder)}});
$('#include-ingredients').value=discoveryFilters.include;$('#exclude-ingredients').value=discoveryFilters.exclude;$('#max-price').value=discoveryFilters.max;$('#search').value=query;$('#sort-menu').value=sortMode;
for(const [selector,key] of [['#include-ingredients','include'],['#exclude-ingredients','exclude'],['#max-price','max']])$(selector).addEventListener('input',e=>{discoveryFilters[key]=e.target.value.trim();renderMenu()});
$('#sort-menu').addEventListener('change',e=>{sortMode=e.target.value;renderMenu('push')});
$('#search').addEventListener('input',queueSearchEvent);
dialog.addEventListener('input',e=>{if(e.target.classList.contains('modifier-count'))updateProductPrice();if(e.target.id==='customization-search')filterCustomization(e.target.value)});
$('#search').addEventListener('input',e=>{query=e.target.value.trim();renderMenu()});$('#clear-search').onclick=()=>{query='';$('#search').value='';renderMenu();$('#search').focus()};$('#bag-button').onclick=openBag;$('#mobile-bag').onclick=openBag;$('#start-order').onclick=goMenu;$('#help-choose').onclick=choose;dialog.addEventListener('change',e=>{if(e.target.classList.contains('option-choice')&&e.target.checked){const group=activeProduct?.option_groups.find(g=>g.id===e.target.name);if(group?.selection_max===1)dialog.querySelectorAll(`[name="${group.id}"]`).forEach(other=>{if(other!==e.target)other.checked=false});reconcileIngredientChoice(e.target)}updateProductPrice()});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}});window.addEventListener('storage',e=>{if(e.key==='wd-platform-favorites'){const values=read('wd-platform-favorites',[]);favorites=new Set(Array.isArray(values)?values:[]);renderMenu()}if(e.key===window.DeliUsuals?.storageKey){usuals=window.DeliUsuals.load();if(savedOnly)renderMenu()}if(e.key==='wd-platform-bag'){removedLine=null;const value=read('wd-platform-bag',[]);cart=Array.isArray(value)?value:[];renderBag()}if(e.key==='wd-connected-orders-v1'){history=retainedHistory(read('wd-connected-orders-v1',[]))}if(e.key==='wd-pending-checkout-v1'){const value=read('wd-pending-checkout-v1',null);pending=value&&typeof value==='object'&&recordTime(value)>=recoveryCutoff()?value:null}if(e.key==='wd-checkout-attempt-v1'){const value=read('wd-checkout-attempt-v1',null);checkoutAttempt=value&&typeof value==='object'&&recordTime(value)>=recoveryCutoff()?value:null}refresh()});window.addEventListener('popstate',applyDiscoveryURL);window.addEventListener('focus',()=>{refresh();if(specificOrderRequested){const requested=privateOrderEntry(requestedOrderID);if(requested)showOrder(requested);return}if(pending)showOrder(pending)});
const groupBagObserver=new MutationObserver(decorateGroupBags);groupBagObserver.observe($('#bag-panel'),{childList:true,subtree:true});groupBagObserver.observe(dialog,{childList:true,subtree:true});
async function boot(){await refresh();decorateGroupBags();if(specificOrderRequested){const requested=privateOrderEntry(requestedOrderID);if(requested)return showOrder(requested);unavailableRequestedOrder();return}if(pending&&(checkoutReturnRequested||pending.status==='pending_payment'))showOrder(pending);else if(checkoutAttempt?.body)checkout()}
boot();setInterval(()=>{if(!document.hidden){if(dialog.open&&dialog.dataset.view==='status'&&trackedOrder)showOrder(trackedOrder);else refresh()}},12000);
