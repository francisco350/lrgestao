const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApplication}=require('./server.cjs'),{seed}=require('./seed.cjs'),{openStore,readState}=require('./lib/store.cjs');
test('autenticação real, autorização e persistência entre sessões',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lino-api-')),file=path.join(dir,'test.sqlite');const port=45000+Math.floor(Math.random()*1000),origin=`http://127.0.0.1:${port}`;
  let app=createApplication({database:file,origin});const passwords={lino:'Teste-Admin-2026!',antonio:'Teste-Gestor-2026!',joao:'Teste-Joao-2026!',rui:'Teste-Rui-2026!'};await seed(app.db,passwords);await new Promise(resolve=>app.server.listen(port,'127.0.0.1',resolve));
  const client=()=>({cookie:'',csrf:''}),a=client(),m=client(),w=client(),other=client();
  async function call(c,url,method='GET',data,headers={}){const r=await fetch(origin+'/api/'+url,{method,headers:{Connection:'close',...(method==='POST'?{'Content-Type':'application/json',Origin:origin,'X-CSRF-Token':c.csrf}:{}),...(c.cookie?{Cookie:c.cookie}:{}),...headers},...(data?{body:JSON.stringify(data)}:{})});const cookie=r.headers.get('set-cookie');if(cookie)c.cookie=cookie.split(';')[0];const body=await r.json();if(body.csrf)c.csrf=body.csrf;return {status:r.status,body,headers:r.headers};}
  const login=(c,name,password=passwords[name])=>call(c,'login','POST',{username:name,password});
  const state=async c=>(await call(c,'state')).body;
  const act=async(c,type,data,revision)=>call(c,'action','POST',{type,data,revision:revision??(await state(c)).revision});
  try{
    await t.test('rejeita anónimo, credenciais erradas e login com origem diferente',async()=>{assert.equal((await call(a,'state')).status,401);assert.equal((await login(a,'lino','errada')).status,401);assert.equal((await call(a,'login','POST',{username:'lino',password:passwords.lino},{Origin:'https://outro.example'})).status,403);});
    await t.test('cria quatro sessões independentes e guarda apenas hashes',async()=>{for(const [c,name]of[[a,'lino'],[m,'antonio'],[w,'joao'],[other,'rui']])assert.equal((await login(c,name)).status,200);const user=app.db.prepare("SELECT password_hash FROM users WHERE username='lino'").get();assert(user.password_hash.startsWith('scrypt$'));assert(!user.password_hash.includes(passwords.lino));const cookie=(await login(a,'lino')).headers.get('set-cookie');assert(cookie.includes('HttpOnly'));assert(cookie.includes('SameSite=Strict'));assert(!app.db.prepare('SELECT token_hash FROM sessions').all().some(s=>a.cookie.includes(s.token_hash)));});
    await t.test('filtra dados por funcionário e obra, sem transmitir remunerações ao encarregado',async()=>{const own=await state(w),elsewhere=await state(other),managed=await state(m);assert(own.employees.every(e=>e.id==='e2'));assert(own.entries.every(e=>e.employee==='e2'));assert(own.projects.every(p=>p.id==='o1'));assert(elsewhere.projects.every(p=>p.id==='o3'));assert(!managed.projects.some(p=>p.id==='o3'));assert(managed.employees.every(e=>!('rate'in e)));assert(managed.entries.every(e=>!('unitRate'in e)&&!('rate'in e)));assert.equal(managed.wagePayments.length,0);for(const endpoint of ['users','audit','backup'])assert.equal((await call(w,endpoint)).status,403);});
    await t.test('não aceita escalada por cabeçalhos, campos, funcionário ou obra',async()=>{assert.equal((await call(w,'users','POST',{username:'intruso',role:'admin'},{'X-Role':'admin'})).status,403);assert.equal((await act(w,'employee',{name:'Ataque',role:'admin'})).status,403);assert.equal((await act(w,'work',{employee:'e1',project:'o1',date:'2026-10-17',mode:'days',days:.5})).status,403);assert.equal((await act(w,'work',{employee:'e2',project:'o3',date:'2026-10-17',mode:'days',days:.5})).status,403);assert.equal((await act(m,'approve',{id:'r4'})).status,403);assert.equal((await call(a,'action','POST',{type:'employee',revision:(await state(a)).revision,data:{}},{'X-CSRF-Token':'incorreto'})).status,403);});
    await t.test('clientes e cobranças: acesso exclusivo, parciais, saldos e anulações',async()=>{
      for(const c of [m,w,other]){const view=await state(c);for(const key of ['clients','charges','receipts'])assert(!Object.hasOwn(view,key));for(const type of ['client','charge','receipt','voidCharge','voidReceipt'])assert.equal((await act(c,type,{})).status,403);}
      assert.equal((await act(a,'client',{name:'Cliente Teste',email:'cliente@example.test',phone:'',cycle:'weekly'})).status,200);
      const customer=(await state(a)).clients.find(c=>c.name==='Cliente Teste');
      assert.equal((await act(a,'project',{name:'Obra teste',clientId:customer.id,city:'Maia',status:'Planeada',budget:1000,employees:[]})).status,200);
      const project=(await state(a)).projects.find(p=>p.name==='Obra teste');
      const charge={project:project.id,description:'Semana 1',amount:100.01,due:'2026-10-16'};
      for(const amount of [0,-1,1.001])assert.equal((await act(a,'charge',{...charge,amount})).status,400);
      assert.equal((await act(a,'charge',{...charge,due:'2026-02-30'})).status,400);
      assert.equal((await act(a,'charge',charge)).status,200);
      const record=(await state(a)).charges.find(c=>c.project===project.id);
      const payment={charge:record.id,amount:30,date:'2026-10-16',method:'Transferência',note:'Parcial'};
      assert.equal((await act(a,'receipt',{...payment,date:'2099-01-01'})).status,400);
      const revision=(await state(a)).revision;
      assert.equal((await act(a,'receipt',payment,revision)).status,200);
      assert.equal((await act(a,'receipt',payment,revision)).status,409);
      assert.equal((await act(a,'receipt',{...payment,amount:70.02})).status,400);
      assert.equal((await act(a,'receipt',{...payment,amount:70.01})).status,200);
      assert.equal((await act(a,'receipt',{...payment,amount:.01})).status,400);
      assert.equal((await act(a,'voidCharge',{id:record.id,reason:'Teste'})).status,400);
      const alternative=(await state(a)).clients.find(c=>c.id!==customer.id);
      assert.equal((await act(a,'project',{...project,clientId:alternative.id})).status,400);
      for(const receipt of (await state(a)).receipts.filter(r=>r.charge===record.id)){assert.equal((await act(a,'voidReceipt',{id:receipt.id,reason:''})).status,400);assert.equal((await act(a,'voidReceipt',{id:receipt.id,reason:'Movimento duplicado'})).status,200);}
      assert.equal((await act(a,'voidCharge',{id:record.id,reason:'Acordo substituído'})).status,200);
      assert.equal((await act(a,'receipt',payment)).status,400);
      const final=await state(a);assert(final.receipts.filter(r=>r.charge===record.id).every(r=>r.voided&&r.voidedBy));assert(final.charges.find(c=>c.id===record.id).voided);
    });
    await t.test('custos calculados pelo servidor, autorizações, conflitos e anulações',async()=>{
      for(const c of [m,w,other]){const view=await state(c);assert(!Object.hasOwn(view,'costs'));assert(!Object.hasOwn(view,'costSummary'));for(const type of ['cost','voidCost'])assert.equal((await act(c,type,{})).status,403);}
      const baseline=(await state(a)).costSummary.find(s=>s.project==='o1');assert.equal(baseline.labour,140);
      const data={project:'o1',kind:'material',description:'Material de teste',quantity:2.345,unit:'kg',unitPrice:4.5,date:'2026-10-16',supplier:'Fornecedor teste',reference:'FT-test',amount:1,createdBy:'intruso',voided:true};
      const before=(await state(a)).revision;
      for(const invalid of [{quantity:0},{quantity:1.0001},{quantity:'2'},{unitPrice:-1},{unitPrice:4.501},{quantity:100000,unitPrice:1000000},{project:'missing'},{unit:'invalid'},{date:'2026-02-30'},{date:'2099-01-01'},{kind:'other'}])assert([400,404].includes((await act(a,'cost',{...data,...invalid})).status));
      assert.equal((await state(a)).revision,before);
      assert.equal((await act(a,'cost',data,before)).status,200);assert.equal((await act(a,'cost',data,before)).status,409);
      const added=(await state(a)).costs.find(c=>c.description==='Material de teste');assert.equal(added.amount,10.55);assert.notEqual(added.createdBy,'intruso');assert(!added.voided);
      let sum=(await state(a)).costSummary.find(s=>s.project==='o1');assert.equal(sum.materials,Math.round((baseline.materials+10.55)*100)/100);assert.equal(sum.labour,140);
      assert.equal((await act(a,'cost',{...data,kind:'expense',category:'Transporte',description:'Transporte teste',quantity:99,unitPrice:25})).status,200);
      const expense=(await state(a)).costs.find(c=>c.description==='Transporte teste');assert.equal(expense.quantity,1);assert.equal(expense.amount,25);
      assert.equal((await act(a,'voidCost',{id:added.id,reason:''})).status,400);
      assert.equal((await act(a,'voidCost',{id:added.id,reason:'Compra duplicada'})).status,200);
      assert.equal((await act(a,'voidCost',{id:added.id,reason:'Outra vez'})).status,400);
      const final=await state(a),voided=final.costs.find(c=>c.id===added.id);assert.equal(voided.amount,10.55);assert(voided.voidedBy&&voided.voidedAt);sum=final.costSummary.find(s=>s.project==='o1');assert.equal(sum.materials,baseline.materials);assert.equal(sum.expenses,baseline.expenses+25);assert.equal(sum.total,Math.round((sum.materials+sum.expenses+sum.labour)*100)/100);
      const exported=(await call(a,'backup')).body;assert(exported.data.costs.some(c=>c.id===added.id&&c.voided));
    });
    await t.test('ficha da obra: datas válidas, notas partilhadas e âmbito dos perfis',async()=>{
      const project=(await state(a)).projects.find(p=>p.id==='o1');
      assert.equal((await act(a,'project',{...project,plannedStart:'2026-10-10',plannedEnd:'2026-10-09'})).status,400);
      assert.equal((await act(a,'project',{...project,plannedStart:'2026-02-30'})).status,400);
      assert.equal((await act(a,'project',{...project,address:'Rua de teste, 10',siteContact:'António',plannedStart:'2026-10-10',plannedEnd:'2026-10-16'})).status,200);
      assert.equal((await act(m,'projectNote',{project:'o3',text:'Sem acesso'})).status,403);
      assert.equal((await act(w,'projectNote',{project:'o1',text:'Não autorizado'})).status,403);
      assert.equal((await act(m,'projectNote',{project:'o1',text:'  '})).status,400);
      assert.equal((await act(m,'projectNote',{project:'o1',text:'Nota da obra 1',author:'Intruso',createdBy:'intruso'})).status,200);
      assert.equal((await act(a,'projectNote',{project:'o3',text:'Nota da obra 3'})).status,200);
      const own=await state(w),managed=await state(m),otherState=await state(other);
      assert.equal(own.projects[0].address,'Rua de teste, 10');assert.equal(own.projects[0].plannedEnd,'2026-10-16');assert(!('budget'in own.projects[0]));
      assert(own.projectNotes.every(n=>n.project==='o1'));assert(!managed.projectNotes.some(n=>n.project==='o3'));assert(otherState.projectNotes.every(n=>n.project==='o3'));
      const note=own.projectNotes.find(n=>n.text==='Nota da obra 1');assert.equal(note.author,'António Ferreira');assert.notEqual(note.createdBy,'intruso');assert(note.createdAt);
    });
    let newEntry;
    await t.test('um colaborador regista e outro utilizador valida; a decisão persiste',async()=>{assert.equal((await act(w,'work',{employee:'e2',project:'o1',date:'2026-10-17',mode:'hours',start:'08:00',end:'13:00',pause:60,note:'Registo de integração'})).status,200);newEntry=(await state(w)).entries.find(e=>e.note==='Registo de integração');assert.equal(newEntry.minutes,240);assert.equal(newEntry.status,'pending');assert.equal((await act(w,'approve',{id:newEntry.id})).status,403);assert.equal((await act(m,'approve',{id:newEntry.id})).status,200);assert.equal((await state(w)).entries.find(e=>e.id===newEntry.id).status,'approved');});
    await t.test('pedidos de correção mantêm o original até à aprovação e guardam o histórico',async()=>{assert.equal((await act(w,'work',{id:'r2',employee:'e2',project:'o1',date:'2026-10-12',mode:'days',days:.5})).status,400);assert.equal((await act(w,'correction',{id:'r2',employee:'e2',project:'o1',date:'2026-10-12',mode:'days',days:.5,reason:'Trabalho apenas de manhã'})).status,200);let own=await state(w);assert.equal(own.entries.find(r=>r.id==='r2').minutes,480);const correction=own.corrections.at(-1);assert.equal((await act(m,'approveCorrection',{id:correction.id})).status,200);own=await state(w);assert.equal(own.entries.find(r=>r.id==='r2').minutes,240);assert.equal(own.corrections.at(-1).original.minutes,480);});
    await t.test('conflitos de sessões são detetados e pagamentos ficam restritos ao administrador',async()=>{const revision=(await state(w)).revision;assert.equal((await act(a,'employee',{id:'e2',name:'João Martins',category:'Ajudante',rate:60,payBasis:'day',dayHours:8,active:true})).status,200);assert.equal((await act(w,'work',{employee:'e2',project:'o1',date:'2026-10-18',mode:'days',days:.5},revision)).status,409);assert.equal((await state(w)).entries.find(e=>e.id===newEntry.id).unitRate,55);const payment={employee:'e2',amount:20,date:'2026-10-18',type:'payment',method:'Transferência',note:'Pagamento de teste'};assert.equal((await act(w,'payment',payment)).status,403);assert.equal((await act(a,'payment',payment)).status,200);assert((await state(w)).wagePayments.every(p=>p.employee==='e2'));assert.equal((await state(other)).wagePayments.length,0);assert.equal((await act(a,'payment',{...payment,amount:9999})).status,400);});
    await t.test('conta nova exige troca de palavra-passe e sessões são revogadas ao desativar',async()=>{const created=await call(a,'users','POST',{username:'pedro',name:'Pedro Costa',role:'worker',employeeId:'e4',projects:[]});assert.equal(created.status,201);assert(created.body.temporaryPassword.length>=12);const p=client();assert.equal((await login(p,'pedro',created.body.temporaryPassword)).status,200);assert.equal((await call(p,'state')).status,428);assert.equal((await call(p,'change-password','POST',{currentPassword:created.body.temporaryPassword,newPassword:'Nova-Palavra-2026!'})).status,200);assert.equal((await call(p,'state')).status,200);const all=(await call(a,'users')).body.users,target=all.find(u=>u.username==='pedro');assert.equal((await call(a,'users','POST',{...target,active:false})).status,200);assert.equal((await call(p,'state')).status,401);const owner=all.find(u=>u.username==='lino');assert.equal((await call(a,'users','POST',{...owner,role:'worker',employeeId:'e3'})).status,400);});
    await t.test('reinício do servidor e cópia restaurada preservam dados e contas',async()=>{const before=readState(app.db);const backup=path.join(dir,'backup.sqlite');app.db.prepare('VACUUM INTO ?').run(backup);const restored=openStore(backup);assert.equal(readState(restored).revision,before.revision);assert.equal(restored.prepare('SELECT count(*) n FROM users').get().n,5);restored.close();await app.close();app=createApplication({database:file,origin});await new Promise(resolve=>app.server.listen(port,'127.0.0.1',resolve));assert.equal((await state(a)).revision,before.revision);assert.equal((await state(w)).entries.find(r=>r.id===newEntry.id).status,'approved');const logs=(await call(a,'audit')).body.events;assert(logs.some(e=>e.event==='approve'));assert(!JSON.stringify(logs).includes(passwords.lino));});
  }finally{await app.close();for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
});
