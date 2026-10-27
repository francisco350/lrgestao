const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openStore}=require('./lib/store.cjs'),{seed}=require('./seed.cjs'),{createCompany}=require('./lib/companies.cjs'),{createPlatform}=require('./platform.cjs');
const Trial=require('./lib/trial.cjs');
test('empresas: login, isolamento de dados e anexos, credenciais próprias e prazo independente',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lr-companies-')),database=path.join(dir,'lino.sqlite');
  const db=openStore(database),password='Empresas-Teste-2026!';await seed(db,{lino:password,antonio:password,joao:password,rui:password});db.close();
  const port=56000+Math.floor(Math.random()*1000),origin=`http://127.0.0.1:${port}`;
  const app=createPlatform({database,origin});const companyB=await createCompany(app.registry,{name:'Empresa B',username:'empresa.b',password,days:14});
  await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
  const a={},b={},worker={};
  async function call(c,endpoint,method='GET',data,extra={}){
    const res=await fetch(origin+'/api/'+endpoint,{method,headers:{Connection:'close',...(c.cookie?{Cookie:c.cookie}:{}),...(method==='POST'?{'Content-Type':'application/json',Origin:origin,'X-CSRF-Token':c.csrf||''}:{}),...extra},...(data?{body:JSON.stringify(data)}:{})});
    const set=res.headers.get('set-cookie');if(set)c.cookie=set.split(';')[0];const content=await res.text();let body;try{body=JSON.parse(content);}catch{body=content;}if(body?.csrf)c.csrf=body.csrf;return {status:res.status,body};
  }
  const login=(c,username,pw=password)=>call(c,'login','POST',{username,password:pw});
  const state=async c=>(await call(c,'state')).body;
  const action=async(c,type,data)=>call(c,'action','POST',{type,data,revision:(await state(c)).revision});
  try{
    await t.test('abre diretamente a app e não publica o protótipo',async()=>{
      const root=await fetch(origin+'/');assert.equal(root.status,200);const html=await root.text();assert(html.includes('/app/app.js'));assert(!html.includes('prototipo/'));assert.equal((await fetch(origin+'/prototipo/index.html')).status,404);
    });
    await t.test('login encaminha para a empresa e mantém os perfis dos funcionários',async()=>{
      const first=await login(a,'lino'),second=await login(b,'empresa.b');assert.equal(first.status,200);assert.equal(second.status,200);assert.equal(first.body.user.company.id,'linorua');assert.equal(second.body.user.company.id,companyB.id);assert.equal(second.body.user.company.name,'Empresa B');
      assert.equal((await login(worker,'joao')).body.user.role,'worker');assert.equal((await state(a)).projects.length,3);assert.equal((await state(b)).projects.length,0);assert((await state(worker)).entries.every(r=>r.employee==='e2'));
    });
    await t.test('cookie, cabeçalhos, IDs e campos enviados não dão acesso a outra empresa',async()=>{
      const tampered={...a,cookie:a.cookie.replace('linorua.',companyB.id+'.')};assert.equal((await call(tampered,'state')).status,401);
      assert.equal((await call(b,'state','GET',undefined,{'X-Company-Id':'linorua'})).body.projects.length,0);
      assert.equal((await action(b,'approve',{id:'r5',companyId:'linorua'})).status,404);
      assert.equal((await action(a,'client',{name:'Só empresa A',cycle:'monthly',companyId:companyB.id})).status,200);assert(!(await state(b)).clients.some(c=>c.name==='Só empresa A'));
      assert.equal((await call(b,'users','POST',{username:'outro',name:'Intruso',role:'worker',employeeId:'e2',projects:[]})).status,400);
      assert.equal((await call(b,'backup')).body.data.projects.length,0);assert.equal((await call(b,'users')).body.users.length,1);
      const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHuoAAAAASUVORK5CYII=';
      const upload=await call(a,'project-files','POST',{project:'o1',name:'teste.png',content:png,caption:'Teste',visibility:'team',revision:(await state(a)).revision});assert.equal(upload.status,201);
      assert.equal((await call(b,'project-files/'+upload.body.id)).status,404);assert.equal((await call(a,'project-files/'+upload.body.id)).status,200);
    });
    await t.test('admin altera a empresa e o próprio login; duplicados, CSRF e outros perfis são recusados',async()=>{
      assert.equal((await call(worker,'company','POST',{name:'Ataque'})).status,403);assert.equal((await call(worker,'change-username','POST',{username:'ataque',currentPassword:password})).status,403);
      assert.equal((await call(a,'change-username','POST',{username:'empresa.b',currentPassword:password})).status,400);
      assert.equal((await call(a,'users','POST',{username:'empresa.b',name:'Duplicado',role:'admin',projects:[],password})).status,400);
      assert.equal((await call(a,'change-username','POST',{username:'novo.lino',currentPassword:password},{'X-CSRF-Token':'errado'})).status,403);
      assert.equal((await call(a,'change-username','POST',{username:'novo.lino',currentPassword:'incorreta'})).status,400);
      assert.equal((await call(a,'company','POST',{name:'Lino Rua Empresa'})).body.company.name,'Lino Rua Empresa');assert.equal((await call(b,'session')).body.user.company.name,'Empresa B');
      const old={...a};const renamed=await call(a,'change-username','POST',{username:'novo.lino',currentPassword:password});assert.equal(renamed.status,200);assert.equal(renamed.body.user.username,'novo.lino');assert.equal((await call(old,'state')).status,401);assert.equal((await login({},'lino')).status,401);assert.equal((await login(a,'novo.lino')).status,200);
      const changed=await call(a,'change-password','POST',{currentPassword:password,newPassword:'Nova-Palavra-2026!'});assert.equal(changed.status,200);assert.equal((await login({},'novo.lino')).status,401);assert.equal((await login(a,'novo.lino','Nova-Palavra-2026!')).body.user.company.id,'linorua');
    });
    await t.test('suspender uma empresa não suspende a outra e não há criação pública de empresas',async()=>{
      assert.equal((await call(b,'companies','POST',{name:'Nova'})).status,404);
      const primary=app.applications.get('linorua').db;Trial.change(primary,'start',14);Trial.change(primary,'suspend');
      assert.equal((await call({},'session')).status,401);assert.equal((await call({},'access')).status,401);assert.equal((await login({},'empresa.b')).status,200);
      assert.equal((await login({},'novo.lino','Nova-Palavra-2026!')).status,423);assert.equal((await call(b,'state')).status,200);
    });
  }finally{await app.close();}
});
