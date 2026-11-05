'use strict';

(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DeliUsuals=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  const storageKey='wd-customer-usuals-v1',maximum=25;

  function copyLine(value){
    if(!value||typeof value!=='object'||typeof value.menu_item_id!=='string')return null;
    const quantity=Number(value.quantity),optionIds=Array.isArray(value.option_ids)?value.option_ids.filter(id=>typeof id==='string').slice(0,400):[];
    if(!Number.isInteger(quantity)||quantity<1||quantity>20)return null;
    return {menu_item_id:value.menu_item_id,quantity,option_ids:optionIds,note:typeof value.note==='string'?value.note.trim().slice(0,180):''};
  }

  function cleanName(value){return String(value??'').trim().replace(/\s+/g,' ').slice(0,50)}

  function cleanEntry(value){
    const line=copyLine(value?.line),name=cleanName(value?.name),id=typeof value?.id==='string'?value.id:'';
    if(!id||!name||!line)return null;
    return {id,name,line,created_at:String(value.created_at||''),updated_at:String(value.updated_at||value.created_at||'')};
  }

  function normalize(entries){
    const seen=new Set(),result=[];
    for(const value of Array.isArray(entries)?entries:[]){
      const entry=cleanEntry(value);if(!entry||seen.has(entry.id))continue;
      seen.add(entry.id);result.push(entry);if(result.length===maximum)break;
    }
    return result;
  }

  function create({name,line,id,now}={}){
    const safeName=cleanName(name),safeLine=copyLine(line);
    if(!safeName)throw new Error('Give this usual a name.');
    if(!safeLine)throw new Error('This sandwich could not be saved. Review it and try again.');
    const stamp=String(now||new Date().toISOString());
    return {id:String(id||('usual_'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)))),name:safeName,line:safeLine,created_at:stamp,updated_at:stamp};
  }

  function revalidate(entry,products,validateOptions){
    const usual=cleanEntry(entry),product=usual&&(Array.isArray(products)?products:[]).find(item=>item.id===usual.line.menu_item_id);
    if(!usual)return {ok:false,reason:'This saved sandwich is incomplete.'};
    if(!product)return {ok:false,reason:'This menu item is no longer available.'};
    if(product.sold_out)return {ok:false,reason:product.name+' is currently sold out.',product};
    try{validateOptions(product,usual.line.option_ids)}catch(error){return {ok:false,reason:error?.message||'One or more choices need to be updated.',product}}
    return {ok:true,product,line:copyLine(usual.line)};
  }

  function load(storage=globalThis.localStorage){
    try{return normalize(JSON.parse(storage?.getItem(storageKey)||'[]'))}catch{return[]}
  }

  function write(entries,storage=globalThis.localStorage){
    const value=normalize(entries),encoded=JSON.stringify(value);
    try{storage?.setItem(storageKey,encoded);return storage?.getItem(storageKey)===encoded}catch{return false}
  }

  function upsert(entries,entry){
    const clean=cleanEntry(entry);if(!clean)throw new Error('This saved sandwich is incomplete.');
    const result=normalize(entries).filter(item=>item.id!==clean.id);result.unshift(clean);return result.slice(0,maximum);
  }

  function rename(entries,id,name,now){
    const clean=cleanName(name);if(!clean)throw new Error('Give this usual a name.');
    return normalize(entries).map(entry=>entry.id===id?{...entry,name:clean,updated_at:String(now||new Date().toISOString())}:entry);
  }

  return {storageKey,maximum,copyLine,cleanName,normalize,create,revalidate,load,write,upsert,rename};
});
