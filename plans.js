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
  function compare(records,meter,monthKeys,plan){
    validate(plan);
    const deliveryRate=rate(plan.delivery,plan.deliveryUnit),energyRate=rate(plan.energy,plan.energyUnit);
    const start=time(plan.start),end=time(plan.end);
    const weekly=plan.discount==='weekly',weekMinutes=7*1440;
    const weekStart=plan.startDay*1440+time(plan.weekStart);
    // The selected ending hour is inclusive: Sunday 23:00 ends Monday 00:00.
    const weekLength=((plan.endDay*1440+time(plan.weekEnd)+60-weekStart)%weekMinutes+weekMinutes)%weekMinutes||weekMinutes;
    const months=monthKeys.map(key=>({key,kwh:0,freeKwh:0,count:0,estimated:0,expected:new Date(Date.UTC(+key.slice(0,4),+key.slice(5,7),0)).getUTCDate()*96}));
    const map=new Map(months.map(m=>[m.key,m]));
    for(const r of records){
      if(r.meter!==meter||r.flow!=='Consumption')continue;
      const m=map.get(r.day.slice(0,7));if(!m)continue;
      m.kwh+=r.kwh;m.count++;m.estimated+=Number(r.estimated);
      if(plan.free){
        const minuteOfWeek=weekly?new Date(r.day+'T00:00:00Z').getUTCDay()*1440+r.start:0;
        const isFree=weekly?(minuteOfWeek-weekStart+weekMinutes)%weekMinutes<weekLength:(start<end?r.start>=start&&r.start<end:r.start>=start||r.start<end);
        if(isFree)m.freeKwh+=r.kwh;
      }
    }
    for(const m of months){
      m.complete=m.count===m.expected;
      if(!m.count){m.bill=null;continue;}
      m.delivery=cents(m.kwh*deliveryRate);m.base=cents(Number(plan.base));m.energy=cents(Math.max(0,m.kwh-m.freeKwh)*energyRate);
      m.credit=plan.credits.filter(c=>m.kwh+1e-8>=Number(c.threshold)).reduce((sum,c)=>sum+cents(Number(c.amount)),0);
      m.bill=Math.max(0,m.delivery+m.base+m.energy-m.credit);
    }
    const known=months.filter(m=>m.bill!==null),total=known.reduce((sum,m)=>sum+m.bill,0),kwh=known.reduce((sum,m)=>sum+m.kwh,0);
    return {months,total:known.length?total:null,average:known.length?total/known.length:null,effective:kwh?total/kwh:null,known:known.length,complete:known.filter(m=>m.complete).length};
  }
  function period(lastDay,year){
    if(year!=='latest')return Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,'0')}`);
    const last=new Date(lastDay+'T00:00:00Z');return Array.from({length:12},(_,i)=>new Date(Date.UTC(last.getUTCFullYear(),last.getUTCMonth()-11+i,1)).toISOString().slice(0,7));
  }
  const api={rate,time,validate,compare,period};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PowerPlans=api;
})(typeof globalThis!=='undefined'?globalThis:this);
