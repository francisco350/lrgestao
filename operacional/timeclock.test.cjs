const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('./lib/timeclock.cjs'),M=require('./lib/model.cjs'),D=require('./lib/domain.cjs');
const worker={id:'u1',role:'worker',employeeId:'e1',projects:[]},manager={id:'u2',role:'manager',employeeId:'e2',projects:['o1']},admin={id:'u3',role:'admin',employeeId:null,projects:[]};
const other={id:'u4',role:'worker',employeeId:'e2',projects:[]};
function fixture(){return {employees:[{id:'e1',name:'João',active:true,rate:80,payBasis:'day',dayHours:8,category:'Oficial'},{id:'e2',name:'Rui',active:true,rate:10,payBasis:'hour',dayHours:8}],projects:[{id:'o1',name:'Obra um',employees:['e1'],status:'Em curso'},{id:'o2',name:'Obra dois',employees:['e2'],status:'Em curso'}],entries:[],corrections:[],wagePayments:[],clients:[],charges:[],receipts:[]};}
const act=(s,u,type,data,time)=>T.apply(s,u,type,data,Date.parse(time));
function completed(s,start,end){act(s,worker,'clockIn',{project:'o1'},start);const shift=s.clockShifts.at(-1);act(s,worker,'clockOut',{id:shift.id},end);return shift;}
test('ponto: identidade da sessão, obras atribuídas e um turno por funcionário',()=>{
 const s=fixture();assert.throws(()=>act(s,admin,'clockIn',{project:'o1'},'2026-10-19T08:00Z'),/funcionário ativo/);
 assert.throws(()=>act(s,worker,'clockIn',{project:'o2'},'2026-10-19T08:00Z'),/atribuída/);
 act(s,worker,'clockIn',{project:'o1',employee:'e2',startedAt:'2000-01-01',minutes:999},'2026-10-19T08:00Z');
 const shift=s.clockShifts[0];assert.equal(shift.employee,'e1');assert.equal(shift.startedAt,'2026-10-19T08:00:00.000Z');
 assert.throws(()=>act(s,worker,'clockIn',{project:'o1'},'2026-10-19T08:01Z'),/turno aberto/);
 assert.throws(()=>act(s,other,'clockPause',{id:shift.id},'2026-10-19T08:01Z'),/próprio ponto/);
 assert.throws(()=>act(s,worker,'clockResume',{id:shift.id},'2026-10-19T08:01Z'),/decorrer/);
 assert.throws(()=>act(s,worker,'clockPause',{id:shift.id},'2026-10-19T07:59Z'),/recuou/);
});
test('ponto: pausas, remuneração histórica, aprovação única e integração no apuramento',()=>{
 const s=fixture();act(s,worker,'clockIn',{project:'o1'},'2026-10-19T07:00Z');const shift=s.clockShifts[0],id=shift.id;
 act(s,worker,'clockPause',{id},'2026-10-19T11:00Z');assert.equal(T.duration(shift,Date.parse('2026-10-19T12:00Z')),4*3600000);
 assert.throws(()=>act(s,worker,'clockPause',{id},'2026-10-19T11:01Z'),/em pausa/);
 act(s,worker,'clockResume',{id},'2026-10-19T12:00Z');s.employees[0].rate=160;
 act(s,worker,'clockOut',{id,note:'Paredes preparadas'},'2026-10-19T16:00:35Z');assert.equal(s.entries.length,0);
 assert.throws(()=>act(s,worker,'clockApprove',{id},'2026-10-19T17:00Z'),/permissão/);
 act(s,manager,'clockApprove',{id},'2026-10-19T17:00Z');assert.equal(s.entries.length,1);assert.equal(s.entries[0].minutes,480);assert.equal(s.entries[0].unitRate,80);assert.equal(M.amount(s.entries[0]),80);
 assert.equal(M.ledger(s,'e1','2026-10-01','2026-10-31').earned,80);
 assert.throws(()=>act(s,admin,'clockApprove',{id},'2026-10-19T17:01Z'),/decidido/);assert.equal(s.entries.length,1);
 assert.throws(()=>D.action(s,admin,'work',{id:s.entries[0].id}),/picagem/);
 assert(!Object.hasOwn(T.list(s,manager)[0],'snapshot'));assert.equal(T.list(s,other).length,0);
});
test('ponto: meia-noite de Lisboa, hora de verão e inverno contam tempo real',()=>{
 let s=fixture(),shift=completed(s,'2026-10-19T22:30Z','2026-10-20T00:30Z');
 assert.deepEqual(T.dailyEntries(shift).map(r=>[r.date,r.minutes]),[['2026-10-19',30],['2026-10-20',90]]);
 s=fixture();shift=completed(s,'2026-10-25T00:30Z','2026-10-25T02:30Z');assert.equal(T.dailyEntries(shift)[0].minutes,120);
 s=fixture();shift=completed(s,'2026-03-29T00:30Z','2026-03-29T02:30Z');assert.equal(T.dailyEntries(shift)[0].minutes,120);
});
test('ponto: sobreposições impedidas nos dois sentidos, incluindo dias e horas repetidas',()=>{
 const s=fixture(),shift=completed(s,'2026-10-19T07:00Z','2026-10-19T11:00Z'),clock=T.dailyEntries(shift)[0];
 const manual={id:'manual',employee:'e1',project:'o1',date:'2026-10-19',mode:'hours',start:'09:00',end:'10:00',minutes:60,status:'pending'};
 assert.throws(()=>M.validateWork(clock,[manual]),/sobrepõe/);assert.throws(()=>M.validateWork(manual,[clock]),/sobrepõe/);
 assert.throws(()=>M.validateWork({...manual,mode:'days'},[clock]),/sobrepõe/);
 assert.throws(()=>M.validateWork(clock,[{...clock,id:'other'}]),/sobrepõe/);
 M.validateWork({...manual,start:'12:00',end:'13:00'},[clock]);
 s.entries.push(manual);assert.throws(()=>act(s,admin,'clockApprove',{id:shift.id},'2026-10-19T12:00Z'),/sobrepõe/);assert.equal(s.clockShifts[0].status,'pending');assert.equal(s.entries.length,1);
 const fall=fixture(),dst=T.dailyEntries(completed(fall,'2026-10-25T00:50Z','2026-10-25T01:10Z'))[0];
 assert.throws(()=>M.validateWork({...manual,date:dst.date,start:'01:55',end:'02:00',minutes:5},[dst]),/sobrepõe/);
});
test('ponto: terminar após perda da obra, fecho pelo responsável, rejeição com motivo',()=>{
 const s=fixture();act(s,worker,'clockIn',{project:'o1'},'2026-10-19T08:00Z');const id=s.clockShifts[0].id;s.projects[0].employees=[];
 act(s,worker,'clockPause',{id},'2026-10-19T09:00Z');act(s,worker,'clockOut',{id},'2026-10-19T10:00Z');assert.equal(T.duration(s.clockShifts[0]),3600000);
 assert.throws(()=>act(s,manager,'clockReject',{id},'2026-10-19T10:01Z'),/motivo/);
 act(s,manager,'clockReject',{id,reason:'Horário incorreto'},'2026-10-19T10:01Z');assert.equal(s.entries.length,0);assert.equal(s.clockShifts[0].rejection,'Horário incorreto');
 s.projects[0].employees=['e1'];act(s,worker,'clockIn',{project:'o1'},'2026-10-19T11:00Z');const id2=s.clockShifts[1].id;
 assert.throws(()=>act(s,{...manager,projects:['o2']},'clockForceOut',{id:id2,reason:'Teste'},'2026-10-19T12:00Z'),/permissão/);
 act(s,admin,'clockForceOut',{id:id2,reason:'Esqueceu-se de sair'},'2026-10-19T12:00Z');assert.equal(s.clockShifts[1].status,'pending');assert.equal(s.clockShifts[1].closeReason,'Esqueceu-se de sair');
});
test('ponto: turno vazio ou esquecido não gera remuneração automaticamente',()=>{
 let s=fixture(),shift=completed(s,'2026-10-19T08:00Z','2026-10-19T08:00:40Z');assert.throws(()=>act(s,admin,'clockApprove',{id:shift.id},'2026-10-19T09:00Z'),/minuto completo/);
 s=fixture();shift=completed(s,'2026-10-19T08:00Z','2026-10-22T08:00Z');assert.throws(()=>act(s,admin,'clockApprove',{id:shift.id},'2026-10-22T09:00Z'),/48 horas/);
});

test('API de ponto: sessões isoladas, conflitos, CSRF, persistência e auditoria',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {createApplication}=require('./server.cjs'),{seed}=require('./seed.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lino-clock-')),database=path.join(dir,'test.sqlite'),port=49000+Math.floor(Math.random()*1000),origin=`http://127.0.0.1:${port}`;
 let app=createApplication({database,origin});const password='Ponto-Teste-2026!';
 async function call(c,url,method='GET',data,extra={}){const r=await fetch(origin+'/api/'+url,{method,headers:{Connection:'close',Cookie:c.cookie||'',...(method==='POST'?{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':c.csrf||''}:{}),...extra},...(data?{body:JSON.stringify(data)}:{})});if(r.headers.get('set-cookie'))c.cookie=r.headers.get('set-cookie').split(';')[0];const body=await r.json();if(body.csrf)c.csrf=body.csrf;return {status:r.status,body};}
 const get=async c=>(await call(c,'state')).body;
 const actApi=async(c,type,data,revision)=>(await call(c,'action','POST',{type,data,revision:revision??(await get(c)).revision}));
 try{
  await seed(app.db,{lino:password,antonio:password,joao:password,rui:password});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
  const a={},m={},w={},r={};for(const [c,username] of [[a,'lino'],[m,'antonio'],[w,'joao'],[r,'rui']])assert.equal((await call(c,'login','POST',{username,password})).status,200);
  const revision=(await get(w)).revision,before=Date.now();assert.equal((await actApi(w,'clockIn',{project:'o1',employee:'e5',startedAt:'2000-01-01'},revision)).status,200);
  const shift=(await get(w)).clockShifts[0];assert.equal(shift.employee,'e2');assert(Date.parse(shift.startedAt)>=before);assert.equal((await get(r)).clockShifts.length,0);assert.equal((await get(m)).clockShifts.length,1);assert(!JSON.stringify((await get(m)).clockShifts).includes('unitRate'));
  assert.equal((await actApi(w,'clockIn',{project:'o1'},revision)).status,409);assert.equal((await actApi(w,'clockIn',{project:'o1'})).status,409);
  assert.equal((await call(w,'action','POST',{type:'clockPause',data:{id:shift.id},revision:(await get(w)).revision},{'X-CSRF-Token':'bad'})).status,403);
  assert.equal((await actApi(r,'clockPause',{id:shift.id})).status,403);assert.equal((await actApi(w,'clockPause',{id:shift.id})).status,200);
  await app.close();app=createApplication({database,origin});await new Promise(resolve=>app.server.listen(port,'127.0.0.1',resolve));assert.equal((await get(w)).clockShifts[0].status,'paused');
  assert.equal((await actApi(w,'clockResume',{id:shift.id})).status,200);assert.equal((await actApi(w,'clockOut',{id:shift.id,note:'Teste de ponto'})).status,200);assert.equal((await actApi(w,'clockApprove',{id:shift.id})).status,403);
  assert.equal((await actApi(m,'clockReject',{id:shift.id,reason:'Teste curto'})).status,200);assert.equal((await get(w)).clockShifts[0].status,'rejected');
  const correction={id:shift.id,reason:'Esquecimento da saída.',intervals:[{startLocal:'2026-10-17T08:00',endLocal:'2026-10-17T12:00'}]};
  assert.equal((await actApi(r,'clockRequestCorrection',correction)).status,403);
  assert.equal((await actApi(w,'clockRequestCorrection',correction)).status,200);
  const request=(await get(w)).clockShifts[0].corrections[0],ids={id:shift.id,correctionId:request.id},beforeApproval=(await get(a)).costSummary.find(c=>c.project==='o1').labour;
  assert.equal((await actApi(w,'clockApproveCorrection',ids)).status,403);
  const stale=(await get(m)).revision;
  assert.equal((await actApi(m,'clockApproveCorrection',ids)).status,200);
  assert.equal((await actApi(a,'clockApproveCorrection',ids,stale)).status,409);
  assert.equal((await get(a)).costSummary.find(c=>c.project==='o1').labour,beforeApproval+27.5);
  assert(!JSON.stringify((await get(m)).clockShifts).includes('unitRate'));
  await app.close();app=createApplication({database,origin});await new Promise(resolve=>app.server.listen(port,'127.0.0.1',resolve));
  const corrected=(await get(w)).clockShifts[0];assert.equal(corrected.corrections[0].status,'approved');assert.equal(corrected.workedMs,4*3600000);assert.equal(corrected.original.startedAt,shift.startedAt);
  const events=(await call(a,'audit')).body.events;for(const event of ['clockIn','clockPause','clockResume','clockOut','clockReject'])assert(events.some(e=>e.event===event));
  for(const event of ['clockRequestCorrection','clockApproveCorrection'])assert(events.some(e=>e.event===event));
 }finally{await app.close();assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'lino-clock-'));fs.rmSync(dir,{recursive:true,force:true});}
});
