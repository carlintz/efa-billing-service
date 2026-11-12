import {tmpdir} from 'node:os';import {join} from 'node:path';
import {test} from 'node:test';import {existsSync} from 'node:fs';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {parseCSV,calculate,period,add} from '../src/core.mjs';import {makeWorkbook} from '../src/excel.mjs';import {extractRate,lookupRate,monthlyQuery} from '../src/rate.mjs';
const r=(date,region,product,cost)=>({ymd:date,projectName:'efa',usageAccountId:'000012345678',region,productCode:product,unblendedCost:String(cost)});
test('15→14 crosses year and leap February',()=>{assert.equal(period('2027-01').start,'2026-12-15');assert.equal(period('2024-03').days.length,29);assert.equal(period('2026-11').days.length,31);});
test('precise decimal aggregation, 14th inclusion, RAW range, discount override, sorting and zero exclusion',()=>{
 const rows=[r('2026-09-30','APN2','old',100),r('2026-10-01','APN2','raw-only',20),r('2026-10-14','APN2','outside',100),r('2026-10-15','APN2','A','.1'),r('2026-10-15','APN2','A','.2'),r('2026-11-14','APE1','B',2),r('2026-11-15','APN2','outside',50),r('2026-10-15','APN2','MZC Discount Program',-.1),r('2026-10-15','USW2','C',1),r('2026-10-15','APN2','zero',0),r('2026-10-16','APN2','offset',1),r('2026-10-17','APN2','offset',-1)];
 const m=calculate(rows,'2026-11','1000');assert.equal(m.total,'3.2');assert.equal(m.groups[0].total,'0.3');assert.deepEqual(m.groups[0].products.map(p=>p.name),['A']);assert.equal(m.groups[2].total,'0.9');assert.equal(m.raw.length,11);assert.equal(m.latest,'2026-11-15');assert.equal(m.money.supply,3200);assert.equal(m.money.vat,320);assert.equal(m.money.invoice,3520);assert.equal(m.days.at(-1).hongkong,'2');assert.equal(m.days[1].seoul,'1');
});
test('half-up uses rounded supply for VAT; collected zero differs from missing',()=>{const m=calculate([r('2026-10-15','APN2','A','1.0045'),r('2026-10-16','APN2','zero','0')],'2026-11','1000');assert.deepEqual(m.money,{supply:1005,vat:101,invoice:1106});assert.equal(m.days[1].present,true);assert.equal(m.days[2].present,false);});
test('CSV quoting, BOM, IDs and invalid values',()=>{const h='ymd,projectName,usageAccountId,region,productCode,unblendedCost\n';assert.equal(parseCSV('\uFEFF'+h+'2026-11-01,"efa, project",000012345678,APN2,A,1e-7')[0].usageAccountId,'000012345678');for(const line of ['2026-02-30,efa,1,APN2,A,1','2026-11-01,efa,1,APN2,A,NaN','2026-11-01,efa,1,,A,1'])assert.throws(()=>parseCSV(h+line));assert.throws(()=>parseCSV('wrong\n1'));});
test('crawl reads requested USD row in the bottom monthly table, not a chart or layout table',async()=>{
 const html=await fs.readFile('test/fixtures/smbs-monthly.html','utf8');
 assert.equal(extractRate(html,'2026-10'),'1337.66');assert.equal(extractRate(html,'2026-09'),'1359.00');
 assert.equal(extractRate(html,'2026-04'),null);assert.equal(extractRate(html.replaceAll('USD','JPY'),'2026-10'),null);
 assert.equal(extractRate('<table><tr><td>2026.10</td><td>USD</td><td>1337.66</td></tr></table>','2026-10'),null);
 const calls=[];const result=await lookupRate('2026-10',async(url,options)=>{calls.push({url:String(url),options});return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});});
 assert.equal(result.rate,'1337.66');assert.equal(result.method,'monthly-table-crawl');assert.equal(calls.length,1);
 assert.equal(calls[0].url,'http://www.smbs.biz/ExRate/MonAvgStdExRate.jsp');assert.equal(calls[0].options.body,undefined);
 await assert.rejects(lookupRate('2026-10',async()=>new Response('unavailable',{status:403})));
});
test('historical crawl submits the actual form controls and retains source option values',async()=>{
 const html=await fs.readFile('test/fixtures/smbs-monthly.html','utf8');
 const q=monthlyQuery(html,'http://www.smbs.biz/ExRate/MonAvgStdExRate.jsp','2026-04');
 assert.equal(q.method,'POST');const params=new URLSearchParams(q.body);
 assert.deepEqual(Object.fromEntries(params),{view:'monthly',money:'USD',fromY:'2026',fromM:'04',untilY:'2026',untilM:'04'});
 assert.equal(monthlyQuery(html.replace('action="/ExRate/MonAvgStdExRate.jsp"','action="https://example.com/"'),'http://www.smbs.biz/ExRate/MonAvgStdExRate.jsp','2026-04'),null);
 const calls=[];const result=await lookupRate('2026-04',async(url,options)=>{calls.push(options);return new Response(calls.length===1?html:html.replaceAll('2026.10','2026.04'),{headers:{'Content-Type':'text/html; charset=utf-8'}});});
 assert.equal(calls.length,2);assert.equal(calls[1].method,'POST');assert.equal(result.rate,'1337.66');
});
test('conflicting month rows are rejected and year boundaries do not match another month',()=>{
 const h='<table><tr><th>날짜</th><th>통화명</th><th>월평균 매매기준율</th></tr><tr><td>2026년 1월</td><td>USD</td><td>1,400.50</td></tr><tr><td>2026.11</td><td>USD</td><td>1,300.50</td></tr></table>';
 assert.equal(extractRate(h,'2026-01'),'1400.50');assert.equal(extractRate(h,'2026-11'),'1300.50');assert.equal(extractRate(h,'2025-01'),null);
 assert.equal(extractRate(h.replace('</table>','<tr><td>2026.11</td><td>USD</td><td>1,200</td></tr></table>'),'2026-11'),null);
});
test('actual attachment: independent known totals and complete five-sheet export',{skip:!process.env.EFA_BILLING_FIXTURE||!existsSync(process.env.EFA_BILLING_FIXTURE)},async()=>{
 const csv=await fs.readFile(process.env.EFA_BILLING_FIXTURE,'utf8');const rows=parseCSV(csv),m=calculate(rows,'2026-11','1337.66');
 assert.equal(rows.length,3565);assert.equal(m.latest,'2026-11-11');assert.equal(m.missing.length,3);assert.ok(Math.abs(Number(m.total)-799.5837687793668)<1e-9);assert.equal(m.groups.reduce((s,g)=>add(s,g.total),'0'),m.total);assert.equal(m.days.reduce((s,d)=>add(s,d.total),'0'),m.total);
 const wb=await makeWorkbook(m,'검증용 직접 입력');assert.equal(wb.worksheets.length,5);assert.equal(wb.worksheets[0].getCell('C8').value.result,Number(m.total));assert.equal(wb.worksheets[0].getCell('D8').value.result,m.money.supply);assert.equal(wb.worksheets[0].getCell('F8').value.result,m.money.invoice);
 for(let i=0;i<3;i++)assert.equal(wb.worksheets[i+1].getCell('C3').value.result,Number(m.groups[i].total));assert.equal(wb.worksheets[0].getCell('K46').value,'수집됨');assert.equal(wb.worksheets[0].getCell('C47').value,null);
 assert.equal(wb.worksheets[4].getCell('D3').type,3);await wb.xlsx.writeFile(join(tmpdir(),'efa-billing-integration.xlsx'));
 console.log('Verified:',JSON.stringify({total:m.total,groups:m.groups.map(g=>({name:g.name,total:g.total,products:g.products.length})),money:m.money,missing:m.missing}));
});

test('Excel compatibility: fresh package, valid sheet property order, current print ranges and visible data',async()=>{
 const {default:JSZip}=await import('jszip');
 for(const month of ['2024-03','2026-03','2026-11','2027-01']){
  const p=period(month),m=calculate([r(p.start,'APN2','A',1),r(p.end,'APE1','B',2)],month,'1337.66');
  const wb=await makeWorkbook(m,'검증용');const zip=await JSZip.loadAsync(await wb.xlsx.writeBuffer());
  const book=await zip.file('xl/workbook.xml').async('string');assert.doesNotMatch(book,/_FilterDatabase/);assert.equal((book.match(/localSheetId=/g)||[]).length,4);
  for(let i=1;i<=5;i++){
   const xml=await zip.file(`xl/worksheets/sheet${i}.xml`).async('string');assert.match(xml,/<sheetData>.*<c /s);assert.doesNotMatch(xml,/undefined|NaN/);
   const props=xml.match(/<sheetPr>(.*?)<\/sheetPr>/s)?.[1]||'';
   const order=[...props.matchAll(/<(tabColor|outlinePr|pageSetUpPr)\b/g)].map(x=>['tabColor','outlinePr','pageSetUpPr'].indexOf(x[1]));assert.deepEqual(order,[...order].sort());
   assert.doesNotMatch(xml,/<col[^>]*max="16384"/);
  }
 }
});

test('EUC-KR source decodes on UTF-8-only Worker runtimes',async()=>{
 const bytes=Buffer.from(await fs.readFile('test/fixtures/smbs-monthly-euckr.base64','utf8'),'base64');
 const {decodeKorean}=await import('../src/korean-decoder.mjs');assert.match(decodeKorean(bytes),/월평균 매매기준율/);
 const Native=globalThis.TextDecoder;
 globalThis.TextDecoder=class extends Native{constructor(label,...args){if(label&&!/^utf-?8$/i.test(label))throw new RangeError('UTF-8 only');super(label,...args);}};
 try{
  const result=await lookupRate('2026-10',async()=>new Response(bytes,{headers:{'Content-Type':'text/html; charset=EUC-KR'}}));assert.equal(result.rate,'1337.66');
  const metaResult=await lookupRate('2026-10',async()=>new Response(bytes,{headers:{'Content-Type':'text/html'}}));assert.equal(metaResult.rate,'1337.66');
 }finally{globalThis.TextDecoder=Native;}
});

test('live SMBS escaped display calls produce the October USD monthly rate',async()=>{
 const html=await fs.readFile('test/fixtures/smbs-live-escaped.html','utf8');
 assert.equal(extractRate(html,'2026-10'),'1337.66');assert.equal(extractRate(html,'2026-09'),'1359.00');assert.equal(extractRate(html,'2026-05'),'1490.11');assert.equal(extractRate(html,'2026-11'),null);
 const calls=[];const result=await lookupRate('2026-10',async(url)=>{calls.push(String(url));return new Response(html,{headers:{'Content-Type':'text/html; charset=UTF-8'}});});
 assert.equal(result.rate,'1337.66');assert.equal(calls.length,1);assert.equal(result.source,'http://www.smbs.biz/ExRate/MonAvgStdExRate.jsp');
});
test('display decoder never executes source JavaScript',async()=>{
 const {expandDisplayMarkup}=await import('../src/rate.mjs');
 assert.equal(expandDisplayMarkup('<script>d5(\'%_D31%_D30\');</script>'),'10');
 assert.equal(expandDisplayMarkup('<script>d(\'%uc6d4\');</script>'),'월');
 const arbitrary='<script>globalThis.smbsInjected=true;d1("%_Z31");</script>';
 assert.equal(expandDisplayMarkup(arbitrary),arbitrary);assert.equal(globalThis.smbsInjected,undefined);
});
