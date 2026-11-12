import ExcelJS from 'exceljs';
import {HEADERS,SOURCE,num,mul,round} from './core.mjs';
const dateValue=s=>new Date(s+'T00:00:00Z');
export async function makeWorkbook(m,rateOrigin){
 if(!m.money)throw new Error('환율을 입력해 주세요.');
 // Build a new package: importing the template also imported stale defined names
 // and outline properties, which ExcelJS serializes out of OOXML element order.
 const wb=new ExcelJS.Workbook();
 for(const name of ['#. 일자별 합계 비용','#. 서울리전','#. 홍콩리전','#. 공통','#. RAW']){
  const sheet=wb.addWorksheet(name,{properties:{defaultRowHeight:20}});
  sheet.getColumn(1).width=3;
 }
 const summary=wb.worksheets[0];summary.getColumn(2).width=25;
 for(let c=3;c<=10;c++)summary.getColumn(c).width=21;
 for(const range of ['C4:G4','D5:G5','F7:G7','F8:G11','C16:F16','G16:J16'])summary.mergeCells(range);
 wb.views=[{activeTab:0,firstSheet:0,visibility:'visible'}];
 wb.creator='EFA 운영비용 정산';wb.created=new Date();wb.modified=new Date();wb.calcProperties.fullCalcOnLoad=true;
 const s=wb.worksheets[0];
 const set=(a,v,fmt)=>{const c=s.getCell(a);c.value=v;if(fmt)c.numFmt=fmt;};
 const usd='#,##0.000000;[Red]-#,##0.000000',won='#,##0;[Red]-#,##0';
 set('B2','■ 기간 내 합계 금액');set('B4','집계 기간');set('C4',`${m.start}~${m.end}`);set('B5','기준 환율');set('C5',Number(m.rate),'#,##0.00');set('D5',`서울외국환중개 월평균매매기준율 (${m.prev}) · ${rateOrigin}`);
 set('C7','달러화');set('D7','원화');set('E7','원화(VAT 포함)');set('F7','세금계산서 청구 금액(VAT 포함)');
 const last=18+m.days.length;
 for(const [i,g] of [{name:'전체',total:m.total},...m.groups].entries()){
  const row=8+i,col=String.fromCharCode(67+i);set('B'+row,g.name+' 합계');
  set('C'+row,{formula:`SUM(${col}19:${col}${last})`,result:num(g.total)},usd);
  const krw=round(mul(g.total,m.rate)),vat=round(mul(krw,'0.1'));
  set('D'+row,{formula:`ROUND(C${row}*$C$5,0)`,result:krw},won);
  set('E'+row,{formula:`D${row}+ROUND(D${row}*10%,0)`,result:krw+vat},won);
 }
 set('F8',{formula:'D8+ROUND(D8*10%,0)',result:m.money.invoice},won);
 set('B12',`공급가액 ${m.money.supply.toLocaleString('ko-KR')}원 / VAT ${m.money.vat.toLocaleString('ko-KR')}원`);
 set('B13',`RAW 최신일 ${m.latest} · ${m.missing.length?`미수집 ${m.missing.length}일 (0원과 구분)`:'정산 기간 데이터 수집 완료'}`);
 set('B14','■ 일자별 합계 금액');set('C16','달러화');set('G16','원화');
 ['구분','합계','서울','홍콩(중국)','공통','합계','서울','홍콩(중국)','공통'].forEach((v,i)=>s.getCell(17,2+i).value=v);s.getCell('K17').value='수집 상태';set('B18','합계');
 for(let c=3;c<=10;c++){const l=s.getColumn(c).letter;const total=c<=6?[m.total,...m.groups.map(g=>g.total)][c-3]:mul([m.total,...m.groups.map(g=>g.total)][c-7],m.rate);s.getCell(18,c).value={formula:`SUM(${l}19:${l}${last})`,result:num(total)};s.getCell(18,c).numFmt=c<=6?usd:won;}
 for(const [i,d] of m.days.entries()){
  const r=19+i;s.getCell(r,2).value=dateValue(d.date);s.getCell(r,2).numFmt='yyyy-mm-dd';
  for(const [j,k] of ['total','seoul','hongkong','common'].entries()){
   const c=s.getCell(r,3+j);c.value=d.present?num(d[k]):null;c.numFmt=usd;
   const kr=s.getCell(r,7+j);kr.value=d.present?{formula:`${s.getColumn(3+j).letter}${r}*$C$5`,result:num(mul(d[k],m.rate))}:null;kr.numFmt=won;
  }
  s.getCell(r,11).value=d.present?'수집됨':'미수집';
 }
 s.getColumn(11).width=14;s.views=[{state:'frozen',ySplit:18}];s.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};s.pageSetup.printArea=`B2:K${last}`;
 for(const [index,g] of m.groups.entries()){
  const sh=wb.worksheets[index+1];sh.getCell('B2').value='상품코드';sh.getCell('C2').value='합계';sh.getCell('B3').value='합계';
  m.days.forEach((d,i)=>{const c=sh.getCell(2,4+i);c.value=dateValue(d.date);c.numFmt='mm-dd';});
  const end=3+g.products.length;
  sh.getCell('C3').value=end>=4?{formula:`SUM(C4:C${end})`,result:num(g.total)}:0;
  for(const [i,d] of m.days.entries())sh.getCell(3,4+i).value=d.present?num(d[g.key]):null;
  for(const [i,p] of g.products.entries()){
   const r=4+i;sh.getCell(r,2).value=p.name;sh.getCell(r,3).value={formula:`SUM(D${r}:${sh.getColumn(3+m.days.length).letter}${r})`,result:num(p.total)};
   m.days.forEach((d,j)=>sh.getCell(r,4+j).value=d.present?num(p.days[d.date]||'0'):null);
  }
  for(let r=3;r<=Math.max(3,end);r++)for(let c=3;c<=3+m.days.length;c++)sh.getCell(r,c).numFmt=usd;
  sh.getColumn(2).width=30;sh.getColumn(3).width=20;for(let c=4;c<=3+m.days.length;c++)sh.getColumn(c).width=15;
  sh.views=[{state:'frozen',xSplit:3,ySplit:3}];sh.autoFilter={from:'B2',to:sh.getColumn(3+m.days.length).letter+'2'};sh.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};sh.pageSetup.printArea=`B2:${sh.getColumn(3+m.days.length).letter}${Math.max(3,end)}`;
 }
 const raw=wb.worksheets[4];HEADERS.forEach((h,i)=>raw.getCell(2,2+i).value=h);
 for(const [i,r] of m.raw.entries())HEADERS.forEach((h,j)=>{const c=raw.getCell(i+3,j+2);c.value=h==='ymd'?dateValue(r[h]):h==='unblendedCost'?num(r[h]):r[h];if(h==='ymd')c.numFmt='yyyy-mm-dd';if(h==='unblendedCost')c.numFmt=usd;});
 raw.views=[{state:'frozen',ySplit:2}];raw.autoFilter=`B2:G${m.raw.length+2}`;[16,18,22,16,28,26].forEach((v,i)=>raw.getColumn(i+2).width=v);
 // Apply only plain supported cell styles; never copy workbook metadata.
 const green='173F3B',pale='EAF2EE',border='D9E3DD';
 for(const sheet of wb.worksheets){
  sheet.eachRow(row=>{
   row.height=22;
   row.eachCell(cell=>{
    cell.font={name:'맑은 고딕',size:11,color:{argb:'FF203438'}};
    cell.alignment={vertical:'middle',horizontal:typeof cell.value==='number'||cell.value?.formula?'right':'left'};
    cell.border={bottom:{style:'hair',color:{argb:'FF'+border}}};
   });
  });
  const headerRows=sheet===s?[7,17]:[2];
  const totalRows=sheet===s?[8,9,10,11,18]:sheet===raw?[]:[3];
  for(const r of headerRows){sheet.getRow(r).height=30;sheet.getRow(r).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+green}};cell.font={name:'맑은 고딕',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};});}
  for(const r of totalRows)sheet.getRow(r).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+pale}};cell.font={...cell.font,bold:true};});
 }
 for(const a of ['B2','B14']){s.getCell(a).font={name:'맑은 고딕',size:14,bold:true,color:{argb:'FF'+green}};s.getRow(s.getCell(a).row).height=30;}
 s.getRow(5).height=32;s.getCell('D5').alignment={vertical:'middle',wrapText:true};
 s.mergeCells('B12:K12');s.mergeCells('B13:K13');s.getRow(13).height=30;
 s.getCell('B13').alignment={vertical:'middle',wrapText:true};
 // Keep five sheets and include rate provenance in the generated workbook.
 wb.description=`환율 출처: ${SOURCE}; 적용월: ${m.prev}; 입력 방식: ${rateOrigin}`;
 return wb;
}
