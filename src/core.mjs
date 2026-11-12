import Decimal from 'decimal.js';
import Papa from 'papaparse';
Decimal.set({precision:40,rounding:Decimal.ROUND_HALF_UP});
export const SOURCE='http://www.smbs.biz/ExRate/MonAvgStdExRate.jsp';
export const HEADERS=['ymd','projectName','usageAccountId','region','productCode','unblendedCost'];
export const GROUPS=[{key:'seoul',name:'서울',sheet:'#. 서울리전',code:'APN2'},{key:'hongkong',name:'홍콩(중국)',sheet:'#. 홍콩리전',code:'APE1'},{key:'common',name:'공통',sheet:'#. 공통',code:'그 외 모든 리전'}];
export const add=(a,b)=>new Decimal(a).plus(b).toString();
export const num=x=>new Decimal(x).toNumber();
export const mul=(a,b)=>new Decimal(a).times(b).toString();
export const round=x=>new Decimal(x).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toNumber();
export function percentShare(cost,total){
 const denominator=new Decimal(total);
 return denominator.isZero()?null:new Decimal(cost).div(denominator).times(100).toFixed(1,Decimal.ROUND_HALF_UP);
}
export function parseCSV(text){
 const p=Papa.parse(text.replace(/^\uFEFF/,''),{header:true,skipEmptyLines:'greedy',transformHeader:x=>x.trim()});
 if(p.errors.length)throw new Error(`CSV 형식을 확인해 주세요. ${p.errors[0].message}`);
 for(const h of HEADERS)if(!p.meta.fields?.includes(h))throw new Error(`필수 열이 없습니다: ${h}`);
 if(!p.data.length)throw new Error('CSV에 데이터가 없습니다.');
 return p.data.map((r,i)=>{
  const row=Object.fromEntries(HEADERS.map(h=>[h,String(r[h]??'').trim()]));
  const date=new Date(row.ymd+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.ymd)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==row.ymd)throw new Error(`${i+2}행: 날짜 형식이 올바르지 않습니다.`);
  if(HEADERS.slice(1,5).some(h=>!row[h]))throw new Error(`${i+2}행: 필수 값이 비어 있습니다.`);
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(row.unblendedCost))throw new Error(`${i+2}행: 청구 금액이 숫자가 아닙니다.`);
  if(!new Decimal(row.unblendedCost).isFinite())throw new Error(`${i+2}행: 청구 금액을 확인해 주세요.`);
  return row;
 });
}
export function period(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('정산 대상월을 선택해 주세요.');
 const [y,m]=month.split('-').map(Number),prev=new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);
 const start=prev+'-15',end=month+'-14',days=[];
 for(let dt=new Date(start+'T00:00:00Z');dt.toISOString().slice(0,10)<=end;dt.setUTCDate(dt.getUTCDate()+1))days.push(dt.toISOString().slice(0,10));
 return {month,prev,start,end,days,rawStart:prev+'-01'};
}
export function groupOf(r){return r.productCode==='MZC Discount Program'?'common':r.region==='APN2'?'seoul':r.region==='APE1'?'hongkong':'common';}
export function calculate(rows,month,rate){
 const p=period(month),raw=rows.filter(r=>r.ymd>=p.rawStart&&r.ymd<=month+'-31');
 const latest=raw.reduce((a,r)=>r.ymd>a?r.ymd:a,'');
 if(!latest)throw new Error('선택한 대상월과 전월에 해당하는 데이터가 없습니다.');
 const present=new Set(raw.map(r=>r.ymd));
 const days=p.days.map(date=>({date,present:present.has(date),total:'0',seoul:'0',hongkong:'0',common:'0'}));
 const dayMap=new Map(days.map(d=>[d.date,d]));
 const groups=GROUPS.map(g=>({...g,total:'0',products:[]})), maps=Object.fromEntries(GROUPS.map(g=>[g.key,new Map()]));
 let count=0;
 for(const r of raw){
  const d=dayMap.get(r.ymd);if(!d)continue;count++;
  const k=groupOf(r),g=groups.find(g=>g.key===k),map=maps[k];
  let product=map.get(r.productCode);if(!product){product={name:r.productCode,total:'0',days:{}};map.set(r.productCode,product);}
  product.total=add(product.total,r.unblendedCost);product.days[r.ymd]=add(product.days[r.ymd]||'0',r.unblendedCost);
  g.total=add(g.total,r.unblendedCost);d[k]=add(d[k],r.unblendedCost);d.total=add(d.total,r.unblendedCost);
 }
 for(const g of groups)g.products=[...maps[g.key].values()].filter(p=>!new Decimal(p.total).isZero()).sort((a,b)=>new Decimal(b.total).cmp(a.total)||a.name.localeCompare(b.name));
 const total=groups.reduce((s,g)=>add(s,g.total),'0'),missing=days.filter(d=>!d.present).map(d=>d.date);
 let money=null;
 if(rate!==''&&rate!=null){if(!/^\d+(\.\d+)?$/.test(String(rate))||!new Decimal(rate).gt(0))throw new Error('환율은 0보다 큰 숫자로 입력해 주세요.');const supply=round(mul(total,rate)),vat=round(mul(supply,'0.1'));money={supply,vat,invoice:supply+vat};}
 return {...p,latest,raw,groups,days,total,missing,money,rate,count,accounts:new Set(raw.map(r=>r.usageAccountId)).size};
}
