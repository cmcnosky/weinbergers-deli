'use strict';
window.Deli = (()=>{
 const key='wd-platform-catalogue-20261102', clone=o=>JSON.parse(JSON.stringify(o));
 const defaults=()=>({items:clone(window.DEMO_MENU).map(p=>({...p,sold_out:false})),settings:{accepting_orders:true,prep_minutes:20,demo:true},orders:[],quotes:{},audit:[]});
 const read=()=>{try{return JSON.parse(localStorage.getItem(key))||defaults()}catch{return defaults()}};
 const save=s=>{try{localStorage.setItem(key,JSON.stringify(s))}catch{};window.dispatchEvent(new Event('deli-change'))};
 const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,10), now=()=>new Date().toISOString();
 let mode='browser', initPromise=null;
 async function init(){if(initPromise)return initPromise;return initPromise=(async()=>{if(location.hostname==='127.0.0.1'||location.hostname==='localhost'){try{const r=await fetch('/api/menu');if(r.ok){mode='server';return}}catch{}}})();}
 function fail(message,code){const error=new Error(message);if(code)error.code=code;throw error}
 function audit(s,action,details){const actor=sessionStorage.getItem('wd-demo-role')==='kitchen'?'kitchen':'manager';s.audit.unshift({id:uid('audit_'),actor_role:actor,action,target:details.id||details.name||'ordering',before:null,after:details,reason:details.reason||null,created_at:now()});}
 function publicOrder(order){const copy=clone(order);delete copy.lookup_token;delete copy.idempotency_key;delete copy.quote_id;return copy}
 function validateOptions(p,ids){
  if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))fail('Please review your item choices.','invalid_options');
  const groups=p.option_groups||[],allowed=groups.flatMap(g=>g.options),counts=new Map();
  if(ids.some(id=>!allowed.some(o=>o.id===id)))fail('An option is no longer available. Please review your choices.','invalid_options');
  ids.forEach(id=>counts.set(id,(counts.get(id)||0)+1));
  for(const g of groups){
   let groupCount=0;
   for(const o of g.options){
    const n=counts.get(o.id)||0;
    if(n>1&&g.display_type!=='quantity-select')fail('The same option cannot be selected twice.','invalid_options');
    if(n<(o.selection_min||0)||(o.selection_max!=null&&n>o.selection_max))fail('Please review the quantity for '+o.name+'.','options_required');
    groupCount+=n;
   }
   if(groupCount<(g.selection_min||0)||(g.selection_max!=null&&groupCount>g.selection_max))fail('Please choose '+g.name.toLowerCase()+'.','options_required');
  }
  return true;
 }

 async function request(path,method='GET',body,staff=false){await init();if(mode==='server'){let r;try{r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json',...(staff?{Authorization:'Bearer '+(sessionStorage.getItem('wd-demo-role')==='kitchen'?'demo-kitchen-token':'demo-manager-token')}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{fail('The service is unavailable. Your items are saved. Please retry.','network_unavailable')}let d;try{d=await r.json()}catch{fail('The service returned an unreadable response. Your items are saved.','invalid_response')}if(!r.ok)fail(d.error?.message||'Unable to complete this action.',d.error?.code);return d;}
 const s=read();if(path==='/menu')return{restaurant:{name:'Weinberger’s Deli'},ordering:s.settings,items:s.items,categories:[...new Set(s.items.map(p=>p.category))]};if(path==='/settings'&&method==='GET')return{ordering:s.settings,demo:true};
 if(path==='/quotes'){
 if(!s.settings.accepting_orders)fail('Orders are paused. Please try again when the kitchen is ready.','ordering_paused');if(!body.items?.length)fail('Add something to your bag first.','empty_basket');
 const items=body.items.map(line=>{const p=s.items.find(x=>x.id===line.menu_item_id);if(!p||p.sold_out)fail((p?.name||'This item')+' is unavailable. Please update your bag.','item_sold_out');if(!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>20)fail('Choose a quantity from 1 to 20.','invalid_quantity');const ids=line.option_ids||[];const allowed=(p.option_groups||[]).flatMap(g=>g.options);validateOptions(p,ids);const unit=p.base_price_cents+ids.reduce((v,id)=>v+(allowed.find(o=>o.id===id)?.price_delta_cents||0),0);return{menu_item_id:p.id,name:p.name,quantity:line.quantity,option_ids:ids,option_names:ids.map(id=>allowed.find(o=>o.id===id).name),note:(line.note||'').slice(0,180),unit_cents:unit,line_cents:unit*line.quantity};});const sub=items.reduce((n,l)=>n+l.line_cents,0);const q={quote_id:uid('qt_'),expires_at:new Date(Date.now()+600000).toISOString(),fulfillment:'pickup',items,subtotal_cents:sub,tax_cents:Math.round(sub*.0825),total_cents:sub+Math.round(sub*.0825),prep_minutes:s.settings.prep_minutes,demo:true};s.quotes[q.quote_id]=q;save(s);return q;}
 if(path==='/orders'&&method==='POST'){if(typeof body.idempotency_key!=='string'||body.idempotency_key.length<8||body.idempotency_key.length>128)fail('Use a valid checkout key.','idempotency_required');const pickup=(body.pickup_name||'Guest').trim();let old=s.orders.find(o=>o.idempotency_key===body.idempotency_key);if(old){if(old.quote_id!==body.quote_id||old.pickup_name!==pickup)fail('This checkout key has already been used.','idempotency_conflict');return{order:publicOrder(old),lookup_token:old.lookup_token,demo:true,idempotent_replay:true}}const q=s.quotes[body.quote_id];if(!q||new Date(q.expires_at)<new Date())fail('Your quote expired. Review your bag again.','quote_expired');if(s.orders.some(o=>o.quote_id===q.quote_id))fail('That order is already submitted.','quote_already_used');if(!s.settings.accepting_orders)fail('Orders are paused. Your bag is saved.','ordering_paused');if(q.items.some(l=>{const p=s.items.find(item=>item.id===l.menu_item_id);return!p||p.sold_out}))fail('An item just sold out. Please review your bag.','item_sold_out');const created=now(),o={...q,id:'WD-'+(1041+s.orders.length),lookup_token:uid('lookup_'),idempotency_key:body.idempotency_key,quote_id:q.quote_id,status:'new',payment_status:'simulated_paid',pickup_name:pickup,promised_minutes:q.prep_minutes,created_at:created,updated_at:created,timeline:[{type:'new',at:created,label:'Order received'}],refunded_cents:0};s.orders.push(o);save(s);return{order:publicOrder(o),lookup_token:o.lookup_token,demo:true,idempotent_replay:false};}
 if(path.startsWith('/orders/')){const [part,query]=path.split('?');const o=s.orders.find(o=>o.id===part.split('/').pop());if(!o||new URLSearchParams(query).get('token')!==o.lookup_token)fail('This order could not be found.','order_not_found');return{order:publicOrder(o),demo:true}}
 if(staff){const kitchen=sessionStorage.getItem('wd-demo-role')==='kitchen';if(kitchen&&!(path.startsWith('/staff/orders')&&(method==='GET'||path.endsWith('/status'))))fail('A manager role is required.');
 if(path.startsWith('/staff/orders')&&method==='GET')return{orders:s.orders.map(publicOrder),demo:true};if(path==='/staff/audit')return{events:s.audit,demo:true};if(path==='/staff/settings'){Object.assign(s.settings,body);audit(s,'settings_changed',body);save(s);return{ordering:s.settings,demo:true};}
 if(path.startsWith('/staff/menu/')){const p=s.items.find(x=>x.id===path.split('/').pop());p.sold_out=body.sold_out;audit(s,'availability_changed',{name:p.name,...body});save(s);return{item:p,demo:true}}
 const o=s.orders.find(x=>x.id===path.split('/')[3]);if(!o)fail('Order not found.','order_not_found');if(path.endsWith('/status')){const next={new:'preparing',preparing:'ready',ready:'completed'};if(body.status!==next[o.status]&&!(body.status==='cancelled'&&!kitchen&&['new','preparing'].includes(o.status)))fail('That status change is not available.','invalid_transition');const changed=now();o.status=body.status;o.updated_at=changed;o.timeline.push({type:body.status,at:changed,label:body.status.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())});audit(s,'order_status_changed',{id:o.id,status:o.status});save(s);return{order:publicOrder(o),demo:true};}
 if(path.endsWith('/refund')){if(body.amount_cents<1||body.amount_cents>o.total_cents-o.refunded_cents)fail('Refund exceeds the remaining payment.');o.refunded_cents+=body.amount_cents;audit(s,'simulated_refund',{id:o.id,amount_cents:body.amount_cents});save(s);return{refund:{status:'simulated'},demo:true};}}
 fail('This action is unavailable.');}
 return{init,request,validateOptions,get mode(){return mode},uid};
})();
