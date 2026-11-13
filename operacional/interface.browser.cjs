const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApplication}=require('./server.cjs'),{seed}=require('./seed.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lino-interface-'));
 const output=path.resolve('..','outputs','interface-review');fs.mkdirSync(output,{recursive:true});
 const app=createApplication({database:path.join(dir,'data.sqlite'),origin:'http://127.0.0.1:4195'});
 let browser;
 try{
  const password='Interface-Review-2026!';await seed(app.db,{lino:password,antonio:password,joao:password,rui:password});
  await new Promise(r=>app.server.listen(4195,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4195/app/');
  await page.getByLabel('Utilizador',{exact:true}).fill('lino');await page.getByLabel('Palavra-passe',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Entrar →',exact:true}).click();await page.locator('main h1').waitFor();
  const routes=await page.evaluate(()=>[...document.querySelectorAll('.sidebar nav a')].map(a=>a.hash).concat('#obras/contas'));
  await page.evaluate(()=>{
   const p=state.projects[0];
   p.budget=9876543210.99;
   p.name='Remodelação completa de apartamentos e espaços comerciais no centro histórico';
   p.client='Sociedade de Construção e Reabilitação Urbana';
   p.city='Vila Nova de Famalicão';
  });
  const findings=[];
  for(const width of [1440,1280,1024,800,390]){
   await page.setViewportSize({width,height:1000});
   for(const route of routes){
    await page.evaluate(route=>{location.hash=route;render();},route);await page.waitForTimeout(100);
    const info=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,tables:document.querySelectorAll('.table-wrap').length,unlabelled:[...document.querySelectorAll('main input:not([type=hidden]), main select, main textarea')].filter(e=>!e.labels?.length&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')).map(e=>e.id||e.name)}));
    findings.push({width,route,...info});
    const invalidHeaders=await page.locator('.table-wrap:not(.mobile-records):visible thead th').evaluateAll(headers=>headers.filter(th=>{
     const style=getComputedStyle(th);
     return style.textAlign!=='left' || style.whiteSpace!=='nowrap' || th.scrollWidth>th.clientWidth+1;
    }).map(th=>th.textContent));
    assert.deepEqual(invalidHeaders,[], 'Cabeçalhos a '+width+' px em '+route);
    const brokenCells=await page.locator('.table-wrap:visible').evaluateAll(wrappers=>wrappers.flatMap(w=>{
     const failures=[];
     for(const cell of w.querySelectorAll('tbody [data-column="actions"]')){
      const buttons=[...cell.querySelectorAll('.btn')].filter(b=>b.getClientRects().length);
      if(buttons.some((b,i)=>i && (Math.abs(b.getBoundingClientRect().top-buttons[0].getBoundingClientRect().top)>1 || b.getBoundingClientRect().left<buttons[i-1].getBoundingClientRect().right))) failures.push('Ações empilhadas: '+cell.innerText);
      if(buttons.some(b=>b.getBoundingClientRect().right>w.getBoundingClientRect().right-15)) failures.push('Margem direita das ações: '+cell.innerText);
     }
     for(const cell of w.querySelectorAll('tbody [data-column="amount"], tbody [data-column="status"]')){
      const walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
       if(!walker.currentNode.textContent.trim())continue;
       const range=document.createRange();range.selectNodeContents(walker.currentNode);
       if(range.getClientRects().length>1) failures.push('Valor ou estado dividido: '+cell.innerText);
      }
      if(cell.scrollWidth>cell.clientWidth+1) failures.push('Valor ou estado cortado: '+cell.innerText);
     }
     return failures;
    }));
    assert.deepEqual(brokenCells,[], 'Valores, estados e ações a '+width+' px em '+route);
    if(route==='#pagamentos' && width>760){
     const shares=await page.locator('.payroll-summary').evaluate(t=>Array.from(t.tHead.rows[0].cells,c=>c.offsetWidth/t.offsetWidth));
     assert(shares[0]<0.36 && shares.slice(1).every(share=>share>0.14),JSON.stringify(shares));
    }
    if(route==='#obras'){
     const row=page.locator('#directory-results-obras tbody tr').first();
     const layout=await row.evaluate(tr=>{
      const [name,client]=tr.cells[0].children;
      const badge=tr.cells[3].querySelector('.badge').getBoundingClientRect();
      const amount=tr.cells[4];
      if(amount.scrollWidth>amount.clientWidth+1 || !amount.textContent.replace(/\s/g,'').includes('9876543210,99'))throw Error(JSON.stringify({width:innerWidth,scroll:amount.scrollWidth,client:amount.clientWidth,value:amount.textContent,layout:amount.closest('.table-wrap').className}));
      return {height:tr.clientHeight,stacked:client.getBoundingClientRect().top>=name.getBoundingClientRect().bottom,
       gap:tr.cells[3].getBoundingClientRect().right-badge.right};
     });
     assert(layout.height>=70 && (width<=760 || layout.height<=72) && layout.stacked && layout.gap>=14, JSON.stringify(layout));
     const actions=page.locator('tbody .row-actions').first();
     const buttons=await actions.locator('button').evaluateAll(items=>items.map(el=>el.getBoundingClientRect().top));
     assert.equal(buttons.length,3);
     assert(Math.max(...buttons)-Math.min(...buttons)<2,'All three project actions on one line');
    }
    {
     const clipped=await page.locator('.table-wrap:visible').evaluateAll(wrappers=>wrappers.filter(w=>w.scrollWidth>w.clientWidth+1).map(w=>({width:w.clientWidth,scroll:w.scrollWidth, cols:[...w.querySelectorAll('tbody tr:first-child td')].map(c=>[c.textContent,c.offsetWidth])})));
     assert.deepEqual(clipped,[],`Horizontal scroll inside tables at ${width} on ${route}`);
    }
    if (width===1280 && ['#clientes','#custos'].includes(route)) {
     const table=page.locator('table').first();
     const widths=await table.evaluate(t=>{
      const header=t.tHead.rows[0],row=t.tBodies[0].rows[0];
      const name=header.querySelector('[data-column="identity"]');
      const amounts=Array.from(header.querySelectorAll('[data-column="amount"]'));
      const last=row.cells[row.cells.length-1],button=last.querySelector('.btn:last-child');
      return {name:name.offsetWidth, largest:Math.max(...amounts.map(th=>th.offsetWidth)),
       margin:button.getBoundingClientRect().left-last.getBoundingClientRect().left};
     });
     assert(widths.name>widths.largest && Math.abs(widths.margin-parseFloat(await table.locator('tbody tr:first-child td:last-child').evaluate(td=>getComputedStyle(td).paddingLeft)))<=1,route+JSON.stringify(widths));
     await table.screenshot({path:path.join(output,route.slice(1)+'-alinhamento.png')});
    }
    if(route==='#obras'&&width===390){
     const wrap=page.locator('#directory-results-obras .table-wrap');
     assert(await wrap.evaluate(w=>w.classList.contains('mobile-records')));
     await wrap.locator('tbody tr').first().screenshot({path:path.join(output,'obra-telemovel.png')});
     await page.setViewportSize({width:1280,height:1000});
     await page.waitForFunction(()=>!document.querySelector('#directory-results-obras .table-wrap').classList.contains('mobile-records'));
     await page.setViewportSize({width:390,height:1000});
    }
    if(route==='#obras'&&width===1280)await page.screenshot({path:path.join(output,'obras-1280.png'),fullPage:true});
    if(['#trabalho','#obras/contas','#resumo'].includes(route))await page.screenshot({path:path.join(output,`${route.slice(1).replaceAll('/','-')}-${width}.png`),fullPage:true});
    assert(!info.overflow,`Page overflow ${width} ${route}`);
   }
  }
  await page.setViewportSize({width:800,height:900});
  await page.evaluate(()=>{
   state.historicalImport={'Pagamentos a funcionários':[{values:['F1','2026-10','António Ferreira',12,132,130,2,1584,1584,0]}]};
   location.hash='#importados'; render();
  });
  await page.locator('main details').first().locator('summary').click();
  const imported=page.locator('main details[open] .table-wrap');
  await page.waitForFunction(()=>document.querySelector('main details[open] .table-wrap')?.hasAttribute('tabindex'));
  assert(await imported.evaluate(w=>w.scrollWidth<=w.clientWidth+1),await imported.evaluate(w=>JSON.stringify([w.clientWidth,w.scrollWidth,[...w.querySelectorAll('th')].map(th=>[th.textContent,th.offsetWidth])] )));
  await page.setViewportSize({width:1024,height:900});
  await page.evaluate(()=>{
   location.hash='#horas'; hoursScope();
   hoursFilter={...hoursFilter,mode:'month',date:'2026-10-01',from:'2026-10-01',until:'2026-10-31'};
   render();
  });
  const grids=page.locator('.hours-grid');
  assert.equal(await grids.count(),5,'All 31 days are available in five blocks');
  assert.equal(await grids.locator('thead th small').count(),31);
  assert(await grids.evaluateAll(grids=>grids.every(w=>w.scrollWidth<=w.clientWidth+1)));
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{
   state.inventory=Array.from({length:25},(_,i)=>({id:'lot-'+i,description:i%2?'Cimento':'Aço galvanizado '+i,date:'2026-11-01',quantity:10,available:5,unit:'kg',unitPrice:2}));
   state.historicalImport={...state.historicalImport,Artigos:Array.from({length:20},(_,i)=>({values:['ART'+i,i%2?'Tijolo':'Areia','Material',5]}))};
   location.hash='#inventario';render();
  });
  await page.waitForTimeout(200);
  const stock=page.locator('#directory-results-inventario .table-wrap');
  const geometry=await stock.evaluate(w=>({height:w.clientHeight,total:w.scrollHeight,row10:w.querySelector('tbody tr:nth-child(10)').getBoundingClientRect().bottom-w.querySelector('table').getBoundingClientRect().top}));
  assert(geometry.total>geometry.height);assert(Math.abs(geometry.height-Math.min(geometry.row10,650))<4,'Ten real rows visible');
  await stock.scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);await stock.hover();await page.mouse.wheel(0,350);await page.waitForTimeout(120);
  assert(await stock.evaluate(w=>w.scrollTop>0));assert.equal(await page.evaluate(()=>scrollY),before,'Wheel stays in table');
  assert.equal(await stock.locator('thead th').first().evaluate(th=>getComputedStyle(th).position),'sticky');
  await stock.evaluate(w=>w.scrollTop=w.scrollHeight);await page.mouse.wheel(0,500);await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>scrollY),before,'No scroll chaining at bottom');
  await stock.focus();await stock.press('Home');await stock.press('ArrowUp');
  await page.getByRole('searchbox',{name:'Pesquisar materiais em stock',exact:true}).fill('aco');await page.waitForTimeout(100);
  assert.equal(await page.locator('#directory-results-inventario tbody tr').count(),13);
  assert.equal(await page.locator('#directory-results-artigos-importados tbody tr').count(),20);
  await page.getByRole('searchbox',{name:'Pesquisar artigos importados',exact:true}).fill('tijolo');assert.equal(await page.locator('#directory-results-artigos-importados tbody tr').count(),10);
  await page.getByRole('searchbox',{name:'Pesquisar materiais em stock',exact:true}).fill('sem-correspondencia');assert(await page.locator('#directory-results-inventario').innerText().then(t=>t.includes('Sem resultados')));
  await page.locator('.directory-search').filter({has:page.getByRole('searchbox',{name:'Pesquisar materiais em stock',exact:true})}).getByRole('button',{name:'Limpar pesquisa'}).click();
  assert.equal(await page.getByRole('searchbox',{name:'Pesquisar artigos importados',exact:true}).inputValue(),'tijolo');
  assert.equal(await page.locator('[id]').evaluateAll(nodes=>nodes.length-new Set(nodes.map(n=>n.id)).size),0,'No duplicated IDs');
  for(const theme of ['light','dark'])for(const width of [1440,390]){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:1000});await page.waitForTimeout(150);await page.evaluate(()=>scrollTo(0,0));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:path.join(output,`inventory-${theme}-${width}.png`),fullPage:true});
  }
  await page.emulateMedia({media:'print'});assert.equal(await stock.evaluate(w=>getComputedStyle(w).maxHeight),'none');await page.emulateMedia({media:'screen'});
  await page.evaluate(()=>{
   const entry={...state.entries[0],status:'pending',mode:'hours',start:'08:00',end:'17:30',pause:60,note:'Observação de teste'};
   state.entries=[entry];
   document.querySelector('main').innerHTML=projectWorkTable([entry])+labourCostPanel();
  });
  for(const width of [1280,1024,800,390]){
   await page.setViewportSize({width,height:900});
   await page.waitForTimeout(150);
   const work=page.locator('.work-team-table tbody tr').first();
   assert(await work.evaluate(row=>{
    const date=row.cells[0],description=row.cells[2];
    return date.scrollWidth<=date.clientWidth+1 && date.querySelector('small').textContent.includes('08:00–17:30') &&
     date.querySelector('small').getBoundingClientRect().top>=date.querySelector('strong').getBoundingClientRect().bottom &&
     description.querySelector('summary').getBoundingClientRect().top>=description.querySelector('strong').getBoundingClientRect().bottom;
   }), 'Data, horário e observação a '+width);
   const labour=page.locator('.labour-by-employee tbody tr').first();
   assert(await labour.evaluate(row=>{
    const wrap=row.closest('.table-wrap'),actions=row.querySelector('.row-actions'),buttons=[...actions.querySelectorAll('button,a')];
    return [4,5,6].every(i=>getComputedStyle(row.cells[i].querySelector('small')).display==='block') &&
     buttons.length===3 && buttons.every(b=>b.getBoundingClientRect().right<=wrap.getBoundingClientRect().right-7) &&
     wrap.scrollWidth<=wrap.clientWidth+1;
   }), 'Montantes, horas e três ações a '+width+' '+await labour.evaluate(row=>JSON.stringify({wrap:[row.closest('.table-wrap').clientWidth,row.closest('.table-wrap').scrollWidth],cells:[...row.cells].map(c=>[c.innerText,c.offsetWidth])})));
  }
  await page.evaluate(()=>{
   const project=state.projects[0].id;
   state.costs.push({id:'layout-material',project,date:financeRange.until||today(),kind:'material',category:'Construção',description:'Material de revestimento exterior',supplier:'Fornecedor de materiais de construção',quantity:3,unit:'m²',unitPrice:12,amount:36});
   document.querySelector('main').innerHTML=projectFinanceView(project);
  });
  for(const width of [1440,1280,1024,800,390]){
   await page.setViewportSize({width,height:900});
   await page.waitForTimeout(100);
   const cell=page.locator('#finance-costs td').filter({hasText:'Fornecedor de materiais de construção'}).first();
   assert(await cell.evaluate(td=>td.querySelector('small').getBoundingClientRect().top>=td.querySelector('strong').getBoundingClientRect().bottom),'Fornecedor sob a descrição');
   const overflow=await page.locator('.project-monthly .table-wrap:visible').evaluateAll(ws=>ws.filter(w=>w.scrollWidth>w.clientWidth+1).map(w=>w.closest('.panel')?.querySelector('h2')?.textContent));
   assert.deepEqual(overflow,[],'Contas da obra a '+width);
  }
  fs.writeFileSync(path.join(output,'audit.json'),JSON.stringify(findings,null,2));
  assert.deepEqual(errors,[]);console.log(`PASS: ${routes.length} routes at 1440/1280/1024/800/390px; 10 rows, internal wheel, sticky headers, independent searches, accents, empty/clear, light/dark, print, no JS errors. Screenshots: ${output}`);
 }finally{if(browser)await browser.close();await app.close();assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'lino-interface-'));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});


