const {test}=require('node:test'),assert=require('node:assert/strict');
const A=require('./lib/absences.cjs'),P=require('./lib/planning.cjs');
const admin={id:'a',role:'admin',name:'Lino',projects:[]},manager={id:'m',role:'manager',projects:['p1'],employeeId:'e1'},worker={id:'w',role:'worker',employeeId:'e2',projects:[]};
const fixture=()=>({employees:[{id:'e1',name:'António',active:true},{id:'e2',name:'João',active:true},{id:'e3',name:'Rui',active:true}],projects:[{id:'p1',name:'Apartamento',status:'Em curso',employees:['e1','e2']},{id:'p2',name:'Outra obra',status:'Em curso',employees:['e2','e3']}],entries:[],wagePayments:[]});
const absence=()=>({employee:'e2',kind:'holiday',mode:'full',from:'2026-10-21',until:'2026-10-23',note:'Observação pessoal'});
const plan=()=>({project:'p1',employees:['e2'],dates:['2026-10-22'],start:'08:00',end:'17:00',pause:60,note:'Trabalho'});
test('ausências: dias completos, limites inclusivos e compatibilidade com dados anteriores',()=>{
 const s=fixture();assert.deepEqual(A.list(s,admin),[]);assert.equal(A.blocked(s,'e2','2026-10-22','08:00','17:00'),false);
 A.apply(s,admin,'absenceCreate',absence());const a=s.absences[0];assert.equal(a.start,'00:00');assert.equal(a.end,'24:00');assert.equal(a.status,'active');
 for(const date of ['2026-10-21','2026-10-22','2026-10-23'])assert(A.blocked(s,'e2',date,'00:00','23:59'));
 for(const date of ['2026-10-20','2026-10-24'])assert.equal(A.blocked(s,'e2',date,'08:00','17:00'),false);
 assert.equal(A.blocked(s,'e1','2026-10-22','08:00','17:00'),false);assert.deepEqual(s.entries,[]);assert.deepEqual(s.wagePayments,[]);
});
test('ausências: intervalos parciais, horários adjacentes e sobreposição entre ausências',()=>{
 const s=fixture(),value={...absence(),mode:'partial',from:'2026-10-22',until:'2026-10-22',start:'10:00',end:'12:00'};
 A.apply(s,admin,'absenceCreate',value);
 assert(A.blocked(s,'e2',value.from,'11:59','12:01'));assert(!A.blocked(s,'e2',value.from,'08:00','10:00'));assert(!A.blocked(s,'e2',value.from,'12:00','17:00'));
 A.apply(s,admin,'absenceCreate',{...value,start:'12:00',end:'13:00'});
 for(const data of [value,absence(),{...value,start:'09:00',end:'10:01'}])assert.throws(()=>A.apply(s,admin,'absenceCreate',data),e=>e.status===409);
 assert.equal(s.absences.length,2);
 P.apply(s,manager,'planCreate',{...plan(),start:'13:00',end:'17:00',pause:0});
});
test('ausências: planeamento bloqueado em lote, em todas as obras e nas alterações',()=>{
 const s=fixture();A.apply(s,admin,'absenceCreate',absence());
 const before=JSON.stringify(s);
 assert.throws(()=>P.apply(s,manager,'planCreate',{...plan(),employees:['e1','e2'],dates:['2026-10-20','2026-10-21']}),e=>e.status===409&&!e.message.includes('pessoal'));
 assert.equal(JSON.stringify(s),before);
 assert.throws(()=>P.apply(s,admin,'planCreate',{...plan(),project:'p2'}),/indisponível/);
 P.apply(s,manager,'planCreate',{...plan(),dates:['2026-10-20']});const p=s.planning[0],original=JSON.stringify(p);
 assert.throws(()=>P.apply(s,manager,'planUpdate',{...plan(),employee:'e2',id:p.id,date:'2026-10-21'}),/indisponível/);assert.equal(JSON.stringify(p),original);
});
test('ausências: trabalho previamente planeado impede criação e alteração sem efeitos parciais',()=>{
 const s=fixture();P.apply(s,admin,'planCreate',{...plan(),project:'p2'});const before=JSON.stringify(s);
 assert.throws(()=>A.apply(s,admin,'absenceCreate',absence()),/Reagende/);assert.equal(JSON.stringify(s),before);
 A.apply(s,admin,'absenceCreate',{...absence(),from:'2026-10-25',until:'2026-10-25'});const a=s.absences[0],original=JSON.stringify(a);
 assert.throws(()=>A.apply(s,admin,'absenceUpdate',{...absence(),id:a.id}),/Reagende/);assert.equal(JSON.stringify(a),original);
 // The complete reserved interval, including the planning pause, remains unavailable.
 assert.throws(()=>A.apply(s,admin,'absenceCreate',{...absence(),mode:'partial',from:'2026-10-22',until:'2026-10-22',start:'12:00',end:'13:00'}),/Reagende/);
 P.apply(s,admin,'planCancel',{id:s.planning[0].id,reason:'Reagendar'});A.apply(s,admin,'absenceCreate',absence());
});
test('ausências: apenas administrador gere, consultas por perfil e privacidade após mudanças de equipa',()=>{
 const s=fixture();
 for(const u of [manager,worker])for(const type of ['absenceCreate','absenceUpdate','absenceCancel'])assert.throws(()=>A.apply(s,u,type,absence()),e=>e.status===403);
 A.apply(s,admin,'absenceCreate',absence());A.apply(s,admin,'absenceCreate',{...absence(),employee:'e3'});
 const m=A.list(s,manager);assert.equal(m.length,1);for(const field of ['kind','note','history','createdBy','updatedBy','cancelReason'])assert(!Object.hasOwn(m[0],field));
 const w=A.list(s,worker);assert.equal(w.length,1);assert.equal(w[0].note,'Observação pessoal');assert(!w[0].history);
 assert.equal(A.list(s,{...worker,employeeId:'missing'}).length,0);assert.equal(A.list(s,{...manager,projects:[]}).length,0);
 s.projects[0].employees=['e1'];assert.equal(A.list(s,manager).length,0);assert.equal(A.list(s,worker).length,1);
 // Personal absence access belongs to the worker even after leaving all projects.
 assert.equal(A.list(s,admin).length,2);
});
test('ausências: edição e cancelamento mantêm histórico e libertam os horários',()=>{
 const s=fixture();A.apply(s,admin,'absenceCreate',absence());const a=s.absences[0];
 assert.throws(()=>A.apply(s,admin,'absenceUpdate',{...absence(),id:a.id,employee:'e1'}),/trocar/);
 A.apply(s,admin,'absenceUpdate',{...absence(),id:a.id,until:'2026-10-22',kind:'unavailable',note:'Atualizada'});
 assert.equal(a.revision,2);assert.equal(a.history[1].before.until,'2026-10-23');assert.equal(a.history[1].before.note,'Observação pessoal');
 P.apply(s,manager,'planCreate',{...plan(),dates:['2026-10-23']});
 assert.throws(()=>A.apply(s,admin,'absenceCancel',{id:a.id,reason:' '}),/motivo/);
 s.employees[1].active=false;A.apply(s,admin,'absenceCancel',{id:a.id,reason:'Registo substituído'});assert.equal(a.revision,3);assert.equal(a.history.length,3);
 assert.equal(A.list(s,worker)[0].cancelReason,'Registo substituído');assert(!Object.hasOwn(A.list(s,manager)[0],'cancelReason'));
 assert(!A.blocked(s,'e2','2026-10-22','08:00','17:00'));s.employees[1].active=true;P.apply(s,manager,'planCreate',plan());
 assert.throws(()=>A.apply(s,admin,'absenceUpdate',{...absence(),id:a.id}),/cancelada/);assert.throws(()=>A.apply(s,admin,'absenceCancel',{id:a.id,reason:'Outra'}),/cancelada/);
});
test('ausências: validação de datas, tamanho do período, horas e campos',()=>{
 for(const data of [{employee:'no'},{kind:'sick'},{mode:'other'},{from:'2026-02-30'},{from:null},{until:'2026-10-20'},{from:'1899-12-31'},{until:'9999-01-01'},{from:'2026-01-01',until:'2027-01-02'},{note:123},{note:'x'.repeat(201)},{mode:'partial',start:'08:00',end:'09:00'},{mode:'partial',until:'2026-10-21',start:'24:00',end:'25:00'},{mode:'partial',until:'2026-10-21',start:'12:00',end:'12:00'},{mode:'partial',until:'2026-10-21',start:'12:00',end:'08:00'}]){
  const s=fixture();assert.throws(()=>A.apply(s,admin,'absenceCreate',{...absence(),...data}));assert(!s.absences);
 }
 const s=fixture();s.employees[1].active=false;assert.throws(()=>A.apply(s,admin,'absenceCreate',absence()),/ativo/);
 s.employees[1].active=true;A.apply(s,admin,'absenceCreate',{...absence(),from:'2028-02-29',until:'2028-02-29'});assert.equal(s.absences.length,1);
 const leap=fixture();A.apply(leap,admin,'absenceCreate',{...absence(),from:'2028-01-01',until:'2028-12-31'});assert.equal(leap.absences.length,1);
});
test('API de ausências: autenticação, concorrência com planeamento, persistência, auditoria e finanças preservadas',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createApplication}=require('./server.cjs'),{seed}=require('./seed.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lino-absences-')),database=path.join(dir,'test.sqlite'),port=52000+Math.floor(Math.random()*1000),origin=`http://127.0.0.1:${port}`,password='Ausencias-Teste-2026!';let app=createApplication({database,origin});
 async function call(c,url,method='GET',data){const r=await fetch(origin+'/api/'+url,{method,headers:{Connection:'close',Cookie:c.cookie||'',...(method==='POST'?{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':c.csrf||''}:{})},...(data?{body:JSON.stringify(data)}:{})});if(r.headers.get('set-cookie'))c.cookie=r.headers.get('set-cookie').split(';')[0];const body=await r.json();if(body.csrf)c.csrf=body.csrf;return {status:r.status,body};}
 const state=async c=>(await call(c,'state')).body;
 const act=async(c,type,data,revision)=>call(c,'action','POST',{type,data,revision:revision??(await state(c)).revision});
 try{
  await seed(app.db,{lino:password,antonio:password,joao:password,rui:password});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
  assert.equal((await call({},'state')).status,401);
  const a={},m={},w={},other={};for(const [c,username] of [[a,'lino'],[m,'antonio'],[w,'joao'],[other,'rui']])assert.equal((await call(c,'login','POST',{username,password})).status,200);
  const before=await state(a);assert.deepEqual(before.absences,[]);
  for(const c of [m,w])assert.equal((await act(c,'absenceCreate',absence())).status,403);
  assert.equal((await act(a,'absenceCreate',absence())).status,200);
  const id=(await state(w)).absences[0].id;assert.equal((await state(other)).absences.length,0);
  assert(!JSON.stringify((await state(m)).absences).includes('Observação pessoal'));
  assert.equal((await act(m,'planCreate',{...plan(),project:'o1'},before.revision)).status,409);
  assert.equal((await act(m,'planCreate',{...plan(),project:'o1'})).status,409);
  assert.equal((await act(w,'absenceCancel',{id,reason:'Sem acesso'})).status,403);
  assert.equal((await act(a,'absenceUpdate',{...absence(),id,until:'2026-10-22'})).status,200);
  await app.close();app=createApplication({database,origin});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
  assert.equal((await state(w)).absences[0].until,'2026-10-22');
  assert.equal((await act(a,'absenceCancel',{id,reason:'Cancelada para teste'})).status,200);
  assert.equal((await act(m,'planCreate',{...plan(),project:'o1'})).status,200);
  const preConflict=await state(a);assert.equal((await act(a,'absenceCreate',absence())).status,409);assert.equal((await state(a)).revision,preConflict.revision);
  const after=await state(a);for(const field of ['entries','wagePayments','clockShifts','costSummary'])assert.deepEqual(after[field],before[field]);
  assert.equal(after.absences[0].history.length,3);for(const type of ['absenceCreate','absenceUpdate','absenceCancel'])assert((await call(a,'audit')).body.events.some(e=>e.event===type));
 }finally{await app.close();assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'lino-absences-'));fs.rmSync(dir,{recursive:true,force:true});}
});
