const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('./lib/timeclock.cjs'),C=require('./lib/clock-corrections.cjs'),M=require('./lib/model.cjs'),Costs=require('./lib/costs.cjs');
const worker={id:'w',name:'João',role:'worker',employeeId:'e1',projects:[]},manager={id:'m',name:'António',role:'manager',employeeId:'e2',projects:['p1']},admin={id:'a',name:'Lino',role:'admin',employeeId:null,projects:[]};
const now=Date.parse('2026-10-20T20:00Z');
const run=(s,u,type,data)=>T.apply(s,u,type,data,now);
function fixture(status='approved'){
 const s={employees:[{id:'e1',name:'João',active:true,rate:80,payBasis:'day',dayHours:8}],projects:[{id:'p1',name:'Obra',employees:['e1'],status:'Em curso'}],entries:[],wagePayments:[],corrections:[]};
 T.apply(s,worker,'clockIn',{project:'p1'},Date.parse('2026-10-19T07:00Z'));
 T.apply(s,worker,'clockOut',{id:s.clockShifts[0].id},Date.parse('2026-10-19T16:00Z'));
 if(status==='approved')run(s,admin,'clockApprove',{id:s.clockShifts[0].id});
 if(status==='rejected')run(s,admin,'clockReject',{id:s.clockShifts[0].id,reason:'Saída errada'});
 return s;
}
const proposal=()=>({reason:'Esqueci-me da pausa e saí às 17h.',note:'Trabalho corrigido',intervals:[{startLocal:'2026-10-19T08:00',endLocal:'2026-10-19T12:00'},{startLocal:'2026-10-19T13:00',endLocal:'2026-10-19T17:00'}]});
function request(s,u=worker,value=proposal()){const shift=s.clockShifts[0];run(s,u,'clockRequestCorrection',{id:shift.id,...value});return {id:shift.id,correctionId:shift.corrections.at(-1).id};}
test('correção: aprovação substitui valores uma vez, preserva picagens, remuneração e pagamentos',()=>{
 const s=fixture(),shift=s.clockShifts[0],original=structuredClone(shift.intervals),oldId=s.entries[0].id;
 s.wagePayments.push({employee:'e1',date:'2026-10-19',amount:90});s.employees[0].rate=160;
 const ids=request(s);assert.equal(M.total(M.approved(s.entries)),90);assert.equal(shift.status,'approved');
 run(s,manager,'clockApproveCorrection',ids);
 assert.equal(M.total(M.approved(s.entries)),80);assert.equal(Costs.summary(s)[0].labour,80);
 assert.equal(M.ledger(s,'e1','2026-10-01','2026-10-31').balance,-10);
 assert.deepEqual(shift.intervals,original);assert.equal(s.entries.find(r=>r.id===oldId).supersededBy,ids.correctionId);
 const view=T.list(s,worker)[0];assert.equal(view.workedMs,8*3600000);assert.deepEqual(view.original.intervals,original);
 assert.equal(view.corrections[0].status,'approved');assert(!JSON.stringify(T.list(s,manager)).includes('unitRate'));
 assert.throws(()=>run(s,manager,'clockApproveCorrection',ids),/decidido/);assert.equal(M.approved(s.entries).length,1);
 const second=proposal();second.intervals[1].endLocal='2026-10-19T16:00';const ids2=request(s,worker,second);
 assert.equal(shift.corrections[1].original.intervals.length,2);
 run(s,admin,'clockApproveCorrection',ids2);assert.equal(M.total(M.approved(s.entries)),70);assert.equal(s.entries.length,3);
});
test('correção: permissões, separação de decisão, duplicados, recusa e cancelamento',()=>{
 const s=fixture(),shift=s.clockShifts[0];
 assert.throws(()=>request(s,{...worker,id:'other',employeeId:'other'}),/acesso/);
 assert.throws(()=>request(s,{...manager,projects:[]}),/acesso/);
 const ids=request(s);assert.throws(()=>request(s),/pendente/);
 assert.throws(()=>run(s,worker,'clockApproveCorrection',ids),/responsável/);
 assert.throws(()=>run(s,{...manager,employeeId:'e1'},'clockApproveCorrection',ids),/outro responsável/);
 assert.throws(()=>run(s,manager,'clockCancelCorrection',ids),/autor/);
 assert.throws(()=>run(s,manager,'clockRejectCorrection',ids),/motivo/);
 run(s,manager,'clockRejectCorrection',{...ids,reason:'Confirme a pausa com o encarregado.'});
 assert.equal(M.total(M.approved(s.entries)),90);assert.equal(shift.corrections[0].decisionReason,'Confirme a pausa com o encarregado.');
 const ids2=request(s,manager);assert.throws(()=>run(s,manager,'clockApproveCorrection',ids2),/outro responsável/);
 run(s,manager,'clockCancelCorrection',ids2);assert.equal(shift.corrections[1].status,'cancelled');assert.equal(shift.status,'approved');
});
test('correção: validação do horário, datas futuras e mudanças de hora em Lisboa',()=>{
 assert.equal(C.resolveLocal('2026-10-19T08:00'),'2026-10-19T07:00:00.000Z');
 assert.equal(C.resolveLocal('2026-12-19T08:00'),'2026-12-19T08:00:00.000Z');
 assert.throws(()=>C.resolveLocal('2026-02-30T08:00'),/válidas/);
 assert.throws(()=>C.resolveLocal('2026-03-29T01:30'),/não existe/);
 assert.throws(()=>C.resolveLocal('2026-10-25T01:30'),/duas vezes/);
 assert.equal(C.resolveLocal('2026-10-25T01:30','60'),'2026-10-25T00:30:00.000Z');
 assert.equal(C.resolveLocal('2026-10-25T01:30','0'),'2026-10-25T01:30:00.000Z');
 assert.throws(()=>C.proposed({...proposal(),reason:' '},now),/motivo/);
 assert.throws(()=>C.proposed({...proposal(),intervals:[]},now),/períodos/);
 assert.throws(()=>C.proposed({...proposal(),intervals:[{startLocal:'2026-10-21T08:00',endLocal:'2026-10-21T17:00'}]},now),/futuro/);
 assert.throws(()=>C.proposed({...proposal(),intervals:[{startLocal:'2026-10-19T12:00',endLocal:'2026-10-19T08:00'}]},now),/posterior/);
 const overlap=proposal();overlap.intervals[1].startLocal='2026-10-19T11:30';assert.throws(()=>C.proposed(overlap,now),/sobreposição/);
});
test('correção: conflitos e colisões não alteram o original nem aplicam dias parcialmente',()=>{
 const s=fixture(),shift=s.clockShifts[0],ids=request(s);
 shift.revision++;assert.throws(()=>run(s,manager,'clockApproveCorrection',ids),/mudou/);assert.equal(M.total(M.approved(s.entries)),90);shift.revision--;
 s.entries.push({id:'collision',employee:'e1',project:'p1',date:'2026-10-19',mode:'hours',start:'16:00',end:'18:00',minutes:120,status:'pending'});
 assert.throws(()=>run(s,manager,'clockApproveCorrection',ids),/sobrepõe/);assert.equal(shift.corrections[0].status,'pending');assert.equal(M.total(M.approved(s.entries)),90);
 const two=fixture('pending'),midnight={reason:'Turno da noite',intervals:[{startLocal:'2026-10-18T23:00',endLocal:'2026-10-19T02:00'}]};
 const ids2=request(two,worker,midnight);
 two.entries.push({id:'second-day',employee:'e1',date:'2026-10-19',mode:'days',minutes:480,status:'approved'});
 assert.throws(()=>run(two,manager,'clockApproveCorrection',ids2),/sobrepõe/);assert.equal(two.entries.length,1);assert.equal(two.clockShifts[0].status,'pending');
});
test('correção: turnos rejeitados e pendentes, bloqueio de decisões concorrentes e meia-noite',()=>{
 for(const status of ['pending','rejected']){
  const s=fixture(status),ids=request(s,worker,{reason:'Trabalho noturno',intervals:[{startLocal:'2026-10-18T23:00',endLocal:'2026-10-19T02:00'}]});
  if(status==='pending')for(const type of ['clockApprove','clockReject'])assert.throws(()=>run(s,admin,type,{id:ids.id,reason:'Teste'}),/correção pendente/);
  run(s,manager,'clockApproveCorrection',ids);assert.deepEqual(M.approved(s.entries).map(r=>[r.date,r.minutes]),[['2026-10-18',60],['2026-10-19',120]]);
 }
});
