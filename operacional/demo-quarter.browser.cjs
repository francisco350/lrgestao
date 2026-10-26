// Read-only checks against the local demo. Does not submit business changes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),H=require('./public/hours-model.js');
(async()=>{
 const origin='http://127.0.0.1:4174',browser=await chromium.launch({headless:true,channel:'msedge'}),errors=[];
 try{
  for(const username of ['lino','antonio','joao','rui']){
   const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/app/');await page.getByLabel('Utilizador',{exact:true}).fill(username);await page.getByLabel('Palavra-passe',{exact:true}).fill(username+'1234');await page.getByRole('button',{name:'Entrar →',exact:true}).click();await page.locator('main h1').waitFor();
   const state=await (await page.request.get(origin+'/api/state')).json();assert(state.entries.length>0);
   if(username==='lino')assert.equal(state.projects.length,8);
   if(['joao','rui'].includes(username)){assert(state.entries.every(r=>r.employee===(username==='joao'?'e2':'e5')));assert(!state.costs);}
   for(const month of ['2026-08','2026-09','2026-10']){
    await page.getByRole('link',{name:'Mapa de horas',exact:true}).click();await page.getByLabel('Período do mapa').selectOption('month');await page.getByLabel('Data de referência',{exact:true}).fill(month+'-15');await page.getByRole('button',{name:'Aplicar ao mapa',exact:true}).click();
    const totals=H.build(state,{mode:'month',date:month+'-15',employee:'',project:''}).totals;assert(totals.approved>0);
    const expected=Math.floor(totals.approved/60)+'h'+(totals.approved%60?' '+String(totals.approved%60).padStart(2,'0')+'m':'');assert.equal(await page.locator('.hours-stats .stat-value').first().innerText(),expected);
    console.log(JSON.stringify({user:username,month,approvedMinutes:totals.approved,pendingMinutes:totals.pending}));
   }
   if(username==='lino'){
    for(const [month,last]of [['08','31'],['09','30'],['10','22']]){
     await page.getByRole('link',{name:'Pagamentos à equipa',exact:true}).click();await page.getByLabel('Início do período').fill('2026-'+month+'-01');await page.getByLabel('Fim do período').fill('2026-'+month+'-'+last);await page.getByLabel('Fim do período').blur();assert(await page.getByRole('row').filter({hasText:'DEMO · acerto 2026-'+month}).count()>0);
    }
    await page.getByRole('link',{name:'Obras',exact:true}).click();await page.screenshot({path:'future-quarter-projects.png',fullPage:true});
    await page.getByRole('link',{name:'Recebimentos',exact:true}).click();assert((await page.locator('main').innerText()).includes('DEMO ·'));await page.getByRole('link',{name:'Materiais e despesas',exact:true}).click();assert((await page.locator('main').innerText()).includes('DEMO ·'));
    await page.getByRole('link',{name:'Planeamento semanal',exact:true}).click();await page.getByLabel('Semana de referência').fill('2026-10-22');await page.getByRole('button',{name:'Aplicar ao planeamento',exact:true}).click();assert(await page.locator('.plan-card').count()>0);
   }
   await context.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: mapas dos três meses nos quatro perfis, pagamentos, obras, custos, recebimentos e planeamento; sem alterações de negócio.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
