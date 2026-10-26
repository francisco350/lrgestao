const {test}=require('node:test'),assert=require('node:assert/strict');
const {populate,KEY,AS_OF}=require('./demo-quarter.cjs'),{openStore,readState}=require('./lib/store.cjs'),{seed}=require('./seed.cjs');
const D=require('./lib/domain.cjs'),M=require('./lib/model.cjs'),H=require('./public/hours-model.js'),A=require('./lib/absences.cjs');
test('demonstração trimestral: preservação, repetição segura, meses, totais, relações e acessos',async()=>{
 const db=openStore(':memory:');
 try{
  await seed(db,{lino:'Demo-Test-2026!',antonio:'Demo-Test-2026!',joao:'Demo-Test-2026!',rui:'Demo-Test-2026!'});
  const state=readState(db),before=structuredClone(state),admin={id:'demo-admin',role:'admin',name:'Lino',projects:[]};
  const result=populate(state,admin);assert(result.addedCounts.entries>200);assert.equal(state.projects.length,8);
  for(const key of Object.keys(before).filter(k=>Array.isArray(before[k])))for(const row of before[key])assert.deepEqual(state[key].find(r=>r.id===row.id),row,`preservar ${key}/${row.id}`);
  const snapshot=structuredClone(state);assert(populate(state,admin).alreadyApplied);assert.deepEqual(state,snapshot);
  for(const month of ['2026-08','2026-09','2026-10']){
   const report=H.build(state,{mode:'month',date:month+'-15',employee:'',project:''});assert(report.totals.approved>0);
   assert.equal(report.totals.approved,state.entries.filter(r=>r.date.startsWith(month)&&r.status==='approved').reduce((n,r)=>n+r.minutes,0),'O mapa conta cada hora validada uma única vez.');
   assert(state.wagePayments.some(p=>p.date.startsWith(month)));assert(state.costs.some(c=>c.date.startsWith(month)));assert(state.receipts.some(r=>r.date.startsWith(month)));
   const earned=M.total(state.entries.filter(r=>r.date.startsWith(month)&&r.status==='approved'));
   assert(earned>0);assert(state.wagePayments.filter(p=>p.date.startsWith(month)).reduce((n,p)=>n+p.amount,0)>0);
  }
  for(const r of state.entries.filter(r=>r.demoDataset===KEY)){
   assert(r.date<=AS_OF);const project=state.projects.find(p=>p.id===r.project);assert(project.employees.includes(r.employee));assert(r.date>=project.plannedStart&&r.date<=project.plannedEnd||['o1','o2','o3'].includes(r.project));
   if(r.status!=='rejected')M.validateWork(r,state.entries,r.id);
   assert(!A.blocked(state,r.employee,r.date,'08:00','17:00'));
  }
  for(const c of state.charges)assert(state.receipts.filter(r=>r.charge===c.id&&!r.voided).reduce((n,r)=>n+r.amount,0)<=c.amount+.001);
  const approvedClock=state.clockShifts.filter(s=>s.demoDataset===KEY&&s.status==='approved');assert(approvedClock.length>30);for(const s of approvedClock)assert.equal(s.entryIds.reduce((n,id)=>n+state.entries.find(r=>r.id===id).minutes,0),420);
  assert(state.entries.some(r=>r.demoDataset===KEY&&r.status==='pending'));assert(state.entries.some(r=>r.demoDataset===KEY&&r.status==='rejected'));assert(state.corrections.some(c=>c.status==='pending'));
  for(const p of state.planning){assert(!A.blocked(state,p.employee,p.date,p.start,p.end));assert(state.projects.find(o=>o.id===p.project).employees.includes(p.employee));}
  const worker=D.sanitize(state,{id:'joao',role:'worker',employeeId:'e2',projects:[]});assert(worker.entries.length>30);assert(worker.entries.every(r=>r.employee==='e2'));assert(!worker.costs);assert(!worker.receipts);
  for(const e of state.employees)assert.equal(M.ledger(state,e.id,'2026-08-01','2026-08-31').balance,0);
 }finally{db.close();}
});
