import {createClient} from '@supabase/supabase-js';
import {HttpError} from './errors.mjs';
export {HttpError};
export function configuration(){
 const url=process.env.EFA_SUPABASE_URL,key=process.env.EFA_SUPABASE_ANON_KEY;
 if(!url||!key)throw new HttpError(503,'월별 저장 기능의 DB 연결을 설정하고 있습니다.');
 return {url,key};
}
export function databaseClients(token){
 const {url,key}=configuration(),options={auth:{persistSession:false,autoRefreshToken:false}};
 return {user:createClient(url,key,{...options,global:{headers:{Authorization:`Bearer ${token}`}}})};
}
export async function authorize(req,adminOnly=false){
 const match=String(req.headers.authorization||'').match(/^Bearer (.+)$/);
 if(!match)throw new HttpError(401,'로그인 후 이용해 주세요.');
 const clients=databaseClients(match[1]);
 const {data:{user},error}=await clients.user.auth.getUser(match[1]);
 if(error||!user)throw new HttpError(401,'로그인이 만료되었습니다. 다시 로그인해 주세요.');
 const {data:member,error:memberError}=await clients.user.from('efa_members').select('user_id,email,role,active').eq('user_id',user.id).maybeSingle();
 if(memberError)throw new HttpError(503,'담당자 권한을 확인할 수 없습니다.');
 if(!member?.active)throw new HttpError(403,'EFA 관리자에게 담당자 승인을 요청해 주세요.');
 if(adminOnly&&member.role!=='admin')throw new HttpError(403,'관리자만 이용할 수 있습니다.');
 return {...clients,actor:user.id,member};
}
export async function readBody(req,max=16384){
 if(req.body&&typeof req.body==='object'){if(Buffer.byteLength(JSON.stringify(req.body))>max)throw new HttpError(413,'요청 내용이 너무 큽니다.');return req.body;}
 let content='';for await(const chunk of req){content+=chunk;if(Buffer.byteLength(content)>max)throw new HttpError(413,'요청 내용이 너무 큽니다.');}
 try{return JSON.parse(content||'{}');}catch{throw new HttpError(400,'요청 형식이 올바르지 않습니다.');}
}
export function reply(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data));}
export function failure(res,error){if(!error.status)console.error('EFA_DATABASE_ERROR',error.message);reply(res,error.status||500,{error:error.status?error.message:'저장 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'});}

export async function protectedWrite(req,action,body){
 const {url,key}=configuration();
 let response;try{response=await fetch(url+'/functions/v1/efa-billing',{method:'POST',headers:{apikey:key,Authorization:req.headers.authorization,'Content-Type':'application/json'},body:JSON.stringify({...body,action}),signal:AbortSignal.timeout(55000)});}catch(error){if(error.name==='TimeoutError'||error.name==='AbortError')throw new HttpError(504,'저장 응답이 지연되고 있습니다. 월별 내역에서 저장 여부를 확인한 뒤 다시 시도해 주세요.');throw error;}
 const data=await response.json().catch(()=>({error:'저장 서버의 응답을 확인할 수 없습니다.'}));
 if(!response.ok)throw new HttpError(response.status,data.error||'저장 처리에 실패했습니다.');return data;
}
