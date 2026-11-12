import {test} from 'node:test';import assert from 'node:assert/strict';
import {saveSettlement,manageMember} from '../lib/operations.mjs';import settlements from '../api/settlements.mjs';import team from '../api/team.mjs';import config from '../api/config.mjs';
const csv='ymd,projectName,usageAccountId,region,productCode,unblendedCost\n2026-10-15,efa,000000000001,APN2,AmazonECS,10\n2026-11-14,efa,000000000001,APE1,AmazonECS,5\n2026-11-14,efa,000000000001,Global,MZC Discount Program,-1\n';
const body={month:'2026-11',expectedVersion:0,sourcePath:'uploads/2026-11/00000000-0000-4000-8000-000000000001.csv',filename:'billing.csv',rate:'1337.66',rateOrigin:'test',status:'draft',note:'initial',snapshot:{money:{supply:99999999}}};
const ctx=rpc=>({actor:'admin-id',member:{role:'admin'},user:{storage:{from:()=>({download:async()=>({data:new Blob([csv])})})}},admin:{rpc}});
test('stored snapshot is recomputed from private source; client totals are ignored',async()=>{
 let document;const result=await saveSettlement(ctx(async(name,args)=>{assert.equal(name,'efa_save_settlement');assert.equal(args.p_actor,'admin-id');document=args.p_document;return {data:{version:1}};}),body);
 assert.equal(result.record.version,1);assert.equal(document.snapshot.total,'14');assert.equal(document.snapshot.money.supply,18727);assert.equal(document.snapshot.money.invoice,20600);assert.equal(document.snapshot.raw,undefined);assert.match(document.source_sha256,/^[0-9a-f]{64}$/);
});
test('stale revision maps to conflict and source-month mismatch is rejected',async()=>{
 await assert.rejects(saveSettlement(ctx(async()=>({error:{code:'40001'}})),body),e=>e.status===409);
 await assert.rejects(saveSettlement(ctx(async()=>({data:{}})),{...body,month:'2026-12'}),e=>e.status===400);
});
test('editor cannot administer accounts and account provisioning never accepts a client role',async()=>{
 await assert.rejects(manageMember({member:{role:'editor'}},{operation:'create'}),e=>e.status===403);
 let args;await manageMember({actor:'owner',member:{role:'admin'},admin:{auth:{admin:{createUser:async user=>{assert.equal(user.email_confirm,true);return {data:{user:{id:'new-user'}}};}}},rpc:async(name,data)=>{assert.equal(name,'efa_add_member');args=data;return {};}}},{operation:'create',email:'editor@example.invalid',password:'Example-password-123',role:'admin'});
 assert.deepEqual(args,{p_actor:'owner',p_user:'new-user',p_email:'editor@example.invalid'});
});
const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=JSON.parse(body);}});
test('anonymous requests cannot list or update saved billing or team members',async()=>{
 for(const handler of [settlements,team])for(const method of ['GET','POST']){const r=res();await handler({method,url:'/api/settlements',headers:{}},r);assert.equal(r.statusCode,401);assert.equal(r.headers['Cache-Control'],'no-store');}
});
test('public configuration never exposes a privileged key',async()=>{
 const oldURL=process.env.EFA_SUPABASE_URL,oldKey=process.env.EFA_SUPABASE_ANON_KEY;
 process.env.EFA_SUPABASE_URL='https://example.supabase.co';process.env.EFA_SUPABASE_ANON_KEY='public-test-key';
 try{const r=res();await config({method:'GET'},r);assert.deepEqual(r.body,{configured:true,url:'https://example.supabase.co',anonKey:'public-test-key'});assert.equal(r.body.secret,undefined);}finally{if(oldURL)process.env.EFA_SUPABASE_URL=oldURL;else delete process.env.EFA_SUPABASE_URL;if(oldKey)process.env.EFA_SUPABASE_ANON_KEY=oldKey;else delete process.env.EFA_SUPABASE_ANON_KEY;}
});
