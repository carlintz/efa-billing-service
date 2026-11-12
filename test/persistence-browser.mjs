import {chromium} from 'playwright';import assert from 'node:assert/strict';
const csv='ymd,projectName,usageAccountId,region,productCode,unblendedCost\n2026-10-15,efa,000000000001,APN2,AmazonECS,10\n2026-11-14,efa,000000000001,APE1,AmazonECS,5\n2026-11-14,efa,000000000001,Global,MZC Discount Program,-1\n';
const userId='00000000-0000-4000-8000-000000000001',email='owner@example.invalid';
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:userId,role:'authenticated',email,exp:Math.floor(Date.now()/1000)+3600})+'.test-signature';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
let current=null,uploads=0,versions=[],writes=[];
await page.route('**/api/config',r=>json(r,{configured:true,url:'https://testdb.supabase.co',anonKey:'public-test-key'}));
await page.route('**/api/rate?*',r=>json(r,{rate:'1337.66'}));
await page.route('https://testdb.supabase.co/**',async r=>{
 const u=new URL(r.request().url());
 if(u.pathname.includes('/auth/v1/token'))return json(r,{access_token:token,refresh_token:'fake-test-refresh',expires_in:3600,token_type:'bearer',user:{id:userId,email,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()}});
 if(u.pathname.includes('/auth/v1/logout'))return r.fulfill({status:204,body:''});
 if(u.pathname.includes('/auth/v1/user'))return json(r,{id:userId,email});
 if(u.pathname.includes('/rest/v1/rpc/efa_request_access'))return json(r,{role:'admin',active:true,email});
 if(u.pathname.includes('/storage/v1/object/')){if(r.request().method()==='POST'){uploads++;return json(r,{Key:'efa-billing-raw/test.csv'});}return r.fulfill({status:200,contentType:'text/csv',body:csv});}
 return json(r,[]);
});
await page.route('**/api/settlements*',async r=>{
 const request=r.request(),u=new URL(request.url());
 if(request.method()==='POST'&&u.searchParams.has('artifact'))return json(r,{artifact:{path:'saved.xlsx',filename:'EFA-v2.xlsx'}});
 if(request.method()==='POST'){
  const body=request.postDataJSON();writes.push(body);
  current={month:body.month+'-01',version:(current?.version||0)+1,rate:body.rate,rate_origin:body.rateOrigin,source_path:body.sourcePath,source_filename:body.filename,status:body.status,note:body.note,updated_at:new Date().toISOString(),updated_by_email:email,supply:'18727',invoice:'20600',groups:[{key:'seoul',total:'10'},{key:'hongkong',total:'5'},{key:'common',total:'-1'}]};
  versions.unshift({...current,created_at:current.updated_at,created_by_email:email});return json(r,{record:current});
 }
 if(u.searchParams.has('history'))return json(r,{records:versions});
 if(u.searchParams.has('month'))return json(r,{record:current});
 return json(r,{records:current?[current,{...current,month:'2026-09-01',supply:'0',invoice:'0',groups:[]}]:[]});
});
await page.route('**/api/team',r=>json(r,{members:[],requests:[]}));
await page.goto((process.env.EFA_TEST_URL||'http://localhost:4173')+'/account');await page.locator('#login-form').waitFor({state:'visible'});assert.equal(await page.locator('#save-settlement').isDisabled(),true);
await page.locator('#login-email').fill(email);await page.locator('#login-secret').fill('Fake-example-password-123');await page.locator('#login-password').click();await page.locator('#session-panel').waitFor({state:'visible'});await page.locator('#team-panel').waitFor({state:'visible'});assert.equal(await page.locator('#file').isVisible(),false);await page.locator('.page-nav [data-page=settlement]').click();
await page.locator('#file').setInputFiles({name:'test-billing.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.getByText('월평균 표 조회 완료',{exact:true}).waitFor();await page.locator('#settlement-note').fill('first save');await page.locator('#save-settlement').click();await page.getByText('2026-11 · 저장 버전 v1',{exact:true}).waitFor();
assert.equal(writes[0].expectedVersion,0);assert.equal(uploads,1);
await page.locator('#settlement-note').fill('updated');await page.locator('#save-settlement').click();await page.getByText('2026-11 · 저장 버전 v2',{exact:true}).waitFor();assert.equal(writes[1].expectedVersion,1);assert.equal(uploads,1);
await page.locator('.page-nav [data-page=history]').click();assert.equal(await page.locator('#archive-chart .archive-column').count(),3);assert.match(await page.locator('#archive-chart').innerText(),/18,727원/);assert.equal(await page.locator('#archive-chart .missing').count(),1);assert.match(await page.locator('#archive-chart').innerText(),/0원/);await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.setViewportSize({width:1440,height:1100});await page.locator('#archive-metric').selectOption('invoice');assert.match(await page.locator('#archive-chart').innerText(),/20,600원/);for(const [metric,amount] of [['seoul','13,377원'],['hongkong','6,688원'],['common','-1,338원']]){await page.locator('#archive-metric').selectOption(metric);assert.match(await page.locator('#archive-chart').innerText(),new RegExp(amount));}
for(const [kind,name] of [['raw','test-billing.csv'],['excel','EFA-v2.xlsx']]){const download=page.waitForEvent('download');await page.locator(`#saved-records [data-download=${kind}][data-month="2026-11"]`).click();assert.equal((await download).suggestedFilename(),name);}
await page.screenshot({path:'test-results/history-desktop.png',fullPage:true});
await page.locator('[data-history="2026-11"]').click();await page.locator('#history-panel').waitFor({state:'visible'});assert.equal(await page.locator('#history-records tbody tr').count(),2);
await page.locator('#archive-chart button').filter({hasText:'2026-11'}).click();await page.getByText('2026-11 정산을 불러왔습니다.',{exact:true}).waitFor();assert.equal(await page.locator('#rate').inputValue(),'1337.66');assert.equal(await page.locator('#settlement-note').inputValue(),'updated');assert.equal(await page.locator('#total').innerText(),'18,727원');
await page.screenshot({path:'test-results/persistence-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.locator('.page-nav [data-page=account]').click();await page.screenshot({path:'test-results/account-desktop.png',fullPage:true});await page.locator('#logout').click();await page.locator('#login-form').waitFor({state:'visible'});assert.equal(await page.locator('#save-settlement').isDisabled(),true);assert.equal(await page.locator('#results').isVisible(),false);assert.deepEqual(errors,[]);
await page.locator('.page-nav [data-page=history]').click();assert.equal(await page.locator('#archive-gate').isVisible(),true);await page.reload();await page.locator('#archive-gate').waitFor();assert.equal(await page.locator('#page-title').innerText(),'월별 정산 내역');
console.log('Persistence browser flow passed: login → upload → save v1 → update v2 → history → restore → logout; immutable source upload once; mobile layout.');await browser.close();
