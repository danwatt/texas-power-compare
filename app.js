'use strict';
const $ = id => document.getElementById(id);
const format = (n, digits = 0) => n.toLocaleString('en-US', {maximumFractionDigits:digits,minimumFractionDigits:digits});
let records = [], demoMode = false, grouping = 'month', current, invalidRows = 0, duplicateRows = 0, fileCount = 0;
let savedLocally=false;
let activeTask = 'usage';
function syncWorkspace() {
  const loaded=records.length>0,shared=!$('shared-notice').hidden;
  $('loaded-header').hidden=!loaded&&!shared;
  $('welcome').hidden=loaded||shared;$('drop-zone').hidden=loaded||shared;
  $('dashboard').hidden=!loaded;
  $('empty').hidden=loaded||activeTask==='plans';
  $('empty').querySelector('h2').textContent=activeTask==='loads'?'Start with your home’s measured usage':'Your everyday patterns. A clearer picture.';
  $('usage-panel').hidden=activeTask!=='usage';$('loads-panel').hidden=activeTask!=='loads';$('plans-panel').hidden=activeTask!=='plans';
  $('dashboard').querySelector('.dashboard-heading').hidden=true;
  $('dashboard').querySelector('.flow-filter').hidden=activeTask!=='usage';
  $('exit-demo').hidden=!demoMode;$('manage-data').hidden=shared;$('add-files').hidden=shared;
  $('storage-status').hidden=shared;
  $('loaded-summary').textContent=shared?'Anonymous shared comparison':demoMode?'Sample data · January–December 2025':$('dataset-info').textContent;
  $('filter-scope').textContent=activeTask==='plans'?($('plan-independent').checked?'Plans use a separate period, selected below.':'Plans use grid consumption for the calendar months in this period.'):activeTask==='loads'?'Appliance scenarios use grid consumption in this period.':'Applies to usage charts. A typical day can use its own period.';
  $('active-period').textContent=loaded?`${$('from').value} – ${$('to').value} · ${activeTask==='usage'?$('flow').selectedOptions[0].textContent:'Grid consumption'}`:'';
  // Shared comparisons have their own fixed period and no access to private filters.
  if(shared)$('dashboard').hidden=true;
  for(const task of ['usage','plans','loads']){const tab=$('tab-'+task);tab.setAttribute('aria-selected',String(activeTask===task));tab.tabIndex=activeTask===task?0:-1;tab.hidden=shared&&task!=='plans';}
}
function selectTask(task){activeTask=task;syncWorkspace();}
for(const task of ['usage','plans','loads']){
  $('tab-'+task).onclick=()=>selectTask(task);
  $('tab-'+task).onkeydown=e=>{
    const tabs=['usage','plans','loads'].filter(t=>!$('tab-'+t).hidden),at=tabs.indexOf(task);
    const next=e.key==='ArrowRight'?tabs[(at+1)%tabs.length]:e.key==='ArrowLeft'?tabs[(at+tabs.length-1)%tabs.length]:e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):null;
    if(next){e.preventDefault();selectTask(next);$('tab-'+next).focus();}
  };
}
$('plan-independent').addEventListener('change',syncWorkspace);
$('add-files').onclick=()=>$('files').click();
$('manage-data').onclick=()=>{$('data-summary').textContent=demoMode?'You are viewing sample data. Deleting saved usage also removes any personal imports stored in this browser.':$('dataset-info').textContent;$('data-dialog').showModal();};
$('close-data').onclick=()=>$('data-dialog').close();
$('data-help').onclick=()=>{$('data-dialog').close();$('guide').showModal();};
$('exit-demo').onclick=()=>location.reload();
function persist(){
  try{localStorage.setItem(PowerStorage.key,PowerStorage.encode(records,{fileCount,invalidRows,duplicateRows}));savedLocally=true;return true;}
  catch{savedLocally=false;return false;}
}
const monthLabel = key => new Date(key + '-01T00:00:00Z').toLocaleDateString('en-US',{month:'short',year:'2-digit',timeZone:'UTC'});
const hourLabel = h => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
function node(tag, cls, text) { const el=document.createElement(tag); if(cls) el.className=cls; if(text !== undefined) el.textContent=text; return el; }
function status(text, error=false) { $('status').textContent=text; $('status').className=error?'error':''; }
function bounds(latest=true) {
  const meterRecords=records.filter(r=>r.meter===$('meter').value);
  const first=meterRecords[0].day,last=meterRecords.at(-1).day;
  let from=first;
  if(latest) { const d=new Date(last+'T00:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()-11); from=[first,d.toISOString().slice(0,10)].sort().at(-1); }
  for(const id of ['from','to']) {$(id).min=first;$(id).max=last;}
  $('from').value=from; $('to').value=last;
}
function setup() {
  const old=$('meter').value; $('meter').replaceChildren();
  [...new Set(records.map(r=>r.meter))].forEach(m=>{const o=node('option','',`Meter ···${m.slice(-6)}`);o.value=m;o.title=m;$('meter').append(o);});
  if(records.some(r=>r.meter===old)) $('meter').value=old;
  $('dashboard').hidden=false;$('empty').hidden=true;$('demo-badge').hidden=!demoMode;
  $('dataset-info').textContent=demoMode?'Illustrative sample · January–December 2025 · not saved':`${fileCount} file${fileCount===1?'':'s'} imported · ${format(records.length)} readings · ${savedLocally?'saved on this browser':'not saved — this tab only'}`;
  bounds();setupRhythm();render();syncWorkspace();
}
async function importFiles(files) {
  if(!files.length)return;
  $('files').disabled=true;$('demo').disabled=true;status('Reading your CSV files…');
  try {
    const additions=[];let invalid=0;
    for(const file of files){if(!/\.csv$/i.test(file.name))throw new Error(`${file.name}: please select a CSV file.`);if(file.size>50*1024*1024)throw new Error('Please use CSV files smaller than 50 MB.'); const parsed=PowerData.parse(await file.text());for(const record of parsed.records)additions.push(record);invalid+=parsed.invalid;}
    const merged=PowerData.merge((demoMode?[]:records).concat(additions));
    if(demoMode){invalidRows=0;duplicateRows=0;fileCount=0;}
    records=merged.records;demoMode=false;invalidRows+=invalid;duplicateRows+=merged.duplicates;fileCount+=files.length;
    const saved=persist();setup();status(`Imported successfully.${invalidRows?' '+format(invalidRows)+' invalid rows skipped.':''}${duplicateRows?' '+format(duplicateRows)+' overlapping readings resolved using revision dates.':''}`);
    $('storage-status').textContent=saved?'Saved on this browser. Your readings will return when you reopen this app.':'Could not save: browser storage is full or unavailable. This import is available in this tab only; keep your CSV. Any previously saved copy is unchanged.';
  } catch(e){status(e.message,true);}finally{$('files').disabled=false;$('demo').disabled=false;$('files').value='';}
}
function render() {
  const from=$('from').value,to=$('to').value;
  if(!from||!to||from>to){status('Choose a valid date range with the start on or before the end.',true);return;}
  if((new Date(to)-new Date(from))/86400000>3660){status('Choose a date range of 10 years or less.',true);return;}
  if($('status').className==='error')status('');
  current=PowerData.analyze(records,{meter:$('meter').value,from,to,flow:$('flow').value,grouping});
  const s=current;
  $('stats').replaceChildren();
  const stats=[['Total energy',format(s.total), 'kWh','In the selected date range'],['Average day',s.averageDay===null?'—':format(s.averageDay,1),'kWh',`${s.completeDays} complete days only`],['Peak demand',s.selected.length?format(s.peak,2):'—','kW','Highest 15-minute average'],['Readings available',s.expected?format(s.selected.length/s.expected*100,1):'0','%',`${format(s.selected.length)} of ${format(s.expected)} expected*`]];
  for(const [label,value,unit,note]of stats){const box=node('div','stat');box.append(node('div','stat-label',label));const v=node('div','stat-value',value);v.append(node('small','',unit));box.append(v,node('div','stat-note',note));$('stats').append(box);}
  $('quality').textContent=`${s.selected.length?'':'No readings for this meter, date range, and energy type. '}${s.estimated?format(s.estimated)+' estimated readings included. ':''}*Coverage assumes 96 readings per day; daylight-saving days may differ. ${s.selected.length<s.expected?'Partial totals are not extrapolated.':''}`;
  renderHeatmap(s);renderMonthly(s);updateRhythm();PowerPlansUI.update(records,$('meter').value,demoMode);LoadPlanner.update(records,$('meter').value);syncWorkspace();
}
function setupRhythm(){
  const available=records.filter(r=>r.meter===$('meter').value),years=[...new Set(available.map(r=>r.day.slice(0,4)))].sort();
  const previous=$('rhythm-year').value;$('rhythm-year').replaceChildren();
  for(const year of years){const option=node('option','',year);option.value=year;$('rhythm-year').append(option);}
  $('rhythm-year').value=years.includes(previous)?previous:years.at(-1);
  $('rhythm-start').value=available[0].day.slice(0,7);$('rhythm-end').value=available.at(-1).day.slice(0,7);$('rhythm-month').value=available.at(-1).day.slice(0,7);
}
function updateRhythm(){
  const mode=$('rhythm-period').value;
  $('rhythm-year-label').hidden=!['year','season'].includes(mode);
  $('rhythm-seasons').hidden=mode!=='season';
  $('rhythm-start-label').hidden=mode!=='range';$('rhythm-end-label').hidden=mode!=='range';$('rhythm-month-label').hidden=mode!=='month';
  let from=$('from').value,to=$('to').value,source=records,description='Analysis period';
  const endOfMonth=m=>new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).toISOString().slice(0,10);
  const validMonth=m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m);
  function empty(message){$('profile').replaceChildren();$('rhythm-summary').textContent=message;}
  if(mode==='year'||mode==='season'){
    const year=$('rhythm-year').value;from=year+'-01-01';to=year+'-12-31';description=year;
    if(mode==='season'){
      const seasons={winter:[12,1,2],spring:[3,4,5],summer:[6,7,8],fall:[9,10,11]};
      const chosen=[...$('rhythm-seasons').querySelectorAll('input:checked')].map(e=>e.value);
      if(!chosen.length){empty('Select at least one season.');return;}
      const months=chosen.flatMap(s=>seasons[s]);source=records.filter(r=>months.includes(Number(r.day.slice(5,7))));description=chosen.map(s=>s[0].toUpperCase()+s.slice(1)).join(' + ')+' · '+year;
    }
  }else if(mode==='range'||mode==='month'){
    const start=$(mode==='month'?'rhythm-month':'rhythm-start').value,end=$(mode==='month'?'rhythm-month':'rhythm-end').value;
    if(!validMonth(start)||!validMonth(end)||start>end){empty('Choose a valid month range with the start on or before the end.');return;}
    from=start+'-01';to=endOfMonth(end);description=start===end?monthLabel(start):monthLabel(start)+' – '+monthLabel(end);
  }
  if(!from||!to||from>to||(new Date(to)-new Date(from))/86400000>3660){empty('Choose a valid period of 10 years or less.');return;}
  const result=PowerData.analyze(source,{meter:$('meter').value,from,to,flow:$('flow').value});
  const hours=result.profile.flat().reduce((sum,c)=>sum+c.count,0);
  $('rhythm-summary').textContent=`${description} · ${from} – ${to} · ${format(hours)} complete hours · ${mode==='selected'?'Follows analysis period':'Applies only to this chart'}`;
  if(!hours){$('profile').replaceChildren(node('p','rhythm-empty','No complete hourly readings for this period and energy type.'));return;}
  renderProfile(result);
}
function renderHeatmap(s){
  const table=node('table','heatmap-table');table.setAttribute('aria-label','Average hourly energy in kilowatt-hours');
  // Explicit columns keep unlabeled hours as wide as hours with time labels.
  table.style.tableLayout='fixed';
  const columns=node('colgroup');
  const labelColumn=node('col');labelColumn.style.width='83px';columns.append(labelColumn);
  for(let h=0;h<24;h++)columns.append(node('col'));
  table.append(columns);
  const head=node('thead'),hr=node('tr');hr.append(node('th','',grouping==='month'?'Month':'Week of'));for(let h=0;h<24;h++)hr.append(node('th','',h%3===0?hourLabel(h):''));head.append(hr);table.append(head);
  const values=s.groups.flatMap(([,cells])=>cells.filter(c=>c.count).map(c=>c.sum/c.count)),max=Math.max(...values,0.001);
  const body=node('tbody');
  for(const[key,cells]of s.groups){const tr=node('tr');const label=grouping==='month'?monthLabel(key):key.slice(5);const th=node('th','',label);th.scope='row';tr.append(th);
    cells.forEach((c,h)=>{const td=node('td'),b=node('button','heat-cell'+(c.count?'':' missing'));const v=c.count?c.sum/c.count:null;
      const detail=`${grouping==='month'?monthLabel(key):'Week of '+key} · ${hourLabel(h)}–${hourLabel((h+1)%24)} · ${v===null?'No complete hours':format(v,2)+' kWh average · '+c.count+' complete hours'}`;
      b.title=detail;b.setAttribute('aria-label',detail);if(v!==null){const ratio=v/max;b.style.backgroundColor=`rgb(${Math.round(237-204*ratio)},${Math.round(243-170*ratio)},${Math.round(255-102*ratio)})`;}
      b.addEventListener('click',()=>{$('cell-detail').textContent=detail;});b.addEventListener('focus',()=>{$('cell-detail').textContent=detail;});td.append(b);tr.append(td);});body.append(tr);
  }
  table.append(body);$('heatmap').replaceChildren(table);$('cell-detail').textContent='Select a cell to explore an hour.';
}
function renderMonthly(s){
  const chart=node('div','bar-chart'),detail=node('p','bar-detail','Striped bars indicate missing readings in the selected range.');detail.setAttribute('aria-live','polite');
  const max=Math.max(...s.months.map(m=>m.total),1);
  for(const m of s.months){const col=node('div','bar-column'),partial=m.count<m.expected;col.append(node('span','bar-value',m.count?format(m.total):'—'));const bar=node('button','bar'+(!m.count?' no-data':partial?' partial':''));bar.style.height=`${m.total/max*145+2}px`;const text=`${monthLabel(m.key)}: ${m.count?format(m.total,2)+' kWh':'No readings'} · ${format(m.count)} of ${format(m.expected)} selected-range readings${partial?' (incomplete)':''}`;bar.title=text;bar.setAttribute('aria-label',text);bar.onclick=()=>{detail.textContent=text;};bar.onfocus=bar.onclick;col.append(bar,node('span','bar-label',monthLabel(m.key)));chart.append(col);}
  $('monthly').replaceChildren(chart,detail);
}
function renderProfile(s){
  const NS='http://www.w3.org/2000/svg';const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 500 220');svg.classList.add('profile-svg');svg.setAttribute('role','img');svg.setAttribute('aria-label','Average hourly energy: blue weekdays, amber weekends. Missing hours have gaps.');
  function el(tag,attrs,text){const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text)e.textContent=text;svg.append(e);return e;}
  const max=Math.max(...s.profile.flat().filter(c=>c.count).map(c=>c.sum/c.count),1)*1.15;
  for(let i=0;i<=4;i++){const y=180-i*40;el('line',{x1:38,x2:484,y1:y,y2:y,stroke:'#e5eaf4','stroke-dasharray':'3 4'});el('text',{x:28,y:y+4,'text-anchor':'end',fill:'#71819b','font-size':11},format(max*i/4,1));}
  for(let h=0;h<24;h+=6)el('text',{x:38+h/23*446,y:205,fill:'#71819b','font-size':11},hourLabel(h));el('text',{x:462,y:205,fill:'#71819b','font-size':11},'11pm');
  s.profile.forEach((series,i)=>{let path='',previous=false;for(let h=0;h<24;h++){const c=series[h];if(!c.count){previous=false;continue;}const x=38+h/23*446,y=180-c.sum/c.count/max*160;path+=`${previous?'L':'M'}${x},${y} `;previous=true;const dot=el('circle',{cx:x,cy:y,r:3,fill:i?'#cd8b2b':'#3568c5',tabindex:0});const title=document.createElementNS(NS,'title');title.textContent=`${i?'Weekend':'Weekday'} ${hourLabel(h)}: ${format(c.sum/c.count,2)} kWh (${c.count} hours)`;dot.append(title);}el('path',{d:path,fill:'none',stroke:i?'#cd8b2b':'#3568c5','stroke-width':2.5,'stroke-linejoin':'round'});});
  $('profile').replaceChildren(svg);
}
$('files').onchange=e=>importFiles([...e.target.files]);
for(const type of ['dragover','dragleave','drop'])$('drop-zone').addEventListener(type,e=>{e.preventDefault();$('drop-zone').classList.toggle('dragging',type==='dragover');if(type==='drop'&&!$('files').disabled)importFiles([...e.dataTransfer.files]);});
$('demo').onclick=()=>{records=PowerData.demo();demoMode=true;invalidRows=0;duplicateRows=0;fileCount=0;status('');$('storage-status').textContent='Sample data is not saved. Exit demo to return to your own data.';setup();};
$('clear').onclick=()=>{if(!confirm('Delete all saved usage from this browser? Keep your original CSVs to import it again. Electricity plans will be kept.'))return;try{localStorage.removeItem(PowerStorage.key);}catch{$('storage-status').textContent='Could not remove the saved copy. Clear this site’s data in your browser settings, then try again.';return;}records=[];current=null;invalidRows=0;duplicateRows=0;fileCount=0;demoMode=false;savedLocally=false;for(const id of ['stats','heatmap','monthly','profile','meter','rhythm-year'])$(id).replaceChildren();for(const id of ['dataset-info','quality','cell-detail','rhythm-summary','storage-status'])$(id).textContent='';$('from').value='';$('to').value='';$('dashboard').hidden=true;$('empty').hidden=false;status('Data cleared from this tab and browser storage.');PowerPlansUI.update([], '', false);LoadPlanner.update([], '');$('data-dialog').close();syncWorkspace();};
$('meter').onchange=()=>{bounds();setupRhythm();render();syncWorkspace();};for(const id of ['from','to','flow'])$(id).onchange=render;
for(const id of ['rhythm-period','rhythm-year','rhythm-start','rhythm-end','rhythm-month','rhythm-seasons'])$(id).addEventListener('change',updateRhythm);
$('last-year').onclick=()=>{bounds();render();};$('all-dates').onclick=()=>{bounds(false);render();};
for(const[id,g]of [['months','month'],['weeks','week']])$(id).onclick=()=>{grouping=g;$('months').setAttribute('aria-pressed',g==='month');$('weeks').setAttribute('aria-pressed',g==='week');render();};
$('guide-button').onclick=()=>$('guide').showModal();$('close-guide').onclick=()=>$('guide').close();$('guide').addEventListener('click',e=>{if(e.target===$('guide')){const r=$('guide').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('guide').close();}});
$('export').onclick=()=>{if(!current)return;const text='MONTH,ENERGY_TYPE,KWH,READINGS,EXPECTED_READINGS_IN_SELECTED_RANGE\r\n'+current.months.map(m=>`${m.key},${$('flow').value},${m.total.toFixed(3)},${m.count},${m.expected}`).join('\r\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv'}));const a=node('a');a.href=url;a.download='current-monthly-usage.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
PowerPlansUI.init();
LoadPlanner.init();
try{
  const text=localStorage.getItem(PowerStorage.key);
  if(text){const restored=PowerStorage.decode(text);records=restored.records;({fileCount,invalidRows,duplicateRows}=restored.meta);savedLocally=true;setup();$('storage-status').textContent='Restored readings saved on this browser. Manage data lets you delete the saved copy.';}
}catch{$('storage-status').textContent='Saved data could not be read or browser storage is unavailable. Import your CSV to continue.';}

if(!$('shared-notice').hidden)activeTask='plans';
syncWorkspace();
