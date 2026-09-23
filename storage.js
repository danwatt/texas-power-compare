/* Versioned, compact localStorage representation. No usage data leaves the browser. */
(function(root){
  'use strict';
  const key='current:usage:v1';
  function encode(records,meta){
    const meters=[],days=[],revisions=[],maps=[new Map(),new Map(),new Map()];
    function index(value,values,map){if(!map.has(value)){map.set(value,values.length);values.push(value);}return map.get(value);}
    const rows=records.map(r=>[index(r.meter,meters,maps[0]),index(r.day,days,maps[1]),r.start/15,r.kwh,(r.flow==='SurplusGeneration'?2:0)+(r.estimated?1:0),index(r.revision,revisions,maps[2])]);
    return JSON.stringify({version:1,meters,days,revisions,rows,meta});
  }
  function decode(text){
    const data=JSON.parse(text),fail=()=>{throw new Error('Invalid saved data');};
    if(!data||data.version!==1||!['meters','days','revisions','rows'].every(k=>Array.isArray(data[k]))||!data.rows.length)fail();
    const {meters,days,revisions,meta}=data;
    if(!meters.every(m=>typeof m==='string'&&/^\d+$/.test(m))||!days.every(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d)||!revisions.every(Number.isFinite))fail();
    if(!meta||!['fileCount','invalidRows','duplicateRows'].every(k=>Number.isSafeInteger(meta[k])&&meta[k]>=0))fail();
    const records=data.rows.map(row=>{
      if(!Array.isArray(row)||row.length!==6)fail();
      const [m,d,slot,kwh,flags,rev]=row;
      if(![m,d,slot,flags,rev].every(Number.isSafeInteger)||m<0||m>=meters.length||d<0||d>=days.length||slot<0||slot>95||flags<0||flags>3||rev<0||rev>=revisions.length||!Number.isFinite(kwh)||kwh<0)fail();
      return {meter:meters[m],day:days[d],start:slot*15,kwh,flow:flags&2?'SurplusGeneration':'Consumption',estimated:Boolean(flags&1),revision:revisions[rev]};
    });
    records.sort((a,b)=>a.day.localeCompare(b.day)||a.start-b.start);
    return {records,meta};
  }
  const api={key,encode,decode};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PowerStorage=api;
})(typeof globalThis!=='undefined'?globalThis:this);
