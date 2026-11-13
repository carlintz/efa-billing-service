import {test} from 'node:test';import assert from 'node:assert/strict';import ExcelJS from 'exceljs';
import {ensureArtifact,downloadArtifact} from '../lib/artifacts.mjs';
import {parseCSV,calculate} from '../src/core.mjs';
const csv='ymd,projectName,usageAccountId,region,productCode,unblendedCost\n2026-10-15,efa,1,APN2,AmazonECS,10\n2026-11-14,efa,1,APE1,AmazonECS,5\n2026-11-14,efa,1,Global,MZC Discount Program,-1\n';
const record={month:'2026-11-01',version:2,rate:'1337.66',rate_origin:'saved rate',snapshot:{start:'2026-10-14',end:'2026-11-14'},source_path:'source.csv',source_sha256:Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(csv))).toString('hex')};
export function fakeContext(){
 let saved=null,bytes=null,uploads=0;
 const query=data=>({select(){return this;},eq(){return this;},async maybeSingle(){return {data:data()};}});
 const ctx={user:{from:table=>query(()=>table==='efa_settlement_versions'?record:saved),storage:{from:()=>({download:async()=>({data:new Blob([csv])})})}},admin:{from:()=>({insert:async row=>{saved=row;return {};}}),storage:{from:()=>({upload:async(path,buffer)=>{bytes=buffer;uploads++;return {};}})}}};
 return {ctx,get saved(){return saved;},get bytes(){return bytes;},get uploads(){return uploads;}};
}
test('legacy revision generates a private Excel once from the original CSV and saved rate',async()=>{
 const fake=fakeContext();const {artifact}=await downloadArtifact(fake.ctx,{month:'2026-11',version:2});
 assert.match(artifact.path,/exports\/2026-11\/v2-/);assert.match(artifact.filename,/_v2.xlsx$/);assert.equal(artifact.sha256.length,64);
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(fake.bytes);assert.equal(wb.worksheets.length,5);assert.equal(wb.worksheets[0].getCell('C4').value,'2026-10-14~2026-11-14');assert.equal(wb.worksheets[0].getCell('D8').value.result,18727);assert.equal(wb.worksheets[0].getCell('F8').value.result,20600);
 assert.deepEqual(await ensureArtifact(fake.ctx,record),artifact);assert.equal(fake.uploads,1);
});
test('changed source is rejected and missing or invalid versions cannot produce files',async()=>{
 const fake=fakeContext();await assert.rejects(ensureArtifact(fake.ctx,{...record,source_sha256:'invalid'}),e=>e.status===409);assert.equal(fake.uploads,0);
 await assert.rejects(downloadArtifact(fake.ctx,{month:'2026-11',version:0}),e=>e.status===400);
});
