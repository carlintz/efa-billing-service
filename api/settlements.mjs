import {authorize,readBody,reply,failure,HttpError,protectedWrite} from '../lib/database.mjs';
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const LIST='month,version,rate,status,source_filename,updated_at,updated_by_email,supply:snapshot->money->>supply,invoice:snapshot->money->>invoice';
export default async function settlements(req,res){
 try{
  const {user}=await authorize(req),url=new URL(req.url,'http://localhost'),month=url.searchParams.get('month'),version=url.searchParams.get('version');
  if(req.method==='GET'){
   if(month&&!MONTH.test(month))throw new HttpError(400,'정산 대상월을 확인해 주세요.');
   if(!month){const {data,error}=await user.from('efa_settlements').select(LIST).order('month',{ascending:false}).limit(120);if(error)throw error;return reply(res,200,{records:data});}
   if(url.searchParams.has('history')){
    const {data,error}=await user.from('efa_settlement_versions').select('month,version,rate,status,note,source_filename,created_at,created_by_email').eq('month',month+'-01').order('version',{ascending:false}).limit(100);if(error)throw error;return reply(res,200,{records:data});
   }
   if(version&&!/^\d{1,8}$/.test(version))throw new HttpError(400,'수정 버전을 확인해 주세요.');
   let query=user.from(version?'efa_settlement_versions':'efa_settlements').select('*').eq('month',month+'-01');if(version)query=query.eq('version',Number(version));
   const {data,error}=await query.maybeSingle();if(error)throw error;if(!data)throw new HttpError(404,'저장된 정산이 없습니다.');return reply(res,200,{record:data});
  }
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return reply(res,405,{error:'지원하지 않는 요청입니다.'});}
  const body=await readBody(req);reply(res,200,await protectedWrite(req,'save',body));
 }catch(e){failure(res,e);}
}
