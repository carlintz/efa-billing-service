import {mul,round} from './core.mjs';
const $=id=>document.getElementById(id);
const pages={account:['계정 · 권한 관리','로그인과 비밀번호, EFA 담당자의 접근 권한을 관리하세요.'],history:['월별 정산 내역','저장한 정산을 확인하고, 월별 금액의 흐름을 살펴보세요.'],settlement:['빌링 정산','빌링 데이터를 업로드하고, EFA 운영비용을 정산하세요.']};
export function currentPage(){const path=location.pathname.replace(/\/$/,'').slice(1);return Object.hasOwn(pages,path)?path:'settlement';}
function renderPage(focus=false){
 const page=currentPage();document.querySelectorAll('[data-view]').forEach(el=>el.hidden=el.dataset.view!==page);
 document.querySelectorAll('.page-nav [data-page]').forEach(el=>{if(el.dataset.page===page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
 const [title,description]=pages[page];$('page-title').textContent=title;$('page-description').textContent=description;document.title=`EFA · ${title}`;$('export').hidden=page!=='settlement';
 if(focus){$('page-title').setAttribute('tabindex','-1');$('page-title').focus({preventScroll:true});window.scrollTo(0,0);}
 document.dispatchEvent(new CustomEvent('efa:page',{detail:{page}}));
}
export function navigate(page){if(!Object.hasOwn(pages,page))return;if(currentPage()!==page)history.pushState({},'',`/${page}`);renderPage(true);}
export function bootPages(){
 document.addEventListener('click',event=>{const link=event.target.closest('a[data-page]');if(!link||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate(link.dataset.page);});
 window.addEventListener('popstate',()=>renderPage(true));renderPage();
}
let chartRecords=[];
const money=value=>Number(value).toLocaleString('ko-KR',{maximumFractionDigits:0})+'원';
export function renderArchive(records=chartRecords){
 chartRecords=records;const metric=$('archive-metric').value,label=({invoice:'청구액',supply:'공급가액',seoul:'서울(한국) 운영비용',hongkong:'홍콩 운영비용',common:'공통 운영비용'})[metric];
 const data=records.map(r=>({...r,[metric]:['seoul','hongkong','common'].includes(metric)?round(mul(r.groups?.find(g=>g.key===metric)?.total||'0',r.rate)):r[metric]})).sort((a,b)=>a.month.localeCompare(b.month));
 const chart=$('archive-chart'),summary=$('archive-summary');chart.replaceChildren();summary.replaceChildren();
 if(!data.length){const empty=document.createElement('p');empty.className='chart-empty';empty.textContent='아직 저장된 정산이 없습니다. 빌링 정산 페이지에서 첫 정산을 저장해 주세요.';chart.append(empty);return;}
 const last=data.at(-1).month.slice(0,7),end=Number(last.slice(0,4))*12+Number(last.slice(5))-1;
 const first=Math.max(end-11,Number(data[0].month.slice(0,4))*12+Number(data[0].month.slice(5,7))-1),months=[];
 for(let n=first;n<=end;n++){const key=`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;months.push({key,record:data.find(r=>r.month.slice(0,7)===key)});}
 const values=months.filter(m=>m.record).map(m=>Number(m.record[metric])),max=Math.max(1,...values.map(Math.abs)),sum=values.reduce((a,b)=>a+b,0);
 for(const [title,value] of [[`표시 기간 ${label} 합계`,money(sum)],[`저장된 ${values.length}개월 평균`,money(sum/values.length)],[`${last} ${label}`,money(data.at(-1)[metric])]]){const item=document.createElement('div'),name=document.createElement('span'),amount=document.createElement('strong');name.textContent=title;amount.textContent=value;item.append(name,amount);summary.append(item);}
 const bars=document.createElement('div');bars.className='archive-bars';const signed=values.some(v=>v<0);if(signed)bars.classList.add('signed');bars.setAttribute('aria-label',`월별 ${label} 차트`);
 for(const {key,record} of months){
  const item=document.createElement(record?'button':'div');item.className='archive-column'+(record?'':' missing');
  const amount=document.createElement('span');amount.className='archive-value';amount.textContent=record?money(record[metric]):'미저장';
  const track=document.createElement('span');track.className='archive-track';const bar=document.createElement('span');bar.className='archive-bar';if(metric==='hongkong')bar.style.background='#7488a8';if(metric==='common')bar.style.background='#a2b0c5';bar.style.height=record?`${Math.abs(Number(record[metric]))/max*(signed?50:100)}%`:'0';if(record&&Number(record[metric])<0)bar.classList.add('negative');track.append(bar);
  const month=document.createElement('span');month.className='archive-month';month.textContent=key;item.append(amount,track,month);
  if(record){item.type='button';item.title=`${key} ${label} ${money(record[metric])} · v${record.version} 불러오기`;item.setAttribute('aria-label',item.title);item.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('efa:load',{detail:{month:key}})));}
  bars.append(item);
 }
 chart.append(bars);
}
