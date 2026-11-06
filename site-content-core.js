(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DeliContentCore=api;})(typeof window==='object'?window:this,function(){
 'use strict';
 const layouts=new Set(['default','compact','featured','stack','stacked','reverse','split','two-column','three-column','grid','cards','marquee']);
 const headingFonts={deli:"'Barlow Condensed','Arial Narrow',Impact,sans-serif",brand:"'Barlow Condensed','Arial Narrow',Impact,sans-serif",condensed:"'Barlow Condensed','Arial Narrow',Impact,sans-serif",slab:"Georgia,'Times New Roman',serif",system:"system-ui,Arial,sans-serif"};
 const bodyFonts={sans:"'DM Sans',Arial,sans-serif",system:"system-ui,Arial,sans-serif",humanist:"'Trebuchet MS','DM Sans',sans-serif",slab:"Georgia,'Times New Roman',serif"};
 const identifier=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(value);
 function safeURL(value,base,media=false){
  if(typeof value!=='string'||value.length>2000||/[\u0000-\u001f\\]/.test(value)||value.startsWith('//'))return '';
  try{const u=new URL(value,base);if(u.username||u.password)return '';if(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))return u.href;if(!media&&['tel:','mailto:'].includes(u.protocol))return u.href;}catch{}return '';
 }
 function videoID(value){try{const u=new URL(value);if(!['https:'].includes(u.protocol))return '';const host=u.hostname.toLowerCase(),id=host==='youtu.be'?u.pathname.slice(1):['youtube.com','www.youtube.com','www.youtube-nocookie.com'].includes(host)?(u.searchParams.get('v')||u.pathname.split('/').pop()):'';return /^[\w-]{11}$/.test(id||'')?id:'';}catch{return '';}}
 function validate(content){
  if(!content||typeof content!=='object'||!content.site||!content.theme||!Array.isArray(content.pages)||!Array.isArray(content.navigation)||content.pages.length>40)return false;
  if(JSON.stringify(content).length>1000000)return false;
  const pages=new Set();
  for(const p of content.pages){if(!identifier(p.id)||pages.has(p.id)||!Array.isArray(p.sections)||p.sections.length>100)return false;pages.add(p.id);const sections=new Set();
   for(const s of p.sections){if(!identifier(s.id)||sections.has(s.id)||!layouts.has(s.layout)||typeof s.visible!=='boolean'||!Array.isArray(s.fields)||s.fields.length>100)return false;sections.add(s.id);const fields=new Set();
    for(const f of s.fields){if(!identifier(f.id)||fields.has(f.id)||!['text','multiline','image','link','video'].includes(f.type)||typeof f.value!=='string'||f.value.length>20000)return false;fields.add(f.id);}
   }
  }return true;
 }
 function themeVars(theme){const t=theme||{},v={};const colors={background:'--yellow',foreground:'--ink',accent:'--red',on_accent:'--cms-on-accent',border:'--line'};for(const[k,css]of Object.entries(colors))if(/^#[0-9a-f]{6}$/i.test(t[k]||''))v[css]=t[k];if(v['--line'])v['--boundary-maroon']=v['--line'];if(v['--yellow'])v['--boundary-gold']=v['--yellow'];if(v['--red'])v['--red-dark']=v['--red'];const width=Number(t.border_width);if(Number.isInteger(width)&&width>=1&&width<=12){v['--section-rule']=width+'px solid var(--line)';v['--panel-rule']=Math.max(1,Math.round(width*2/3))+'px solid var(--line)';}if(headingFonts[t.heading_font])v['--display']=headingFonts[t.heading_font];if(bodyFonts[t.body_font])v['--sans']=bodyFonts[t.body_font];const radius=Number(t.corner_radius);if(Number.isInteger(radius)&&radius>=0&&radius<=40)v['--cms-radius']=radius+'px';return v;}
 return {safeURL,videoID,validate,themeVars,layouts:[...layouts],headingFonts,bodyFonts};
});
