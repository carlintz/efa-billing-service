import {decodeKorean} from './korean-decoder.mjs';
import {parseDocument} from 'htmlparser2';
import {getElementsByTagName,textContent} from 'domutils';
const URLS=[
 'http://www.smbs.biz/ExRate/MonAvgStdExRate.jsp',
 'https://www.smbs.biz/ExRate/MonAvgStdExRate.jsp',
 'http://www.smbs.co.kr/ExRate/MonAvgStdExRate.jsp',
 'https://www.smbs.co.kr/ExRate/MonAvgStdExRate.jsp',
];
const elements=(root,tag)=>getElementsByTagName(tag,root,true);
const text=node=>textContent(node).replace(/\s+/g,' ').trim();
const monthKey=value=>{
 const m=value.trim().match(/^(\d{4})\s*(?:[.\/-]|년)\s*(\d{1,2})\s*월?$/);
 return m?m[1]+'-'+m[2].padStart(2,'0'):null;
};
function nearestTable(node){for(let p=node.parent;p;p=p.parent)if(p.name==='table')return p;return null;}
// SMBS writes visible cells/options with d(), d1()...d5() and escaped text.
// Decode only those literal display calls; never execute remote JavaScript.
export function expandDisplayMarkup(html){
 return html.replace(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi,(tag,code)=>{
  const call=code.match(/^\s*d([1-5]?)\(\s*(['"])([^'"]*)\2\s*\)\s*;?\s*$/);
  if(!call)return tag;
  const marker=['','_Z','_A','_B','_C','_D'][Number(call[1]||0)];
  const encoded=marker?call[3].split(marker).join(''):call[3];
  return encoded.replace(/%u([0-9a-f]{4})|%([0-9a-f]{2})/gi,(_,unicode,byte)=>String.fromCharCode(parseInt(unicode||byte,16)));
 });
}
export function extractRate(html,month){
 const doc=parseDocument(expandDisplayMarkup(html),{decodeEntities:true});const matches=new Set();
 for(const table of elements(doc,'table')){
  const rows=elements(table,'tr').filter(row=>nearestTable(row)===table);
  // Select the monthly rate table by its own column headings, not layout tables or chart labels.
  const header=rows.some(row=>/월평균매매기준율|monthly(?:average)?(?:basic)?exchangerate/i.test(text(row).replace(/\s/g,'')));
  if(!header)continue;
  for(const row of rows){
   const cells=(row.children||[]).filter(n=>n.name==='td'||n.name==='th').map(text);
   if(cells.length!==3||monthKey(cells[0])!==month||!/(?:^|[^A-Z])USD(?:[^A-Z]|$)/i.test(cells[1]))continue;
   const rate=cells[2].replace(/[,\s]/g,'').replace(/원$/,'');
   if(/^\d+(?:\.\d{1,4})?$/.test(rate)&&Number(rate)>0)matches.add(rate);
  }
 }
 return matches.size===1?[...matches][0]:null;
}
function decodeHTML(bytes,contentType=''){
 // The original page is EUC-KR; also honor UTF-8 responses/meta on alternate hosts.
 const raw=new Uint8Array(bytes),head=String.fromCharCode(...raw.slice(0,4096));
 const charset=(contentType.match(/charset\s*=\s*["']?([\w-]+)/i)||head.match(/charset\s*=\s*["']?([\w-]+)/i))?.[1]||'euc-kr';
 if(/^utf-?8$/i.test(charset))return new TextDecoder().decode(raw);
 return decodeKorean(raw);
}
export function monthlyQuery(html,base,month){
 const doc=parseDocument(expandDisplayMarkup(html)),[year,mon]=month.split('-');
 for(const form of elements(doc,'form')){
  const params=new URLSearchParams();let years=0,months=0,usd=false,valid=true;
  for(const input of elements(form,'input')){
   const a=input.attribs;if(!a.name||a.disabled!==undefined||['submit','button','file','reset'].includes(a.type))continue;
   if(['checkbox','radio'].includes(a.type)&&a.checked===undefined)continue;
   params.append(a.name,a.value||'');
  }
  for(const select of elements(form,'select')){
   if(!select.attribs.name||select.attribs.disabled!==undefined)continue;
   const options=elements(select,'option').map(o=>({value:o.attribs.value??text(o),label:text(o),selected:o.attribs.selected!==undefined}));
   const currency=options.find(o=>/(?:^|[^A-Z])USD(?:[^A-Z]|$)/i.test(o.label));
   let option=options.find(o=>o.selected)||options[0];
   if(currency){option=currency;usd=true;}
   else if(options.filter(o=>/^\d{4}$/.test(o.value)).length>=2){years++;option=options.find(o=>o.value===year);}
   else if(options.length>=12&&options.filter(o=>/^\d{1,2}$/.test(o.value)&&Number(o.value)>=1&&Number(o.value)<=12).length===12){months++;option=options.find(o=>Number(o.value)===Number(mon));}
   if(!option){valid=false;break;}
   params.set(select.attribs.name,option.value);
  }
  if(!valid||!years||!months||!usd)continue;
  const url=new URL(form.attribs.action||base,base),origin=new URL(base);
  // Crawl only the same monthly-rate page; never follow document instructions or arbitrary form actions.
  if(url.origin!==origin.origin||url.pathname!==origin.pathname)continue;
  const method=(form.attribs.method||'GET').toUpperCase();
  if(method==='POST')return {url:url.href,method,body:params.toString(),headers:{'Content-Type':'application/x-www-form-urlencoded'}};
  if(method==='GET'){for(const [key,value] of params)url.searchParams.append(key,value);return {url:url.href,method};}
 }
 return null;
}
export async function lookupRate(month,fetcher=fetch){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('환율 기준월이 올바르지 않습니다.');
 const deadline=Date.now()+20000;
 const retrieve=async(url,options={})=>{
  const remaining=deadline-Date.now();if(remaining<=0)throw new Error('조회 시간 초과');
  const response=await fetcher(url,{...options,signal:AbortSignal.timeout(Math.min(4500,remaining)),headers:{Accept:'text/html','Accept-Language':'ko-KR,ko;q=0.9',...options.headers}});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const html=decodeHTML(await response.arrayBuffer(),response.headers.get('content-type'));
  return {html,url:response.url||String(url)};
 };
 for(const base of URLS){
  if(Date.now()>=deadline)break;
  try{
   // The normal HTTP page already contains the latest monthly values in its bottom table.
   // Read it first, without invented query parameters or a dependency on the chart's JavaScript.
   const page=await retrieve(base),rate=extractRate(page.html,month);
   if(rate){console.info('SMBS_CRAWL_SUCCESS',JSON.stringify({month,rate,source:page.url}));return {rate,month,currency:'USD',source:page.url,method:'monthly-table-crawl'};}
   // For older statements, submit the actual form field names and option values found in the page.
   const query=monthlyQuery(page.html,page.url,month);
   if(query){const {url,...options}=query,result=await retrieve(url,options),value=extractRate(result.html,month);if(value)return {rate:value,month,currency:'USD',source:result.url,method:'monthly-table-crawl'};}
  }catch(error){console.error('SMBS_CRAWL_FAILURE',JSON.stringify({month,url:base,error:String(error?.message||error).slice(0,200)}));}
 }
 throw new Error('서울외국환중개 월평균 환율 표를 읽지 못했습니다. 잠시 후 다시 조회하거나 출처에서 확인한 값을 직접 입력해 주세요.');
}
