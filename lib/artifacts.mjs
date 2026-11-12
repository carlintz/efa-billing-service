import {calculate,parseCSV} from '../src/core.mjs';
import {makeWorkbook} from '../src/excel.mjs';
import {HttpError} from './errors.mjs';
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function ensureArtifact({user,admin},record,model){
 const match=()=>user.from('efa_settlement_artifacts').select('*').eq('month',record.month).eq('version',record.version).maybeSingle();
 const existing=await match();if(existing.error)throw existing.error;if(existing.data)return existing.data;
 if(!model){
  const {data:file,error}=await user.storage.from('efa-billing-raw').download(record.source_path);if(error||!file)throw new HttpError(404,'저장된 RAW 파일을 찾을 수 없습니다.');
  const bytes=new Uint8Array(await file.arrayBuffer());if(await hash(bytes)!==record.source_sha256)throw new HttpError(409,'원본 파일 검증에 실패했습니다.');
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('euc-kr').decode(bytes);}
  model=calculate(parseCSV(text),record.month.slice(0,7),record.rate);
 }
 const wb=await makeWorkbook(model,record.rate_origin),bytes=new Uint8Array(await wb.xlsx.writeBuffer());
 const path=`exports/${record.month.slice(0,7)}/v${record.version}-${crypto.randomUUID()}.xlsx`,filename=`EFA 운영비용 집계_${model.prev}_${model.month}_v${record.version}.xlsx`;
 const upload=await admin.storage.from('efa-billing-excel').upload(path,bytes,{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',upsert:false});if(upload.error)throw upload.error;
 const artifact={month:record.month,version:record.version,path,filename,sha256:await hash(bytes)};
 const saved=await admin.from('efa_settlement_artifacts').insert(artifact);
 if(saved.error){if(saved.error.code==='23505'){const winner=await match();if(winner.data)return winner.data;}throw saved.error;}
 return artifact;
}
export async function downloadArtifact(ctx,body){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month||'')||!Number.isInteger(body.version)||body.version<1)throw new HttpError(400,'정산월과 버전을 확인해 주세요.');
 const {data:record,error}=await ctx.user.from('efa_settlement_versions').select('*').eq('month',body.month+'-01').eq('version',body.version).maybeSingle();
 if(error)throw error;if(!record)throw new HttpError(404,'저장된 정산 버전이 없습니다.');
 return {artifact:await ensureArtifact(ctx,record)};
}
