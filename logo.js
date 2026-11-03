'use strict';
// Keep the official artwork; resample its fine outlines for the rendered pixel size.
(() => {
 const logos=[...document.querySelectorAll('.brand img')];
 for(const img of logos){
  const original=img.currentSrc||img.src,source=new Image();let previous='',frame=0;
  img.dataset.logoSource=original;
  const render=()=>{
   frame=0;if(!source.naturalWidth)return;
   const rect=img.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
   const width=Math.max(1,Math.round(rect.width*dpr)),height=Math.max(1,Math.round(rect.height*dpr));
   if(!rect.width||!rect.height)return;
   const key=width+'x'+height;if(key===previous)return;
   if(width>=source.naturalWidth){img.src=original;previous=key;return}
   try{
    let input=source,w=source.naturalWidth,h=source.naturalHeight;
    while(w>width*2){w=Math.max(width,Math.floor(w/2));h=Math.max(1,Math.round(w*source.naturalHeight/source.naturalWidth));const step=document.createElement('canvas');step.width=w;step.height=h;const ctx=step.getContext('2d');if(!ctx)return;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(input,0,0,w,h);input=step}
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(input,0,0,width,height);
    const result=canvas.toDataURL('image/png');if(result==='data:,')return;previous=key;img.src=result;
   }catch{/* Keep the original logo if canvas rendering is unavailable. */}
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(render)};
  source.onload=()=>{img.style.aspectRatio=source.naturalWidth+' / '+source.naturalHeight;schedule()};source.src=original;
  if('ResizeObserver' in window)new ResizeObserver(schedule).observe(img);
  window.addEventListener('resize',schedule,{passive:true});
  let resolution;
  const watchResolution=()=>{resolution?.removeEventListener?.('change',onResolution);resolution=window.matchMedia?.('(resolution: '+(window.devicePixelRatio||1)+'dppx)');resolution?.addEventListener?.('change',onResolution,{once:true})};
  const onResolution=()=>{watchResolution();schedule()};watchResolution();
 }
})();
