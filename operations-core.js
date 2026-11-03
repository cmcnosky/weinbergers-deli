'use strict';
(function(root){
 const days=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
 function cents(value,{nullable=false}={}){const text=String(value??'').trim();if(!text&&nullable)return null;if(!/^\d{1,5}(?:\.\d{1,2})?$/.test(text))throw new Error('Enter a nonnegative price with no more than two decimal places.');const [whole,fraction='']=text.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));}
 function schedule(rows){const result={};for(const day of days){const periods=rows[day]||[];result[day]=periods.filter(period=>period.some(Boolean)).map(period=>{if(period.length!==2||!period.every(value=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))||period[0]>=period[1])throw new Error('Check '+day+' hours. Use an opening time before the closing time.');return period});for(let i=1;i<result[day].length;i++)if(result[day][i][0]<result[day][i-1][1])throw new Error('The '+day+' hours overlap or are out of order.');}return result;}
 function orderQuery({search='',status='',payment='',from='',to='',cursor='',limit=50}={}){const params=new URLSearchParams({limit:String(limit)});for(const [key,value] of Object.entries({q:search.trim(),status,payment_status:payment,created_from:from?new Date(from+'T00:00:00').toISOString(): '',created_to:to?new Date(to+'T23:59:59.999').toISOString():'',cursor}))if(value)params.set(key,value);return params.toString();}
 const api={days,cents,schedule,orderQuery};if(typeof module!=='undefined')module.exports=api;else root.DeliOpsCore=api;
})(typeof window==='undefined'?this:window);
