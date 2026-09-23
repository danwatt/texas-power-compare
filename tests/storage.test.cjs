const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../storage.js'),D=require('../data.js');
const meta={fileCount:2,invalidRows:3,duplicateRows:4};
test('54,000 readings round-trip without losing precision, IDs, flags or revisions',()=>{
  const demo=D.demo();const records=Array.from({length:54000},(_,i)=>({...demo[i%demo.length],flow:i>=demo.length?'SurplusGeneration':'Consumption',estimated:i%7===0,revision:Date.UTC(2025,0,1)+Math.floor(i/96)*86400000}));
  const encoded=S.encode(records,meta),decoded=S.decode(encoded);
  assert.deepEqual(decoded.records,records.sort((a,b)=>a.day.localeCompare(b.day)||a.start-b.start));assert.deepEqual(decoded.meta,meta);
  assert.ok(encoded.length*2<5*1024*1024);console.log(`54,000 readings: ${encoded.length.toLocaleString()} characters, ${(encoded.length*2/1024/1024).toFixed(2)} MiB at two bytes per character`);
});
test('corrupt and unsupported saved payloads are rejected',()=>{
  for(const text of ['{','null','{}',JSON.stringify({version:2})])assert.throws(()=>S.decode(text));
  const data=JSON.parse(S.encode(D.demo().slice(0,1),meta));data.rows[0][0]=999;assert.throws(()=>S.decode(JSON.stringify(data)));
});
