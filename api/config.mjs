import {configuration,reply} from '../lib/database.mjs';
export default async function config(req,res){
 if(req.method!=='GET')return reply(res,405,{error:'GET 요청만 지원합니다.'});
 try{const {url,key}=configuration();reply(res,200,{configured:true,url,anonKey:key});}
 catch{reply(res,200,{configured:false});}
}
