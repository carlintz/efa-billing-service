import {lookupRate} from '../src/rate.mjs';
export default async function rateHandler(req,res){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');res.statusCode=405;res.end(JSON.stringify({error:'GET 요청만 지원합니다.'}));return;
 }
 const month=new URL(req.url,'http://localhost').searchParams.get('month');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')){
  res.statusCode=400;res.end(JSON.stringify({error:'환율 기준월은 YYYY-MM 형식이어야 합니다.'}));return;
 }
 try{
  const rate=await lookupRate(month);
  res.setHeader('Cache-Control','public, max-age=3600, s-maxage=86400');
  res.statusCode=200;res.end(JSON.stringify(rate));
 }catch(e){res.statusCode=503;res.end(JSON.stringify({error:e.message}));}
}
