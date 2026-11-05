'use strict';

(function(){
 const $=selector=>document.querySelector(selector),esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])),money=cents=>'$'+(Number(cents||0)/100).toFixed(2);
 const draftKey='wd-catering-draft-v1',accessKey='wd-catering-access-v1',acceptKey='wd-catering-accept-attempt-v1';let access=read(accessKey,null),current=null;
 function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
 function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
 function notice(message,error=false){const target=$('#catering-notice');target.textContent=message;target.classList.toggle('error',error);target.hidden=!message}
 function copyLink(field,report,success){field.select();const fallback=()=>report('Link selected. Copy it to save or share privately.');try{const result=navigator.clipboard?.writeText(field.value);if(!result||typeof result.then!=='function'){fallback();return Promise.resolve(false)}return result.then(()=>{report(success);return true}).catch(()=>{fallback();return false})}catch{fallback();return Promise.resolve(false)}}
 function copyFeedback(message){const target=$('#catering-copy-feedback');if(target){target.textContent=message;target.hidden=false}}
 function validToken(value){return typeof value==='string'&&/^[A-Za-z0-9._-]{16,512}$/.test(value)}
 function validID(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{4,80}$/.test(value)}
 function dateLabel(value){if(!value)return'';const date=new Date(value);return Number.isNaN(date.valueOf())?'':date.toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
 function requestID(value){return value?.id||value?.request_id}
 function parseAccessFragment(value){
  const raw=String(value||'').replace(/^#/,'');if(!raw)return null;const params=new URLSearchParams(raw);if(!params.has('request')&&!params.has('access'))return null;
  const request_id=params.get('request'),status_token=params.get('access');return validID(request_id)&&validToken(status_token)?{request_id,status_token}:{invalid:true};
 }
 function consumeAccessFragment(){const linked=parseAccessFragment(location.hash);if(linked)history.replaceState(null,'',location.pathname+location.search);return linked}
 function preferredLinkedAccess(candidate,currentAccess){const retained=currentAccess&&currentAccess.request_id===candidate?.request_id&&validToken(currentAccess.status_token)&&!String(currentAccess.status_token).startsWith('cq1.');return retained?currentAccess:candidate}
 function activateLinkedAccess(candidate,connected,persist=write){if(!connected||!candidate||candidate.invalid)return{value:null,stored:false};return{value:candidate,stored:Boolean(persist(accessKey,candidate))}}
 function privateStatusURL(id){if(!access||access.request_id!==id||!validID(id)||!validToken(access.status_token))return'';const url=new URL(location.href);url.search='';url.hash=`request=${encodeURIComponent(id)}&access=${encodeURIComponent(access.status_token)}`;return url.href}
 function safeCheckoutURL(value){if(typeof value!=='string')return'';try{const url=new URL(value,location.href),loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname),stripe=url.protocol==='https:'&&url.hostname==='checkout.stripe.com';return !url.username&&!url.password&&(stripe||loopback&&['http:','https:'].includes(url.protocol))?url.href:''}catch{return''}}
 function persistOrderRecovery(checkout){
  if(!checkout?.order_id||!checkout?.lookup_token)return false;
  const entry={id:checkout.order_id,token:checkout.lookup_token,checkout_url:safeCheckoutURL(checkout.checkout_url),checkout_expires_at:checkout.checkout_expires_at,payment_status:checkout.payment_status,status:checkout.status,fulfillment:'catering_deposit',catering_request_id:access?.request_id||'',catering_quote_total:Number(current?.quote_total_cents||0),lines:[{menu_item_id:'catering-deposit',name:'Catering deposit',quantity:1,option_ids:[],note:''}],time:new Date().toISOString(),total:Number(current?.deposit_cents||0),pickup_name:current?.contact_name||'Catering deposit',email:'',phone:''};
  if(!write('wd-pending-checkout-v1',entry)||read('wd-pending-checkout-v1',null)?.token!==entry.token)return false;
  const history=read('wd-connected-orders-v1',[]),next=[entry,...(Array.isArray(history)?history:[]).filter(item=>item?.id!==entry.id)].slice(0,50);write('wd-connected-orders-v1',next);return true;
 }

 function saveDraft(form){const data=Object.fromEntries(new FormData(form));if(write(draftKey,data))notice('Saved on this device. It has not been sent. Catering requests are not accepting submissions here yet. Call or email the deli to plan an event now.');else notice('This browser could not save the request. Nothing was sent. Call or email the deli to plan the event now.',true);}
 function renderStatus(request){
  notice('');current=request;const id=requestID(request),shortID=id?String(id).slice(-8).toUpperCase():'',status=String(request.status||'submitted').replaceAll('_',' '),expired=Boolean(request.valid_until)&&new Date(request.valid_until)<=new Date(),depositPending=request.status==='deposit_pending',payable=Number.isInteger(request.deposit_cents)&&request.deposit_cents>0&&(depositPending||(['quoted','approved'].includes(request.status)&&!expired)),event=dateLabel(request.event_at),expires=dateLabel(request.valid_until),paymentLabel=depositPending?'Continue deposit payment':'Accept quote and pay '+money(request.deposit_cents)+' deposit',privateLink=privateStatusURL(id);
  $('#request-panel').hidden=true;$('#catering-status').hidden=false;$('#catering-status').innerHTML=`<section class="expansion-panel"><p class="expansion-kicker">CATERING REQUEST${shortID?' / '+esc(shortID):''}</p><h2>${esc(status.toUpperCase())}</h2><dl><div><dt>Event</dt><dd>${esc(event)}</dd></div><div><dt>People</dt><dd>${Number(request.headcount||0)}</dd></div><div><dt>Fulfillment</dt><dd>${esc(request.fulfillment||'')}</dd></div>${request.quote_total_cents!=null?`<div><dt>Quoted total</dt><dd>${money(request.quote_total_cents)}</dd></div>`:''}${request.deposit_cents!=null?`<div><dt>Deposit</dt><dd>${money(request.deposit_cents)}</dd></div>`:''}</dl>${request.quote_note?`<div class="quote-note"><strong>FROM THE DELI</strong><p>${esc(request.quote_note)}</p></div>`:''}${request.deposit_paid?'<p class="expansion-success">Deposit payment confirmed.</p>':payable?`<p class="form-help">${depositPending?'A secure deposit payment request already exists. Continue that same request while its payment page remains available.':(expires?'This quote is available until '+esc(expires)+'. ':'')} Payment is confirmed after your payment is processed.</p><button class="expansion-primary full" data-catering-action="accept">${esc(paymentLabel)}</button>`:expired&&['quoted','approved'].includes(request.status)?'<p class="form-help">This quote has expired. Contact the deli to review the event and request a current quote.</p>':'<p class="form-help">The deli will review the date, menu, timing, price, and fulfillment before any payment is requested.</p>'}${privateLink?`<label for="catering-status-link">Private status link</label><div class="copy-row"><input id="catering-status-link" type="url" value="${esc(privateLink)}" readonly><button class="expansion-secondary" data-catering-action="copy-status">Copy</button></div><p class="form-help">Keep this link private. Anyone with it can view this request and any quote the deli sends.</p><p id="catering-copy-feedback" class="form-help" role="status" aria-live="polite" hidden></p>`:''}<div class="status-actions"><button class="expansion-secondary" data-catering-action="refresh">Refresh status</button><button class="expansion-text" data-catering-action="new">Start another request</button></div></section>`;
 }

 async function submit(form){
  if(!Deli.connected)return saveDraft(form);
  const data=Object.fromEntries(new FormData(form)),budget=String(data.budget||'').trim(),eventAt=new Date(data.event_at);
  if(Number.isNaN(eventAt.valueOf())||eventAt<=new Date()){notice('Choose a future event date and time.',true);form.elements.event_at.focus();return}
  const body={contact_name:data.contact_name.trim(),email:data.email.trim(),event_at:eventAt.toISOString(),headcount:Number(data.headcount),fulfillment:data.fulfillment,details:data.details.trim()};
  if(!body.contact_name){notice('Enter the name the deli should contact.',true);form.elements.contact_name.focus();return}if(body.details.length<3){notice('Tell the deli what food you need.',true);form.elements.details.focus();return}
  if(data.fulfillment==='delivery'&&!String(data.address||'').trim()){notice('Enter the delivery address so the deli can review the request.',true);form.elements.address?.focus();return}
  if(data.phone)body.phone=data.phone.trim();if(data.address)body.address=data.address.trim();if(budget)body.budget_cents=Math.round(Number(budget)*100);if(data.dietary_notes)body.dietary_notes=data.dietary_notes.trim();
  const button=form.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Sending request…';
  try{
   const response=await Deli.request('/catering','POST',body),request=response.request||response,id=requestID(request);
   if(!validID(id)||!validToken(response.status_token))throw new Error('The catering service returned an incomplete response.');
   access={request_id:id,status_token:response.status_token};const stored=write(accessKey,access);
   renderStatus(request);notice(stored?'Request sent. No payment has been requested.':'Request sent, but this browser could not retain the private status access. Keep this page open and contact the deli before submitting again.',!stored);
  }catch(error){notice(error.message,true);button.disabled=false;button.textContent='Send request for review'}
 }

 async function refresh(){
  if(!access||!Deli.connected)return false;
  try{const response=await Deli.request(`/catering/${encodeURIComponent(access.request_id)}`,'GET',undefined,access.status_token);renderStatus(response.request||response);return true}catch(error){notice(error.message,true);return false}
 }

 async function accept(button){
  if(!access||!current)return;let attempt=read(acceptKey,null);
  if(attempt?.request_id!==access.request_id||attempt.expected_version!==Number(current.version)&&current.status==='quoted')attempt={request_id:access.request_id,expected_version:Number(current.version),idempotency_key:Deli.uid('catering_accept_'),created_at:new Date().toISOString()};
  if(!write(acceptKey,attempt))return notice('Allow site storage before opening payment so the same request can be retried safely.',true);
  button.disabled=true;button.textContent='Opening secure payment…';
  try{
   const response=await Deli.request(`/catering/${encodeURIComponent(access.request_id)}/accept`,'POST',{expected_version:attempt.expected_version,idempotency_key:attempt.idempotency_key},access.status_token),checkout=response.checkout||response,url=checkout.checkout_url===null?'':safeCheckoutURL(checkout.checkout_url);
   if(!checkout.order_id||!checkout.lookup_token||(checkout.checkout_url!==null&&!url))throw new Error('The payment service returned an incomplete response. This same acceptance request can be retried.');
   if(!persistOrderRecovery(checkout))throw new Error('The payment request was created, but this browser could not save its private recovery key. Keep this page open and retry the same request.');
   if(response.request)renderStatus(response.request);
   if(url)location.assign(url);else notice('No active payment page was returned. Refresh the request status before taking another action.');
  }catch(error){if(error.code==='catering_version_conflict'){write(acceptKey,null);button.disabled=false;notice('The deli updated this quote. Review the current total before accepting it.',true);await refresh();return}notice(error.message,true);button.disabled=false;button.textContent='Retry the same secure deposit request'}
 }

 function startNew(){access=null;current=null;write(accessKey,null);$('#catering-status').hidden=true;$('#request-panel').hidden=false;$('#catering-form').querySelector('input')?.focus()}
 async function boot(){
  const linked=consumeAccessFragment();
  const draft=read(draftKey,{});for(const [name,value] of Object.entries(draft)){const field=$(`[name="${CSS.escape(name)}"]`);if(field)field.value=String(value)}
  try{await Deli.init()}catch{}
  if(linked?.invalid){notice('This private catering status link is incomplete or invalid. Ask the person who sent it to copy the full link.',true);return}
  if(linked){const activated=activateLinkedAccess(preferredLinkedAccess(linked,access),Deli.connected);if(!activated.value){$('#connection-note').hidden=false;notice('This private status link can only be opened on the connected ordering address. Nothing from the link was saved on this device.',true);return}access=activated.value;const loaded=await refresh();if(loaded&&!activated.stored)notice('The request is open, but this browser could not save its private access. Keep this page open and copy the private status link before leaving.',true);return}
  if(access?.request_id&&validID(access.request_id)&&validToken(access.status_token)&&Deli.connected)return refresh();
  if(!Deli.connected)$('#connection-note').hidden=false;
 }
 document.addEventListener('submit',event=>{if(event.target.id!=='catering-form')return;event.preventDefault();submit(event.target)});
 document.addEventListener('click',event=>{const button=event.target.closest('[data-catering-action]');if(!button)return;const action=button.dataset.cateringAction;if(action==='refresh')refresh();if(action==='accept')accept(button);if(action==='new')startNew();if(action==='copy-status'){const field=$('#catering-status-link');if(field)copyLink(field,copyFeedback,'Private status link copied.')}});
 boot();
})();
