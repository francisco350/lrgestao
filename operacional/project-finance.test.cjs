const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('./lib/costs.cjs'),D=require('./lib/domain.cjs'),F=require('./public/project-finance-model.js');
const admin={role:'admin',id:'admin'},helpers={...D,isoToday:()=> '2026-11-05'};
function state(){return {projects:[{id:'p',employees:[]},{id:'other',employees:[]}],entries:[],employees:[],wagePayments:[],corrections:[],costs:[],costPayments:[],charges:[],receipts:[],clients:[]};}
const cost={project:'p',kind:'expense',description:'Gasóleo',category:'Transporte',date:'2026-10-12',unitPrice:100,settlement:'unpaid'};
const apply=(s,type,data,user=admin)=>C.apply(s,user,type,data,helpers);

test('por receber no fecho agrega horas validadas por obra e categoria e respeita a data de recebimento',()=>{
  const s=state(),R=require('./lib/receivables.cjs');
  s.projects[0].saleRates={official:2500,helper:1000};
  s.entries=[
    {id:'h',project:'p',category:'Ajudante',status:'approved',date:'2026-10-15',minutes:600},
    {id:'o',project:'p',category:'Oficial',status:'approved',date:'2026-09-14',minutes:90},
    {id:'future',project:'p',category:'Oficial',status:'approved',date:'2026-12-01',minutes:60},
    {id:'other',project:'other',category:'Oficial',status:'approved',date:'2026-10-18',minutes:120},
    {id:'pending',project:'p',category:'Ajudante',status:'pending',date:'2026-10-18',minutes:120}
  ];
  const receipt={project:'p',role:'helper',date:'2026-11-03',method:'Transferência'};
  R.apply(s,admin,'saleReceipt',{...receipt,minutes:420},helpers);
  const detail=(project,until)=>F.accountDetails(s,'receivable',project,'2026-10-01',until);
  const oct=detail('p','2026-10-31');
  assert.deepEqual(oct.map(r=>[r.description,r.minutes,r.amount]),[['Ajudantes',600,100],['Oficiais',90,37.5]]);
  assert.equal(F.summary(s,'p','','2026-10-31').receivable,137.5);
  assert.equal(F.summary(s,'p','','2026-11-30').receivable,67.5);
  assert.equal(detail(undefined,'2026-10-31').find(r=>r.project==='other').unpriced,120);
  s.projects[1].saleRates={official:2000};
  assert.equal(detail(undefined,'2026-10-31').reduce((n,r)=>n+r.amount,0),177.5);
  Object.assign(s.receipts[0],{voided:true,voidedAt:'2026-12-01T12:00:00Z'});
  assert.equal(F.summary(s,'p','','2026-11-30').receivable,67.5);
  assert.equal(F.summary(s,'p','','2026-12-31').receivable,162.5);
});

test('cobrança com horas mantém um único saldo e liquida as horas antes da parcela adicional',()=>{
  const s=state(),R=require('./lib/receivables.cjs'),p=s.projects[0];
  p.clientId='client';p.saleRates={official:2500,helper:1000};s.clients=[{id:'client',active:true}];
  s.entries=[
    {id:'helper',project:'p',category:'Ajudante',status:'approved',date:'2026-10-01',minutes:120},
    {id:'official',project:'p',category:'Oficial',status:'approved',date:'2026-10-02',minutes:60}
  ];
  const save=(type,data)=>R.apply(s,admin,type,data,helpers);
  const charge={project:'p',amount:65,description:'Trabalho e deslocação',due:'2026-10-31',workEntries:['official','helper']};
  assert.throws(()=>save('charge',{...charge,amount:44.99}));
  assert.throws(()=>save('charge',{...charge,workEntries:['official','official']}));
  save('charge',charge);const id=s.charges[0].id;
  assert.throws(()=>save('charge',charge));assert.throws(()=>R.ensureWorkEditable(s,'helper'));
  assert.throws(()=>save('saleReceipt',{project:'p',role:'helper',minutes:60,date:'2026-11-03',method:'Numerário'}));
  p.saleRates.helper=2000;
  assert.equal(F.summary(s,'p','','2026-10-30').receivable,45);
  assert.equal(F.summary(s,'p','','2026-10-31').receivable,65);
  save('receipt',{charge:id,date:'2026-11-03',amount:32.5,method:'Numerário'});
  assert.deepEqual(F.accountDetails(s,'receivable','p','','2026-11-30').map(r=>[r.description,r.amount,r.minutes]),
    [['Oficiais',12.5,30],['Trabalho e deslocação',20,undefined]]);
  assert.equal(F.summary(s,'p','','2026-10-31').receivable,65);
  assert.equal(F.summary(s,'p','','2026-11-30').received,32.5);
  save('receipt',{charge:id,date:'2026-11-04',amount:32.5,method:'Transferência'});
  assert.equal(F.summary(s,'p','','2026-11-30').receivable,0);
  for(const r of s.receipts)save('voidReceipt',{id:r.id,reason:'Correção'});
  assert.equal(F.summary(s,'p').receivable,65);
  save('voidCharge',{id,reason:'Correção'});R.ensureWorkEditable(s,'helper');
  assert.equal(F.summary(s,'p').receivable,65); // Tarifa atual de ajudante: 2 h × 20 €.
});

test('recebimento parcial de horas preserva preço, período, saldo da cobrança e histórico',()=>{
  const s=state(),R=require('./lib/receivables.cjs');
  s.projects[0].saleRates={official:2500,helper:1500};s.projects[0].clientId='client';
  s.entries=[{id:'a',project:'p',category:'Oficial',date:'2026-10-01',minutes:240,status:'approved'},{id:'b',project:'p',category:'Oficial',date:'2026-10-02',minutes:360,status:'approved'}];
  s.charges=[{id:'c',project:'p',amount:500,due:'2026-10-01'}];
  const data={project:'p',role:'official',from:'2026-10-01',until:'2026-10-31',date:'2026-11-03',minutes:420,charge:'c',method:'Numerário'};
  const save=(updates={})=>R.apply(s,admin,'saleReceipt',{...data,...updates},helpers);
  assert.throws(()=>save({date:'2026-10-01'}));assert.throws(()=>save({role:'helper'}));
  save();
  // A later receipt explicitly links 7 hours to the October charge.
  // October still owes the entire charge plus the three hours outside it.
  assert.equal(F.summary(s,'p','','2026-10-31').receivable,575);
  assert.equal(F.summary(s,'p','','2026-11-30').receivable,400);
  assert.deepEqual(s.receipts[0].sale.allocations,[{entry:'a',minutes:240,cents:10000},{entry:'b',minutes:180,cents:7500}]);
  assert.equal(F.chargeBalance(s,s.charges[0]),325);
  assert.equal(F.summary(s,'p','2026-11-01','2026-11-30').received,175);
  assert.equal(F.summary(s,'p','2026-10-01','2026-10-31').received,0);
  s.projects[0].saleRates.official=3000;
  assert.throws(()=>save({minutes:181}));save({minutes:180});
  assert.deepEqual(s.receipts.map(r=>r.amount),[175,90]);
  assert.equal(F.saleWork(s,'p','2026-10-02','2026-10-02')[0].paidCents,16500);
  assert.throws(()=>R.ensureWorkEditable(s,'a'));
  R.apply(s,admin,'voidReceipt',{id:s.receipts[0].id,reason:'Correção'},helpers);
  assert.equal(F.saleWork(s,'p')[0].available,240);R.ensureWorkEditable(s,'a');
  assert.equal(F.chargeBalance(s,s.charges[0]),410);assert.equal(s.wagePayments.length,0);
});

test('lucro e saldo excluem movimentos anteriores e posteriores ao intervalo',()=>{
  const s=state();s.projects[0].budget=99999;
  s.costs=[{id:'old',project:'p',kind:'material',amount:200,date:'2026-09-01',paymentTracked:true},{id:'current',project:'p',kind:'material',amount:60,date:'2026-10-01',paymentTracked:true},{id:'general',project:null,kind:'expense',amount:50,date:'2026-10-31',paymentTracked:true},{id:'future',project:'p',kind:'expense',amount:999,date:'2026-11-01',paymentTracked:true}];
  s.entries=[{employee:'a',project:'p',status:'approved',date:'2026-09-01',minutes:600,unitRate:10,payBasis:'hour'}];
  s.costPayments=[{cost:'old',project:'p',date:'2026-09-01',amount:50},{cost:'general',project:null,date:'2026-10-31',amount:50}];
  s.wagePayments=[{employee:'a',project:'p',date:'2026-10-01',amount:40},{employee:'a',date:'2026-10-02',amount:10}];
  s.charges=[{project:'p',due:'2026-09-30',amount:999},{project:'p',due:'2026-10-01',amount:200},{project:'other',due:'2026-10-31',amount:100},{project:'p',due:'2026-11-01',amount:999},{project:'p',due:'2026-10-15',amount:999,voided:true}];
  s.receipts=[{project:'p',date:'2026-09-01',amount:300},{project:'p',date:'2026-11-01',amount:500},{project:'p',date:'2026-10-01',amount:100},{project:'other',date:'2026-10-31',amount:20}];
  assert.deepEqual(F.position(s,'p','2026-10-01','2026-10-31'),{profit:140,balance:60});
  assert.deepEqual(F.position(s,undefined,'2026-10-01','2026-10-31'),{profit:190,balance:20});
  s.charges=[];s.receipts=[];
  assert.deepEqual(F.position(s,'p','2026-10-01','2026-10-31'),{profit:-60,balance:-40});
});

test('contas mensais incluem categorias e todos os pagamentos à equipa uma única vez',()=>{
  const s=state();
  s.costs=[{id:'m',project:'p',kind:'material',amount:100,date:'2026-09-01',paymentTracked:true},{id:'g',project:null,kind:'expense',category:'Transporte',amount:50,date:'2026-10-01',paymentTracked:true},{id:'u',project:'p',kind:'expense',category:'Aluguer de equipamento',amount:20,date:'2026-10-02'}];
  s.costPayments=[{cost:'m',project:'p',amount:25,date:'2026-10-03'}];
  const entry=(employee,project,date,minutes,status='approved')=>({employee,project,date,minutes,status,payBasis:'hour',unitRate:10});
  s.entries=[entry('a','p','2026-09-01',600),entry('a','other','2026-10-01',600),entry('b','p','2026-10-01',300),entry('a','p','2026-10-02',600,'pending')];
  s.wagePayments=[{employee:'a',project:'p',amount:40,date:'2026-10-03'}, {employee:'a',amount:10,date:'2026-10-04'}, {employee:'a',amount:999,date:'2026-11-01'}, {employee:'a',amount:999,date:'2026-10-01',voided:true}, {employee:'b',type:'advance',amount:100,date:'2026-10-05'}];
  const result=F.monthly(s,'2026-10-01','2026-10-31');
  assert.deepEqual(result.totals,{cost:220,paid:175,due:275,unknown:20});
  assert.equal(result.unassignedPaid,110);
  assert.deepEqual(result.rows.find(r=>r.label==='Mão de obra'),{label:'Mão de obra',cost:150,paid:150,due:150,unknown:0});
  assert.equal(result.rows.find(r=>r.label==='Transporte').due,50);
  assert.equal(result.rows.find(r=>r.label==='Materiais').cost,0);
});

test('resumo unificado inclui equipa, transporta saldos e separa pendentes e desconhecidos',()=>{
  const s=state();
  s.costs=[{id:'m',project:'p',kind:'material',date:'2026-09-01',amount:100,paymentTracked:true},{id:'x',project:'p',kind:'expense',date:'2026-10-01',amount:50}];
  s.costPayments=[{cost:'m',project:'p',date:'2026-10-02',amount:30,method:'Numerário'}];
  s.entries=[{id:'e',employee:'a',project:'p',date:'2026-09-01',status:'approved',minutes:480,payBasis:'hour',unitRate:10},{id:'pending',employee:'a',project:'p',date:'2026-10-01',status:'pending',minutes:120,payBasis:'hour',unitRate:10}];
  s.wagePayments=[{entry:'e',project:'p',employee:'a',date:'2026-10-03',amount:40,method:'Numerário'}, {employee:'a',date:'2026-09-02',amount:5,method:'Transferência'}, {entry:'e',project:'p',date:'2026-11-01',amount:40,method:'Numerário'}, {project:'other',date:'2026-10-03',amount:999,method:'Numerário'}];
  const result=F.overview(s,'p','2026-10-01','2026-10-31');
  assert.deepEqual(result.totals,{cost:50,paid:70,due:110,unknown:50});
  assert.equal(result.pending,20);assert.equal(result.unassignedWages,1);
  assert.equal(result.rows.find(r=>r.kind==='labour').due,40);
  assert.equal(result.methods.find(r=>r.method==='Numerário').paid,70);
  s.wagePayments[0].voided=true;s.wagePayments[0].voidedAt='2026-11-02T10:00:00Z';
  assert.equal(F.overview(s,'p','','2026-10-31').rows[2].paid,40);
  assert.equal(F.overview(s,'p','','2026-11-30').rows[2].paid,40);
});
test('custo e pagamento inicial são atómicos e não duplicam o custo',()=>{
  const s=state();apply(s,'projectCost',{...cost,settlement:'partial',paidAmount:40,paymentDate:'2026-10-12',paymentMethod:'Numerário'});
  assert.equal(C.summary(s)[0].total,100);assert.equal(s.costPayments[0].amount,40);assert.equal(s.costPayments[0].project,'p');
  assert.equal(F.summary(s,'p','2026-10-01','2026-10-31').due,60);
  const before=structuredClone(s);
  for(const payment of [{paidAmount:101,paymentDate:'2026-10-12',paymentMethod:'Numerário'},{paidAmount:10,paymentDate:'2026-11-06',paymentMethod:'Numerário'},{paidAmount:10,paymentDate:'2026-10-11',paymentMethod:'Numerário'},{paidAmount:10,paymentDate:'2026-10-12',paymentMethod:'Cartão inexistente'}]){
    assert.throws(()=>apply(s,'projectCost',{...cost,settlement:'partial',...payment}));assert.deepEqual(s,before);
  }
});
test('pagamento total, limites, datas e anulação com histórico',()=>{
  const s=state();apply(s,'projectCost',cost);const id=s.costs[0].id;
  apply(s,'costPayment',{cost:id,amount:100,date:'2026-11-02',method:'Transferência',project:'other'});
  assert.equal(s.costPayments[0].project,'p');assert.equal(F.costBalance(s,s.costs[0]).due,0);
  assert.throws(()=>apply(s,'costPayment',{cost:id,amount:.01,date:'2026-11-03',method:'Numerário'}),/excede/);
  assert.throws(()=>apply(s,'voidCost',{id,reason:'Correção'}),/pagamentos/);
  apply(s,'voidCostPayment',{id:s.costPayments[0].id,reason:'Engano'});assert.equal(F.costBalance(s,s.costs[0]).due,100);
  assert.equal(s.costPayments[0].voidReason,'Engano');
  apply(s,'voidCost',{id,reason:'Correção'});assert.equal(F.costBalance(s,s.costs[0]).due,0);
});
test('fecho mensal transporta dívidas sem misturar pagamentos de meses posteriores ou outras obras',()=>{
  const s=state();apply(s,'projectCost',{...cost,date:'2026-09-20'});const id=s.costs[0].id;
  apply(s,'costPayment',{cost:id,amount:30,date:'2026-10-12',method:'Numerário'});
  apply(s,'costPayment',{cost:id,amount:70,date:'2026-11-02',method:'Transferência'});
  s.charges=[{id:'c',project:'p',amount:500,due:'2026-09-30'},{id:'later',project:'p',amount:900,due:'2026-12-01'}];
  s.receipts=[{charge:'c',project:'p',amount:200,date:'2026-10-20',method:'Transferência'},{charge:'c',project:'p',amount:300,date:'2026-11-02',method:'Numerário'},{charge:'x',project:'other',amount:999,date:'2026-10-20',method:'Numerário'}];
  const oct=F.summary(s,'p','2026-10-01','2026-10-31');
  assert.equal(oct.expenses,0);assert.equal(oct.paid,30);assert.equal(oct.due,70);assert.equal(oct.received,200);assert.equal(oct.receivable,300);assert.equal(oct.cashBalance,170);
  assert.deepEqual(oct.methods[0],{method:'Numerário',paid:30,received:0});assert.deepEqual(oct.methods[1],{method:'Transferência',paid:0,received:200});
  const nov=F.summary(s,'p','2026-11-01','2026-11-30');assert.equal(nov.due,0);assert.equal(nov.paid,70);assert.equal(nov.receivable,0);
});
test('custos antigos e saídas de armazém nunca são assumidos como dívida ou pagamento',()=>{
  const s=state();apply(s,'cost',cost);s.costs.push({...s.costs[0],id:'stock',inventoryLot:'lot'});
  let summary=F.summary(s,'p');assert.equal(summary.unknownCount,1);assert.equal(summary.unknownAmount,100);assert.equal(summary.due,0);assert.equal(summary.paid,0);
  assert.throws(()=>apply(s,'costPayment',{cost:'stock',amount:100,date:'2026-10-12',method:'Numerário'}),/armazém/);
  apply(s,'trackCostPayment',{cost:s.costs[0].id});summary=F.summary(s,'p');assert.equal(summary.unknownCount,0);assert.equal(summary.due,100);
});
test('anulações posteriores não apagam o fecho anterior',()=>{
  const s=state();s.costs=[{id:'c',project:'p',kind:'expense',amount:100,date:'2026-10-01',paymentTracked:true,voided:true,voidedAt:'2026-11-05T10:00:00Z'}];
  s.costPayments=[{id:'pay',cost:'c',project:'p',date:'2026-10-02',amount:40,method:'Numerário',voided:true,voidedAt:'2026-11-05T10:00:00Z'}];
  const oct=F.summary(s,'p','2026-10-01','2026-10-31');assert.equal(oct.expenses,100);assert.equal(oct.paid,40);assert.equal(oct.due,60);
  const nov=F.summary(s,'p','2026-11-01','2026-11-30');assert.equal(nov.due,0);assert.equal(nov.paid,0);
});
test('novos movimentos são exclusivos do administrador e não expostos à equipa',()=>{
  for(const role of ['manager','worker']){
    const s=state(),user={id:role,role,projects:['p'],employeeId:'e'};
    for(const type of ['projectCost','costPayment','voidCostPayment','trackCostPayment'])assert.throws(()=>apply(s,type,{},user),e=>e.status===403);
    assert.equal(D.sanitize(s,user).costPayments,undefined);
  }
});


test('custos gerais entram uma vez no mês e não são atribuídos a obras',()=>{
  const s=state();apply(s,'projectCost',cost);
  apply(s,'generalCost',{...cost,project:'p',settlement:'partial',paidAmount:30,paymentDate:'2026-10-12',paymentMethod:'Numerário'});
  const c=s.costs.at(-1);assert.equal(c.project,null);assert.equal(c.kind,'expense');
  const general=F.summary(s,null,'2026-10-01','2026-10-31'),project=F.summary(s,'p','2026-10-01','2026-10-31');
  assert.equal(general.expenses,100);assert.equal(general.paid,30);assert.equal(general.due,70);assert.equal(project.expenses,100);assert.equal(project.paid,0);
  assert.equal(F.summary(s,null,'2026-11-01','2026-11-30').expenses,0);
  assert.equal(F.summary(s,null,'2026-11-01','2026-11-30').due,70);
  const before=structuredClone(s);assert.throws(()=>apply(s,'generalCost',{...cost,settlement:'paid',paymentDate:'2026-12-01',paymentMethod:'Numerário'}));assert.deepEqual(s,before);
  assert.throws(()=>apply(s,'cost',{...cost,project:null}));
  for(const role of ['manager','worker'])assert.throws(()=>apply(s,'generalCost',cost,{id:role,role}),e=>e.status===403);
  assert.throws(()=>apply(s,'voidCost',{id:c.id,reason:'Correção'}),/pagamentos/);
  apply(s,'voidCostPayment',{id:s.costPayments.at(-1).id,reason:'Correção'});apply(s,'voidCost',{id:c.id,reason:'Correção'});
  assert.equal(F.summary(s,null).expenses,0);assert.equal(F.summary(s,null).due,0);
});
test('estados das cobranças refletem pagamentos e anulações no período consultado',()=>{
  const s=state(),c={id:'c',project:'p',due:'2026-10-01',amount:100};s.charges=[c];
  assert.equal(F.chargeState(s,c,'2026-10-31').label,'Por receber');
  s.receipts=[{charge:'c',amount:40,date:'2026-10-12'},{charge:'c',amount:60,date:'2026-11-02'}];
  assert.equal(F.chargeState(s,c,'2026-10-31').label,'Parcialmente recebida');assert.equal(F.chargeState(s,c,'2026-10-31').paid,40);
  assert.equal(F.chargeState(s,c,'2026-11-30').label,'Recebida');
  Object.assign(s.receipts[1],{voided:true,voidedAt:'2026-12-01T12:00:00Z'});
  assert.equal(F.chargeState(s,c,'2026-11-30').label,'Recebida');assert.equal(F.chargeState(s,c).label,'Parcialmente recebida');
  Object.assign(c,{voided:true,voidedAt:'2026-12-02T12:00:00Z'});assert.equal(F.chargeState(s,c).label,'Anulada');
});
