import {archiveValues} from './archive-values.mjs';
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
 chartRecords=records;const target=$('archive-target').value,vat=$('archive-vat').value,label=({all:'전체',seoul:'한국',hongkong:'홍콩',common:'공통'})[target]+(vat==='included'?' 청구액':' 공급가액');
 const data=records.map(r=>{const split=archiveValues(r,vat);return {...r,split,segments:target==='all'?split.regions:split.regions.filter(g=>g.key===target),value:target==='all'?split.total:split.regions.find(g=>g.key===target).amount};}).sort((a,b)=>a.month.localeCompare(b.month));
 const tooltip=$('archive-tooltip');tooltip.hidden=true;
 const chart=$('archive-chart'),summary=$('archive-summary');chart.replaceChildren();summary.replaceChildren();
 if(!data.length){const empty=document.createElement('p');empty.className='chart-empty';empty.textContent='아직 저장된 정산이 없습니다. 빌링 정산 페이지에서 첫 정산을 저장해 주세요.';chart.append(empty);return;}
 const last=data.at(-1).month.slice(0,7),end=Number(last.slice(0,4))*12+Number(last.slice(5))-1;
 const first=Math.max(end-11,Number(data[0].month.slice(0,4))*12+Number(data[0].month.slice(5,7))-1),months=[];
 for(let n=first;n<=end;n++){const key=`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;months.push({key,record:data.find(r=>r.month.slice(0,7)===key)});}
 const values=months.filter(m=>m.record).map(m=>m.record.value),sum=values.reduce((a,b)=>a+b,0);
 for(const [title,value] of [[`표시 기간 ${label} 합계`,money(sum)],[`저장된 ${values.length}개월 평균`,money(sum/values.length)],[`${last} ${label}`,money(data.at(-1).value)]]){const item=document.createElement('div'),name=document.createElement('span'),amount=document.createElement('strong');name.textContent=title;amount.textContent=value;item.append(name,amount);summary.append(item);}
 const positive=Math.max(0,...months.map(m=>m.record?.segments.reduce((s,g)=>s+Math.max(0,g.amount),0)||0)),negative=Math.max(0,...months.map(m=>m.record?.segments.reduce((s,g)=>s+Math.max(0,-g.amount),0)||0)),extent=Math.max(1,positive+negative),baseline=negative/extent*100;
 const bars=document.createElement('div');bars.className='archive-bars stacked';bars.setAttribute('aria-label',`월별 ${label} 차트`);
 function showTooltip(record,key,x,y){
  tooltip.replaceChildren();const heading=document.createElement('strong');heading.textContent=`${key} · ${vat==='included'?'VAT 포함':'VAT 미포함'}`;tooltip.append(heading);
  for(const g of record.split.regions){const row=document.createElement('div'),name=document.createElement('span'),amount=document.createElement('b');name.textContent=g.name;name.style.borderColor=g.color;amount.textContent=`${money(g.amount)} · ${g.share===null?'비중 —':g.share+'%'}`;row.append(name,amount);tooltip.append(row);}
  const total=document.createElement('p');total.textContent=`전체 ${money(record.split.total)}`;tooltip.append(total);tooltip.hidden=false;
  const box=tooltip.getBoundingClientRect();tooltip.style.left=`${Math.max(8,Math.min(x+14,innerWidth-box.width-8))}px`;tooltip.style.top=`${Math.max(8,Math.min(y+14,innerHeight-box.height-8))}px`;
 }
 for(const {key,record} of months){
  const item=document.createElement(record?'button':'div');item.className='archive-column'+(record?'':' missing');
  const amount=document.createElement('span');amount.className='archive-value';amount.textContent=record?money(record.value):'미저장';
  const track=document.createElement('span');track.className='archive-track';track.style.setProperty('--baseline',baseline+'%');
  if(record){let up=0,down=0;for(const g of record.segments){const bar=document.createElement('span');bar.className='archive-bar archive-segment';bar.dataset.region=g.key;bar.style.background=g.color;bar.style.height=`${Math.abs(g.amount)/extent*100}%`;bar.style.bottom=`${g.amount<0?baseline-(down+Math.abs(g.amount))/extent*100:baseline+up/extent*100}%`;if(g.amount<0){down+=Math.abs(g.amount);bar.classList.add('negative');}else up+=g.amount;track.append(bar);}}
  const month=document.createElement('span');month.className='archive-month';month.textContent=key;item.append(amount,track,month);
  if(record){
   item.type='button';item.setAttribute('aria-describedby','archive-tooltip');item.setAttribute('aria-label',`${key} ${label} ${money(record.value)} · ${record.split.regions.map(g=>`${g.name} ${money(g.amount)} ${g.share===null?'':g.share+'%'}`).join(', ')} · v${record.version} 불러오기`);
   item.addEventListener('pointermove',e=>showTooltip(record,key,e.clientX,e.clientY));item.addEventListener('pointerleave',()=>tooltip.hidden=true);
   item.addEventListener('focus',()=>{const box=item.getBoundingClientRect();showTooltip(record,key,box.left,box.top);});item.addEventListener('blur',()=>tooltip.hidden=true);
   item.addEventListener('keydown',e=>{if(e.key==='Escape')tooltip.hidden=true;});item.addEventListener('click',()=>{tooltip.hidden=true;document.dispatchEvent(new CustomEvent('efa:load',{detail:{month:key}}));});
  }
  bars.append(item);
 }
 chart.append(bars);
}
