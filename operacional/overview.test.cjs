const test=require('node:test'),assert=require('node:assert/strict');
const O=require('./public/overview-model.js'),D=require('./lib/domain.cjs');
function fixture(){return {employees:[{id:'e1',name:'João',category:'Oficial',active:true,rate:100,payBasis:'day',dayHours:8},{id:'e2',name:'Rui',active:true}],projects:[{id:'o1',name:'Obra',client:'Cliente',clientId:'c1',city:'Maia',status:'Em curso',employees:['e1','e2']}],entries:[{id:'r1',employee:'e1',project:'o1',date:'2026-01-01',status:'approved',minutes:480,unitRate:100,payBasis:'day',dayHours:8},{id:'r2',employee:'e2',project:'o1',date:'2026-01-01',status:'approved',minutes:480,unitRate:50,payBasis:'day',dayHours:8},{id:'future',employee:'e1',project:'o1',date:'2099-01-01',status:'approved',minutes:480,unitRate:100,payBasis:'day',dayHours:8}],wagePayments:[{id:'p1',employee:'e1',amount:150,date:'2026-01-01',type:'advance'},{id:'p2',employee:'e2',amount:50,date:'2026-01-01',voided:true}],clients:[{id:'c1',name:'Cliente',active:true}],charges:[{id:'c1',clientId:'c1',project:'o1',amount:500,due:'2026-02-01'},{id:'c2',amount:100,voided:true}],receipts:[{id:'receipt1',clientId:'c1',project:'o1',charge:'c1',amount:100,date:'2026-01-01'},{id:'receipt2',charge:'c1',amount:50,date:'2026-01-01',voided:true}],costs:[],corrections:[]};}
test('resumo: créditos individuais não abatem a dívida a outros funcionários; anulações e datas futuras',()=>{
 const s=O.summary(fixture(),'admin','2026-01-02');assert.equal(s.wagesDue,50);assert.equal(s.earned,150);assert.equal(s.minutes,960);assert.equal(s.receivable,400);assert.equal(s.clients,1);assert.equal(s.balances[0].balance,-50);
});
test('resumo e movimentos respeitam os perfis e os dados filtrados pelo servidor',()=>{
 const raw=fixture();
 const manager=D.sanitize(raw,{id:'m',role:'manager',projects:['o1']});const s=O.summary(manager,'manager','2026-01-02');assert(!('earned' in s));assert(!('wagesDue' in s));assert(!('receivable' in s));assert(!('clients' in s));assert(!O.activity(manager,'manager').some(r=>r.value!==undefined));
 const worker=D.sanitize(raw,{id:'w',role:'worker',employeeId:'e1'});assert(O.activity(worker,'worker').every(r=>!['recebimentos','cobrancas','custos','clientes','equipa'].includes(r.kind)));assert(O.activity(worker,'worker').filter(r=>r.kind==='pagamentos').every(r=>r.title==='João'));assert(!('receivable' in O.summary(worker,'worker','2026-01-02')));
});
test('histórico: atualização mais recente, pagamentos retroativos e registos antigos sem hora inventada',()=>{
 const s=fixture();s.entries=s.entries.filter(r=>r.id!=='future');s.wagePayments[0].createdAt='2026-01-10T12:00:00Z';s.receipts[0].voided=true;s.receipts[0].voidedAt='2026-01-11T12:00:00Z';
 const rows=O.activity(s,'admin');assert.equal(rows[0].id,'recebimentos:receipt1');assert.equal(rows[0].status,'Anulado');assert.equal(rows[1].id,'pagamentos:p1');assert.equal(rows.find(r=>r.id==='trabalho:r1').dated,true);assert(!rows.some(r=>r.kind==='cobrancas'));
});
test('histórico: não duplica o ponto validado, mas mantém entradas históricas sem turno acessível',()=>{
 const s=fixture();s.entries[0].clockShiftId='shift1';s.clockShifts=[{id:'shift1',employee:'e1',project:'o1',status:'approved',workedMs:28800000,events:[{at:'2026-01-02T12:00:00Z'}]}];
 assert(!O.activity(s,'admin').some(r=>r.id==='trabalho:r1'));assert(O.activity(s,'admin').some(r=>r.id==='trabalho:shift1'));s.clockShifts=[];assert(O.activity(s,'admin').some(r=>r.id==='trabalho:r1'));
});
test('novos movimentos e validações recebem datas do servidor para ordenação',()=>{
 const s=fixture(),admin={id:'admin',role:'admin'};D.action(s,admin,'payment',{employee:'e2',amount:25,date:'2026-01-02',type:'payment',method:'Numerário'});const payment=s.wagePayments.at(-1);assert(Number.isFinite(Date.parse(payment.createdAt)));
 D.action(s,admin,'voidPayment',{id:payment.id,reason:'Teste'});assert(Number.isFinite(Date.parse(payment.voidedAt)));
 D.action(s,admin,'work',{employee:'e1',project:'o1',date:'2026-01-03',mode:'hours',start:'08:00',end:'09:00',pause:0,note:'Teste'});const entry=s.entries.at(-1);assert(Number.isFinite(Date.parse(entry.createdAt)));D.action(s,admin,'approve',{id:entry.id});assert(Number.isFinite(Date.parse(entry.updatedAt)));
});
