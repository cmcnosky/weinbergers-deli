'use strict';
(function(root){
  function integer(value,min,max,label){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${label} must be a whole number from ${min} to ${max}.`);return n}
  function cents(value){const s=String(value).trim();if(!/^\d+(\.\d{1,2})?$/.test(s))throw new Error('Enter a dollar amount with no more than two decimal places.');const [a,b='']=s.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n>100000000)throw new Error('That amount is too large.');return n}
  function automation(values,current,now=Date.now()){
    const data={expected_version:current.version,reason:'Updated owner automation preferences'};
    if(!['off','suggest','automatic'].includes(values.mode))throw new Error('Choose Off, Suggest, or Automatic.');data.mode=values.mode;
    const fields={base_minutes:[5,180,'Base preparation time'],min_minutes:[5,180,'Shortest preparation time'],max_minutes:[10,360,'Longest ASAP wait'],slot_minutes:[5,30,'Window length'],units_per_slot:[1,200,'Capacity per window'],large_order_threshold:[2,100,'Large-order threshold'],large_order_extra_minutes:[0,180,'Large-order allowance'],manual_delay_minutes:[0,180,'Temporary extra wait']};
    for(const [key,[min,max,label]]of Object.entries(fields))data[key]=integer(values[key],min,max,label);
    if(![5,10,15,20,30].includes(data.slot_minutes))throw new Error('Choose a supported window length.');
    if(data.min_minutes>data.base_minutes||data.base_minutes>data.max_minutes)throw new Error('The base preparation time must be between the shortest time and longest ASAP wait.');
    for(const key of ['complexity_weight_enabled','external_workload_visible','ready_email_enabled','ready_sms_enabled','ready_push_enabled','group_ordering_enabled','catering_requests_enabled','insights_collection_enabled'])data[key]=Boolean(values[key]);
    const preserve=values.override_duration==='keep'&&data.manual_delay_minutes===current.manual_delay_minutes&&Date.parse(current.override_expires_at)>now;
    const duration=integer(values.override_duration==='keep'?30:(values.override_duration||30),5,1440,'Override duration');
    data.override_expires_at=data.manual_delay_minutes?(preserve?current.override_expires_at:new Date(now+duration*60000).toISOString()):null;
    return data;
  }
  function catering(values,current,now=Date.now()){
    const total=cents(values.total),deposit=cents(values.deposit);
    if(total<=0||deposit<=0||deposit>total)throw new Error('The total and payment due must be positive. Payment due cannot exceed the total.');
    const note=String(values.note||'').trim();if(note.length<3)throw new Error('Describe what is included in this quote.');if(note.length>1500)throw new Error('Keep the quote description to 1,500 characters or fewer.');
    const days=integer(values.valid_days,1,30,'Quote validity');
    return{expected_version:current.version,status:'quoted',quote_total_cents:total,deposit_cents:deposit,quote_note:note,valid_until:new Date(now+days*86400000).toISOString(),reason:'Published catering quote for customer review'};
  }
  function percent(n,d){const numerator=Number(n),denominator=Number(d);if(!Number.isFinite(numerator)||!Number.isFinite(denominator)||denominator<=0)return'Not enough data';if(numerator<0||numerator>denominator)return'Data needs review';return Math.round(numerator/denominator*100)+'%'}
  function rate(value,observations){const ratio=Number(value),count=Number(observations);if(!Number.isFinite(count)||count<=0)return'Not enough data';if(!Number.isFinite(ratio)||ratio<0||ratio>1)return'Data needs review';return Math.round(ratio*100)+'%'}
  const api={automation,catering,cents,percent,rate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DeliExpansionCore=api;
})(typeof window!=='undefined'?window:globalThis);
