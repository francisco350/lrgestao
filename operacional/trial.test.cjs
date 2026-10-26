const {test}=require('node:test'),assert=require('node:assert/strict');
const {openStore,readState}=require('./lib/store.cjs'),T=require('./lib/trial.cjs');
test('controlo reservado: duração, limites, suspensão, prolongamento, renovação e auditoria',()=>{
 const db=openStore(':memory:'),now=Date.parse('2026-10-23T12:00Z'),day=86400000;
 try{
  assert(T.status(db).allowed);assert(!T.status(db,{required:true}).allowed);
  for(const n of [0,-1,1.5,3651,NaN])assert.throws(()=>T.change(db,'start',n,now));
  T.change(db,'start',14,now);assert.equal(T.status(db,{now}).remainingDays,14);
  assert(T.status(db,{now:now+14*day-1}).allowed);assert.equal(T.status(db,{now:now+14*day}).state,'expired');
  assert.throws(()=>T.change(db,'start',14,now));
  T.change(db,'days',7,now+8*day);assert.equal(T.status(db,{now:now+8*day}).state,'expired');
  assert.throws(()=>T.change(db,'resume',undefined,now+8*day));
  T.change(db,'extend',3,now+8*day);assert.equal(T.status(db,{now:now+8*day}).remainingDays,3);
  T.change(db,'suspend',undefined,now+8*day);assert.equal(T.status(db,{now:now+8*day}).state,'suspended');
  T.change(db,'extend',2,now+8*day);assert.equal(T.status(db,{now:now+8*day}).state,'suspended');
  T.change(db,'resume',undefined,now+8*day);assert(T.status(db,{now:now+8*day}).allowed);
  T.change(db,'renew',30,now+20*day);assert.equal(T.status(db,{now:now+20*day}).remainingDays,30);
  assert.equal(db.prepare('SELECT count(*) n FROM trial_events').get().n,7);
 }finally{db.close();}
});
test('API: cliente administra equipa mas não o prazo; bloqueio global inclui novas contas, exportação e anexos',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createApplication}=require('./server.cjs'),{seed}=require('./seed.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lino-trial-')),database=path.join(dir,'test.sqlite'),port=53000+Math.floor(Math.random()*1000),origin=`http://127.0.0.1:${port}`,password='Trial-Test-2026!';let app=createApplication({database,origin});
 async function call(c,url,method='GET',data){const r=await fetch(origin+'/api/'+url,{method,headers:{Connection:'close',Cookie:c.cookie||'',...(method==='POST'?{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':c.csrf||''}:{})},...(data?{body:JSON.stringify(data)}:{})});if(r.headers.get('set-cookie'))c.cookie=r.headers.get('set-cookie').split(';')[0];const body=await r.json();if(body.csrf)c.csrf=body.csrf;return {status:r.status,body};}
 const login=(c,username)=>call(c,'login','POST',{username,password});
 const act=async(c,type,data)=>call(c,'action','POST',{type,data,revision:(await call(c,'state')).body.revision});
 try{
  await seed(app.db,{lino:password,antonio:password,joao:password,rui:password});T.change(app.db,'start',14);await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
  const a={},w={},m={},n={};for(const [c,name]of [[a,'lino'],[w,'joao'],[m,'antonio']])assert.equal((await login(c,name)).status,200);
  assert.equal((await act(a,'employee',{name:'Funcionário do teste',category:'Ajudante',payBasis:'day',rate:55,dayHours:8,active:true})).status,200);
  const employee=(await call(a,'state')).body.employees.at(-1).id;
  assert.equal((await call(a,'users','POST',{username:'colaborador',name:'Funcionário do teste',role:'worker',employeeId:employee,projects:[],password})).status,201);
  assert.equal((await login(n,'colaborador')).status,200);
  assert.equal((await call(n,'change-password','POST',{currentPassword:password,newPassword:'Trial-Changed-2026!'})).status,200);
  assert.equal((await call(n,'state')).status,200);
  assert.equal((await call(a,'users','POST',{username:'outroadmin',name:'Outro administrador',role:'admin',projects:[],password})).status,201);
  const second={};assert.equal((await login(second,'outroadmin')).status,200);
  for(const url of ['trial','trial/start','trial-control','access'])assert([404,405].includes((await call(a,url,'POST',{days:9999,state:'active'})).status));
  assert.equal((await act(a,'trial',{days:9999})).status,400);
  const exported=(await call(a,'backup')).body;assert(!exported.data.trial_access);assert(!JSON.stringify(exported).includes('expires_at'));
  const before=readState(app.db),control=require('./lib/store.cjs').openStore(database);
  T.change(control,'suspend');control.close();assert.equal(app.db.prepare('SELECT count(*) n FROM sessions').get().n,0);
  for(const c of [a,w,m,n,second])for(const endpoint of ['session','state','users','backup','audit','project-files/known-id'])assert.equal((await call(c,endpoint)).status,423);
  assert.equal((await login({},'lino')).status,423);assert.equal((await call(a,'action','POST',{type:'employee',data:{},revision:before.revision})).status,423);
  assert.equal((await call(a,'users','POST',{username:'bypass',role:'admin',password})).status,423);
  assert.equal((await call(a,'project-files','POST',{})).status,423);assert.equal((await call({},'health')).status,200);
  assert.deepEqual(readState(app.db),before);
  await app.close();app=createApplication({database,origin});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));assert.equal((await login({},'lino')).status,423);
  T.change(app.db,'resume');assert.equal((await call(a,'state')).status,401);assert.equal((await login(a,'lino')).status,200);
  // Expiry also blocks a still-valid session without requiring a scheduled task.
  app.db.prepare('UPDATE trial_access SET expires_at=?').run(Date.now()-1);assert.equal((await call(a,'state')).body.access.state,'expired');
  assert.equal((await login({},'outroadmin')).status,423);
  T.change(app.db,'renew',21);assert.equal((await login(a,'lino')).status,200);assert.deepEqual((await call(a,'state')).body.employees,before.employees);
  assert.equal(T.status(app.db).remainingDays,21);
  app.db.exec('DELETE FROM trial_access');await app.close();app=createApplication({database,origin:origin.replace('http:','https:'),production:true});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
  assert.equal((await call({},'state')).body.access.state,'unconfigured');assert.equal((await call({},'state')).status,423);
 }finally{await app.close();assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'lino-trial-'));fs.rmSync(dir,{recursive:true,force:true});}
});
