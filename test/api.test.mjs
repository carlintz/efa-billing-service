import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import rateHandler from '../api/rate.mjs';
const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=JSON.parse(body);}});
test('Vercel endpoint validates method and month before requesting the source',async()=>{
 const invalid=response();await rateHandler({method:'GET',url:'/api/rate?month=2026-99'},invalid);assert.equal(invalid.statusCode,400);assert.equal(invalid.headers['Cache-Control'],'no-store');
 const post=response();await rateHandler({method:'POST',url:'/api/rate?month=2026-10'},post);assert.equal(post.statusCode,405);assert.equal(post.headers.Allow,'GET');
});
test('Vercel Node handler returns decoded monthly rate with cache headers',async()=>{
 const original=globalThis.fetch,html=await fs.readFile('test/fixtures/smbs-live-escaped.html','utf8');
 globalThis.fetch=async()=>new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
 try{const res=response();await rateHandler({method:'GET',url:'/api/rate?month=2026-10'},res);assert.equal(res.statusCode,200);assert.equal(res.body.rate,'1337.66');assert.equal(res.body.month,'2026-10');assert.match(res.headers['Cache-Control'],/s-maxage/);}finally{globalThis.fetch=original;}
});
test('unavailable upstream returns an uncached failure',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('unavailable',{status:403});
 try{const res=response();await rateHandler({method:'GET',url:'/api/rate?month=2026-10'},res);assert.equal(res.statusCode,503);assert.equal(res.headers['Cache-Control'],'no-store');assert.ok(res.body.error);}finally{globalThis.fetch=original;}
});
