/* Plan math uses imported grid consumption only. Rates are user supplied. */
(function(root){
  'use strict';
  function rate(value,unit='auto'){
    const n=Number(value);
    if(String(value).trim()===''||!Number.isFinite(n)||n<0)throw new Error('Enter a nonnegative rate.');
    if(!['auto','cents','dollars'].includes(unit))throw new Error('Choose a valid rate unit.');
    return unit==='cents'||(unit==='auto'&&n>=1)?n/100:n;
  }
  function time(value){const m=/^(\d{2}):(\d{2})$/.exec(value);return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:NaN;}
  function validate(plan){
    if(!plan||typeof plan.name!=='string'||!plan.name.trim())throw new Error('Enter a provider and plan name.');
    rate(plan.delivery,plan.deliveryUnit);rate(plan.energy,plan.energyUnit);
    const nonnegative=n=>String(n).trim()!==''&&Number.isFinite(Number(n))&&Number(n)>=0;
    if(!nonnegative(plan.base))throw new Error('Enter a nonnegative monthly base charge.');
    if(!Array.isArray(plan.credits)||!plan.credits.every(c=>c&&nonnegative(c.amount)&&nonnegative(c.threshold)))throw new Error('Each credit needs a nonnegative dollar amount and kWh threshold.');
    if(typeof plan.free!=='boolean')throw new Error('Invalid free-energy setting.');
    if(plan.discount!==undefined&&!['none','daily','weekly'].includes(plan.discount))throw new Error('Invalid discount type.');
    if(plan.free&&plan.discount==='weekly'){
      if(![plan.startDay,plan.endDay].every(d=>Number.isInteger(d)&&d>=0&&d<=6)||![plan.weekStart,plan.weekEnd].every(t=>Number.isFinite(time(t))&&time(t)%60===0))throw new Error('Choose valid start/end days and whole hours for free weekends.');
    }else if(plan.free){const start=time(plan.start),end=time(plan.end);if(!Number.isFinite(start)||!Number.isFinite(end)||start%15||end%15||start===end)throw new Error('Choose different start and end times in 15-minute steps.');}
    return plan;
  }
  const cents=n=>Math.round((n+Number.EPSILON)*100);
  function expected(key){return new Date(Date.UTC(+key.slice(0,4),+key.slice(5,7),0)).getUTCDate()*96;}
  function aggregate(records,meter,monthKeys){
    const months=monthKeys.map(key=>({key,kwh:0,count:0,estimated:0,expected:expected(key),hours:Array(168).fill(0)})),map=new Map(months.map(m=>[m.key,m]));
    for(const r of records){
      if(r.meter!==meter||r.flow!=='Consumption')continue;
      const month=map.get(r.day.slice(0,7));if(!month)continue;
      month.kwh+=r.kwh;month.count++;month.estimated+=Number(r.estimated);
      month.hours[new Date(r.day+'T00:00:00Z').getUTCDay()*24+Math.floor(r.start/60)]+=r.kwh;
    }
    return {version:1,months};
  }
  function compareData(data,plan){
    validate(plan);
    if(!data||data.version!==1||!Array.isArray(data.months))throw new Error('Invalid comparison data.');
    const deliveryRate=rate(plan.delivery,plan.deliveryUnit),energyRate=rate(plan.energy,plan.energyUnit);
    const start=time(plan.start),end=time(plan.end);
    const weekly=plan.discount==='weekly',weekMinutes=7*1440;
    const weekStart=plan.startDay*1440+time(plan.weekStart);
    // The selected ending hour is inclusive: Sunday 23:00 ends Monday 00:00.
    const weekLength=((plan.endDay*1440+time(plan.weekEnd)+60-weekStart)%weekMinutes+weekMinutes)%weekMinutes||weekMinutes;
    const months=data.months.map(source=>({...source,hours:[...source.hours],freeKwh:0}));
    for(const m of months){
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.key)||!Number.isFinite(m.kwh)||m.kwh<0||!Number.isSafeInteger(m.count)||m.count<0||!Number.isSafeInteger(m.estimated)||m.estimated<0||m.expected!==expected(m.key)||!Array.isArray(m.hours)||m.hours.length!==168||!m.hours.every(v=>Number.isFinite(v)&&v>=0))throw new Error('Invalid comparison data.');
      if(plan.free){
        for(let weekday=0;weekday<7;weekday++)for(let hour=0;hour<24;hour++){
          const minute=hour*60,minuteOfWeek=weekday*1440+minute;
          const free=weekly?(minuteOfWeek-weekStart+weekMinutes)%weekMinutes<weekLength:(start<end?minute>=start&&minute<end:minute>=start||minute<end);
          if(free)m.freeKwh+=m.hours[weekday*24+hour];
        }
      }
    }
    return settle(months,plan,deliveryRate,energyRate);
  }
  function settle(months,plan,deliveryRate=rate(plan.delivery,plan.deliveryUnit),energyRate=rate(plan.energy,plan.energyUnit)){
    for(const m of months){m.complete=m.count===m.expected;if(!m.count){m.bill=null;continue;}m.delivery=cents(m.kwh*deliveryRate);m.base=cents(Number(plan.base));m.energy=cents(Math.max(0,m.kwh-m.freeKwh)*energyRate);m.credit=plan.credits.filter(c=>m.kwh+1e-8>=Number(c.threshold)).reduce((sum,c)=>sum+cents(Number(c.amount)),0);m.bill=Math.max(0,m.delivery+m.base+m.energy-m.credit);}
    const known=months.filter(m=>m.bill!==null),total=known.reduce((sum,m)=>sum+m.bill,0),kwh=known.reduce((sum,m)=>sum+m.kwh,0);
    return {months,total:known.length?total:null,average:known.length?total/known.length:null,effective:kwh?total/kwh:null,known:known.length,complete:known.filter(m=>m.complete).length};
  }
  function compare(records,meter,monthKeys,plan){
    validate(plan);if(!plan.free||plan.discount==='weekly')return compareData(aggregate(records,meter,monthKeys),plan);
    const data=aggregate(records,meter,monthKeys),map=new Map(data.months.map(m=>[m.key,m])),start=time(plan.start),end=time(plan.end);
    for(const r of records)if(r.meter===meter&&r.flow==='Consumption'){const m=map.get(r.day.slice(0,7));if(m&&(start<end?r.start>=start&&r.start<end:r.start>=start||r.start<end))m.freeKwh=(m.freeKwh||0)+r.kwh;}
    for(const m of data.months)m.freeKwh=m.freeKwh||0;return settle(data.months,plan);
  }
  function period(lastDay,year){
    if(year!=='latest')return Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,'0')}`);
    const last=new Date(lastDay+'T00:00:00Z');return Array.from({length:12},(_,i)=>new Date(Date.UTC(last.getUTCFullYear(),last.getUTCMonth()-11+i,1)).toISOString().slice(0,7));
  }
  function encodeBase64(value){
    const bytes=new TextEncoder().encode(JSON.stringify(value));let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decodeBase64(value){
    if(!/^[A-Za-z0-9_-]+$/.test(value)||value.length>100000)throw new Error('Invalid shared comparison link.');
    const padded=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4),raw=atob(padded),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));return JSON.parse(new TextDecoder().decode(bytes));
  }
  function shareEncode(data,plans){
    if(!Array.isArray(plans))throw new Error('Invalid plans.');plans.forEach(validate);
    compareData(data,{name:'Validation',delivery:'0',deliveryUnit:'dollars',energy:'0',energyUnit:'dollars',base:'0',credits:[],free:false,discount:'none'});
    for(const plan of plans)if(plan.free&&plan.discount!=='weekly'&&(time(plan.start)%60||time(plan.end)%60))throw new Error(`“${plan.name}” uses 15-minute free-energy times. Shared comparisons support whole-hour boundaries; change its start and end to full hours first.`);
    const payload={v:1,m:data.months.map(m=>[m.key,Math.round(m.kwh*1000),m.count,m.estimated,m.hours.map(v=>Math.round(v*1000))]),p:plans};return encodeBase64(payload);
  }
  function shareDecode(text){
    const payload=decodeBase64(text);if(!payload||payload.v!==1||!Array.isArray(payload.m)||!payload.m.length||payload.m.length>120||!Array.isArray(payload.p)||payload.p.length>50)throw new Error('Invalid shared comparison link.');
    payload.p.forEach(validate);const months=payload.m.map(row=>{if(!Array.isArray(row)||row.length!==5||typeof row[0]!=='string'||!Number.isSafeInteger(row[1])||row[1]<0||!Number.isSafeInteger(row[2])||row[2]<0||!Number.isSafeInteger(row[3])||row[3]<0||!Array.isArray(row[4])||row[4].length!==168||!row[4].every(v=>Number.isSafeInteger(v)&&v>=0))throw new Error('Invalid shared comparison link.');return {key:row[0],kwh:row[1]/1000,count:row[2],estimated:row[3],expected:expected(row[0]),hours:row[4].map(v=>v/1000)};});
    const data={version:1,months};compareData(data,{name:'Validation',delivery:'0',deliveryUnit:'dollars',energy:'0',energyUnit:'dollars',base:'0',credits:[],free:false,discount:'none'});return {data,plans:payload.p};
  }
  const api={rate,time,validate,aggregate,compare,compareData,period,shareEncode,shareDecode};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PowerPlans=api;
})(typeof globalThis!=='undefined'?globalThis:this);
