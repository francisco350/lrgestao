const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('./lib/planning.cjs');
const admin={id:'a',role:'admin',name:'Lino',projects:[]},manager={id:'m',role:'manager',name:'António',projects:['p1'],employeeId:'e1'},worker={id:'w',role:'worker',employeeId:'e2',projects:[]};
function fixture(){return {employees:[{id:'e1',name:'António',active:true},{id:'e2',name:'João',active:true},{id:'e3',name:'Rui',active:true}],projects:[{id:'p1',name:'Apartamento',status:'Em curso',employees:['e1','e2']},{id:'p2',name:'Obra reservada',status:'Em curso',employees:['e2','e3']}],entries:[],wagePayments:[]};}
const data=()=>({project:'p1',employees:['e1','e2'],dates:['2026-10-21','2026-10-22'],start:'08:00',end:'17:00',pause:60,note:'Preparar paredes'});
test('planeamento: conjunto de pessoas/dias, pausas e separação do trabalho efetivo',()=>{
 const s=fixture();P.apply(s,manager,'planCreate',data());assert.equal(s.planning.length,4);assert(s.planning.every(p=>p.minutes===480&&p.status==='planned'));
 assert.deepEqual(s.entries,[]);assert.deepEqual(s.wagePayments,[]);assert(s.planning.every(p=>p.createdBy==='m'&&p.history.length===1));
 assert.equal(P.list(s,worker).length,2);assert(P.list(s,worker).every(p=>p.employee==='e2'&&!p.history));assert.equal(P.list(s,admin).length,4);
});
test('planeamento: autorização, associação, inatividade e obras concluídas',()=>{
 const s=fixture();
 assert.throws(()=>P.apply(s,worker,'planCreate',data()),/responsáveis/);
 assert.throws(()=>P.apply(s,manager,'planCreate',{...data(),project:'p2',employees:['e2']}),/acesso/);
 assert.throws(()=>P.apply(s,admin,'planCreate',{...data(),employees:['e3']}),/ativos/);
 s.employees[1].active=false;assert.throws(()=>P.apply(s,admin,'planCreate',data()),/ativos/);s.employees[1].active=true;
 s.projects[0].status='Concluída';assert.throws(()=>P.apply(s,admin,'planCreate',data()),/concluída/);assert(!s.planning);
});
test('planeamento: conflitos entre obras reservadas e gravação atómica',()=>{
 const s=fixture();P.apply(s,admin,'planCreate',{...data(),project:'p2',employees:['e2'],dates:['2026-10-22']});
 const original=JSON.stringify(s.planning);
 assert.throws(()=>P.apply(s,manager,'planCreate',data()),e=>e.status===409&&!e.message.includes('reservada'));
 assert.equal(JSON.stringify(s.planning),original);
 P.apply(s,manager,'planCreate',{...data(),employees:['e2'],dates:['2026-10-22'],start:'17:00',end:'18:00',pause:0});
 assert.equal(s.planning.length,2);
 assert.throws(()=>P.apply(s,manager,'planCreate',{...data(),employees:['e2'],dates:['2026-10-22'],start:'12:00',end:'13:00',pause:0}),/planeado/);
});
test('planeamento: alterar, cancelar, libertar horário e conservar histórico',()=>{
 const s=fixture();P.apply(s,admin,'planCreate',data());const p=s.planning[0];
 P.apply(s,manager,'planUpdate',{...data(),id:p.id,employee:p.employee,date:p.date,end:'16:00'});
 assert.equal(p.minutes,420);assert.equal(p.history[1].before.end,'17:00');assert.equal(p.revision,2);
 assert.throws(()=>P.apply(s,manager,'planCancel',{id:p.id,reason:''}),/motivo/);
 P.apply(s,manager,'planCancel',{id:p.id,reason:'Alteração da sequência da obra'});assert.equal(p.status,'cancelled');assert.equal(p.history.length,3);
 P.apply(s,admin,'planCreate',{...data(),employees:[p.employee],dates:[p.date]});assert.equal(s.planning.length,5);
 assert.throws(()=>P.apply(s,admin,'planUpdate',{...data(),id:p.id,employee:p.employee,date:p.date}),/cancelado/);
 const active=s.planning.at(-1);P.apply(s,admin,'planUpdate',{...data(),id:active.id,project:'p2',employee:'e3',date:active.date});
 const restricted={...manager,projects:['p2']},view=P.list(s,restricted).find(r=>r.id===active.id);assert(!view.history);assert.equal(P.list(s,manager).some(r=>r.id===active.id),false);
});
test('planeamento: alterações de equipa ficam sinalizadas e revogam acesso',()=>{
 const s=fixture();P.apply(s,admin,'planCreate',data());
 s.projects[0].employees=['e1'];assert.equal(P.list(s,worker).length,0);assert.equal(P.list(s,admin).filter(p=>p.needsReview).length,2);
 s.employees[0].active=false;assert(P.list(s,admin).every(p=>p.needsReview));
 const id=s.planning[0].id;P.apply(s,admin,'planCancel',{id,reason:'Funcionário indisponível'});assert.equal(P.list(s,admin).find(p=>p.id===id).needsReview,false);
});
test('planeamento: datas, horários e lotes inválidos são recusados',()=>{
 for(const change of [{dates:[]},{dates:['2026-02-30']},{dates:['2026-10-21','2026-10-21']},{employees:['e1','e1']},{employees:[]},{start:'25:00'},{start:'17:00',end:'08:00'},{pause:540},{pause:-1},{pause:1.5},{note:'x'.repeat(201)}]){
  const s=fixture();assert.throws(()=>P.apply(s,admin,'planCreate',{...data(),...change}));assert(!s.planning);
 }
});

test('API de planeamento: permissões, revisões, persistência, cancelamento e auditoria',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createApplication}=require('./server.cjs'),{seed}=require('./seed.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lino-planning-')),database=path.join(dir,'test.sqlite'),port=51000+Math.floor(Math.random()*1000),origin=`http://127.0.0.1:${port}`,password='Planeamento-Teste-2026!';
 let app=createApplication({database,origin});
 async function call(c,url,method='GET',data){const r=await fetch(origin+'/api/'+url,{method,headers:{Connection:'close',Cookie:c.cookie||'',...(method==='POST'?{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':c.csrf||''}:{})},...(data?{body:JSON.stringify(data)}:{})});if(r.headers.get('set-cookie'))c.cookie=r.headers.get('set-cookie').split(';')[0];const body=await r.json();if(body.csrf)c.csrf=body.csrf;return {status:r.status,body};}
 const state=async c=>(await call(c,'state')).body;
 const act=async(c,type,data,revision)=>call(c,'action','POST',{type,data,revision:revision??(await state(c)).revision});
 try{
  await seed(app.db,{lino:password,antonio:password,joao:password,rui:password});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
  const a={},m={},w={},other={};for(const [c,username] of [[a,'lino'],[m,'antonio'],[w,'joao'],[other,'rui']])assert.equal((await call(c,'login','POST',{username,password})).status,200);
  const plan={...data(),project:'o1',employees:['e1','e2']},before=await state(a);
  assert.equal((await act(w,'planCreate',plan)).status,403);
  assert.equal((await act(m,'planCreate',plan)).status,200);
  assert.equal((await state(w)).planning.length,2);assert.equal((await state(other)).planning.length,0);
  assert.equal((await act(a,'planCreate',plan,before.revision)).status,409);
  const p=(await state(w)).planning[0];
  assert.equal((await act(other,'planUpdate',{...plan,id:p.id,employee:p.employee,date:p.date})).status,403);
  assert.equal((await act(m,'planUpdate',{...plan,id:p.id,employee:p.employee,date:p.date,end:'16:00'})).status,200);
  const after=await state(a);assert.deepEqual(after.entries,before.entries);assert.deepEqual(after.wagePayments,before.wagePayments);assert.deepEqual(after.costSummary,before.costSummary);
  await app.close();app=createApplication({database,origin});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
  assert.equal((await state(w)).planning.find(r=>r.id===p.id).end,'16:00');
  assert.equal((await act(m,'planCancel',{id:p.id,reason:'Trabalho adiado'})).status,200);
  assert.equal((await state(w)).planning.find(r=>r.id===p.id).status,'cancelled');
  const events=(await call(a,'audit')).body.events;for(const type of ['planCreate','planUpdate','planCancel'])assert(events.some(e=>e.event===type));
 }finally{await app.close();assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'lino-planning-'));fs.rmSync(dir,{recursive:true,force:true});}
});
