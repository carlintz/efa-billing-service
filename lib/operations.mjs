import {ensureArtifact} from './artifacts.mjs';
import {parseCSV,calculate} from '../src/core.mjs';
import {HttpError} from './errors.mjs';
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
export async function saveSettlement({user,admin,actor},body){
 if(!MONTH.test(body.month||'')||!Number.isInteger(body.expectedVersion)||body.expectedVersion<0)throw new HttpError(400,'정산 대상월과 저장 버전을 확인해 주세요.');
 if(!new RegExp(`^uploads/${body.month}/[0-9a-f-]{36}\\.csv$`).test(body.sourcePath||''))throw new HttpError(400,'원본 CSV 경로가 올바르지 않습니다.');
 if(!['draft','final'].includes(body.status)||typeof body.note!=='string'||body.note.length>2000||typeof body.filename!=='string'||body.filename.length>255)throw new HttpError(400,'저장 상태·메모·파일명을 확인해 주세요.');
 if(typeof body.rateOrigin!=='string'||body.rateOrigin.length>100)throw new HttpError(400,'환율 출처를 확인해 주세요.');
 const {data:file,error:fileError}=await user.storage.from('efa-billing-raw').download(body.sourcePath);if(fileError||!file)throw new HttpError(400,'원본 CSV를 먼저 업로드해 주세요.');
 const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.byteLength>20*1024*1024)throw new HttpError(413,'원본 파일은 최대 20MB입니다.');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('euc-kr').decode(bytes);}
 let model;try{model=calculate(parseCSV(text),body.month,body.rate);}catch(e){throw new HttpError(400,e.message);}if(!model.money)throw new HttpError(400,'환율을 입력해 주세요.');
 const {raw,...snapshot}=model;
 const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const document={rate:String(body.rate),rate_origin:body.rateOrigin,source_path:body.sourcePath,source_filename:body.filename,source_sha256:sha,status:body.status,note:body.note,snapshot:{...snapshot,algorithmVersion:'efa-v1'}};
 const {data,error}=await admin.rpc('efa_save_settlement',{p_actor:actor,p_month:body.month+'-01',p_expected_version:body.expectedVersion,p_document:document});
 if(error){if(error.code==='40001'||error.message?.includes('EFA_VERSION_CONFLICT'))throw new HttpError(409,'다른 담당자가 이 월의 정산을 변경했습니다. 최신 자료를 불러온 뒤 다시 저장해 주세요.');throw error;}
 try{return {record:data,artifact:await ensureArtifact({user,admin},data,model)};}catch(error){console.error('EFA_EXCEL_ARCHIVE_ERROR',error.message);return {record:data,artifactError:'정산은 저장됐지만 Excel 보관에 실패했습니다. 월별 내역의 Excel 다운로드로 다시 시도해 주세요.'};}
}
export async function manageMember({admin,actor,member},body){
 if(member.role!=='admin')throw new HttpError(403,'관리자만 이용할 수 있습니다.');
 if(body.operation==='create'){
  const email=String(body.email||'').trim().toLowerCase(),password=body.password;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||password.length<12||password.length>128)throw new HttpError(400,'올바른 이메일과 12~128자의 초기 비밀번호를 입력해 주세요.');
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});
  if(error||!data.user)throw new HttpError(400,'계정을 만들 수 없습니다. 기존 계정이라면 로그인 후 승인 요청을 이용해 주세요.');
  const {error:memberError}=await admin.rpc('efa_add_member',{p_actor:actor,p_user:data.user.id,p_email:email});
  if(memberError){await admin.auth.admin.deleteUser(data.user.id);throw memberError;}
  return {ok:true};
 }
 if(!/^[0-9a-f-]{36}$/.test(body.userId||'')||!['approve','disable','enable'].includes(body.operation))throw new HttpError(400,'담당자와 작업을 확인해 주세요.');
 const {data,error}=await admin.rpc('efa_manage_member',{p_actor:actor,p_user:body.userId,p_action:body.operation});
 if(error)throw new HttpError(400,'담당자 권한 변경에 실패했습니다. 요청 상태를 확인해 주세요.');return data;
}
