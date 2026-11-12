import {downloadArtifact} from '../../../lib/artifacts.mjs';
import {createClient} from 'npm:@supabase/supabase-js@2.95.3';
import {saveSettlement,manageMember} from '../../../lib/operations.mjs';
import {HttpError} from '../../../lib/errors.mjs';
const json=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
Deno.serve(async request=>{
 try{
  if(request.method!=='POST')return json(405,{error:'POST 요청만 지원합니다.'});
  const header=request.headers.get('Authorization')||'',token=header.match(/^Bearer (.+)$/)?.[1];if(!token)throw new HttpError(401,'로그인 후 이용해 주세요.');
  const url=Deno.env.get('SUPABASE_URL');
  const publicKeys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}'),secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
  const key=publicKeys.default||Object.values(publicKeys)[0]||Deno.env.get('SUPABASE_ANON_KEY'),secret=secretKeys.default||Object.values(secretKeys)[0]||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const opts={auth:{persistSession:false,autoRefreshToken:false}};
  const user=createClient(url,key,{...opts,global:{headers:{Authorization:header}}}),admin=createClient(url,secret,opts);
  const {data:{user:identity},error:authError}=await user.auth.getUser(token);if(authError||!identity)throw new HttpError(401,'로그인이 만료되었습니다. 다시 로그인해 주세요.');
  const {data:member,error:memberError}=await user.from('efa_members').select('user_id,email,role,active').eq('user_id',identity.id).maybeSingle();if(memberError||!member?.active)throw new HttpError(403,'EFA 담당자 승인 후 이용할 수 있습니다.');
  const text=await request.text();if(new TextEncoder().encode(text).length>16384)throw new HttpError(413,'요청 내용이 너무 큽니다.');
  let body;try{body=JSON.parse(text);}catch{throw new HttpError(400,'요청 형식이 올바르지 않습니다.');}
  const ctx={user,admin,actor:identity.id,member};
  if(body.action==='save')return json(200,await saveSettlement(ctx,body));
  if(body.action==='artifact')return json(200,await downloadArtifact(ctx,body));
  if(body.action==='member')return json(200,await manageMember(ctx,body));
  throw new HttpError(400,'지원하지 않는 작업입니다.');
 }catch(error){if(!error.status)console.error('EFA_WRITE_ERROR',error.message);return json(error.status||500,{error:error.status?error.message:'저장 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.'});}
});
