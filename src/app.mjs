import {parseCSV,calculate,period,GROUPS,HEADERS,num,mul,round,percentShare} from './core.mjs';
import {makeWorkbook} from './excel.mjs';
const $=id=>document.getElementById(id),fmt=(x,n=2)=>Number(x).toLocaleString('ko-KR',{minimumFractionDigits:n,maximumFractionDigits:n}),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rows=null,model=null,tab='daily',rateOrigin='직접 입력',lookupID=0,loadedName='',sampleMode=false;
const now=new Date(),seoulNow=new Date(now.toLocaleString('en-US',{timeZone:'Asia/Seoul'}));$('month').value=`${seoulNow.getFullYear()}-${String(seoulNow.getMonth()+1).padStart(2,'0')}`;
function error(e){$('error').hidden=false;$('error').textContent=e.message||String(e);}
function clearError(){$('error').hidden=true;}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,4000);}
function updatePeriod(){try{const p=period($('month').value);$('period').textContent=`${p.start} ~ ${p.end}`;$('rate-month').textContent=`${p.prev.replace('-','년 ')}월 · 미국 달러`;return p;}catch(e){error(e);}}
function render(){
 clearError();const p=updatePeriod();if(!p)return;
 $('export').disabled=true;
 if(!rows)return;
 try{model=calculate(rows,$('month').value,$('rate').value);}catch(e){model=null;$('results').hidden=true;$('empty').hidden=false;error(e);return;}
 const m=model;$('results').hidden=false;$('empty').hidden=true;$('result-month').textContent=m.month;$('coverage').textContent=`${m.days.length-m.missing.length} / ${m.days.length}일 수집`;
 $('notice').hidden=!m.missing.length&&!sampleMode;
 $('notice').textContent=(sampleMode?'예시 데이터입니다. 실제 정산에는 billing.exported.csv를 업로드해 주세요. ':'')+(m.missing.length?`정산 기간 중 ${m.missing.length}일은 데이터가 없습니다. 현재 수집된 금액만 합산합니다. RAW 최신일: ${m.latest}. 미수집: ${m.missing.join(', ')}`:'');
 $('invoice').textContent=m.money?`${fmt(m.money.invoice,0)}원`:'환율 입력 필요';
 $('tax-line').textContent=m.money?`공급가액 ${fmt(m.money.supply,0)}원 · VAT ${fmt(m.money.vat,0)}원`:'전월 USD 월평균 매매기준율을 입력하세요';
 $('invoice-usd').textContent=m.money?`USD $${fmt(m.money.invoice/Number(m.rate))} · 환산 참고`:'환율 입력 후 USD 환산';
 for(const [id,cost] of [['total',m.total],['seoul-total',m.groups[0].total],['hk-total',m.groups[1].total],['common-total',m.groups[2].total]]){
  $(id).textContent=m.money?`${fmt(round(mul(cost,m.rate)),0)}원`:'—';
  $(id+'-usd').textContent=`USD $${fmt(cost)}`;
 }
 for(const [index,id] of ['seoul-share','hk-share','common-share'].entries()){
  const share=percentShare(m.groups[index].total,m.total);
  $(id).textContent=share===null?'전체 대비 —':`전체 대비 ${share}%`;
 }
 $('export').disabled=!m.money;
 drawChart(m);drawTable();
}
function drawChart(m){
 const W=1000,H=175,L=38,R=10,T=15,B=28,base=H-B;
 const max=Math.max(1,...m.days.map(d=>GROUPS.reduce((s,g)=>s+Math.max(0,num(d[g.key])),0))),min=Math.min(0,...m.days.map(d=>GROUPS.reduce((s,g)=>s+Math.min(0,num(d[g.key])),0)));
 const y=x=>T+(max-x)/(max-min)*(H-T-B),zero=y(0),step=(W-L-R)/m.days.length;
 let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="정산 기간 일자별 서울, 홍콩, 공통 운영비용">`;
 for(let i=0;i<=3;i++){const v=min+(max-min)*i/3,yy=y(v);svg+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="#e8edf4"/><text x="${L-10}" y="${yy+3}" text-anchor="end" fill="#64748b" font-size="9">${v.toFixed(0)}</text>`;}
 m.days.forEach((d,i)=>{
  const x=L+i*step+step*.22,w=step*.56;
  if(!d.present)svg+=`<rect x="${x}" y="${zero-3}" width="${w}" height="3" fill="#e2e8f0"><title>${d.date}: 미수집</title></rect>`;
  let pos=0,neg=0;
  GROUPS.forEach((g,j)=>{const v=num(d[g.key]),start=v>=0?pos:neg,end=start+v,yy=y(Math.max(start,end)),hh=Math.abs(y(start)-y(end));if(v>=0)pos=end;else neg=end;
   if(d.present&&v!==0)svg+=`<rect x="${x}" y="${yy}" width="${w}" height="${hh}" rx="1" fill="${['#17243d','#94a3b8','#d8e0eb'][j]}"><title>${d.date} ${g.name}: $${fmt(v,6)}</title></rect>`;
  });
  if(i%5===0||i===m.days.length-1)svg+=`<text x="${x+w/2}" y="${H-7}" text-anchor="middle" fill="#64748b" font-size="9">${d.date.slice(5).replace('-','/')}</text>`;
 });$('chart').innerHTML=svg+'</svg>';
}
const usd=x=>`$${fmt(x,6)}`;
function drawTable(){
 if(!model)return;const m=model;let heads=[],body='',note='';
 const row=(cells,cls='')=>`<tr class="${cls}">${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`;
 if(tab==='daily'){
  heads=['일자','전체 (USD)','서울 (USD)','홍콩 (USD)','공통 (USD)','전체 (KRW)','수집 상태'];
  body=row(['기간 합계',usd(m.total),...m.groups.map(g=>usd(g.total)),m.money?`${fmt(m.money.supply,0)}원`:'—',`${m.days.length-m.missing.length}일`],'total');
  body+=m.days.map(d=>row([d.date,...['total','seoul','hongkong','common'].map(k=>d.present?usd(d[k]):'—'),d.present&&m.money?`${fmt(mul(d.total,m.rate),2)}원`:'—',d.present?'수집됨':'미수집'],d.present?'':'missing')).join('');
  note='일별 원화는 소수점을 유지하며, 공급가액은 기간 USD 합계를 환산해 반올림합니다.';$('table-meta').textContent=`${m.start} ~ ${m.end}`;
 }else if(tab==='raw'){
  heads=HEADERS;body=m.raw.slice(0,300).map(r=>row(HEADERS.map(h=>esc(r[h])))).join('');note=`전체 ${fmt(m.raw.length,0)}건 중 처음 300건 표시 · Excel에는 전체 데이터 포함`;$('table-meta').textContent=`${m.rawStart} ~ ${m.latest}`;
 }else{
  const g=m.groups.find(g=>g.key===tab);heads=['상품코드','기간 합계 (USD)',...m.days.map(d=>d.date.slice(5))];
  body=row(['합계',usd(g.total),...m.days.map(d=>d.present?usd(d[g.key]):'—')],'total');
  body+=g.products.map(p=>row([esc(p.name),usd(p.total),...m.days.map(d=>d.present?fmt(p.days[d.date]||0,6):'—')],num(p.total)<0?'negative':'')).join('');
  note=`${g.code} · ${g.products.length}개 상품코드`;$('table-meta').textContent='단위 USD';
 }
 $('table-wrap').innerHTML=`<table><thead><tr>${heads.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;$('table-note').textContent=note;
}
async function lookup(){
 const p=updatePeriod();if(!p)return;const id=++lookupID;$('lookup').disabled=true;$('rate-status').textContent=`${p.prev} USD 월평균 환율 표를 읽고 있습니다…`;
 try{
  const response=await fetch(`/api/rate?month=${p.prev}`,{signal:AbortSignal.timeout(25000)});const data=await response.json();
  if(id!==lookupID)return;
  if(!response.ok)throw new Error(data.error||'환율 조회에 실패했습니다.');
  $('rate').value=data.rate;rateOrigin='월평균 환율 표 크롤링';$('rate-tag').textContent='월평균 표 조회 완료';$('rate-status').textContent=`${p.prev} USD 월평균 ${fmt(data.rate)}원 · 서울외국환중개`;render();
 }catch(e){if(id!==lookupID)return;$('rate-tag').textContent=$('rate').value?'직접 입력':'직접 입력 필요';$('rate-status').textContent='자동 조회가 불가능합니다. 위 출처에서 기준월 USD 월평균 환율을 확인하여 직접 입력해 주세요.';
 }finally{if(id===lookupID)$('lookup').disabled=false;}
}
async function loadFile(file){
 if(!file)return;if(!/\.csv$/i.test(file.name))return error(new Error('CSV 파일을 선택해 주세요.'));if(file.size>20*1024*1024)return error(new Error('파일 크기는 최대 20MB입니다.'));
 try{
  const buf=await file.arrayBuffer();let txt;
  try{txt=new TextDecoder('utf-8',{fatal:true}).decode(buf);}catch{txt=new TextDecoder('euc-kr').decode(buf);}
  const parsed=parseCSV(txt);const latest=parsed.reduce((a,r)=>r.ymd>a?r.ymd:a,'');rows=parsed;loadedName=file.name;sampleMode=false;
  $('month').value=latest.slice(0,7);$('rate').value='';rateOrigin='직접 입력';$('file-title').textContent=file.name;$('file-sub').textContent=`${fmt(rows.length,0)}건 · 최신일 ${latest} · ${(file.size/1024).toFixed(1)} KB`;
  document.querySelector('.file-button').textContent='다른 파일 선택';render();lookup();
 }catch(e){error(e);}finally{$('file').value='';}
}
$('file').addEventListener('change',e=>loadFile(e.target.files[0]));
$('drop').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file').click();}});
for(const name of ['dragenter','dragover'])$('drop').addEventListener(name,e=>{e.preventDefault();$('drop').classList.add('drag');});
for(const name of ['dragleave','drop'])$('drop').addEventListener(name,e=>{e.preventDefault();$('drop').classList.remove('drag');if(name==='drop')loadFile(e.dataTransfer.files[0]);});
$('month').addEventListener('change',()=>{$('rate').value='';rateOrigin='직접 입력';render();lookup();});
$('rate').addEventListener('input',()=>{lookupID++;$('lookup').disabled=false;rateOrigin='직접 입력';$('rate-tag').textContent='직접 입력';$('rate-status').textContent='직접 입력한 환율입니다. 기준월 USD 월평균 매매기준율과 일치하는지 확인해 주세요.';render();});
$('lookup').addEventListener('click',lookup);
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-selected',x===b?'true':'false');});drawTable();}));
$('export').addEventListener('click',async()=>{
 if(!model?.money)return;$('export').disabled=true;const old=$('export').innerHTML;$('export').textContent='Excel을 만들고 있습니다…';const snapshot=model,origin=rateOrigin;
 try{const wb=await makeWorkbook(snapshot,origin);const blob=new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`EFA 운영비용 집계_${snapshot.prev}_${snapshot.month}${sampleMode?'_예시':''}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('5개 시트의 정산 Excel을 다운로드했습니다.');}catch(e){error(e);}finally{$('export').innerHTML=old;$('export').disabled=!model?.money;}
});
$('sample').addEventListener('click',()=>{
 ++lookupID;$('lookup').disabled=false;const p=period($('month').value);sampleMode=true;rows=[];
 for(const [i,date] of p.days.entries())for(const [region,productCode,value] of [['APN2','AmazonECS',11.2],['APN2','AmazonRDS',3.1],['APE1','AmazonECS',7.3],['USW2','AmazonVPC',.24],['Global','AWSGlobalAccelerator',.6]])rows.push({ymd:date,projectName:'efa-demo',usageAccountId:'000000000000',region,productCode,unblendedCost:String(value+(i%5)*.03)});
 rows.push({ymd:p.month+'-01',projectName:'efa-demo',usageAccountId:'000000000000',region:'Global',productCode:'MZC Discount Program',unblendedCost:'-8.5'});
 $('file-title').textContent='예시 데이터 · 실제 청구 데이터가 아닙니다';$('file-sub').textContent=`${rows.length}건 · 정산 기능을 미리 확인하세요`;$('rate').value='1300';rateOrigin='예시용 환율';$('rate-tag').textContent='예시 환율';$('rate-status').textContent='1,300원은 기능 확인을 위한 예시 환율입니다. 실제 정산에는 공식 환율을 사용하세요.';render();
});
updatePeriod();
lookup();
