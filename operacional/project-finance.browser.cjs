const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApplication}=require('./server.cjs'),{seed}=require('./seed.cjs'),{readState}=require('./lib/store.cjs');
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lino-project-finance-')),database=path.join(dir,'test.sqlite'),origin='http://127.0.0.1:4189';
  let app=createApplication({database,origin}),browser;
  const password='Teste-Financas-Obra-2026!',today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Lisbon'}),month=today.slice(0,7);
  const d=new Date(today+'T12:00:00Z');d.setUTCDate(0);const previous=d.toISOString().slice(0,10),prevMonth=previous.slice(0,7);
  try{
    await seed(app.db,{lino:password,antonio:password,joao:password,rui:password});await new Promise(r=>app.server.listen(4189,'127.0.0.1',r));
    browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
    const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto(origin);await p.getByLabel('Utilizador',{exact:true}).fill('lino');await p.getByLabel('Palavra-passe',{exact:true}).fill(password);await p.getByRole('button',{name:'Entrar →'}).click();await p.locator('main h1').waitFor();
    const pending=await p.evaluate(()=>state.entries.find(r=>r.status==='pending'));
    assert(pending,'A demonstração deve incluir trabalho por validar');
    const checkPendingActions=async()=>{
      for(const action of ['approve','reject','edit-work'])assert.equal(await p.locator(`[data-action="${action}"][data-id="${pending.id}"]`).count(),1,action);
      assert(!(await p.locator('main').innerText()).includes('\uFFFD'),'Texto sem caracteres corrompidos');
    };
    const checkLabour=async()=>{
      const panel=p.locator('.panel').filter({has:p.getByRole('heading',{name:'Mão de obra por funcionário',exact:true})});
      assert.deepEqual(await panel.locator('thead th').allTextContents(),['Funcionário','Obra','Horas validadas','Custo validado','Por validar','Pago','Em falta','Ações']);
      const row=panel.locator('tbody tr').filter({has:p.locator(`[data-work-employee="${pending.employee}"][data-work-project="${pending.project}"][data-work-status="pending"]`)});
      assert.equal(await row.count(),1);
      for(const index of [4,5,6]){assert((await row.locator('td').nth(index).innerText()).includes('€'));assert.equal(await row.locator('td').nth(index).locator('small').count(),1);}
      assert.equal(await row.getByRole('button',{name:'Ver registos',exact:true}).count(),1);
      assert.equal(await row.getByRole('button',{name:'Ver pendentes',exact:true}).count(),1);
    };
    await p.goto(origin+'/#obra/'+pending.project);await p.locator('.project-detail').waitFor();await checkPendingActions();await checkLabour();
    await p.getByRole('link',{name:'Contas da obra',exact:true}).click();await p.getByRole('button',{name:'Toda a obra',exact:true}).click();await checkPendingActions();await checkLabour();
    assert.equal(await p.locator('.project-monthly > .panel').last().locator('h2').innerText(),'Entradas e saídas por método');
    assert.deepEqual(await p.locator('#finance-movements th').allTextContents(),['Data','Movimento / descrição','Valor','Método / observação','Estado','Ações']);
    const tones=await p.evaluate(()=>Object.values(clockLabels).map(label=>badgeTone(label)));
    assert.deepEqual(tones,['blue','purple','amber','green','red']);
    await p.goto(origin+'/#custos');await p.getByRole('button',{name:'Todas as datas',exact:true}).click();await checkLabour();
    await p.goto(origin+'/#trabalho');await p.getByRole('button',{name:'Limpar filtros',exact:true}).click();await checkPendingActions();
    await p.goto(origin+'/#obra/o1');await p.getByRole('link',{name:'Contas da obra',exact:true}).click();await p.getByRole('heading',{name:'Contas da obra'}).waitFor();await p.getByRole('button',{name:'Este mês',exact:true}).click();assert.equal(await p.getByLabel('Mês de consulta',{exact:true}).inputValue(),month);
    await p.getByLabel('Mês de consulta',{exact:true}).fill(prevMonth);
    await p.getByRole('button',{name:'+ Despesa',exact:true}).click();assert.equal(await p.locator('#form select[name="project"]').count(),0);
    await p.getByLabel('Descrição da despesa',{exact:true}).fill('Gasóleo teste mensal');await p.getByLabel('Valor final da despesa (€)',{exact:true}).fill('100');
    assert.equal(await p.getByLabel('Data do custo',{exact:true}).inputValue(),previous);
    await p.getByLabel('Estado do pagamento',{exact:true}).selectOption('partial');await p.getByLabel('Valor já pago (€)',{exact:true}).fill('40');await p.getByLabel('Método do pagamento',{exact:true}).selectOption('Numerário');
    await p.getByRole('button',{name:'Guardar',exact:true}).click();await p.locator('dialog').waitFor({state:'hidden'});
    const costs=p.locator('.panel').filter({has:p.getByRole('heading',{name:'Materiais e despesas desta obra',exact:true})}),row=costs.getByRole('row').filter({hasText:'Gasóleo teste mensal'});
    assert((await row.innerText()).includes('60,00'));await row.getByRole('button',{name:'Registar pagamento',exact:true}).click();await p.getByLabel('Data do pagamento',{exact:true}).fill(today);
    await p.getByRole('button',{name:'Guardar',exact:true}).click();await p.locator('dialog').waitFor({state:'hidden'});assert((await row.innerText()).includes('Parcial'));
    await p.getByRole('button',{name:'+ Cobrança',exact:true}).click();await p.getByLabel('Descrição da cobrança',{exact:true}).fill('Cobrança teste mensal');await p.getByLabel('Valor da cobrança (€)',{exact:true}).fill('250');
    await p.getByRole('button',{name:'Guardar',exact:true}).click();await p.locator('dialog').waitFor({state:'hidden'});
    await p.getByRole('button',{name:'+ Recebimento',exact:true}).click();const option=await p.locator('#form select[name="charge"] option').filter({hasText:'Cobrança teste mensal'}).getAttribute('value');await p.getByLabel('Cobrança',{exact:true}).selectOption(option);
    await p.getByLabel('Valor recebido (€)',{exact:true}).fill('50');await p.getByLabel('Método do recebimento',{exact:true}).selectOption('Numerário');await p.getByRole('button',{name:'Guardar',exact:true}).click();await p.locator('dialog').waitFor({state:'hidden'});
    await p.getByRole('button',{name:'+ Recebimento',exact:true}).click();await p.getByLabel('Cobrança',{exact:true}).selectOption(option);await p.getByLabel('Valor recebido (€)',{exact:true}).fill('100');await p.getByLabel('Data do recebimento',{exact:true}).fill(today);await p.getByRole('button',{name:'Guardar',exact:true}).click();await p.locator('dialog').waitFor({state:'hidden'});
    const own=await p.evaluate(()=>ProjectFinance.summary(state,'o1',financeRange.from,financeRange.until));
    assert.equal(own.paid,40);assert.equal(own.due,60);assert(own.methods.find(r=>r.method==='Numerário').received>=50);
    await p.getByRole('button',{name:'Este mês',exact:true}).click();const current=await p.evaluate(()=>ProjectFinance.summary(state,'o1',financeRange.from,financeRange.until));assert.equal(current.paid,60);
    assert.equal(await costs.getByText('Gasóleo teste mensal',{exact:true}).count(),0);assert((await p.locator('.panel').filter({has:p.getByRole('heading',{name:'Cobranças e recebimentos desta obra',exact:true})}).getByRole('row').filter({hasText:'Cobrança teste mensal'}).innerText()).includes('100,00'));
    await p.getByRole('button',{name:'+ Material',exact:true}).click();await p.getByLabel('Descrição do material',{exact:true}).fill('Cimento teste por pagar');await p.getByLabel('Custo unitário final (€)',{exact:true}).fill('5');await p.getByLabel('Quantidade',{exact:true}).fill('10');
    await p.getByRole('button',{name:'Guardar',exact:true}).click();await p.locator('dialog').waitFor({state:'hidden'});await costs.getByRole('row').filter({hasText:'Cimento teste por pagar'}).getByText('Por pagar',{exact:true}).waitFor();
    await p.reload();await p.getByRole('heading',{name:'Contas da obra'}).waitFor();assert.equal(await costs.getByText('Cimento teste por pagar',{exact:true}).count(),1);
    // Every entry point opens the same accounts, preserving the selected period.
    await p.getByLabel('Mês de consulta',{exact:true}).fill(prevMonth);
    await p.getByRole('link',{name:'Ficha e equipa',exact:true}).click();
    assert.equal(await p.locator('.project-monthly').count(),0);
    await p.getByRole('link',{name:'Contas da obra',exact:true}).click();assert.equal(await p.getByLabel('Mês de consulta',{exact:true}).inputValue(),prevMonth);
    await p.getByRole('button',{name:'Este mês',exact:true}).click();
    const statText=await p.getByRole('region',{name:'Resumo de recebimentos e pagamentos'}).innerText();
    for(const label of ['Por receber','Recebido','Por pagar','Pago'])assert(statText.includes(label));
    async function checkCardDetails(){
      for(const card of await p.locator('[data-finance-card]').all()){
        const total=await card.locator('.stat-value').innerText();
        await card.click();
        const detail=p.getByRole('dialog');
        assert.equal(await detail.locator('.finance-detail-total strong').innerText(),total);
        const metric=await card.getAttribute('data-finance-card');
        const descriptions={receivable:'Cobrança teste mensal',received:'Cobrança teste mensal',due:'Cimento teste por pagar',paid:'Gasóleo teste mensal',profit:'Cimento teste por pagar',balance:'Gasóleo teste mensal'};
        const description=descriptions[metric];
        assert(await detail.getByText(description,{exact:true}).first().isVisible());
        if(metric==='profit'||metric==='balance'){
          const amount=detail.getByRole('listitem').filter({has:detail.page().getByText(description,{exact:true})}).first().locator('b');
          assert((await amount.innerText()).startsWith('-'));
          assert.equal(await detail.getByText('Cobrança teste mensal',{exact:true}).count(),metric==='balance'?1:0);
          const calculation=detail.getByRole('region',{name:'Resumo do cálculo'});
          const parts=await calculation.locator('dd').allTextContents();
          assert.deepEqual(await calculation.locator('dt').allTextContents(),metric==='profit'?['Cobranças previstas','Custos registados']:['Recebimentos','Pagamentos']);
          const cents=text=>Math.round(Number(text.replace(/[^\d,-]/g,'').replace(',','.'))*100);
          const entries=(await detail.locator('li b').allTextContents()).map(cents);
          assert.deepEqual(parts.map(cents),[entries.reduce((n,v)=>n+Math.max(0,v),0),entries.reduce((n,v)=>n+Math.max(0,-v),0)]);
          assert.equal(await calculation.locator('.finance-equation b').textContent(),parts[0]+' − '+parts[1]+' = '+await card.locator('.stat-value').textContent());
        }
        await p.keyboard.press('Escape');
        assert(await card.evaluate(el=>el===document.activeElement));
      }
    }
    await checkCardDetails();
    await p.getByLabel('Obra das contas',{exact:true}).selectOption('o3');await p.getByRole('heading',{name:'Pintura de moradia',exact:true}).waitFor();
    assert.equal(await p.getByText('Cimento teste por pagar',{exact:true}).count(),0);
    await p.reload();await p.getByRole('heading',{name:'Pintura de moradia',exact:true}).waitFor();assert.equal(await p.getByLabel('Obra das contas').inputValue(),'o3');
    await p.getByRole('link',{name:'Contas mensais',exact:true}).click();await p.getByRole('heading',{name:'Contas por obra',exact:true}).waitFor();
    await p.getByRole('heading',{name:'Custos por categoria',exact:true}).waitFor();
    const expectedMonthly=await p.evaluate(()=>{const s=ProjectFinance.monthly(state,financeRange.from,financeRange.until);return {paid:euro(s.totals.paid),due:euro(s.totals.due)};});
    const monthlyCards=p.getByRole('region',{name:'Resumo de recebimentos e pagamentos'});
    assert.equal(await monthlyCards.locator('.stat-value').nth(2).innerText(),expectedMonthly.due);
    assert.equal(await monthlyCards.locator('.stat-value').nth(3).innerText(),expectedMonthly.paid);
    await p.setViewportSize({width:390,height:844});
    await checkCardDetails();
    assert.equal(await p.getByRole('region',{name:'Lucro estimado e saldo atual'}).locator('.stat').count(),2);
    for(const width of [1440,390]){await p.setViewportSize({width,height:1000});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Contas mensais sem overflow');}
    await p.setViewportSize({width:1440,height:1000});
    await p.getByRole('row').filter({hasText:'Remodelação de apartamento'}).getByRole('button',{name:'Ver contas',exact:true}).click();
    await p.getByLabel('Início do período',{exact:true}).fill(previous);await p.getByLabel('Fim do período',{exact:true}).fill(today);
    const custom=await p.evaluate(()=>ProjectFinance.summary(state,'o1',financeRange.from,financeRange.until));assert.equal(custom.paid,100);
    await p.getByRole('button',{name:'Este mês',exact:true}).click();
    await p.getByRole('button',{name:'Recebimentos',exact:true}).click();assert(await p.locator('#finance-charges').isVisible());
    const output=path.join(os.tmpdir(),'lino-project-finance-screenshots');fs.mkdirSync(output,{recursive:true});
    for(const theme of ['light','dark']){
      await p.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
      for(const width of [1440,768,390]){await p.setViewportSize({width,height:1000});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow ${theme}/${width}`);await p.locator('.finance-filters').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await p.screenshot({path:path.join(output,`obra-financas-${theme}-${width}.png`)});await p.locator('.finance-cost-summary').screenshot({path:path.join(output,`contrato-custos-${theme}-${width}.png`)});}
    }
    await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'+ Despesa',exact:true}).click();await p.getByLabel('Estado do pagamento',{exact:true}).selectOption('paid');assert(await p.evaluate(()=>document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth+1));await p.getByRole('button',{name:'Cancelar',exact:true}).click();
    await p.goto(origin+'/#custos');await p.getByRole('button',{name:'+ Despesa',exact:true}).click();assert.equal(await p.getByLabel('Estado do pagamento',{exact:true}).count(),0);await p.getByRole('button',{name:'Cancelar',exact:true}).click();
    await p.getByLabel('Obra a consultar',{exact:true}).selectOption('o1');
    await p.getByLabel('Mês de consulta',{exact:true}).fill(prevMonth);
    await p.getByRole('button',{name:'Ver contas desta obra',exact:true}).click();await p.getByRole('heading',{name:'Contas da obra'}).waitFor();
    assert.equal(await p.getByLabel('Mês de consulta',{exact:true}).inputValue(),prevMonth);assert.equal(await p.getByLabel('Obra das contas').inputValue(),'o1');
    await p.getByRole('link',{name:'Obras',exact:true}).click();await p.getByRole('row').filter({hasText:'Remodelação de apartamento'}).getByRole('button',{name:'Ver contas',exact:true}).click();await p.getByRole('heading',{name:'Contas da obra'}).waitFor();
    // Financial navigation remains restricted to the administrator.
    const worker=await browser.newPage();await worker.goto(origin);await worker.getByLabel('Utilizador',{exact:true}).fill('antonio');await worker.getByLabel('Palavra-passe',{exact:true}).fill(password);await worker.getByRole('button',{name:'Entrar →'}).click();await worker.locator('main h1').waitFor();
    assert.equal(await worker.getByRole('link',{name:'Contas das obras',exact:true}).count(),0);await worker.goto(origin+'/#contas/o1');assert.equal(await worker.locator('.project-monthly').count(),0);await worker.close();
    assert.equal(await p.locator('nav[aria-label="Menu principal"] a[aria-current="page"]').getAttribute('href'),'#obras');
    const chargesPanel=p.locator('#finance-charges');
    await p.getByRole('button',{name:'Este mês',exact:true}).click();
    await chargesPanel.getByRole('row').filter({hasText:'Cobrança teste mensal'}).getByText('Parcialmente recebida',{exact:true}).waitFor();
    await chargesPanel.getByRole('row').filter({hasText:'Cobrança teste mensal'}).getByRole('button',{name:'Registar recebimento',exact:true}).click();
    await p.getByRole('button',{name:'Guardar',exact:true}).click();await p.locator('dialog').waitFor({state:'hidden'});
    await chargesPanel.getByRole('row').filter({hasText:'Cobrança teste mensal'}).getByText('Recebida',{exact:true}).waitFor();
    await p.getByRole('link',{name:'Contas mensais',exact:true}).click();
    const beforeGeneral=await p.evaluate(()=>ProjectFinance.summary(state,null,financeRange.from,financeRange.until));
    await p.getByRole('button',{name:'+ Custo geral',exact:true}).click();await p.getByLabel('Descrição da despesa',{exact:true}).fill('Gasóleo geral mensal');
    await p.getByLabel('Valor final da despesa (€)',{exact:true}).fill('80');await p.getByLabel('Estado do pagamento',{exact:true}).selectOption('paid');await p.getByLabel('Método do pagamento',{exact:true}).selectOption('Numerário');
    await p.getByRole('button',{name:'Guardar',exact:true}).click();await p.locator('dialog').waitFor({state:'hidden'});
    await p.locator('#finance-general').getByText('Gasóleo geral mensal',{exact:true}).first().waitFor();
    const general=await p.evaluate(()=>ProjectFinance.summary(state,null,financeRange.from,financeRange.until));assert.equal(general.expenses,beforeGeneral.expenses+80);assert.equal(general.paid,beforeGeneral.paid+80);
    await p.reload();await p.locator('#finance-general').getByText('Gasóleo geral mensal',{exact:true}).first().waitFor();
    for(const width of [1440,390]){await p.setViewportSize({width,height:1000});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.locator('#finance-general').screenshot({path:path.join(output,`custos-gerais-${width}.png`)});}

    await p.getByRole('row').filter({hasText:'Remodelação de apartamento'}).getByRole('button',{name:'Ver contas',exact:true}).click();
    assert.equal(await p.getByText('Gasóleo geral mensal',{exact:true}).count(),0);assert.equal(await p.locator('nav[aria-label="Menu principal"] a[aria-current="page"]').getAttribute('href'),'#obras');
    for(const route of ['custos','recebimentos']){
      await p.goto(origin+'/#'+route);
      const cards=p.locator('[data-section-detail]');
      await cards.first().waitFor();
      assert.equal(await cards.count(),4);
      for(const card of await cards.all()){
        const total=await card.locator('.stat-value').textContent();
        await card.click();
        const detail=p.getByRole('dialog');
        assert((await detail.locator('.finance-equation b').textContent()).endsWith(' = '+total));
        await detail.getByRole('button',{name:'Fechar detalhe'}).click();
      }
    }
    const persisted=readState(app.db);assert.equal(persisted.costPayments.length,3);assert.equal(persisted.costs.find(c=>c.description==='Gasóleo teste mensal').project,'o1');
    assert.deepEqual(errors,[]);await browser.close();browser=null;await app.close();app=createApplication({database,origin});assert.equal(readState(app.db).costPayments.length,3);
    console.log('PASS: criação e pagamento na obra, recebimentos, meses distintos, persistência, acessos unificados, filtros por obra/mês/intervalo, permissões, secção global preservada, desktop/mobile e temas claro/escuro.');
  }finally{if(browser)await browser.close();await app.close();const target=path.resolve(dir);assert(target.startsWith(path.resolve(os.tmpdir())+path.sep+'lino-project-finance-'));fs.rmSync(target,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
