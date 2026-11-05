'use strict';

(function(){
 const $=selector=>document.querySelector(selector),esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])),money=cents=>'$'+(Number(cents||0)/100).toFixed(2);
 const stateKey='wd-group-order-access-v1',draftKey='wd-group-order-draft-v1',contextKey='wd-group-context-v1',attemptKey='wd-group-checkout-attempt-v1';
 let access=read(stateKey,null),invite=null,current=null,products=new Map();

 function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
 function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
 function notice(message,error=false){const target=$('#group-notice');target.textContent=message;target.classList.toggle('error',error);target.hidden=false}
 function copyLink(field,report,success){field.select();const fallback=()=>report('Link selected. Copy it to save or share privately.');try{const result=navigator.clipboard?.writeText(field.value);if(!result||typeof result.then!=='function'){fallback();return Promise.resolve(false)}return result.then(()=>{report(success);return true}).catch(()=>{fallback();return false})}catch{fallback();return Promise.resolve(false)}}
 function copyFeedback(message){const target=$('#group-copy-feedback');if(target){target.textContent=message;target.hidden=false}}
 function validToken(value){return typeof value==='string'&&value.length>=16&&value.length<=512&&!/[\s?#&]/.test(value)}
 function validID(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{4,80}$/.test(value)}
 function dateLabel(value){if(!value)return'';const date=new Date(value);return Number.isNaN(date.valueOf())?'':date.toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
 function groupID(group){return group?.id||group?.group_id}
 function lineName(line){return line?.name||products.get(line?.menu_item_id)?.name||'Menu item'}
 function lineChoices(line){
  if(Array.isArray(line?.option_names)&&line.option_names.length)return line.option_names.join(', ');
  const options=(products.get(line?.menu_item_id)?.option_groups||[]).flatMap(group=>group.options||[]),counts=new Map();for(const id of line?.option_ids||[])counts.set(id,(counts.get(id)||0)+1);
  return[...counts].map(([id,count])=>{const option=options.find(value=>value.id===id);return option?(count>1?count+' × ':'')+option.name:''}).filter(Boolean).join(', ');
 }
 function contributionLine(line){const choices=lineChoices(line),note=String(line?.note||'').trim();return`<li><strong>${Number(line?.quantity||0)} × ${esc(lineName(line))}</strong>${choices?`<span>${esc(choices)}</span>`:''}${note?`<span>Request: ${esc(note)}</span>`:''}</li>`}
 function hasPrivateOrderAccess(orderID){const pending=read('wd-pending-checkout-v1',null),history=read('wd-connected-orders-v1',[]);return Boolean(orderID&&((pending?.id===orderID&&pending?.token)||(Array.isArray(history)&&history.some(entry=>entry?.id===orderID&&entry?.token))))}
 function clearFragment(){if(location.hash)history.replaceState(null,'',location.pathname+location.search)}

 function consumeInvite(){
  const params=new URLSearchParams(location.hash.slice(1)),id=params.get('group'),token=params.get('invite');
  if(validID(id)&&validToken(token))invite={group_id:id,token};
  clearFragment();
 }

 function connected(){return Deli.connected&&Deli.apiRoot}
 function safeCheckoutURL(value){if(typeof value!=='string')return'';try{const url=new URL(value,location.href),loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname),stripe=url.protocol==='https:'&&url.hostname==='checkout.stripe.com';return !url.username&&!url.password&&(stripe||loopback&&['http:','https:'].includes(url.protocol))?url.href:''}catch{return''}}
 function persistOrderRecovery(response,attempt,body){
  if(!response.order_id||!response.lookup_token)return false;
  const entry={id:response.order_id,token:response.lookup_token,checkout_url:safeCheckoutURL(response.checkout_url),checkout_expires_at:response.checkout_expires_at,payment_status:response.payment_status,status:response.status,lines:attempt.quote.items||[],time:new Date().toISOString(),total:attempt.quote.total_cents,pickup_name:body.pickup_name,email:body.email||'',phone:body.phone||''};
  if(!write('wd-pending-checkout-v1',entry)||read('wd-pending-checkout-v1',null)?.token!==entry.token)return false;
  const history=read('wd-connected-orders-v1',[]),next=[entry,...(Array.isArray(history)?history:[]).filter(item=>item?.id!==entry.id)].slice(0,50);write('wd-connected-orders-v1',next);return true;
 }
 function saveDraft(form){
  const data=Object.fromEntries(new FormData(form));if(write(draftKey,data))notice('Saved on this device. It has not been sent or made shareable. Group ordering is not accepting requests here yet. Use the current ordering site or call the deli for today’s order.');else notice('This browser could not save the plan. Nothing was sent. Use the current ordering site or call the deli for today’s order.',true);
 }

 function showJoin(){
  $('#join-panel').hidden=false;$('#create-panel').hidden=true;$('#dashboard').hidden=true;
  $('#join-group-id').textContent=invite.group_id;$('#participant-name').focus();
 }

 function showOrganizer(group){
  current=group;const id=groupID(group),deadline=dateLabel(group.deadline_at),pickup=dateLabel(group.requested_pickup_at),participants=group.participants||[],savedAttempt=read(attemptKey,null),sameAttempt=savedAttempt?.group_id===id;
  $('#create-panel').hidden=true;$('#join-panel').hidden=true;$('#dashboard').hidden=false;
  const share=access?.invite_token?`${location.origin}${location.pathname}#group=${encodeURIComponent(id)}&invite=${encodeURIComponent(access.invite_token)}`:'';
  $('#dashboard').innerHTML=`<div class="expansion-panel group-summary"><p class="expansion-kicker">GROUP LUNCH</p><h2>${esc(group.name||'Group order')}</h2><dl><div><dt>Organizer</dt><dd>${esc(group.organizer_name||'')}</dd></div><div><dt>Contributions close</dt><dd>${esc(deadline||'Set by organizer')}</dd></div><div><dt>Requested pickup</dt><dd>${esc(pickup||'First available')}</dd></div><div><dt>Status</dt><dd>${esc(String(group.status||'open').replaceAll('_',' '))}</dd></div></dl>${share?`<label for="group-share">Private invitation link</label><div class="copy-row"><input id="group-share" value="${esc(share)}" readonly><button class="expansion-secondary" data-group-action="copy">Copy</button></div><p class="form-help">Anyone with this link can join this lunch. The private invitation stays after the # and is never sent in the page request.</p><p id="group-copy-feedback" class="form-help" role="status" aria-live="polite" hidden></p>`:''}</div><section class="expansion-panel"><div class="panel-heading"><div><p class="expansion-kicker">CONTRIBUTIONS</p><h2>${participants.length} ${participants.length===1?'PERSON':'PEOPLE'}</h2></div><button class="expansion-secondary" data-group-action="refresh">Refresh</button></div>${participants.length?participants.map(person=>`<article class="participant"><div><h3>${esc(person.display_name||'Participant')}</h3><p>${(person.items||[]).reduce((sum,line)=>sum+Number(line.quantity||0),0)} items</p></div><ul>${(person.items||[]).map(contributionLine).join('')||'<li>Nothing added yet</li>'}</ul></article>`).join(''):'<p>No one has added a sandwich yet. Send the private invitation link when you are ready.</p>'}${group.status==='open'?'<button class="expansion-primary full" data-group-action="quote">Close contributions and review total</button>':group.status==='quoted'&&sameAttempt&&!savedAttempt.quote?'<button class="expansion-primary full" data-group-action="quote">Recover finalized total</button>':''}</section><section class="expansion-panel" id="group-checkout" hidden></section>`;
  if(group.payment||!['open','quoted'].includes(group.status))paymentPanel(group);else if(sameAttempt&&savedAttempt.quote)checkoutPanel(savedAttempt.quote);
 }

 async function createGroup(form){
  if(!connected())return saveDraft(form);
  const data=Object.fromEntries(new FormData(form)),name=String(data.name||'').trim(),organizer=String(data.organizer_name||'').trim(),deadline=new Date(data.deadline_at),pickup=data.requested_pickup_at?new Date(data.requested_pickup_at):null;
  if(name.length<2){notice('Give this group a name.',true);form.elements.name.focus();return}if(!organizer){notice('Enter the organizer’s name.',true);form.elements.organizer_name.focus();return}if(Number.isNaN(deadline.valueOf())||deadline<=new Date()){notice('Choose a future contribution deadline.',true);form.elements.deadline_at.focus();return}if(pickup&&(Number.isNaN(pickup.valueOf())||pickup<=deadline)){notice('Requested pickup must be after the contribution deadline.',true);form.elements.requested_pickup_at.focus();return}
  const body={name,organizer_name:organizer,deadline_at:deadline.toISOString()};if(pickup)body.requested_pickup_at=pickup.toISOString();
  const button=form.querySelector('button[type="submit"]');button.disabled=true;
  try{
   const response=await Deli.request('/groups','POST',body),group=response.group||response,id=groupID(group);
   if(!validID(id)||!validToken(response.organizer_token)||!validToken(response.invite_token))throw new Error('The group service returned an incomplete response.');
   access={group_id:id,organizer_token:response.organizer_token,invite_token:response.invite_token};const stored=write(stateKey,access);
   showOrganizer(group);notice(stored?'Group created. Send the private invitation link when you are ready.':'Group created, but this browser could not retain the private organizer access. Keep this page open and copy the invitation now.',!stored);
  }catch(error){notice(error.message,true);button.disabled=false}
 }

 async function joinGroup(form){
  if(!invite||!connected())return notice('This private group is not accepting additions here yet. Ask the organizer for the current ordering link or call them directly.',true);
  const displayName=String(new FormData(form).get('display_name')||'').trim(),button=form.querySelector('button[type="submit"]');button.disabled=true;
  if(!displayName){button.disabled=false;notice('Enter the name the organizer should see.',true);form.elements.display_name.focus();return}
  try{
   const response=await Deli.request(`/groups/${encodeURIComponent(invite.group_id)}/participants`,'POST',{display_name:displayName},invite.token),participant=response.participant||response;
   if(!validID(participant.id||participant.participant_id)||!validToken(response.participant_token))throw new Error('The group service returned an incomplete participant response.');
   const context={group_id:invite.group_id,participant_id:participant.id||participant.participant_id,participant_token:response.participant_token,display_name:participant.display_name||displayName,version:Number(participant.version||0)};
   if(!write(contextKey,context)){notice('You joined the group, but this browser could not retain the private access needed to add a sandwich. Keep this page open and contact the organizer instead of joining again.',true);return}
   location.assign('menu.html');
  }catch(error){notice(error.message,true);button.disabled=false}
 }

 async function refreshGroup(){
  if(!access||!connected())return;
  try{const response=await Deli.request(`/groups/${encodeURIComponent(access.group_id)}`,'GET',undefined,access.organizer_token);showOrganizer(response.group||response)}catch(error){notice(error.message,true)}
 }

 function checkoutPanel(quote){
  const panel=$('#group-checkout');panel.hidden=false;panel.innerHTML=`<p class="expansion-kicker">ONE ORGANIZER PAYMENT</p><h2>REVIEW THE GROUP</h2><div class="quote-lines">${(quote.items||[]).map(line=>{const details=[line.recipient_name?'For '+line.recipient_name:'',...(line.option_names||[]),line.note?'Request: '+line.note:''].filter(Boolean).join(' · ');return`<p><span>${Number(line.quantity)} × ${esc(line.name)}${details?`<small>${esc(details)}</small>`:''}</span><strong>${money(line.line_cents)}</strong></p>`}).join('')}</div><p class="quote-total"><span>Total</span><strong>${money(quote.total_cents)}</strong></p><form id="group-payment-form"><label>Pickup name<input name="pickup_name" required maxlength="100" autocomplete="name" value="${esc(current?.organizer_name||'')}"></label><label>Email <span>Optional</span><input name="email" type="email" maxlength="254" autocomplete="email"></label><label>Phone <span>Optional</span><input name="phone" type="tel" maxlength="32" autocomplete="tel"></label><button class="expansion-primary full" type="submit">Continue to secure payment · ${money(quote.total_cents)}</button></form><p class="form-help">One payment covers the combined group order. It reaches the kitchen only after the payment provider confirms payment.</p>`;panel.scrollIntoView({behavior:'smooth',block:'start'});
 }

 function paymentPanel(group){
  const panel=$('#group-checkout'),payment=group?.payment,status=String(group?.status||'payment_pending'),title=({paid:'PAYMENT CONFIRMED',partially_refunded:'PARTIAL REFUND RECORDED',refunded:'PAYMENT REFUNDED',disputed:'PAYMENT UNDER REVIEW',cancelled:'ORDER CANCELLED',expired:'PAYMENT NOT COMPLETED',payment_failed:'PAYMENT NOT COMPLETED',payment_pending:'PAYMENT IN PROGRESS'}[status]||'PAYMENT STATUS'),rawOrderStatus=String(payment?.order_status||'unavailable'),orderStatus=({new:'Received',preparing:'Preparing',ready:'Ready for pickup',completed:'Picked up',cancelled:'Cancelled',pending_payment:'Waiting for payment',payment_failed:'Payment failed',expired:'Expired'}[rawOrderStatus]||rawOrderStatus.replaceAll('_',' ')),paymentStatus=String(payment?.payment_status||'unavailable').replaceAll('_',' '),expiry=status==='payment_pending'?dateLabel(payment?.checkout_expires_at):'',privateAccess=hasPrivateOrderAccess(payment?.order_id);
  const message=status==='paid'?`The group payment is confirmed. The kitchen status is ${orderStatus}. No payment action is needed here.`:status==='partially_refunded'?'The payment record includes a partial refund. Check the private order status for the current amount and kitchen status.':status==='refunded'?'The group payment was refunded. No payment action is available here.':status==='disputed'?'The payment is under review. Call the deli if the organizer needs help with the payment record.':status==='payment_pending'?`A secure payment request already exists. Do not create another. ${privateAccess?'Continue or check it through Orders on the menu.':'Its private payment link remains on the browser that opened it.'}`:'This payment cannot be continued from the group page. Call the deli to review the group before taking another payment action.';
  panel.hidden=false;panel.innerHTML=`<p class="expansion-kicker">ONE ORGANIZER PAYMENT</p><h2>${esc(title)}</h2>${payment?`<dl><div><dt>Order</dt><dd>${esc(payment.order_id||'Unavailable')}</dd></div><div><dt>Payment</dt><dd>${esc(paymentStatus)}</dd></div><div><dt>Order status</dt><dd>${esc(orderStatus)}</dd></div>${expiry?`<div><dt>Payment window</dt><dd>${esc(expiry)}</dd></div>`:''}</dl>`:'<p class="form-help">The current payment record could not be loaded. Refresh before taking any further action.</p>'}<p class="form-help">${esc(message)}</p>${privateAccess?`<a class="expansion-secondary full" href="menu.html?order=${encodeURIComponent(payment.order_id)}">Open private order status</a>`:'<a class="expansion-secondary full" href="tel:+18176705729">Call the deli</a>'}`;
 }

 async function requestQuote(button){
  button.disabled=true;
  try{
   let attempt=read(attemptKey,null);if(attempt?.group_id!==access.group_id)attempt={group_id:access.group_id,quote_idempotency_key:Deli.uid('group_quote_'),created_at:new Date().toISOString()};if(!write(attemptKey,attempt))throw new Error('Allow site storage before finalizing the group so the same request can be safely retried.');
   const response=await Deli.request(`/groups/${encodeURIComponent(access.group_id)}/quote`,'POST',{expected_version:Number(current.version),idempotency_key:attempt.quote_idempotency_key},access.organizer_token),quote=response.quote||response;
   if(!quote.quote_id||!Array.isArray(quote.items))throw new Error('The group total could not be read. Refresh and try again.');
   attempt={...attempt,quote,idempotency_key:attempt.idempotency_key||Deli.uid('group_checkout_')};if(!write(attemptKey,attempt))throw new Error('The group was finalized, but this browser could not save the protected payment retry. Keep this page open and do not create another checkout.');checkoutPanel(quote);
  }catch(error){notice(error.message,true);button.disabled=false}
 }

 async function payGroup(form){
  const attempt=read(attemptKey,null);if(!attempt?.quote?.quote_id)return notice('Refresh the group total before opening payment.',true);
  const data=Object.fromEntries(new FormData(form)),body={quote_id:attempt.quote.quote_id,idempotency_key:attempt.idempotency_key,pickup_name:data.pickup_name.trim()};if(data.email)body.email=data.email.trim();if(data.phone)body.phone=data.phone.trim();
  const button=form.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Opening secure payment…';
  try{
   const response=await Deli.request('/checkouts','POST',body),url=safeCheckoutURL(response.checkout_url);
   if(response.checkout_url!==null&&!url)throw new Error('The secure payment page was not available. This same request can be retried.');
   if(!persistOrderRecovery(response,attempt,body))throw new Error('The order was created, but this browser could not save its private recovery key. Keep this page open and do not create another checkout.');
   if(url)location.assign(url);else{notice('Payment status is being confirmed. Open Orders from the menu to check it.');location.assign('menu.html?checkout=return')}
  }catch(error){notice(error.message,true);button.disabled=false;button.textContent='Retry the same secure payment request'}
 }

 async function boot(){
  consumeInvite();const draft=read(draftKey,{});for(const [name,value] of Object.entries(draft)){$(`[name="${CSS.escape(name)}"]`)?.setAttribute('value',String(value))}
  try{await Deli.init()}catch{}
  if(invite)return showJoin();
  try{const menu=await Deli.menu();products=new Map((menu.items||[]).map(item=>[item.id,item]))}catch{}
  if(access?.group_id&&validToken(access.organizer_token)&&connected())return refreshGroup();
  $('#create-panel').hidden=false;
  if(!connected())$('#connection-note').hidden=false;
 }

 document.addEventListener('submit',event=>{event.preventDefault();if(event.target.id==='create-group-form')createGroup(event.target);if(event.target.id==='join-group-form')joinGroup(event.target);if(event.target.id==='group-payment-form')payGroup(event.target)});
 document.addEventListener('click',event=>{const button=event.target.closest('[data-group-action]');if(!button)return;const action=button.dataset.groupAction;if(action==='refresh')refreshGroup();if(action==='quote')requestQuote(button);if(action==='copy'){const field=$('#group-share');if(field)copyLink(field,copyFeedback,'Private invitation link copied.')}});
 boot();
})();
