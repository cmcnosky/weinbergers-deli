'use strict';
(function(root){
 const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
 const pointerPart=value=>String(value).replaceAll('~','~0').replaceAll('/','~1');
 const pointer=(...parts)=>'/'+parts.map(pointerPart).join('/');
 function replace(path,value){return {op:'replace',path,value:clone(value)}}
 function add(path,value){return {op:'add',path,value:clone(value)}}
 function remove(path){return {op:'remove',path}}
 function pointerParts(path){return String(path).split('/').slice(1).map(part=>part.replaceAll('~1','/').replaceAll('~0','~'))}
 function read(document,path){let value=document;for(const part of pointerParts(path)){const index=/^(?:0|[1-9]\d*)$/.test(part)?Number(part):part;value=value?.[index]}return value}
 function collapseReplacements(patches,document){
  const entries=[...(patches||[])];
  return entries.filter(patch=>!entries.some(other=>other!==patch&&patch.path.startsWith(other.path+'/'))).map(patch=>patch.op==='replace'?replace(patch.path,read(document,patch.path)):clone(patch));
 }
 function move(list,index,direction){
  const next=clone(list||[]),target=index+(direction==='up'?-1:1);
  if(index<0||index>=next.length||target<0||target>=next.length)return next;
  [next[index],next[target]]=[next[target],next[index]];return next;
 }
 function stats(content){
  const pages=content?.pages||[],sections=pages.flatMap(page=>page.sections||[]),fields=sections.flatMap(section=>section.fields||[]);
  return {pages:pages.length,sections:sections.length,visibleSections:sections.filter(section=>section.visible!==false).length,fields:fields.length,images:fields.filter(field=>field.type==='image'&&field.value).length,navigation:(content?.navigation||[]).length};
 }
 function fieldInputType(type){return type==='multiline'?'textarea':['image','link','video'].includes(type)?'url':'text'}
 function allowedURL(value,{image=false}={}){
  const text=String(value||'').trim();if(!text)return true;
  if(/^assets\/[a-z0-9_./-]+$/i.test(text))return true;
  try{const url=new URL(text,'https://weinbergersdeli.com');return url.protocol==='https:'||(!image&&['tel:','mailto:'].includes(url.protocol))}catch{return false}
 }
 function clientIssues(content){
  const issues=[];
  if(!content?.site?.name?.trim())issues.push('Restaurant name is required.');
  for(const [index,item] of (content?.navigation||[]).entries()){
   if(!String(item.label||'').trim())issues.push(`Navigation link ${index+1} needs a label.`);
   if(!allowedURL(item.url))issues.push(`Navigation link ${index+1} has an invalid address.`);
  }
  for(const page of content?.pages||[]){
   if(page.seo?.image&&!allowedURL(page.seo.image,{image:true}))issues.push(`${page.title}: link preview image has an invalid address.`);
   if(page.seo?.image&&!String(page.seo.image_alt||'').trim())issues.push(`${page.title}: link preview image needs description text.`);
   for(const section of page.sections||[])for(const field of section.fields||[]){
   if(['image','link','video'].includes(field.type)&&!allowedURL(field.value,{image:field.type==='image'}))issues.push(`${page.title}: ${field.label} has an invalid address.`);
   if(field.type==='image'&&field.value&&!String(field.alt||'').trim())issues.push(`${page.title}: ${field.label} needs image description text.`);
   }
  }
  return issues;
 }
 function mergeMenu(published,draft){
  const base=new Map((published?.items||[]).map(item=>[item.id,clone(item)]));if(!draft)return [...base.values()];
  for(const [id,item] of Object.entries(draft.custom_items||{}))base.set(id,clone(item));
  for(const [id,override] of Object.entries(draft.item_overrides||{}))if(base.has(id))Object.assign(base.get(id),override);
  for(const item of base.values())for(const group of item.option_groups||[]){Object.assign(group,draft.group_overrides?.[group.id]||{});for(const option of group.options||[])Object.assign(option,draft.option_overrides?.[option.id]||{})}
  const order=[...(draft.item_order||[])];for(const id of base.keys())if(!order.includes(id))order.push(id);const archived=new Set(draft.archived_item_ids||[]);
  return order.map(id=>base.get(id)).filter(Boolean).map(item=>({...item,archived:archived.has(item.id)}));
 }
 const api={clone,pointer,replace,add,remove,read,collapseReplacements,move,stats,fieldInputType,allowedURL,clientIssues,mergeMenu};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WeinbergersStudioCore=api;
})(typeof window==='undefined'?this:window);
