const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApplication}=require('./server.cjs'),{seed}=require('./seed.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lr-table-text-'));
 const origin='http://127.0.0.1:4199',app=createApplication({database:path.join(dir,'data.sqlite'),origin});let browser;
 try{
  const password='Table-Text-2026!';await seed(app.db,{lino:password,antonio:password,joao:password,rui:password});
  await new Promise(resolve=>app.server.listen(4199,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.getByLabel('Utilizador',{exact:true}).fill('lino');await page.getByLabel('Palavra-passe',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Entrar →',exact:true}).click();await page.locator('main h1').waitFor();
  const routes=await page.evaluate(()=>{
   for(const p of state.projects)p.name+=' — Remodelação de apartamentos e instalações comerciais com acompanhamento de todas as especialidades';
   for(const e of state.employees)e.name+=' — Funcionário com nome completo de teste';
   for(const c of state.clients)c.name+=' — Sociedade de construção e reabilitação urbana';
   return [...document.querySelectorAll('.sidebar nav a')].map(a=>a.hash);
  });
  let checked=0;
  for(const route of routes){
   await page.evaluate(route=>{location.hash=route;render();},route);await page.waitForTimeout(120);
   assert.equal(await page.locator('[data-column="amount"] .table-text-open,[data-column="status"] .table-text-open,[data-column="actions"] .table-text-open').count(),0);
   for(const button of await page.locator('.table-text-open:visible').all()){
    const expected=await button.evaluate(b=>b.parentElement.innerText.trim());
    assert(await button.evaluate(b=>['identity','text'].includes(b.parentElement.dataset.column)));
    assert(await button.evaluate(b=>{
     const cell=b.parentElement,row=cell.parentElement,before=row.offsetHeight;
     cell.classList.remove('table-text-expandable');b.hidden=true;const after=row.offsetHeight;
     cell.classList.add('table-text-expandable');b.hidden=false;return before===after;
    }),'Disclosure preserves row height');
    await button.click();assert.equal(await page.locator('.table-text-dialog p').innerText(),expected);
    await page.getByRole('button',{name:'Fechar',exact:true}).click();checked++;
   }
  }
  assert(checked>5,'Shared disclosure exercised across tables');
  await page.evaluate(()=>{location.hash='#utilizadores';render();});
  const button=page.locator('tbody tr').filter({hasText:'Encarregado'}).locator('td:nth-child(4) .table-text-open');
  await button.waitFor();await button.focus();await button.press('Enter');
  assert((await page.locator('.table-text-dialog p').innerText()).includes('Remodelação'));
  const output=path.resolve('..','outputs','table-text');fs.mkdirSync(output,{recursive:true});
  await page.locator('.table-text-dialog').screenshot({path:path.join(output,'conteudo-completo.png')});
  await page.keyboard.press('Escape');assert(await button.evaluate(b=>document.activeElement===b));
  await page.locator('main').screenshot({path:path.join(output,'contas-aplicacao.png')});
  await page.setViewportSize({width:390,height:900});await page.waitForTimeout(120);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);console.log('PASS: '+checked+' clipped cells across routes; full text, protected columns, stable row height, keyboard, Escape and mobile.');
 }finally{if(browser)await browser.close();await app.close();assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'lr-table-text-'));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
