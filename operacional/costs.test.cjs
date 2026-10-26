const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('./lib/costs.cjs'),D=require('./lib/domain.cjs'),M=require('./lib/model.cjs');
test('normalização preserva dados legados e é idempotente',()=>{const legacy={projects:[],entries:[],wagePayments:[]};const before=structuredClone(legacy);C.normalize(legacy);assert.deepEqual(legacy,{...before,costs:[]});assert.equal(C.normalize(legacy),legacy);});
test('total por obra conta trabalho validado uma vez e exclui anulações e pendentes',()=>{
  const state={projects:[{id:'one'},{id:'two'}],entries:[{project:'one',status:'approved',minutes:480,unitRate:80,payBasis:'day',dayHours:8},{project:'one',status:'pending',minutes:480,unitRate:500,payBasis:'day',dayHours:8}],wagePayments:[{amount:80,employee:'e1'}],costs:[{project:'one',kind:'material',amount:10.01},{project:'one',kind:'expense',amount:4.99},{project:'one',kind:'expense',amount:100,voided:true},{project:'two',kind:'material',amount:30}]};
  assert.deepEqual(C.summary(state),[{project:'one',materials:10.01,expenses:4.99,labour:80,direct:15,total:95},{project:'two',materials:30,expenses:0,labour:0,direct:30,total:30}]);
});
test('quantidade fracionária arredonda ao cêntimo e ignora valores derivados do cliente',()=>{
  const state={projects:[{id:'one'}]},user={role:'admin',id:'admin'};
  C.apply(state,user,'cost',{project:'one',kind:'material',description:'Teste',date:'2026-10-01',quantity:.5,unit:'m',unitPrice:.05,amount:999},D);assert.equal(state.costs[0].amount,.03);
  assert.throws(()=>C.apply(state,user,'cost',{project:'one',kind:'material',description:'Teste',date:'2026-10-01',quantity:.001,unit:'m',unitPrice:.01},D));
});
