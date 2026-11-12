import Decimal from 'decimal.js';
import {round} from './core.mjs';
export const REGIONS=[{key:'seoul',name:'한국',color:'#19263e'},{key:'hongkong',name:'홍콩',color:'#7488a8'},{key:'common',name:'공통',color:'#b3c0d3'}];
export function archiveValues(record,vat){
 const usd=REGIONS.map(g=>new Decimal(record.groups?.find(r=>r.key===g.key)?.total||0)),total=usd.reduce((a,b)=>a.plus(b),new Decimal(0));
 const target=Number(vat==='included'?record.invoice:record.supply);
 const amounts=usd.map(value=>round(total.isZero()?value.times(record.rate).times(vat==='included'?'1.1':1):value.div(total).times(target)));
 const largest=usd.reduce((best,v,i)=>v.abs().gt(usd[best].abs())?i:best,0);
 amounts[largest]+=target-amounts.reduce((a,b)=>a+b,0);
 return {total:target,regions:REGIONS.map((g,i)=>({...g,amount:amounts[i],share:total.isZero()?null:usd[i].div(total).times(100).toDecimalPlaces(1,Decimal.ROUND_HALF_UP).toFixed(1)}))};
}
