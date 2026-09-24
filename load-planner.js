/* Private 15-minute demand screening. This is not an electrical load calculation. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id),dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  let records=[],meter='',loads=[];
  const format=n=>n.toLocaleString('en-US',{maximumFractionDigits:1,minimumFractionDigits:1});
  const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  const button=(text,action,cls='text-button')=>{const b=node('button',cls,text);b.type='button';b.onclick=action;return b;};
  const minutes=value=>{const m=/^(\d{2}):(\d{2})$/.exec(value);return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:NaN;};
  const defaults={ev:{name:'Level 2 EV charger',kw:7.7,continuous:true,start:'21:00',end:'07:00',days:'all'},induction:{name:'Induction cooktop',kw:10,continuous:false,start:'17:00',end:'20:00',days:'all'},custom:{name:'New load',kw:1,continuous:false,start:'00:00',end:'00:00',days:'all'}};
  function addLoad(type='ev'){loads.push({...defaults[type],type,id:crypto.randomUUID()});render();}
  function applies(load,row){
    const weekday=new Date(row.day+'T00:00:00Z').getUTCDay(),dayOk=load.days==='all'||load.days==='weekdays'&&weekday>0&&weekday<6||load.days==='weekends'&&(weekday===0||weekday===6);if(!dayOk)return false;
    const start=minutes(load.start),end=minutes(load.end),at=row.start;if(!Number.isFinite(start)||!Number.isFinite(end))return false;
    if(start===end)return true;return start<end?at>=start&&at<end:at>=start||at<end;
  }
  function input(label,value,change,{type='text',min,step,options}={}){const wrap=node('label','load-field',label),control=node(options?'select':'input');if(options){for(const [v,text]of options){const option=node('option','',text);option.value=v;control.append(option);}}else{control.type=type;if(min!==undefined)control.min=min;if(step!==undefined)control.step=step;}if(control.type==='checkbox')control.checked=value;else control.value=value;control.addEventListener('input',()=>change(control.type==='checkbox'?control.checked:control.value));control.addEventListener('change',()=>change(control.type==='checkbox'?control.checked:control.value));wrap.append(control);return wrap;}
  function loadEditor(load){
    const card=node('article','load-card'),head=node('div','load-card-head');head.append(node('h3','',load.name),button('Remove',()=>{loads=loads.filter(x=>x.id!==load.id);render();}));card.append(head);
    const grid=node('div','load-grid');
    grid.append(input('Load type',load.type,value=>{const replacement={...defaults[value],type:value,id:load.id};loads[loads.indexOf(load)]=replacement;render();},{options:[['ev','EV charger'],['induction','Induction cooktop'],['custom','Other load']]}));
    grid.append(input('Name',load.name,value=>{load.name=value;renderResults();}));
    grid.append(input('Nameplate / charger power (kW)',load.kw,value=>{load.kw=value;renderResults();},{type:'number',min:'0',step:'0.1'}));
    grid.append(input('Active days',load.days,value=>{load.days=value;renderResults();},{options:[['all','Every day'],['weekdays','Weekdays'],['weekends','Weekends']]}));
    grid.append(input('Starts',load.start,value=>{load.start=value;renderResults();},{type:'time',step:'900'}));
    grid.append(input('Ends',load.end,value=>{load.end=value;renderResults();},{type:'time',step:'900'}));
    const continuous=input('Continuous load (125% planning factor)',load.continuous,value=>{load.continuous=value;renderResults();},{type:'checkbox'});continuous.classList.add('load-check');grid.append(continuous);card.append(grid);
    const note=node('p','small',load.continuous?`Planning contribution: ${format(Number(load.kw||0)*1.25)} kW (nameplate × 125%).`:`Planning contribution: ${format(Number(load.kw||0))} kW.`);card.append(note);return card;
  }
  function renderResults(){
    const from=$('from').value,to=$('to').value,service=Number($('service-amps').value),voltage=Number($('service-voltage').value),margin=Number($('planning-margin').value);
    const selected=records.filter(r=>r.meter===meter&&r.flow==='Consumption'&&r.day>=from&&r.day<=to),validLoads=loads.filter(l=>Number.isFinite(Number(l.kw))&&Number(l.kw)>=0&&Number.isFinite(minutes(l.start))&&Number.isFinite(minutes(l.end)));
    const target=service>0&&voltage>0&&margin>0?service*voltage/1000*margin/100:NaN;
    const samples=selected.map(row=>{const base=row.kwh*4,added=validLoads.reduce((sum,load)=>sum+(applies(load,row)?Number(load.kw)*(load.continuous?1.25:1):0),0);return {...row,base,added,total:base+added};});
    const peak=samples.reduce((best,s)=>!best||s.total>best.total?s:best,null),basePeak=samples.reduce((best,s)=>!best||s.base>best.base?s:best,null),over=samples.filter(s=>s.total>target).length;
    $('load-results').replaceChildren();if(!samples.length){$('load-results').append(node('p','load-empty','No grid-consumption readings exist for the selected meter and dashboard dates.'));return;}
    const stats=node('div','load-stats'),values=[['Measured 15-minute peak',format(basePeak.base)+' kW','Before proposed loads'],['Modeled 15-minute peak',format(peak.total)+' kW',`${format(peak.base)} kW measured + ${format(peak.added)} kW proposed`],['Planning capacity',Number.isFinite(target)?format(target)+' kW':'—',`${format(service||0)} A × ${format(voltage||0)} V × ${format(margin||0)}%`],['Headroom at modeled peak',Number.isFinite(target)?format(target-peak.total)+' kW':'—',Number.isFinite(target)&&target<peak.total?`${over.toLocaleString()} intervals exceed target`:'No modeled interval exceeds target']];
    for(const [label,value,note]of values){const cell=node('div','load-stat');cell.append(node('span','small',label),node('strong','',value),node('span','small',note));stats.append(cell);} $('load-results').append(stats);
    const top=samples.sort((a,b)=>b.total-a.total).slice(0,3),table=node('table','load-peak-table'),head=node('thead'),tr=node('tr');for(const label of ['Highest modeled intervals','Measured','Added','Modeled'])tr.append(node('th','',label));head.append(tr);table.append(head);const body=node('tbody');for(const sample of top){const row=node('tr'),when=new Date(sample.day+'T00:00:00Z');when.setUTCMinutes(sample.start);const label=when.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})+' · '+when.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'UTC'});row.append(node('th','',label),node('td','',format(sample.base)+' kW'),node('td','',format(sample.added)+' kW'),node('td','',format(sample.total)+' kW'));body.append(row);}table.append(body);$('load-results').append(table);
    $('load-data-note').textContent=`${selected.length.toLocaleString()} 15-minute grid-consumption readings in the dashboard date range. This is measured average kW over each 15-minute interval, not instantaneous demand.`;
  }
  function render(){
    $('load-list').replaceChildren(...loads.map(loadEditor));$('load-results').replaceChildren();$('load-data-note').textContent='';renderResults();
  }
  function update(nextRecords,nextMeter){records=nextRecords;meter=nextMeter;render();}
  function init(){
    $('add-ev').onclick=()=>addLoad('ev');$('add-induction').onclick=()=>addLoad('induction');$('add-custom-load').onclick=()=>addLoad('custom');for(const id of ['service-amps','service-voltage','planning-margin'])$(id).addEventListener('input',renderResults);render();
  }
  root.LoadPlanner={init,update};
})(globalThis);
