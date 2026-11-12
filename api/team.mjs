import {authorize,readBody,reply,failure,HttpError,protectedWrite} from '../lib/database.mjs';
export default async function team(req,res){
 try{
  const {user}=await authorize(req,true);
  if(req.method==='GET'){
   const [members,requests]=await Promise.all([user.from('efa_members').select('user_id,email,role,active,created_at').order('created_at'),user.from('efa_access_requests').select('user_id,email,requested_at').order('requested_at')]);
   if(members.error||requests.error)throw members.error||requests.error;return reply(res,200,{members:members.data,requests:requests.data});
  }
  if(req.method!=='POST')return reply(res,405,{error:'지원하지 않는 요청입니다.'});
  const body=await readBody(req);reply(res,200,await protectedWrite(req,'member',body));
 }catch(e){failure(res,e);}
}
