const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApplication}=require('./server.cjs'),{seed}=require('./seed.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lr-finance-tabs-')),origin='http://127.0.0.1:4196';
 const app=createApplication({database:path.join(dir,'data.sqlite'),origin});let browser;
 try{
  const password='Finance-Tabs-2026!';await seed(app.db,{lino:password,antonio:password,joao:password,rui:password});await new Promise(r=>app.server.listen(4196,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,channel:'msedge'});const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin+'/#obra/o1/contas');await p.getByLabel('Utilizador',{exact:true}).fill('lino');await p.getByLabel('Palavra-passe',{exact:true}).fill(password);await p.getByRole('button',{name:'Entrar →',exact:true}).click();await p.locator('.project-monthly').waitFor();
  await p.getByRole('button',{name:'Toda a obra',exact:true}).click();
  const nav=p.getByRole('navigation',{name:'Detalhes das contas',exact:true});
  const expected={charges:['Cobranças e recebimentos desta obra'],costs:['Materiais e despesas desta obra'],labour:['Mão de obra por funcionário','Trabalho nesta obra'],movements:['Pagamentos de trabalho','Movimentos financeiros da obra','Entradas e saídas por método']};
  for(const width of [1440,390]){
   await p.setViewportSize({width,height:1000});
   for(const key of ['movements','costs','labour','charges']){
    const button=nav.locator(`[data-finance-tab="${key}"]`);await button.scrollIntoViewIfNeeded();await button.click();await p.waitForTimeout(100);
    assert.equal(await nav.locator('[aria-pressed="true"]').count(),1);assert.equal(await button.getAttribute('aria-pressed'),'true');
    assert(await button.evaluate(b=>b.classList.contains('selected')));
    assert.equal(await p.locator('[data-finance-pane]:visible').count(),1);
    assert.deepEqual(await p.locator('[data-finance-pane]:visible h2').allTextContents(),expected[key]);
    assert(await nav.evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'Navigation stays accessible after selecting '+key);
    await p.evaluate(()=>render());assert.equal(await nav.locator('[aria-pressed="true"]').getAttribute('data-finance-tab'),key);
    if(key==='charges'){
     const output=path.resolve('..','outputs','finance-tabs');fs.mkdirSync(output,{recursive:true});
     await p.locator('.project-monthly').screenshot({path:path.join(output,'charges-'+width+'.png')});
    }
   }
  }
  await nav.locator('[data-finance-tab="labour"]').click();await p.getByRole('button',{name:'Este mês',exact:true}).click();assert.equal(await nav.locator('[aria-pressed="true"]').getAttribute('data-finance-tab'),'labour');
  await p.getByRole('link',{name:'Materiais e despesas',exact:true}).click();
  assert.equal(await p.getByRole('heading',{name:'Pagamentos de trabalho',exact:true}).count(),1,'Original costs view retains wage payments');
  assert.deepEqual(errors,[]);console.log('PASS: four exclusive panes, selected styling, correct table groups, navigation remains accessible, selection persists on render/period changes, desktop/mobile.');
 }finally{if(browser)await browser.close();await app.close();assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'lr-finance-tabs-'));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
