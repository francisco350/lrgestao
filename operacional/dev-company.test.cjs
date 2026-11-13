const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {ensureDevCompany} = require('./dev-company.cjs');
const {openStore,readState} = require('./lib/store.cjs');
const {verifyPassword} = require('./lib/auth.cjs');
const {createPlatform} = require('./platform.cjs');

test('empresa de testes: exemplos, login, isolamento e repetição sem apagar alterações', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'lr-dev-company-'));
  const database = path.join(dir,'lino.sqlite');
  const primary = openStore(database);
  const original = {schemaVersion:2, employees:[], projects:[], entries:[], wagePayments:[], corrections:[], clients:[], charges:[], receipts:[], costs:[]};
  primary.prepare('INSERT INTO business VALUES(1,1,?)').run(JSON.stringify(original));
  primary.close();
  let app;
  try {
    const result = await ensureDevCompany({database});
    const db = openStore(result.database);
    const credentials = JSON.parse(fs.readFileSync(result.credentials,'utf8'));
    try {
      const state = readState(db);
      for (const key of ['employees','clients','projects','entries','wagePayments','corrections','charges','receipts','costs','costPayments','inventory','planning','absences','clockShifts','projectNotes','monthlyHistory','attachments']) assert(state[key].length > 0, key);
      assert.equal(state.projects[0].name,'Obra 1');
      assert.equal(state.clients[0].name,'Cliente 1');
      for (const account of credentials) assert(await verifyPassword(account.password, db.prepare('SELECT password_hash FROM users WHERE username=?').get(account.username).password_hash));
      db.prepare("UPDATE company_profile SET name='Teste editado'").run();
      const document = db.prepare('SELECT document FROM business').get().document;
      const again = await ensureDevCompany({database});
      assert.equal(again.alreadyExists,true);
      assert.equal(again.database,result.database);
      assert.equal(db.prepare('SELECT document FROM business').get().document,document);
      assert.equal(db.prepare('SELECT name FROM company_profile').get().name,'Teste editado');
      assert.deepEqual(JSON.parse(fs.readFileSync(again.credentials,'utf8')),credentials);
    } finally { db.close(); }
    const main = openStore(database);
    assert.deepEqual(JSON.parse(main.prepare('SELECT document FROM business').get().document),original);
    main.close();
    const port = 57000 + Math.floor(Math.random() * 1000), origin = `http://127.0.0.1:${port}`;
    app = createPlatform({database,origin});
    await new Promise(resolve => app.server.listen(port,'127.0.0.1',resolve));
    const response = await fetch(origin + '/api/login', {
      method:'POST', headers:{Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify(credentials.find(c => c.username === 'teste'))
    });
    assert.equal(response.status,200);
    const login = await response.json();
    assert.equal(login.user.company.id,result.id);
    assert.equal(login.user.mustChangePassword,false);
    assert.equal(login.user.company.estimateSimulator,true);
    const cookie=response.headers.get('set-cookie').split(';')[0];
    const call=async(endpoint,data)=>{
      const res=await fetch(origin+'/api/'+endpoint,{
        method:data?'POST':'GET',headers:{Cookie:cookie,...(data?{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':login.csrf}:{})},
        ...(data?{body:JSON.stringify(data)}:{})
      });
      return {status:res.status,body:await res.json()};
    };
    const catalog=await call('estimate-catalog');assert.equal(catalog.status,200);
    const selections=[{room:'wc',area:6,trades:['electricidade']}];
    const calculated=await call('estimate',{version:catalog.body.version,selections});
    assert.equal(calculated.status,200);assert(calculated.body.subtotalCents>0);
    const id=require('node:crypto').randomUUID();
    assert.equal((await call('project-estimates',{id,project:'o1',title:'Orçamento de teste',version:catalog.body.version,selections})).status,200);
    assert.equal((await call('project-estimates?id='+id)).body.project,'o1');
    const testApp=app.applications.get(result.id),linoApp=app.applications.get('linorua');
    assert.equal(linoApp.db.prepare('SELECT count(*) AS n FROM project_estimates').get().n,0);
    assert.equal(linoApp.db.prepare('SELECT count(*) AS n FROM estimate_catalog').get().n,0);
    assert.equal(testApp.db.prepare('SELECT count(*) AS n FROM project_estimates').get().n,1);
    const managerResponse=await fetch(origin+'/api/login',{
      method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify(credentials.find(c=>c.username==='teste.enc'))
    });
    const managerCookie=managerResponse.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(origin+'/api/estimate-catalog',{headers:{Cookie:managerCookie}})).status,403);
  } finally {
    if (app) await app.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
