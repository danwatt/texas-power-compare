const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../plans.js'),D=require('../data.js');
const plan={name:'Test',delivery:'5',deliveryUnit:'auto',base:'10',energy:'16',energyUnit:'auto',credits:[],free:false,start:'21:00',end:'07:00'};
const row=(start,kwh,overrides={})=>({meter:'123',day:'2025-01-01',start,kwh,flow:'Consumption',estimated:false,...overrides});
test('rate input auto-detects cents/dollars and allows explicit overrides',()=>{assert.equal(P.rate('16'),.16);assert.equal(P.rate('0.16'),.16);assert.equal(P.rate('5.5'),.055);assert.equal(P.rate('.5','cents'),.005);assert.equal(P.rate('1','dollars'),1);for(const n of ['',-1,'oops',Infinity])assert.throws(()=>P.rate(n));});
test('bill includes energy, delivery and one monthly base; exports and other meters excluded',()=>{const r=P.compare([row(0,1000),row(15,500,{flow:'SurplusGeneration'}),row(30,500,{meter:'456'})],'123',['2025-01'],plan);assert.equal(r.total,22000);assert.equal(r.average,22000);assert.equal(r.effective,22);assert.equal(r.months[0].complete,false);});
test('overnight free window includes 9pm, excludes 7am, and still charges delivery',()=>{const r=P.compare([row(1260,1),row(405,1),row(420,1),row(1245,1),row(0,1)],'123',['2025-01'],{...plan,free:true});assert.equal(r.months[0].freeKwh,3);assert.equal(r.months[0].energy,32);assert.equal(r.months[0].delivery,25);assert.equal(r.total,1057);});
test('custom daytime window and invalid time ranges',()=>{const r=P.compare([row(540,1),row(555,1),row(600,1)],'123',['2025-01'],{...plan,free:true,start:'09:15',end:'10:00'});assert.equal(r.months[0].freeKwh,1);for(const [start,end]of [['21:00','21:00'],['21:01','07:00'],['25:00','07:00']])assert.throws(()=>P.validate({...plan,free:true,start,end}));});
test('credits trigger at exact threshold, stack, count free usage, and floor bill at zero',()=>{const p={...plan,free:true,credits:[{amount:'100',threshold:'2000'},{amount:'20',threshold:'1000'}]};assert.equal(P.compare([row(0,2000)],'123',['2025-01'],p).total,0);assert.equal(P.compare([row(600,2000)],'123',['2025-01'],p).total,31000);assert.equal(P.compare([row(600,1999)],'123',['2025-01'],p).months[0].credit,2000);});
test('missing months are excluded, zero consumption is included, averages use rounded bills',()=>{const r=P.compare([row(0,0),row(0,100,{day:'2025-02-01'})],'123',['2025-01','2025-02','2025-03'],plan);assert.equal(r.total,4100);assert.equal(r.average,2050);assert.equal(r.known,2);assert.equal(r.months[2].bill,null);assert.equal(r.months[0].bill,1000);assert.equal(P.compare([],'123',['2025-01'],plan).total,null);});
test('yearly total charges exactly 12 base fees and free hours affect energy only',()=>{const records=[];for(let d=new Date('2025-01-01T00:00:00Z');d<new Date('2026-01-01T00:00:00Z');d=new Date(+d+86400000))for(let i=0;i<96;i++)records.push(row(i*15,.25,{day:d.toISOString().slice(0,10)}));const r=P.compare(records,'123',P.period('2025-12-31','2025'),{...plan,free:true});assert.equal(r.complete,12);assert.equal(r.total,(8760*.05+5110*.16+120)*100);assert.equal(r.average,r.total/12);});
test('comparison period is 12 months across year boundaries',()=>{assert.deepEqual(P.period('2026-02-15','latest').filter((_,i)=>i===0||i===11),['2025-03','2026-02']);});
test('free weekends include Friday 19:00 through Sunday 23:45, but not Monday',()=>{
  const p={...plan,free:true,discount:'weekly',startDay:5,endDay:0,weekStart:'19:00',weekEnd:'23:00'};
  const data=[row(1125,1,{day:'2025-01-03'}),row(1140,1,{day:'2025-01-03'}),row(720,1,{day:'2025-01-04'}),row(1380,1,{day:'2025-01-05'}),row(1425,1,{day:'2025-01-05'}),row(0,1,{day:'2025-01-06'})];
  const r=P.compare(data,'123',['2025-01'],p).months[0];assert.equal(r.freeKwh,4);assert.equal(r.energy,32);assert.equal(r.delivery,30);assert.equal(r.bill,1062);
});
test('custom weekly days work across year/month boundaries and include the end hour',()=>{
  const p={...plan,free:true,discount:'weekly',startDay:2,endDay:3,weekStart:'19:00',weekEnd:'11:00'};
  const data=[row(1140,1,{day:'2024-12-31'}),row(705,1,{day:'2025-01-01'}),row(720,1,{day:'2025-01-01'})];
  const r=P.compare(data,'123',['2024-12','2025-01'],p);assert.equal(r.months[0].freeKwh,1);assert.equal(r.months[1].freeKwh,1);
  assert.throws(()=>P.validate({...p,startDay:7}));assert.throws(()=>P.validate({...p,weekEnd:'11:15'}));
});
test('same-day weekly window is limited to that weekday; disabling removes free energy',()=>{
  const p={...plan,free:true,discount:'weekly',startDay:0,endDay:0,weekStart:'11:00',weekEnd:'11:00'};
  const data=[row(660,1,{day:'2025-01-05'}),row(705,1,{day:'2025-01-05'}),row(720,1,{day:'2025-01-05'}),row(660,1,{day:'2025-01-06'})];
  assert.equal(P.compare(data,'123',['2025-01'],p).months[0].freeKwh,2);
  assert.equal(P.compare(data,'123',['2025-01'],{...p,free:false,discount:'none'}).months[0].freeKwh,0);
});
test('shared comparison preserves monthly bills and includes no meter IDs or interval dates',()=>{
  const records=[];for(let d=new Date('2025-01-01T00:00:00Z');d<new Date('2025-02-01T00:00:00Z');d=new Date(+d+86400000))for(let h=0;h<24;h++)records.push(row(h*60,.5,{day:d.toISOString().slice(0,10),meter:'10443720000790198'}));
  const p={...plan,free:true,discount:'weekly',startDay:5,endDay:0,weekStart:'19:00',weekEnd:'23:00'},data=P.aggregate(records,'10443720000790198',['2025-01']),encoded=P.shareEncode(data,[p]),shared=P.shareDecode(encoded);
  assert.equal(P.compareData(shared.data,p).total,P.compare(records,'10443720000790198',['2025-01'],p).total);assert.deepEqual(shared.plans,[p]);assert.ok(!encoded.includes('10443720000790198'));assert.ok(!encoded.includes('2025-01-03'));
});
test('shared data refuses plans that require sub-hour energy boundaries and rejects malformed links',()=>{
  const data=P.aggregate([row(0,1)],'123',['2025-01']);assert.throws(()=>P.shareEncode(data,[{...plan,free:true,start:'21:15',end:'07:00'}]),/whole-hour/);assert.throws(()=>P.shareDecode('oops!'));assert.throws(()=>P.shareDecode('a'.repeat(100001)));});
test('binary shares are compact with bounded 0.01 kWh hourly rounding',()=>{
  const records=D.demo(),keys=P.period('2025-12-31','2025'),p={...plan,free:true,discount:'weekly',startDay:5,endDay:0,weekStart:'19:00',weekEnd:'23:00'},data=P.aggregate(records,records[0].meter,keys),encoded=P.shareEncode(data,[p]),shared=P.shareDecode(encoded);
  assert.ok(encoded.length<8000,`Expected <8 KB link; got ${encoded.length} bytes`);assert.equal(shared.data.months.length,12);for(let i=0;i<12;i++)assert.ok(Math.abs(shared.data.months[i].kwh-data.months[i].kwh)<=.005);assert.ok(Math.abs(P.compareData(shared.data,p).total-P.compareData(data,p).total)<=25);
});
test('legacy JSON shared links remain readable',()=>{
  const data=P.aggregate([row(0,1)],'123',['2025-01']),payload={v:1,m:data.months.map(m=>[m.key,Math.round(m.kwh*1000),m.count,m.estimated,m.hours.map(v=>Math.round(v*1000))]),p:[plan]},legacy=btoa(JSON.stringify(payload)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');assert.equal(P.shareDecode(legacy).data.months[0].kwh,1);
});
