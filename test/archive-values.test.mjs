import {test} from 'node:test';import assert from 'node:assert/strict';import {archiveValues} from '../src/archive-values.mjs';
const record={supply:'18727',invoice:'20600',rate:'1337.66',groups:[{key:'seoul',total:'10'},{key:'hongkong',total:'5'},{key:'common',total:'-1'}]};
test('regional VAT allocations add to the exact stored total and retain negative discounts',()=>{
 for(const [vat,total,amounts] of [['included',20600,[14714,7357,-1471]],['excluded',18727,[13377,6688,-1338]]]){
  const result=archiveValues(record,vat);assert.equal(result.total,total);assert.deepEqual(result.regions.map(g=>g.amount),amounts);assert.equal(result.regions.reduce((s,g)=>s+g.amount,0),total);assert.deepEqual(result.regions.map(g=>g.share),['71.4','35.7','-7.1']);
 }
});
test('net zero cost retains offsetting regions without inventing a percentage',()=>{
 const result=archiveValues({...record,supply:0,invoice:0,groups:[{key:'seoul',total:'1'},{key:'common',total:'-1'}]},'included');assert.equal(result.regions.reduce((s,g)=>s+g.amount,0),0);assert.equal(result.regions[0].share,null);assert.equal(result.regions[0].amount,1471);assert.equal(result.regions[2].amount,-1471);
});
