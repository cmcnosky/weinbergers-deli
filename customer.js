'use strict';
const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])), money=c=>'$'+(c/100).toFixed(2), read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const storedFavorites=read('wd-platform-favorites',[]);
let items=[],settings={accepting_orders:false,checkout_enabled:false,prep_minutes:20},category='All',query='',savedOnly=false,cart=read('wd-platform-bag',[]),favorites=new Set(Array.isArray(storedFavorites)?storedFavorites:[]),history=read('wd-connected-orders-v1',[]),pending=read('wd-pending-checkout-v1',null),checkoutAttempt=read('wd-checkout-attempt-v1',null),quote=null,checkoutKey=null,activeProduct=null,activeQuantity=1,editIndex=null,toastTimer,lastFocus,trackedOrder=null,trackedOrderSignature='',menuSignature='';
if(!Array.isArray(cart))cart=[];if(!Array.isArray(history))history=[];history=history.filter(entry=>entry&&typeof entry==='object'&&typeof entry.id==='string');if(!pending||typeof pending!=='object')pending=null;if(!checkoutAttempt||typeof checkoutAttempt!=='object')checkoutAttempt=null;
const officialOrderURL='https://weinbergersdeli.com/menu';
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
function lineState(line){const p=item(line.menu_item_id);return p?Deli.selectionState(p,line.option_ids||[]):{pendingPrice:true,pendingAvailability:true,requiresConfirmation:true,unitCents:null,selected:[]}}
function unit(line){return lineState(line).unitCents}
function itemPriceLabel(p){return p?.base_price_cents==null||p?.price_status==='unknown'||p?.requires_price_approval===true?'PRICE TO CONFIRM':p?.price_label||money(p?.base_price_cents||0)}
function optionPriceLabel(option){if(option.price_delta_cents==null||option.price_status==='unknown'||option.requires_price_approval===true)return'Price to confirm';if(option.availability_status==='needs_confirmation'||option.requires_availability_approval===true||option.requires_confirmation===true)return'Availability to confirm';if(option.price_delta_cents>0)return'+'+money(option.price_delta_cents);if(option.action==='omit')return'No price change';if(option.action==='preparation'||option.action==='substitute')return'No charge';return''}
function lineTotalLabel(line){const value=unit(line);return value==null?'Price to confirm':money(value*line.quantity)}
function confirmationReason(state){if(state.pendingPrice&&state.pendingAvailability)return'Price and availability to confirm';if(state.pendingPrice)return'Price to confirm';if(state.pendingAvailability)return'Availability to confirm';return''}
function bagSave(){save('wd-platform-bag',cart);renderBag()}
function renderMenu(){
 const builder=item('custom-build-your-own'),shortcuts=document.querySelector('.quick-ingredients');
 if(builder&&shortcuts&&!shortcuts.querySelector('[data-product="custom-build-your-own"]'))shortcuts.insertAdjacentHTML('beforeend','<button class="build-own-shortcut" data-product="custom-build-your-own">Build your own ↗</button>');
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
 $('#products').innerHTML=visible.length?visible.map(p=>`<article class="product ${p.sold_out?'sold-out':''} ${p.image?'':'text-product'} ${p.id==='custom-build-your-own'?'build-own-product':''}"><button class="product-main" data-product="${p.id}" aria-label="Customize ${esc(p.name)}, ${esc(itemPriceLabel(p))}${p.sold_out?', sold out':''}">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`:''}<div class="product-copy"><span class="product-index">${esc(p.category.toUpperCase())}</span><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p>${p.sold_out||p.popular||p.id==='custom-build-your-own'?`<span class="tag">${p.sold_out?'SOLD OUT':p.id==='custom-build-your-own'?'EVERY BREAD, MEAT, CHEESE & TOPPING':'POPULAR ITEM'}</span>`:''}</div><span class="price">${esc(itemPriceLabel(p))}<b aria-hidden="true">+</b></span></button><div class="product-tools"><button class="compare-toggle" data-compare="${p.id}" aria-pressed="${compared.includes(p.id)}" aria-label="${compared.includes(p.id)?'Remove from comparison':'Compare'} ${esc(p.name)}"><span aria-hidden="true">${compared.includes(p.id)?'✓':'+'}</span> ${compared.includes(p.id)?'Added to comparison':'Compare'}</button><button class="save-item" data-favorite="${p.id}" aria-pressed="${favorites.has(p.id)}" aria-label="${favorites.has(p.id)?'Unsave':'Save'} ${esc(p.name)}">${favorites.has(p.id)?'♥ Saved':'♡ Save'}</button></div></article>`).join(''):`<div class="empty-state"><h3>${savedOnly?'NO SAVED MATCHES':'NO MATCHES'}</h3><p>${savedOnly?'Save an item from the menu, or clear your filters.':'Try a broader ingredient or a higher price limit.'}</p><button class="secondary" data-action="reset-menu">Show the full menu</button></div>`;
 renderComparisonTray();
 syncDiscoveryURL();
}

function optionNames(line){
 const options=(item(line.menu_item_id)?.option_groups||[]).flatMap(g=>g.options),counts=new Map();
 (line.option_ids||[]).forEach(id=>counts.set(id,(counts.get(id)||0)+1));
 return [...counts].map(([id,n])=>{const o=options.find(x=>x.id===id);return o?(n>1?n+' × ':'')+o.name:''}).filter(Boolean).join(', ');
}

function lineNeedsReview(line){const p=item(line.menu_item_id);if(!p||p.sold_out)return true;try{Deli.validateOptions(p,line.option_ids||[]);return false}catch{return true}}
function bagHTML(){
 const n=cart.reduce((s,l)=>s+l.quantity,0),states=cart.map(lineState),confirmationNeeded=states.some(state=>state.requiresConfirmation),pricePending=states.some(state=>state.pendingPrice),subtotal=pricePending?null:cart.reduce((s,l)=>s+(unit(l)||0)*l.quantity,0),unavailable=cart.some(lineNeedsReview);
 const hasPending=Boolean(pending?.id&&pending?.token),hasAttempt=Boolean(checkoutAttempt?.body),integrationReady=Deli.connected&&Deli.config.checkout_enabled===true,canCheckout=integrationReady&&settings.checkout_enabled===true&&settings.accepting_orders!==false&&settings.open_now!==false,paused=integrationReady&&!canCheckout;
 const action=hasPending?'pending-order':hasAttempt||integrationReady?'checkout':'official-order',label=hasPending?'Check pending order ↗':hasAttempt?'Continue secure checkout ↗':unavailable?'Review item choices':confirmationNeeded?'Confirmation needed before checkout':canCheckout?'Review your order ↗':paused?(settings.open_now===false?'Online pickup is closed':'Online ordering paused'):'Order through the current site ↗';
 const recoveryButton=hasPending?'<button class="primary full" data-action="pending-order">Check pending order ↗</button>':hasAttempt?'<button class="primary full" data-action="checkout">Continue secure checkout ↗</button>':'';
 return `<div class="bag-top"><h2>YOUR ORDER</h2><span>${n} ${n===1?'item':'items'}</span></div>${!n?`<div class="empty-bag"><span class="bag-art" aria-hidden="true">—</span><strong>${hasPending?'ORDER STATUS PENDING':hasAttempt?'CHECKOUT SAVED':'YOUR ORDER IS EMPTY'}</strong><p>${hasPending?'Check payment and kitchen status before starting another order.':hasAttempt?'Continue the saved secure checkout request, or choose more items from the menu.':'Choose an item from the menu to get started.'}</p>${recoveryButton}</div>`:cart.map((l,i)=>{const state=lineState(l),reason=confirmationReason(state);return`<div class="cart-row"><div class="row-title"><span>${esc(item(l.menu_item_id)?.name||'Unavailable item')}${lineNeedsReview(l)?'<small> · Review choices</small>':reason?`<small class="confirmation-needed"> · ${esc(reason)}</small>`:''}</span><span>${lineTotalLabel(l)}</span></div>${optionNames(l)?`<p>${esc(optionNames(l))}</p>`:''}${l.note?`<p>${esc(l.note)}</p>`:''}<div class="cart-tools"><div class="quantity"><button data-qty="${i}" data-delta="-1" aria-label="Decrease ${esc(item(l.menu_item_id)?.name)} quantity">−</button><span>${l.quantity}</span><button data-qty="${i}" data-delta="1" ${l.quantity>=20?'disabled':''} aria-label="Increase ${esc(item(l.menu_item_id)?.name)} quantity">+</button></div><div class="cart-edit-actions">${item(l.menu_item_id)?`<button data-edit="${i}">Edit</button>`:''}<button data-remove="${i}">Remove</button></div></div></div>`}).join('')+`<div class="money-row"><span>${pricePending?'Order total':'Menu subtotal'}</span><strong>${pricePending?'Price to confirm':money(subtotal)}</strong></div><p class="fine">${hasPending?'Check the pending order before starting another checkout.':hasAttempt?'The saved secure checkout uses the total already shown.':unavailable?'An item or choice changed. Edit or remove the affected items before continuing.':confirmationNeeded?'Your custom choices are saved. The deli must confirm their availability and price before this order can be charged.':canCheckout?'Tax and the final total are confirmed by the order service.':'Your bag is saved here. Final availability and pricing are confirmed before you place it.'}</p><button class="primary full" data-action="${action}" ${(unavailable||confirmationNeeded||paused)&&!hasAttempt&&!hasPending?'disabled':''}>${label}</button>`}<div class="bag-meta">Pickup · 601 S Main Street</div>`;
}
function renderBag(){const before=cart.length;cart=cart.filter(l=>l&&typeof l==='object'&&typeof l.menu_item_id==='string'&&Number.isInteger(l.quantity)&&l.quantity>0&&l.quantity<=20&&Array.isArray(l.option_ids||[]));if(cart.length!==before)save('wd-platform-bag',cart);$('#bag-panel').innerHTML=bagHTML();const n=cart.reduce((s,l)=>s+l.quantity,0),pricePending=cart.some(line=>lineState(line).pendingPrice),subtotal=pricePending?null:cart.reduce((s,l)=>s+(unit(l)||0)*l.quantity,0);$('#bag-count').textContent=n;$('#bag-button').setAttribute('aria-label','Open bag, '+n+(n===1?' item':' items'));$('#mobile-bag').hidden=!n;$('#mobile-bag span').textContent=n+(n===1?' item · ':' items · ')+(pricePending?'Price to confirm':money(subtotal));if(dialog.open&&dialog.dataset.view==='bag')replaceDialog(`<div class="modal-pad">${head('Your order')}${bagHTML()}</div>`);}
function openBag(){open(`<div class="modal-pad">${head('Your order')}${bagHTML()}</div>`,'bag')}

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
function openProduct(id,index=null){
 const p=item(id);if(!p)return;activeProduct=p;editIndex=index;
 const existing=index===null?null:cart[index];activeQuantity=existing?.quantity||1;
 const selected=existing?.option_ids||(p.option_groups||[]).flatMap(group=>group.preselected_option_ids||[]),hasCustomization=(p.option_groups||[]).some(group=>group.customization);
 const groups=(p.option_groups||[]).map((group,groupIndex)=>groupMarkup(group,selected,groupIndex)).join('');
 const controls=hasCustomization?`<section class="customization-control"><div><div><p class="eyebrow">COMPLETE CUSTOMIZATION</p><h3>Choose your ingredients.</h3></div><button class="text-link" data-action="clear-customization">Reset custom choices</button></div><label for="customization-search">Find an ingredient or instruction<input id="customization-search" type="search" autocomplete="off" placeholder="Bread, turkey, Swiss, peppers…"></label><p id="customization-search-status" class="fine" aria-live="polite">Open a section below or search every available choice.</p></section>`:'';
 open(`${p.image?`<img class="detail-image" src="${esc(p.image)}" alt="${esc(p.name)}">`:''}<div class="modal-pad">${head(esc(p.name))}<div class="detail-meta"><span>${esc(p.category)}</span><strong>${esc(itemPriceLabel(p))}</strong></div><p class="detail-copy">${esc(p.description)}</p>${controls}${groups}<label class="field" for="special-note">Special request <span class="fine">Optional</span></label><textarea id="special-note" maxlength="180" placeholder="For example, sauce on the side">${esc(existing?.note||'')}</textarea><p class="fine allergy-note">Removing an ingredient does not make an item allergen-free. For allergies, speak with the deli before ordering.</p><div class="selection-review"><strong>Your choices</strong><p id="selection-summary"></p><p id="selection-confirmation" class="selection-confirmation" hidden></p></div></div><div class="modal-bottom"><div class="quantity"><button data-action="minus" aria-label="Decrease quantity">−</button><span id="item-quantity">${activeQuantity}</span><button data-action="plus" aria-label="Increase quantity">+</button></div><button class="primary" data-action="add" ${p.sold_out?'disabled':''}><span id="item-submit-label">${p.sold_out?'Sold out':index===null?'Add to order':'Save changes'}</span> <span id="item-total"></span></button></div>`,'product');updateProductPrice();
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
 const submit=dialog.querySelector('[data-action="add"]');
 submit.disabled=activeProduct.sold_out||missing.length>0||Boolean(validationError);
 $('#item-submit-label').textContent=activeProduct.sold_out?'Sold out':missing.length?(/^choose\b/i.test(missing[0].name)?missing[0].name:'Choose '+missing[0].name):validationError?'Review conflicting choices':editIndex===null?'Add to order':'Save changes';
 for(const g of activeProduct.option_groups||[]){
  const count=ids.filter(id=>g.options.some(o=>o.id===id)).length;
  if(g.selection_max>1)dialog.querySelectorAll(`[data-group="${g.id}"] .option-choice`).forEach(input=>{input.disabled=!input.checked&&count>=g.selection_max});
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

function officialOrder(){window.open(officialOrderURL,'_blank','noopener,noreferrer')}
function cartFingerprint(lines=cart){return JSON.stringify(lines.map(line=>({menu_item_id:line.menu_item_id,quantity:line.quantity,option_ids:line.option_ids||[],note:line.note||''})))}
function saveHistory(entry){const index=history.findIndex(item=>item.id===entry.id);if(index>=0)history[index]={...history[index],...entry};else history.unshift(entry);history=history.slice(0,20);save('wd-connected-orders-v1',history)}
function saveCheckoutAttempt(value){checkoutAttempt=value;save('wd-checkout-attempt-v1',value)}
const loopbackHosts=['localhost','127.0.0.1','[::1]'];
function loopbackAPI(){try{return loopbackHosts.includes(new URL(Deli.apiRoot||location.origin,location.href).hostname)}catch{return false}}
function secureCheckoutURL(value){if(typeof value!=='string'||!value.trim())return'';try{const url=new URL(value,location.href),localCheckout=loopbackHosts.includes(url.hostname),stripeCheckout=url.protocol==='https:'&&url.hostname==='checkout.stripe.com',localTest=loopbackAPI()&&localCheckout&&['http:','https:'].includes(url.protocol);return !url.username&&!url.password&&(stripeCheckout||localTest)?url.href:''}catch{return''}}
function checkoutLines(currentQuote){return `<div class="checkout-lines">${currentQuote.items.map(line=>`<p><span>${line.quantity} × ${esc(line.name)}<small>${esc([...(line.option_names||[]),line.note].filter(Boolean).join(' · '))}</small></span><strong>${money(line.line_cents)}</strong></p>`).join('')}</div><div class="money-row"><span>Subtotal</span><span>${money(currentQuote.subtotal_cents)}</span></div><div class="money-row"><span>Sales tax</span><span>${money(currentQuote.tax_cents)}</span></div><div class="money-row total"><span>Total</span><span>${money(currentQuote.total_cents)}</span></div>`}
function renderCheckoutReview(message=''){
 const attempt=checkoutAttempt;if(!attempt?.quote)return;
 quote=attempt.quote;checkoutKey=attempt.idempotency_key;
 if(attempt.body){
  replaceDialog(`<div class="modal-pad">${head('Continue secure checkout')}<p class="fine">Pickup for ${esc(attempt.body.pickup_name)} · About ${attempt.quote.prep_minutes} minutes</p>${checkoutLines(attempt.quote)}${message?`<p class="info-line">${esc(message)}</p>`:'<p class="info-line">This exact checkout is saved. Retrying sends the same checkout, so it cannot create a second order.</p>'}<button class="primary full" data-action="retry-payment">Continue to secure payment · ${money(attempt.quote.total_cents)}</button><button class="text-link full" data-action="close" style="margin-top:10px">Keep browsing</button></div>`);
  return;
 }
 replaceDialog(`<div class="modal-pad">${head('Review your order')}<p class="fine">Pickup at 601 S Main Street · About ${quote.prep_minutes} minutes</p>${checkoutLines(quote)}<div class="checkout-customer"><label class="field" for="pickup-name">Pickup name</label><input id="pickup-name" autocomplete="name" maxlength="80" required><div class="checkout-contact"><label class="field" for="pickup-email">Email <span class="fine">Optional</span></label><input id="pickup-email" type="email" autocomplete="email" maxlength="254"><label class="field" for="pickup-phone">Phone <span class="fine">Optional</span></label><input id="pickup-phone" type="tel" autocomplete="tel" maxlength="30"></div></div><p class="fine">Continue to the secure payment page. Your order reaches the kitchen only after payment is confirmed.</p><button class="primary full" data-action="start-payment">Continue to secure payment · ${money(quote.total_cents)}</button></div>`);
}

async function checkout(){
 if(!cart.length&&!checkoutAttempt?.body)return;
 if(!checkoutAttempt?.body&&cart.some(line=>lineState(line).requiresConfirmation)){open(`<div class="modal-pad">${head('Confirmation needed')}<p class="detail-copy">One or more custom choices still need the deli to confirm availability or price. Your choices are saved, but this order cannot be charged until those details are approved.</p><button class="primary full" data-action="bag">Review your order</button></div>`,'checkout');return}
 if(!Deli.connected){if(checkoutAttempt?.body){open(`<div class="modal-pad">${head('Checkout saved')}<p>Your secure checkout request is saved, but online ordering cannot be reached right now.</p><p class="info-line">Try again when the connection is restored. No order is treated as paid until payment is confirmed.</p><button class="secondary full" data-action="close">Back to the menu</button></div>`,'checkout');return}return officialOrder()}
 if(Deli.config.checkout_enabled!==true&&!checkoutAttempt?.body)return officialOrder();
 if(!checkoutAttempt?.body&&(settings.checkout_enabled!==true||settings.accepting_orders===false||settings.open_now===false)){open(`<div class="modal-pad">${head(settings.open_now===false?'Online pickup is closed':'Online ordering paused')}<p>Your bag is saved. Check back when online pickup is accepting orders.</p><button class="secondary full" data-action="close">Back to the menu</button></div>`,'checkout');return}
 open(`<div class="modal-pad">${head('Review your order')}<p>Checking current prices and availability…</p></div>`,'checkout');
 try{
  const validAttempt=checkoutAttempt?.quote&&checkoutAttempt?.idempotency_key&&Array.isArray(checkoutAttempt?.lines),sameBag=validAttempt&&checkoutAttempt.cart_fingerprint===cartFingerprint(),notExpired=!checkoutAttempt?.quote?.expires_at||new Date(checkoutAttempt.quote.expires_at)>new Date();
  if(validAttempt&&(checkoutAttempt.body||sameBag&&notExpired))renderCheckoutReview();
  else{saveCheckoutAttempt(null);quote=await Deli.request('/quotes','POST',{fulfillment:'pickup',items:cart});checkoutKey=Deli.uid('checkout_');saveCheckoutAttempt({quote,idempotency_key:checkoutKey,cart_fingerprint:cartFingerprint(),lines:structuredClone(cart),body:null,created_at:new Date().toISOString()});renderCheckoutReview()}
 }catch(e){replaceDialog(`<div class="modal-pad">${head('Update your order')}<p>${esc(e.message)}</p><button class="primary full" style="margin-top:20px" data-action="bag">Back to your bag</button></div>`);await refresh()}
}

async function submitCheckout(button){
 const attempt=checkoutAttempt;if(!attempt?.body)return checkout();
 button.disabled=true;button.textContent='Opening secure payment…';
 try{
  const response=await Deli.request('/checkouts','POST',attempt.body),paymentURL=response.checkout_url===null?'':secureCheckoutURL(response.checkout_url);
  if(!response.order_id||!response.lookup_token||(response.checkout_url!==null&&!paymentURL))throw Object.assign(new Error('The payment service returned an incomplete or unsafe response.'),{code:'invalid_checkout_response'});
  pending={id:response.order_id,token:response.lookup_token,checkout_url:paymentURL,checkout_expires_at:response.checkout_expires_at,payment_status:response.payment_status,status:response.status,lines:structuredClone(attempt.lines),cart_fingerprint:attempt.cart_fingerprint,time:new Date().toISOString(),total:attempt.quote.total_cents,pickup_name:attempt.body.pickup_name};
  save('wd-pending-checkout-v1',pending);saveHistory(pending);saveCheckoutAttempt(null);if(paymentURL)location.assign(paymentURL);else await showOrder(pending);
 }catch(error){
  if(['quote_expired','item_sold_out','ordering_paused'].includes(error.code)){saveCheckoutAttempt(null);replaceDialog(`<div class="modal-pad">${head('Review your order')}<p>${esc(error.message)}</p><p class="info-line">Your bag is unchanged. Review it to get a new total before trying again.</p><button class="primary full" data-action="bag">Back to your bag</button></div>`);return}
  renderCheckoutReview(error.message+' Retrying uses the same protected request, so it will not create a second order.');
 }
}

async function startPayment(button){
 const name=$('#pickup-name')?.value.trim(),email=$('#pickup-email')?.value.trim(),phone=$('#pickup-phone')?.value.trim();
 if(!name){toast('Enter the name for pickup.');$('#pickup-name')?.focus();return}
 if(email&&!$('#pickup-email').checkValidity()){toast('Enter a valid email address.');$('#pickup-email').focus();return}
 const body={quote_id:quote.quote_id,idempotency_key:checkoutKey,pickup_name:name};if(email)body.email=email;if(phone)body.phone=phone;
 saveCheckoutAttempt({...checkoutAttempt,body});await submitCheckout(button);
}

function paidStatus(value){return ['paid','partially_refunded','refunded'].includes(value)}
async function showOrder(entry){
 if(!entry?.id||!entry?.token)return;
 trackedOrder=entry;
 try{
  const response=await Deli.request('/orders/'+encodeURIComponent(entry.id),'GET',undefined,entry.token),order=response.order||response;
  const current={...entry,status:order.status,payment_status:order.payment_status,total:order.total_cents??entry.total,pickup_name:order.pickup_name||entry.pickup_name,checkout_url:Object.prototype.hasOwnProperty.call(order,'checkout_url')?secureCheckoutURL(order.checkout_url):entry.checkout_url,checkout_expires_at:Object.prototype.hasOwnProperty.call(order,'checkout_expires_at')?order.checkout_expires_at:entry.checkout_expires_at,updated_at:order.updated_at,time:entry.time||order.created_at};
  saveHistory(current);
  const paid=paidStatus(order.payment_status),failed=['payment_failed','failed','expired'].includes(order.payment_status)||['payment_failed','expired'].includes(order.status),disputed=order.payment_status==='disputed';
  if(paid&&pending?.id===entry.id){if(cartFingerprint()===pending.cart_fingerprint){cart=[];save('wd-platform-bag',cart)}pending=null;save('wd-pending-checkout-v1',null);renderBag()}
  if(failed&&pending?.id===entry.id){pending=null;save('wd-pending-checkout-v1',null);renderBag()}
  const signature=JSON.stringify([order.status,order.payment_status,order.updated_at,order.refunded_cents,order.timeline,order.checkout_url,order.checkout_expires_at]);
  if(dialog.open&&dialog.dataset.view==='status'&&signature===trackedOrderSignature)return;
  trackedOrder=current;trackedOrderSignature=signature;
  const states=['new','preparing','ready','completed'],names=['Order received','Preparing your order','Ready for pickup','Picked up'],index=states.indexOf(order.status);
  const returnURL=secureCheckoutURL(current.checkout_url);
  const expiry=current.checkout_expires_at?new Date(current.checkout_expires_at):null,expiryText=expiry&&!Number.isNaN(expiry.valueOf())?expiry.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'';
  let title='Payment confirmation pending',body=`<p class="info-line">The kitchen has not received this order yet. Payment confirmation can take a moment.</p>${returnURL?`<a class="primary full" href="${esc(returnURL)}">Return to secure payment ↗</a><p class="fine">This payment page remains available ${expiryText?'until '+esc(expiryText):'until it expires'}, even if new orders are paused.</p>`:'<p class="info-line">The secure payment link is no longer available. Your bag remains saved while this status is checked.</p>'}`;
  if(failed){title='Payment not completed';body='<p class="info-line">Your bag is still saved. Review it before trying payment again.</p><button class="primary full" data-action="bag">Review your bag</button>'}
  if(disputed){title='Payment under review';body='<p class="info-line">The payment processor reported a dispute on this order. Call the deli if you need help with the order or payment record.</p><a class="secondary full" href="tel:+18176705729">Call the deli</a>'}
  if(paid){title=order.status==='cancelled'?'Order cancelled':order.status==='ready'?'Your order is ready':order.status==='completed'?'Pickup complete':'Order received';body=`<div class="success-circle" aria-hidden="true">✓</div>${order.status==='cancelled'?'<p class="info-line">This order was cancelled. Any refund status is shown by the payment record.</p>':`<ol class="step-list">${states.map((state,i)=>`<li class="${i<index?'done':i===index?'current':''}">${names[i]}<small>${i===index?'Current kitchen status':i<index?'Complete':'Waiting'}</small></li>`).join('')}</ol>`}`}
  const html=`<div class="modal-pad">${head(title)}<p><strong>${esc(order.id)}</strong> · ${esc(order.pickup_name||entry.pickup_name||'Pickup')}</p><p class="fine">${money(order.total_cents??entry.total??0)} · Main Street pickup</p>${body}<button class="secondary full" data-action="refresh-order">Refresh status</button><button class="text-link full" data-action="close" style="margin-top:10px">Back to the menu</button></div>`;
  if(dialog.open&&dialog.dataset.view==='status')replaceDialog(html);else open(html,'status');
 }catch(e){
  const returnURL=secureCheckoutURL(entry.checkout_url),expiry=entry.checkout_expires_at?new Date(entry.checkout_expires_at):null,expired=expiry&&!Number.isNaN(expiry.valueOf())&&expiry<=new Date();
  const html=`<div class="modal-pad">${head('Status temporarily unavailable')}<p class="info-line">We could not refresh payment or kitchen status. Your bag and order details are still saved.</p>${returnURL&&!expired?`<a class="primary full" href="${esc(returnURL)}">Return to secure payment ↗</a>`:''}<button class="secondary full" data-action="refresh-order">Try status again</button><button class="text-link full" data-action="close" style="margin-top:10px">Back to the menu</button></div>`;
  if(dialog.open&&dialog.dataset.view==='status')replaceDialog(html);else open(html,'status');toast(e.message)
 }
}

function orders(){open(`<div class="modal-pad">${head('Your orders')}<p class="fine">We securely check each order’s current status. Menu prices and availability are checked again when you reorder.</p>${history.length?history.map((entry,i)=>`<div class="order-history"><header><span>${esc(entry.id)}</span><span>${money(entry.total||0)}</span></header><p>${(entry.lines||[]).reduce((sum,line)=>sum+line.quantity,0)} items · ${new Date(entry.time).toLocaleDateString()} · ${esc((entry.payment_status||entry.status||'pending').replaceAll('_',' '))}</p><div class="actions"><button class="secondary" data-status="${i}">View status</button>${paidStatus(entry.payment_status)?`<button class="secondary" data-reorder="${i}">Order again ↗</button>`:''}</div></div>`).join(''):'<div class="empty-state"><h3>No online orders yet</h3><p>Orders placed here will appear after secure checkout begins.</p><button class="primary" data-action="browse">Browse menu</button></div>'}</div>`,'orders')}
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
 const cells=chosen.map(p=>`<section class="comparison-card"><div class="comparison-image">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}">`:''}<button data-compare="${p.id}" aria-label="Remove ${esc(p.name)} from comparison">×</button></div><p class="eyebrow">${esc(p.category)}</p><h3>${esc(p.name)}</h3><p class="comparison-price">${esc(itemPriceLabel(p))}${p.base_price_cents!=null&&p.variable_price?'<small>Starting price</small>':p.base_price_cents==null?'<small>Set choices, then confirm with the deli</small>':''}</p><div class="comparison-description"><h4>Ingredients & bread</h4><p>${esc(p.description)||'No description listed. Ask the deli for details.'}</p></div><button class="primary full" data-product="${p.id}">Choose ${esc(p.short_name||p.name)} ↗</button></section>`).join('');
 open(`<div class="modal-pad">${head('Compare your choices')}<p class="comparison-intro">Keep the ingredients and prices side by side. Choose an item to set its options.</p><div class="comparison-grid" style="--compare-columns:${chosen.length}">${cells}</div><div class="comparison-footer"><button class="text-link" data-action="browse">Back to the menu</button><button class="secondary" data-action="share-comparison">Copy comparison link ↗</button></div><div id="comparison-share" class="comparison-share" hidden><label for="comparison-url">Comparison link</label><input id="comparison-url" type="url" readonly value="${esc(location.href)}"><p>Copy this address to share these choices and filters.</p></div><p class="fine">Prices marked + vary with options. Menu descriptions may not list every ingredient. For allergies, speak with the deli.</p></div>`,'compare');
}

function shareComparison(){
 const box=$('#comparison-share'),field=$('#comparison-url');
 if(!box||!field)return;
 box.hidden=false;field.value=location.href;field.focus();field.select();
 const message=box.querySelector('p');
 message.textContent='Copy this address to share these choices and filters.';
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(field.value).then(()=>{if(box.isConnected)message.textContent='Link copied. Share it to open this same comparison.'}).catch(()=>{});
}

function showCategories(){
 const categories=['All','Popular',...new Set(items.map(p=>p.category))];
 open(`<div class="modal-pad">${head('Menu categories')}<div class="category-grid">${categories.map(c=>`<button class="secondary" data-category="${esc(c)}">${esc(c==='All'?'All items':c==='Popular'?'Popular':c)}</button>`).join('')}</div></div>`,'categories');
}

async function refresh(){
 try{
  const response=await Deli.menu(),signature=JSON.stringify([response.items,response.ordering,response.connection_error]);
  if(signature===menuSignature)return;
  menuSignature=signature;items=response.items;settings={checkout_enabled:false,...response.ordering};
  const browsingOnly=!Deli.connected||Deli.config.checkout_enabled!==true,closed=Deli.connected&&settings.open_now===false,paused=Deli.connected&&Deli.config.checkout_enabled===true&&(settings.accepting_orders===false||settings.checkout_enabled!==true);
  $('#prep-label').textContent=browsingOnly?'Browse the menu':closed?'Online pickup closed':paused?'Orders paused':'About '+settings.prep_minutes+' minutes';
  $('#ordering-alert').hidden=!response.connection_error&&!browsingOnly&&!closed&&!paused;
  $('#ordering-alert').textContent=response.connection_error?'Live ordering is temporarily unavailable. Your bag is saved.':browsingOnly?'Browse and customize here. For current ordering, use Weinberger’s ordering site.':closed?'Online pickup is currently closed. Your bag stays saved.':'New checkouts are paused. Your bag stays saved, and any secure payment page you already opened remains available until it expires.';
  renderMenu();renderBag();if(initialComparison){initialComparison=false;showComparison()}
 }catch(e){toast(e.message)}
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.compare)return toggleComparison(b.dataset.compare);if(b.dataset.ingredient){discoveryFilters.include=b.dataset.ingredient;$('#include-ingredients').value=discoveryFilters.include;category='All';savedOnly=false;query='';$('#search').value='';renderMenu();return goMenu()}if(b.dataset.product)return openProduct(b.dataset.product);if(b.dataset.favorite){const id=b.dataset.favorite;favorites.has(id)?favorites.delete(id):favorites.add(id);save('wd-platform-favorites',[...favorites]);renderMenu();return toast(favorites.has(id)?'Saved for next time.':'Removed from saved.')}if(b.dataset.category){category=b.dataset.category;savedOnly=false;renderMenu();if(dialog.open&&dialog.dataset.view==='categories')goMenu();return}if(b.dataset.choice){category=b.dataset.choice;savedOnly=false;query='';$('#search').value='';renderMenu();return goMenu()}if(b.dataset.remove!==undefined){cart.splice(+b.dataset.remove,1);return bagSave()}if(b.dataset.qty!==undefined){cart[+b.dataset.qty].quantity+=+b.dataset.delta;cart=cart.filter(l=>l.quantity>0);return bagSave()}if(b.dataset.edit!==undefined)return openProduct(cart[+b.dataset.edit].menu_item_id,+b.dataset.edit);if(b.dataset.status!==undefined)return showOrder(history[+b.dataset.status]);if(b.dataset.reorder!==undefined){cart=structuredClone(history[+b.dataset.reorder].lines||[]);bagSave();openBag();return toast('Review your bag. Availability will be checked at checkout.')}if(b.dataset.view){document.querySelectorAll('.bottom-nav button').forEach(x=>x.classList.toggle('selected',x.dataset.view===b.dataset.view));if(b.dataset.view==='visit')return visit();if(b.dataset.view==='orders')return orders();savedOnly=b.dataset.view==='saved';category='All';query='';$('#search').value='';renderMenu();return goMenu()}switch(b.dataset.action){case'compare':return showComparison();case'clear-compare':compared=[];renderMenu();return;case'clear-filters':return clearDiscovery();case'reset-menu':category='All';query='';savedOnly=false;$('#search').value='';return clearDiscovery();case'clear-customization':return clearCustomization();case'categories':return showCategories();case'share-comparison':return shareComparison();case'close':return close();case'bag':return openBag();case'browse':return goMenu();case'official-order':return officialOrder();case'pending-order':return showOrder(pending);case'plus':activeQuantity=Math.min(20,activeQuantity+1);return updateProductPrice();case'minus':activeQuantity=Math.max(1,activeQuantity-1);return updateProductPrice();case'add':return addProduct();case'checkout':return checkout();case'start-payment':return startPayment(b);case'retry-payment':return submitCheckout(b);case'refresh-order':return showOrder(trackedOrder)}});
$('#include-ingredients').value=discoveryFilters.include;$('#exclude-ingredients').value=discoveryFilters.exclude;$('#max-price').value=discoveryFilters.max;$('#search').value=query;
for(const [selector,key] of [['#include-ingredients','include'],['#exclude-ingredients','exclude'],['#max-price','max']])$(selector).addEventListener('input',e=>{discoveryFilters[key]=e.target.value.trim();renderMenu()});
$('#sort-menu').addEventListener('change',e=>{sortMode=e.target.value;renderMenu()});
dialog.addEventListener('input',e=>{if(e.target.classList.contains('modifier-count'))updateProductPrice();if(e.target.id==='customization-search')filterCustomization(e.target.value)});
$('#search').addEventListener('input',e=>{query=e.target.value.trim();renderMenu()});$('#clear-search').onclick=()=>{query='';$('#search').value='';renderMenu();$('#search').focus()};$('#bag-button').onclick=openBag;$('#mobile-bag').onclick=openBag;$('#start-order').onclick=goMenu;$('#help-choose').onclick=choose;dialog.addEventListener('change',e=>{if(e.target.classList.contains('option-choice')&&e.target.checked){const group=activeProduct?.option_groups.find(g=>g.id===e.target.name);if(group?.selection_max===1)dialog.querySelectorAll(`[name="${group.id}"]`).forEach(other=>{if(other!==e.target)other.checked=false});reconcileIngredientChoice(e.target)}updateProductPrice()});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}});window.addEventListener('storage',e=>{if(e.key==='wd-platform-favorites'){const values=read('wd-platform-favorites',[]);favorites=new Set(Array.isArray(values)?values:[]);renderMenu()}if(e.key==='wd-platform-bag'){const value=read('wd-platform-bag',[]);cart=Array.isArray(value)?value:[];renderBag()}if(e.key==='wd-connected-orders-v1'){const value=read('wd-connected-orders-v1',[]);history=Array.isArray(value)?value.filter(entry=>entry&&typeof entry==='object'&&typeof entry.id==='string'):[]}if(e.key==='wd-pending-checkout-v1'){const value=read('wd-pending-checkout-v1',null);pending=value&&typeof value==='object'?value:null}if(e.key==='wd-checkout-attempt-v1'){const value=read('wd-checkout-attempt-v1',null);checkoutAttempt=value&&typeof value==='object'?value:null}refresh()});window.addEventListener('focus',()=>{refresh();if(pending)showOrder(pending)});
async function boot(){try{await Deli.init()}catch{}await refresh();const params=new URLSearchParams(location.search);if(pending&&(params.has('checkout')||params.has('payment')||params.has('session_id')||pending.status==='pending_payment'))showOrder(pending);else if(checkoutAttempt?.body)checkout()}
boot();setInterval(()=>{if(!document.hidden){if(dialog.open&&dialog.dataset.view==='status'&&trackedOrder)showOrder(trackedOrder);else refresh()}},12000);
