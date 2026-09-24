(function(root){
  'use strict';
  const key='current:plans:v1', $=id=>document.getElementById(id);
  const money=cents=>cents===null?'—':(cents/100).toLocaleString('en-US',{style:'currency',currency:'USD'});
  const number=n=>n.toLocaleString('en-US',{maximumFractionDigits:2});
  const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const month=key=>new Date(key+'-01T00:00:00Z').toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'});
  let plans=[],records=[],meter='',editing=null,demo=false,sharedData=null;
  function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  function button(text,action,cls='text-button'){const b=el('button',cls,text);b.type='button';b.onclick=action;return b;}
  function save(){
    if(sharedData){$('plan-status').textContent='Changes apply to this shared comparison in this tab. Use Share again to create an updated link.';return;}
    try{localStorage.setItem(key,JSON.stringify({version:1,plans}));$('plan-status').textContent='Plans saved on this browser.';}catch{$('plan-status').textContent='Plans could not be saved. Changes are available in this tab only; any previous saved plans are unchanged.';}
  }
  function creditRow(credit={amount:'',threshold:''}){
    const row=el('div','credit-row');
    for(const [field,label]of [['amount','Credit ($)'],['threshold','At least (kWh/month)']]){const l=el('label','',label),input=el('input');input.type='number';input.min='0';input.step='any';input.required=true;input.dataset.field=field;input.value=credit[field];l.append(input);row.append(l);}
    row.append(button('Remove',()=>row.remove()));$('plan-credits').append(row);
  }
  function edit(index=null){
    editing=index;const p=index===null?{name:'',delivery:'',deliveryUnit:'auto',energy:'',energyUnit:'auto',base:'',credits:[],free:false,start:'21:00',end:'07:00'}:plans[index];
    $('plan-dialog-title').textContent=index===null?'Add an electricity plan':'Edit electricity plan';
    for(const f of ['name','delivery','deliveryUnit','energy','energyUnit','base','start','end'])$('plan-'+f).value=p[f];
    $('plan-discount').value=p.free?(p.discount||'daily'):'none';
    $('plan-startDay').value=p.startDay??5;$('plan-endDay').value=p.endDay??0;
    $('plan-weekStart').value=p.weekStart||'19:00';$('plan-weekEnd').value=p.weekEnd||'23:00';
    toggleTimes();$('plan-credits').replaceChildren();p.credits.forEach(creditRow);
    $('plan-error').textContent='';rateHints();$('plan-dialog').showModal();
  }
  function rateHints(){for(const f of ['delivery','energy']){try{$('plan-'+f+'-hint').textContent=`Interpreted as ${number(PowerPlans.rate($('plan-'+f).value,$('plan-'+f+'Unit').value)*100)}¢/kWh`;}catch{$('plan-'+f+'-hint').textContent='Enter a rate to see the interpreted price.';}}}
  function toggleTimes(){const mode=$('plan-discount').value;$('plan-times').hidden=mode!=='daily';$('plan-week-times').hidden=mode!=='weekly';for(const f of ['start','end'])$('plan-'+f).disabled=mode!=='daily';for(const f of ['startDay','endDay','weekStart','weekEnd'])$('plan-'+f).disabled=mode!=='weekly';}
  function update(nextRecords,nextMeter,isDemo){
    if(sharedData)return;
    records=nextRecords;meter=nextMeter;demo=isDemo;
    const previous=$('plan-period').value,years=[...new Set(records.filter(r=>r.meter===meter).map(r=>r.day.slice(0,4)))].sort().reverse();
    $('plan-period').replaceChildren();const latest=el('option','','Latest 12 calendar months');latest.value='latest';$('plan-period').append(latest);
    years.forEach(y=>{const o=el('option','',y);o.value=y;$('plan-period').append(o);});$('plan-period').value=years.includes(previous)?previous:'latest';render();
  }
  function render(){
    const relevant=records.filter(r=>r.meter===meter),last=relevant.length?relevant.at(-1).day:null;
    const keys=sharedData?sharedData.months.map(m=>m.key):last?PowerPlans.period(last,$('plan-period').value):[];
    const data=sharedData||last&&PowerPlans.aggregate(records,meter,keys);
    const results=plans.map(p=>sharedData?PowerPlans.compareData(sharedData,p):last?PowerPlans.compare(records,meter,keys,p):null);
    $('plan-context').textContent=sharedData?`Shared comparison · ${month(keys[0])}–${month(keys.at(-1))} · anonymous monthly and weekday/hour totals only. No ESI ID or 15-minute readings were included.`:last?`${demo?'Sample data · ':''}Meter ···${meter.slice(-6)} · ${month(keys[0])}–${month(keys.at(-1))} · Grid consumption only. This period is independent of the chart dates above.`:'Import usage or explore sample data to calculate bills. You can add plans now.';
    $('shared-notice').hidden=!sharedData;$('share-plan').textContent=sharedData?'Copy updated share link':'Share comparison';
    $('plan-cards').replaceChildren();$('plan-results').replaceChildren();
    if(!plans.length)$('plan-cards').append(el('p','plan-empty','Add your first plan to compare its cost against your actual usage.'));
    plans.forEach((p,i)=>{
      const card=el('article','plan-card'),head=el('div','plan-card-heading');head.append(el('h3','',p.name));
      const actions=el('div');actions.append(button('Edit',()=>edit(i)),button('Remove',()=>{plans.splice(i,1);save();render();}));head.append(actions);card.append(head);
      card.append(el('p','small',`${number(PowerPlans.rate(p.energy,p.energyUnit)*100)}¢ energy + ${number(PowerPlans.rate(p.delivery,p.deliveryUnit)*100)}¢ delivery / kWh · ${money(Number(p.base)*100)} base / month`));
      if(p.credits.length)card.append(el('p','small','Monthly credits: '+p.credits.map(c=>`${money(Number(c.amount)*100)} at ${number(Number(c.threshold))}+ kWh`).join('; ')));
      if(p.free)card.append(el('p','small',p.discount==='weekly'?`Free energy: ${weekdays[p.startDay]} ${p.weekStart} through ${weekdays[p.endDay]} ${p.weekEnd.slice(0,2)}:59:59 each week; delivery still charged.`:`Free energy: ${p.start}–${p.end} daily (end time excluded); delivery still charged.`));
      const r=results[i];const summary=el('div','plan-summary');
      for(const [label,value]of [[r?.complete===12?'Annual total':'Recorded-month total',money(r?.total??null)],['Average monthly bill',money(r?.average??null)],['Effective rate',r?.effective===null||!r?'—':number(r.effective)+'¢/kWh']]){const cell=el('div');cell.append(el('span','small',label),el('strong','',value));summary.append(cell);}card.append(summary);
      card.append(el('p','small',r?`${r.known} of 12 months have readings · ${r.complete} meet the 96-readings/day coverage check. ${r.complete<12?'Partial data; not a full-year estimate.':''}`:'Waiting for usage data.'));$('plan-cards').append(card);
    });
    if(!data||!plans.length)return;
    const table=el('table','plan-table');table.append(el('caption','','Estimated monthly bills — select a bill for its breakdown'));
    const head=el('thead'),tr=el('tr');for(const label of ['Month','Recorded kWh',...plans.map(p=>p.name)])tr.append(el('th','',label));head.append(tr);table.append(head);
    const body=el('tbody');keys.forEach((k,j)=>{const row=el('tr'),m=results[0].months[j];const label=el('th','',month(k));label.scope='row';row.append(label,el('td','',m.count?number(m.kwh):'—'));
      results.forEach((r,i)=>{const v=r.months[j],cell=el('td');if(v.bill===null)cell.append(el('span','small','No readings'));else{const b=button(money(v.bill)+(v.complete?'':' *'),()=>breakdown(plans[i],v),'bill-button');b.setAttribute('aria-label',`${plans[i].name}, ${month(k)}: ${money(v.bill)}${v.complete?'':', partial data'}. Show breakdown`);cell.append(b);}row.append(cell);});body.append(row);});table.append(body);$('plan-results').append(table);
  }
  function breakdown(p,m){
    $('bill-title').textContent=p.name+' · '+month(m.key);$('bill-lines').replaceChildren();
    const lines=[['Recorded consumption',number(m.kwh)+' kWh'],['Free-energy usage',number(m.freeKwh)+' kWh'],['Energy charge',money(m.energy)],['Utility delivery charge',money(m.delivery)],['Utility monthly base',money(m.base)],['Qualifying bill credits','−'+money(m.credit)],['Estimated bill (minimum $0)',money(m.bill)]];
    for(const[label,value]of lines){$('bill-lines').append(el('dt','',label),el('dd','',value));}
    $('bill-note').textContent=`${number(m.count)} of ${number(m.expected)} expected readings (96/day); ${m.estimated} estimated. ${m.complete?'':'Partial month: usage is not extrapolated; the full monthly base charge applies.'}`;$('bill-dialog').showModal();
  }
  function share(){
    try{
      const relevant=records.filter(r=>r.meter===meter),last=relevant.length?relevant.at(-1).day:null;
      const keys=sharedData?sharedData.months.map(m=>m.key):last?PowerPlans.period(last,$('plan-period').value):[];
      if(!keys.length)throw new Error('Import usage before creating a share link.');
      const data=sharedData||PowerPlans.aggregate(records,meter,keys),payload=PowerPlans.shareEncode(data,plans);
      const url=location.href.split('#')[0]+'#compare='+payload;$('share-link').value=url;$('share-size').textContent=`${(url.length/1024).toFixed(1)} KB link · contains ${data.months.length} months of anonymous comparison data and ${plans.length} plan${plans.length===1?'':'s'}.`;$('share-error').textContent='';$('share-dialog').showModal();
    }catch(error){$('plan-status').textContent=error.message;}
  }
  async function copyShare(){try{await navigator.clipboard.writeText($('share-link').value);$('share-error').textContent='Link copied.';}catch{$('share-link').select();$('share-error').textContent='Select and copy the link above.';}}
  function loadShared(){
    const value=new URLSearchParams(location.hash.slice(1)).get('compare');if(!value)return;
    try{const shared=PowerPlans.shareDecode(value);sharedData=shared.data;plans=shared.plans;$('plan-period').replaceChildren();const option=el('option','','Shared period');option.value='shared';$('plan-period').append(option);$('plan-period').value='shared';$('plan-period').disabled=true;}
    catch(error){$('plan-status').textContent='This shared comparison link is invalid or incomplete.';}
  }
  function init(){
    for(const id of ['startDay','endDay'])weekdays.forEach((day,i)=>{const o=el('option','',day);o.value=i;$('plan-'+id).append(o);});
    for(const id of ['weekStart','weekEnd'])for(let h=0;h<24;h++){const o=el('option','',`${h%12||12}:00 ${h<12?'am':'pm'}`);o.value=String(h).padStart(2,'0')+':00';$('plan-'+id).append(o);}
    try{const raw=localStorage.getItem(key);if(raw){const data=JSON.parse(raw);if(data.version!==1||!Array.isArray(data.plans))throw Error();data.plans.forEach(PowerPlans.validate);plans=data.plans;}}catch{$('plan-status').textContent='Saved plans could not be read. Add plans again to continue.';}
    loadShared();
    $('add-plan').onclick=()=>edit();$('share-plan').onclick=share;$('copy-share').onclick=copyShare;$('close-share').onclick=()=>$('share-dialog').close();$('exit-share').onclick=()=>{history.replaceState(null,'',location.href.split('#')[0]);location.reload();};$('close-plan').onclick=()=>$('plan-dialog').close();$('cancel-plan').onclick=()=>$('plan-dialog').close();$('close-bill').onclick=()=>$('bill-dialog').close();
    $('add-credit').onclick=()=>creditRow();$('plan-discount').onchange=toggleTimes;$('plan-period').onchange=render;
    for(const f of ['delivery','energy'])for(const suffix of ['','Unit'])$('plan-'+f+suffix).addEventListener('input',rateHints);
    $('plan-form').onsubmit=e=>{e.preventDefault();try{
      const p={};for(const f of ['name','delivery','deliveryUnit','energy','energyUnit','base','start','end','discount','weekStart','weekEnd'])p[f]=$('plan-'+f).value;p.name=p.name.trim();p.free=p.discount!=='none';p.startDay=Number($('plan-startDay').value);p.endDay=Number($('plan-endDay').value);
      p.credits=[...$('plan-credits').children].map(row=>({amount:row.querySelector('[data-field=amount]').value,threshold:row.querySelector('[data-field=threshold]').value}));PowerPlans.validate(p);
      if(editing===null)plans.push(p);else plans[editing]=p;save();render();$('plan-dialog').close();
    }catch(error){$('plan-error').textContent=error.message;}};
    render();
  }
  root.PowerPlansUI={init,update};
})(globalThis);
