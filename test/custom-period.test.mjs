import {test} from 'node:test';import assert from 'node:assert/strict';import {period,calculate,parseCSV} from '../src/core.mjs';
test('custom dates are inclusive, can cross year boundaries, and preserve target-month FX basis',()=>{
 const p=period('2026-01',{start:'2025-12-31',end:'2026-01-02'});assert.equal(p.days.length,3);assert.equal(p.prev,'2025-12');assert.equal(p.start,'2025-12-31');assert.equal(p.end,'2026-01-02');
 assert.equal(period('2026-11').start,'2026-10-15');assert.equal(period('2026-11').end,'2026-11-14');
});
test('reversed dates, impossible dates, missing endpoints and oversized ranges are rejected',()=>{
 for(const range of [{start:'2026-11-02',end:'2026-11-01'},{start:'2026-02-30',end:'2026-03-01'},{start:'2026-11-01'},{start:'2025-01-01',end:'2026-01-02'},null])assert.throws(()=>period('2026-11',range));
 assert.equal(period('2024-02',{start:'2024-02-29',end:'2024-02-29'}).days.length,1);
});
test('only selected dates affect costs while RAW retains the broader upload range',()=>{
 const rows=parseCSV('ymd,projectName,usageAccountId,region,productCode,unblendedCost\n2026-10-01,efa,1,APN2,ECS,99\n2026-10-20,efa,1,APN2,ECS,10\n2026-11-19,efa,1,APE1,ECS,5\n2026-11-20,efa,1,APE1,ECS,99\n');
 const m=calculate(rows,'2026-11','1000',{start:'2026-10-20',end:'2026-11-19'});assert.equal(m.total,'15');assert.equal(m.money.invoice,16500);assert.equal(m.raw.length,4);assert.equal(m.days.length,31);
 const outside=calculate(rows,'2026-11','1000',{start:'2026-09-30',end:'2026-10-01'});assert.equal(outside.rawStart,'2026-09-30');assert.equal(outside.total,'99');
});
