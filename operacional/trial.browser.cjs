const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApplication}=require('./server.cjs'),{seed}=require('./seed.cjs'),T=require('./lib/trial.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lino-trial-browser-')),origin='http://127.0.0.1:4187',app=createApplication({database:path.join(dir,'demo.sqlite'),origin}),password='Trial-Browser-2026!';let browser;
 try{
  await seed(app.db,{lino:password,antonio:password,joao:password,rui:password});T.change(app.db,'start',14);await new Promise(r=>app.server.listen(4187,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,channel:'msedge'});const a=await browser.newPage(),w=await browser.newPage(),errors=[];for(const p of[a,w])p.on('pageerror',e=>errors.push(e.message));
  async function login(p,name){await p.goto(origin+'/app/');await p.getByLabel('Utilizador',{exact:true}).fill(name);await p.getByLabel('Palavra-passe',{exact:true}).fill(password);await p.getByRole('button',{name:'Entrar →',exact:true}).click();await p.locator('main h1').waitFor();}
  await login(a,'lino');await login(w,'joao');await a.locator('#trial-notice').waitFor({timeout:20000});assert((await a.locator('#trial-notice').innerText()).includes('demonstração até'));
  T.change(app.db,'suspend');await a.getByLabel('Atualizar dados',{exact:true}).click();await a.locator('#login-error').filter({hasText:'está suspenso'}).waitFor();assert.equal(await a.locator('main').count(),0);
  await w.locator('#login-error').filter({hasText:'está suspenso'}).waitFor({timeout:20000});assert.equal(await w.locator('main').count(),0);
  await a.screenshot({path:'future-trial.png',fullPage:true});T.change(app.db,'resume');await login(a,'lino');await a.getByRole('link',{name:'Utilizadores e acessos',exact:true}).click();await a.getByRole('button',{name:'+ Criar utilizador'}).waitFor();
  app.db.prepare('UPDATE trial_access SET expires_at=?').run(Date.now()-1);await a.getByLabel('Atualizar dados',{exact:true}).click();await a.locator('#login-error').filter({hasText:'demonstração terminou'}).waitFor();
  T.change(app.db,'renew',30);await login(a,'lino');assert.deepEqual(errors,[]);console.log('PASS: prazo visível, suspensão de sessão ativa e inativa, expiração, reativação e administração da equipa.');
 }finally{if(browser)await browser.close();await app.close();assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'lino-trial-browser-'));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
