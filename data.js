/* Shared browser / Node analysis code; no network or storage access. */
(function (root) {
  'use strict';
  const DAY = 86400000;
  function csv(text) {
    const rows = []; let row = [], cell = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
      else if (c === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
      else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (quoted) throw new Error('The CSV has an unclosed quoted field. Please export the file again.');
    row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
    return rows;
  }
  function date(value) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
    if (!m) return null;
    const d = new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]));
    return d.getUTCMonth() === +m[1] - 1 && d.getUTCDate() === +m[2] ? d.toISOString().slice(0, 10) : null;
  }
  function minute(value) { const m = /^(\d{2}):(\d{2})$/.exec(value); return m && +m[2] < 60 && (+m[1] < 24 || value === '24:00') ? +m[1] * 60 + +m[2] : NaN; }
  function revision(value) { const [d, t = '00:00:00'] = value.split(' '); const iso = date(d); const n = iso ? Date.parse(iso + 'T' + t + 'Z') : NaN; return Number.isFinite(n) ? n : 0; }
  function parse(text) {
    const rows = csv(text), headerIndex = rows.findIndex(r => r.includes('ESIID') && r.includes('USAGE_DATE'));
    if (headerIndex < 0) throw new Error('No Smart Meter Texas interval header found. Choose the 15-minute CSV report.');
    const header = rows[headerIndex];
    const required = ['ESIID','USAGE_DATE','REVISION_DATE','USAGE_START_TIME','USAGE_END_TIME','USAGE_KWH','ESTIMATED_ACTUAL','CONSUMPTION_SURPLUSGENERATION'];
    const missing = required.filter(h => !header.includes(h));
    if (missing.length) throw new Error('Missing columns: ' + missing.join(', '));
    const records = []; let invalid = 0;
    for (const row of rows.slice(headerIndex + 1)) {
      if (row[0] === 'ESIID') continue;
      const get = name => row[header.indexOf(name)] || '';
      const day = date(get('USAGE_DATE')), start = minute(get('USAGE_START_TIME')), end = minute(get('USAGE_END_TIME'));
      const value = get('USAGE_KWH'), kwh = Number(value), meter = get('ESIID').replace(/^'/, '');
      const flowText = get('CONSUMPTION_SURPLUSGENERATION').replace(/[\s_-]/g, '').toLowerCase();
      const flow = flowText === 'consumption' ? 'Consumption' : flowText === 'surplusgeneration' ? 'SurplusGeneration' : null;
      if (!day || !/^\d+$/.test(meter) || !value || !Number.isFinite(kwh) || kwh < 0 || start >= 1440 || start % 15 !== 0 || (end - start + 1440) % 1440 !== 15 || !flow || !['A','E'].includes(get('ESTIMATED_ACTUAL'))) { invalid++; continue; }
      records.push({day, start, kwh, meter, flow, estimated: get('ESTIMATED_ACTUAL') === 'E', revision: revision(get('REVISION_DATE'))});
    }
    if (!records.length) throw new Error('No valid 15-minute readings found. Check the dates, times, and usage values in this CSV.');
    return {records, invalid};
  }
  function merge(records) {
    const map = new Map(); let duplicates = 0;
    for (const r of records) { const key = [r.meter,r.day,r.start,r.flow].join('|'), old = map.get(key); if (old) duplicates++; if (!old || r.revision >= old.revision) map.set(key, r); }
    return {records: [...map.values()].sort((a,b) => a.day.localeCompare(b.day) || a.start - b.start), duplicates};
  }
  function week(day) { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0,10); }
  function analyze(records, {meter, from, to, flow = 'Consumption', grouping = 'month'}) {
    const selected = records.filter(r => r.meter === meter && r.day >= from && r.day <= to && r.flow === flow);
    const months = new Map(), days = new Map(), hours = new Map(), groups = new Map();
    for (let d = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z'); d <= end; d = new Date(+d + DAY)) {
      const key = d.toISOString().slice(0,10), month = key.slice(0,7), group = grouping === 'month' ? month : grouping === 'week' ? week(key) : key;
      if (!months.has(month)) months.set(month, {key: month, total: 0, count: 0, expected: 0});
      months.get(month).expected += 96;
      if (!groups.has(group)) groups.set(group, Array.from({length:24}, () => ({sum:0, count:0})));
    }
    let total = 0, peak = 0, estimated = 0;
    for (const r of selected) {
      total += r.kwh; peak = Math.max(peak,r.kwh * 4); estimated += Number(r.estimated);
      const m = months.get(r.day.slice(0,7)); m.total += r.kwh; m.count++;
      if (!days.has(r.day)) days.set(r.day, {total:0, count:0}); const d = days.get(r.day); d.total += r.kwh; d.count++;
      const key = r.day + '|' + Math.floor(r.start / 60); if (!hours.has(key)) hours.set(key, {day:r.day, hour:Math.floor(r.start / 60), total:0, count:0}); const h = hours.get(key); h.total += r.kwh; h.count++;
    }
    const profile = [0,1].map(() => Array.from({length:24}, () => ({sum:0,count:0})));
    for (const h of hours.values()) if (h.count === 4) {
      const key = grouping === 'month' ? h.day.slice(0,7) : grouping === 'week' ? week(h.day) : h.day, cell = groups.get(key)[h.hour]; cell.sum += h.total; cell.count++;
      const dow = new Date(h.day + 'T00:00:00Z').getUTCDay(), p = profile[dow === 0 || dow === 6 ? 1 : 0][h.hour]; p.sum += h.total; p.count++;
    }
    const complete = [...days.values()].filter(d => d.count === 96);
    return {selected, total, peak, estimated, months:[...months.values()], groups:[...groups], profile, completeDays:complete.length, averageDay:complete.length ? complete.reduce((s,d) => s + d.total,0) / complete.length : null, days:days.size, expected:[...months.values()].reduce((s,m) => s+m.expected,0)};
  }
  function demo() {
    const records = [];
    for (let d = new Date('2025-01-01T00:00:00Z'); d < new Date('2026-01-01T00:00:00Z'); d = new Date(+d + DAY)) for (let i=0;i<96;i++) {
      const h=i/4, season=0.6+1.1*Math.exp(-Math.pow((d.getUTCMonth()-6)/2.3,2)), afternoon=0.35+1.6*Math.exp(-Math.pow((h-17)/4,2));
      records.push({meter:'10443720000000000',day:d.toISOString().slice(0,10),start:i*15,kwh:Math.round((0.19+season*afternoon/3+0.06*Math.sin(i*7+d.getUTCDate()))*1000)/1000,flow:'Consumption',estimated:false,revision:0});
    }
    return records;
  }
  const api = {csv, parse, merge, analyze, demo, week};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PowerData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
