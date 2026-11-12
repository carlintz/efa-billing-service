import {currentPage,navigate,renderArchive} from './pages.mjs';
import {createClient} from '@supabase/supabase-js';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when=s=>new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'});
export async function bootPersistence({getDraft,restore,onSaved,onSignedOut,onError,onToast}){
 let db,session=null,member=null,active=null,records=[],dirty=false,changing=false,loading=false,changeCounter=0,lastHandledSession=null;
 const showError=e=>onError(e instanceof Error?e:new Error(e.message||String(e)));
 function update(){
  const draft=getDraft(),ready=!!member?.active;
  $('save-settlement').disabled=!ready||!draft.model?.money||draft.sampleMode||loading;
  const same=active&&active.month.slice(0,7)===$('month').value;
  $('save-info').textContent=same?`${active.month.slice(0,7)} · 저장 버전 v${active.version}${dirty?' · 저장하지 않은 변경사항':''}`:ready?'현재 정산은 아직 저장하지 않았습니다.':'로그인하고 담당자 승인을 받으면 월별로 저장할 수 있습니다.';
  $('archive-gate').hidden=ready;$('archive-content').hidden=!ready;$('work-account-status').textContent=ready?`${session.user.email} · ${member.role==='admin'?'관리자':'담당자'} · 월별 정산 저장 가능`:'월별 저장은 담당자 로그인 및 승인 후 이용할 수 있습니다.';$('saved-workspace').hidden=!ready;$('manage-team').hidden=member?.role!=='admin';
 }
 async function api(path,options={}){
  const {data:{session:current}}=await db.auth.getSession();if(!current)throw new Error('다시 로그인해 주세요.');
  const res=await fetch(path,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${current.access_token}`,...options.headers}});
  const data=await res.json();if(!res.ok)throw Object.assign(new Error(data.error||'요청에 실패했습니다.'),{status:res.status});return data;
 }
 async function refreshList(){
  if(!member?.active)return;const data=await api('/api/settlements');records=data.records||[];renderArchive(records);
  $('saved-records').innerHTML=records.length?`<table><thead><tr><th>정산월</th><th>상태</th><th>버전</th><th>공급가액 / 청구액</th><th>수정 일시 · 담당자</th><th>파일 다운로드</th><th>작업</th></tr></thead><tbody>${records.map(r=>`<tr><td>${esc(r.month.slice(0,7))}</td><td>${r.status==='final'?'확정':'작성 중'}</td><td>v${r.version}</td><td>${Number(r.supply).toLocaleString('ko-KR')}원 / ${Number(r.invoice).toLocaleString('ko-KR')}원</td><td>${esc(when(r.updated_at))}<br><small>${esc(r.updated_by_email)}</small></td><td><button class="text-button" data-download="raw" data-month="${esc(r.month.slice(0,7))}" data-version="${r.version}">RAW CSV ↓</button> <button class="text-button" data-download="excel" data-month="${esc(r.month.slice(0,7))}" data-version="${r.version}">정산 Excel ↓</button></td><td><button class="text-button" data-load="${esc(r.month.slice(0,7))}">불러오기</button> <button class="text-button" data-history="${esc(r.month.slice(0,7))}">수정 이력</button></td></tr>`).join('')}</tbody></table>`:'<p class="hint">저장된 월별 정산이 없습니다. CSV를 업로드하고 환율을 확인한 뒤 저장해 주세요.</p>';
 }
 async function accessChanged(current,force=false){
  const fingerprint=current?.access_token||'signed-out';if(!force&&lastHandledSession===fingerprint)return;lastHandledSession=fingerprint;
  const wasSignedIn=!!session;const changedUser=session?.user?.id!==current?.user?.id;if(wasSignedIn&&!current)onSignedOut?.();session=current;member=null;if(changedUser||!current){active=null;dirty=false;}$('team-panel').hidden=true;$('history-panel').hidden=true;
  $('login-form').hidden=!!session;$('session-panel').hidden=!session;$('account-email').textContent=session?.user?.email||'';
  if(!session){$('account-status').textContent='월별 저장은 EFA 담당자 로그인 후 이용할 수 있습니다.';update();return;}
  try{
   const {data,error}=await db.rpc('efa_request_access');if(error)throw error;member=data;
   $('account-status').textContent=member.active?(member.role==='admin'?'EFA 관리자 · 담당자 계정과 월별 정산을 관리할 수 있습니다.':'EFA 담당자 · 공동 정산 자료를 조회하고 저장할 수 있습니다.'):'담당자 승인 대기 중입니다. 관리자에게 승인을 요청해 주세요.';
   $('change-password').hidden=!member.active;update();if(member.active){await refreshList();if(member.role==='admin'&&currentPage()==='account')await showTeam();}
  }catch(e){$('account-status').textContent='접근 권한을 확인하지 못했습니다. 로그인 상태를 새로 확인해 주세요.';showError(e);update();}
 }
 async function load(month,version){
  if(dirty&&!confirm('현재 저장하지 않은 변경사항이 있습니다. 선택한 정산을 불러올까요?'))return;
  loading=true;update();
  try{
   const {record}=await api(`/api/settlements?month=${month}${version?`&version=${version}`:''}`);
   const {data:blob,error}=await db.storage.from('efa-billing-raw').download(record.source_path);if(error)throw error;
   changing=true;await restore(record,blob);changing=false;
   const latest=records.find(r=>r.month.slice(0,7)===month);active={month:record.month,version:version?(latest?.version||record.version):record.version};dirty=false;
   navigate('settlement');$('settlement-note').value=record.note;$('settlement-status').value=record.status;
   if(version&&Number(version)!==active.version){dirty=true;onToast(`과거 v${version}을 불러왔습니다. 저장하면 새 버전으로 기록됩니다.`);}else onToast(`${month} 정산을 불러왔습니다.`);
  }catch(e){changing=false;showError(e);}finally{loading=false;update();}
 }
 async function history(month){
  try{
   const {records:versions}=await api(`/api/settlements?month=${month}&history=1`);$('history-panel').hidden=false;
   $('history-title').textContent=`${month} 수정 이력`;
   $('history-records').innerHTML=`<table><thead><tr><th>버전</th><th>상태 / 환율</th><th>메모</th><th>저장 일시 · 담당자</th><th>파일 다운로드</th><th>작업</th></tr></thead><tbody>${versions.map(v=>`<tr><td>v${v.version}</td><td>${v.status==='final'?'확정':'작성 중'} / ${esc(v.rate)}</td><td class="note-cell">${esc(v.note||'—')}</td><td>${esc(when(v.created_at))}<br><small>${esc(v.created_by_email)}</small></td><td><button class="text-button" data-download="raw" data-month="${month}" data-version="${v.version}">RAW CSV ↓</button> <button class="text-button" data-download="excel" data-month="${month}" data-version="${v.version}">정산 Excel ↓</button></td><td><button class="text-button" data-load="${month}" data-version="${v.version}">이 버전 불러오기</button></td></tr>`).join('')}</tbody></table>`;
  }catch(e){showError(e);}
 }
 $('save-settlement').addEventListener('click',async()=>{
  const draft=getDraft();if(!member?.active||!draft.model?.money||draft.sampleMode||loading)return;
  const month=draft.model.month,counter=changeCounter;let expected=active?.month.slice(0,7)===month?active.version:0;
  loading=true;update();const label=$('save-settlement').textContent;$('save-settlement').textContent='저장 중…';$('error').hidden=true;
  try{
   if(!expected){
    let existing;try{existing=(await api(`/api/settlements?month=${month}`)).record;}catch(e){if(e.status!==404)throw e;}
    if(existing){if(!confirm(`${month} 정산 v${existing.version}이 이미 저장되어 있습니다. 현재 업로드한 내용으로 새 버전을 저장할까요? 기존 버전은 수정 이력에 보존됩니다.`))return;expected=existing.version;}
   }
   let path=draft.sourcePath;
   if(!path){
    if(!draft.file)throw new Error('실제 CSV 원본 파일을 업로드해 주세요.');
    path=`uploads/${month}/${crypto.randomUUID()}.csv`;
    const {error}=await db.storage.from('efa-billing-raw').upload(path,draft.file,{contentType:'text/csv',upsert:false});if(error)throw error;
   }
   // A source saved for a different month gets its own immutable copy.
   if(!path.startsWith(`uploads/${month}/`)){
    const {data:file,error}=await db.storage.from('efa-billing-raw').download(path);if(error)throw error;
    path=`uploads/${month}/${crypto.randomUUID()}.csv`;const copy=await db.storage.from('efa-billing-raw').upload(path,file,{contentType:'text/csv',upsert:false});if(copy.error)throw copy.error;
   }
   const {record,artifactError}=await api('/api/settlements',{method:'POST',body:JSON.stringify({month,expectedVersion:expected,sourcePath:path,filename:draft.filename,rate:String(draft.model.rate),rateOrigin:draft.rateOrigin,note:$('settlement-note').value,status:$('settlement-status').value})});
   if(getDraft().model?.month===month){active={month:record.month,version:record.version};if(counter===changeCounter){onSaved(record);dirty=false;}else dirty=true;}
   await refreshList();if(artifactError)showError(new Error(artifactError));onToast(`${month} 정산 v${record.version}을 저장했습니다.`);
  }catch(e){showError(e);}finally{loading=false;$('save-settlement').textContent=label;update();}
 });
 document.addEventListener('efa:changed',()=>{if(!changing){changeCounter++;dirty=true;}update();});
 for(const id of ['settlement-note','settlement-status'])$(id).addEventListener('input',()=>{changeCounter++;dirty=true;update();});
 async function downloadSaved(button){
  button.disabled=true;const old=button.textContent;button.textContent='준비 중…';
  try{
   const month=button.dataset.month,version=Number(button.dataset.version);let bucket,path,filename;
   if(button.dataset.download==='raw'){
    const {record}=await api(`/api/settlements?month=${month}&version=${version}`);bucket='efa-billing-raw';path=record.source_path;filename=record.source_filename;
   }else{
    const {artifact}=await api('/api/settlements?artifact=1',{method:'POST',body:JSON.stringify({month,version})});bucket='efa-billing-excel';path=artifact.path;filename=artifact.filename;
   }
   const {data:blob,error}=await db.storage.from(bucket).download(path);if(error)throw error;
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);onToast('저장된 파일을 다운로드했습니다.');
  }catch(e){showError(e);}finally{button.disabled=false;button.textContent=old;}
 }
 $('saved-records').addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.download)downloadSaved(b);if(b?.dataset.load)load(b.dataset.load);if(b?.dataset.history)history(b.dataset.history);});
 $('history-records').addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.download)downloadSaved(b);if(b?.dataset.load)load(b.dataset.load,b.dataset.version);});
 $('close-history').addEventListener('click',()=>$('history-panel').hidden=true);
 $('refresh-records').addEventListener('click',()=>refreshList().catch(showError));
 async function showTeam(){
  const data=await api('/api/team');$('team-panel').hidden=false;
  $('team-records').innerHTML=`<table><thead><tr><th>이메일</th><th>권한 · 상태</th><th>작업</th></tr></thead><tbody>${data.requests.map(m=>`<tr><td>${esc(m.email)}</td><td>승인 대기</td><td><button class="text-button" data-user="${m.user_id}" data-operation="approve">승인</button></td></tr>`).join('')}${data.members.map(m=>`<tr><td>${esc(m.email)}</td><td>${m.role==='admin'?'관리자':'담당자'} · ${m.active?'활성':'중지'}</td><td>${m.role==='admin'?'—':`<button class="text-button" data-user="${m.user_id}" data-operation="${m.active?'disable':'enable'}">${m.active?'접근 중지':'접근 허용'}</button>`}</td></tr>`).join('')}</tbody></table>`;
 }
 document.addEventListener('efa:page',()=>{if(currentPage()==='account'&&session)accessChanged(session,true).catch(showError);});
 document.addEventListener('efa:load',e=>load(e.detail.month));
 for(const id of ['archive-target','archive-vat'])$(id).addEventListener('change',()=>renderArchive());
 $('manage-team').addEventListener('click',()=>showTeam().catch(showError));
 $('close-team').addEventListener('click',()=>$('team-panel').hidden=true);
 $('team-records').addEventListener('click',async e=>{const b=e.target.closest('[data-user]');if(!b)return;b.disabled=true;try{await api('/api/team',{method:'POST',body:JSON.stringify({userId:b.dataset.user,operation:b.dataset.operation})});await showTeam();}catch(e){showError(e);b.disabled=false;}});
 $('create-member-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=$('create-member');button.disabled=true;
  try{await api('/api/team',{method:'POST',body:JSON.stringify({operation:'create',email:$('member-email').value,password:$('member-password').value})});$('member-password').value='';$('member-email').value='';await showTeam();onToast('담당자 계정을 만들었습니다. 초기 비밀번호를 담당자에게 전달해 주세요.');}catch(e){showError(e);}finally{button.disabled=false;}
 });
 $('login-form').addEventListener('submit',async e=>{
  e.preventDefault();$('login-password').disabled=true;
  try{const {error}=await db.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-secret').value});if(error)throw error;$('login-secret').value='';}catch(e){showError(new Error('로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.'));}finally{$('login-password').disabled=false;}
 });
 $('login-link').addEventListener('click',async()=>{
  const email=$('login-email').value.trim();if(!$('login-email').reportValidity()||!email)return;$('login-link').disabled=true;
  try{const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;onToast('로그인 링크를 보냈습니다. 이 브라우저에서 이메일 링크를 열어 주세요.');}catch(e){showError(new Error('로그인 메일 발송에 실패했습니다. 담당자 계정은 관리자에게 발급받아 비밀번호로 로그인할 수 있습니다.'));}finally{$('login-link').disabled=false;}
 });
 $('logout').addEventListener('click',async()=>{if(dirty&&!confirm('저장하지 않은 변경사항이 있습니다. 로그아웃할까요?'))return;try{const {error}=await db.auth.signOut({scope:'local'});if(error)throw error;}catch(e){showError(e);}});
 $('change-password').addEventListener('click',()=>$('password-panel').hidden=!$('password-panel').hidden);
 $('password-form').addEventListener('submit',async e=>{e.preventDefault();$('update-password').disabled=true;try{const {error}=await db.auth.updateUser({password:$('new-password').value});if(error)throw error;$('new-password').value='';$('password-panel').hidden=true;onToast('비밀번호를 변경했습니다.');}catch(e){showError(e);}finally{$('update-password').disabled=false;}});
 try{
  const response=await fetch('/api/config'),config=await response.json();
  if(!config.configured){$('account-status').textContent='월별 저장 기능의 DB 연결을 준비하고 있습니다. CSV 집계와 Excel 다운로드는 계속 이용할 수 있습니다.';$('login-form').hidden=true;update();return;}
  $('login-form').hidden=false;db=createClient(config.url,config.anonKey,{auth:{flowType:'pkce'}});
  db.auth.onAuthStateChange((event,current)=>{if(event==='TOKEN_REFRESHED'||event==='USER_UPDATED'){session=current;lastHandledSession=current?.access_token||'signed-out';return;}setTimeout(()=>accessChanged(current).catch(showError),0);});
  const {data:{session:initial}}=await db.auth.getSession();await accessChanged(initial);
 }catch(e){$('account-status').textContent='로그인 연결을 확인할 수 없습니다. 새로고침 후 다시 시도해 주세요.';showError(e);}
 update();
}
