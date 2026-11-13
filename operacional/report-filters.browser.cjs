const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApplication}=require('./server.cjs'),{seed}=require('./seed.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lino-report-filters-'));
 const origin='http://127.0.0.1:4193',app=createApplication({database:path.join(dir,'data.sqlite'),origin});
 const password='Report-Filters-2026!';let browser;
 try {
  await seed(app.db,{lino:password,antonio:password,joao:password,rui:password});
  await new Promise(r=>app.server.listen(4193,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/app/');
  await page.getByLabel('Utilizador',{exact:true}).fill('lino');
  await page.getByLabel('Palavra-passe',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Entrar →',exact:true}).click();
  await page.locator('main h1').waitFor();
  for(const section of ['Mapa de horas','Registos de trabalho']){
   await page.getByRole('link',{name:section,exact:true}).click();
   await page.getByRole('heading',{name:section,exact:true}).waitFor();
   await page.getByLabel('Período',{exact:true}).selectOption('day');
   assert.equal(await page.getByLabel('Início do período',{exact:true}).inputValue(),await page.getByLabel('Fim do período',{exact:true}).inputValue());
   const day=await page.getByLabel('Início do período',{exact:true}).inputValue();
   await page.getByRole('button',{name:'Período seguinte',exact:true}).last().click();
   assert.notEqual(await page.getByLabel('Início do período',{exact:true}).inputValue(),day);
   await page.getByRole('button',{name:'Período anterior',exact:true}).first().click();
   assert.equal(await page.getByLabel('Início do período',{exact:true}).inputValue(),day);
   await page.getByLabel('Período',{exact:true}).selectOption('month');
   assert.equal(await page.locator('.report-select-options:visible').count(),0);
   const employee=page.locator('.report-select').filter({has:page.locator('#report-employee-label')});
   const trigger=employee.getByRole('button');
   await trigger.click();
   const checks=employee.getByRole('checkbox');
   await checks.nth(0).check();await checks.nth(1).check();
   assert.equal(await checks.nth(0).isChecked(),true);assert.equal(await checks.nth(1).isChecked(),true);
   assert.equal(await trigger.getAttribute('aria-expanded'),'true');
   assert((await trigger.innerText()).includes(','));
   await checks.nth(1).press('Escape');
   assert.equal(await trigger.getAttribute('aria-expanded'),'false');
   await trigger.press('ArrowUp');
   assert(await checks.last().evaluate(input=>input===document.activeElement));
   await checks.last().press('Escape');
   await page.getByRole('button',{name:/^Aplicar (ao mapa|aos registos)$/}).click();
   assert.equal(await employee.locator('input:checked').count(),2);
   await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
   assert.equal(await page.locator('.report-select input:checked').count(),0);
   await page.getByLabel('Início do período',{exact:true}).fill('2026-10-13');
   await page.getByLabel('Fim do período',{exact:true}).fill('2026-10-14');
   await page.getByRole('button',{name:/^Aplicar (ao mapa|aos registos)$/}).click();
   if(section==='Mapa de horas'){
    const download=page.waitForEvent('download');
    await page.getByRole('button',{name:'Exportar detalhe CSV',exact:true}).click();
    const csv=await download;
    assert.equal(csv.suggestedFilename(),'lino-horas-detalhe-2026-10-13-2026-10-14.csv');
    const text=fs.readFileSync(await csv.path(),'utf8');
    assert(text.includes('2026-10-13'));assert(!text.includes('2026-10-12'));
   }else{
    assert.equal(await page.getByText('5 registo(s) · 32h',{exact:true}).count(),0);
    assert(await page.locator('.work-filter-panel > small').innerText().then(text=>text.startsWith('2 registo(s)')));
   }
   for(const theme of ['light','dark']){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    for(const width of [1440,390]){
     await page.setViewportSize({width,height:1000});
     await page.waitForTimeout(100);
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),section+' overflow '+width+' '+await page.evaluate(()=>JSON.stringify([...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>[el.tagName,el.className,Math.round(el.getBoundingClientRect().right)]).slice(0,16))));
     if(width===1440){
      const panel=await page.locator('.report-filters').boundingBox(),dates=await page.locator('.report-period-controls .period-date-range').boundingBox();
      assert(dates.x+dates.width>panel.x+panel.width-2,'Dates aligned right');
      assert(panel.height<160,'Compact filter panel');
      const left=await page.locator('.report-select-input').first().boundingBox(),right=await page.getByLabel('Fim do período',{exact:true}).boundingBox();
      assert(Math.abs(left.y-right.y)<2,'All filters on a single desktop row');
      const actions=await page.locator('.report-filter-actions').boundingBox();
      assert.equal(await page.locator('.report-filters [data-report-step]').count(),0);
      const controls=page.locator('.panel-head .table-period');
      assert.equal(await controls.count(),section==='Mapa de horas'?3:2);
      const periods=await controls.locator('strong').allTextContents();
      assert.equal(new Set(periods).size,1,'All tables show the same applied range');
      assert(actions.y>=left.y+left.height,'Apply and clear below fields');
     }
     await trigger.click();
     const bounds=await employee.locator('.report-select-options').boundingBox();
     assert(bounds.x>=0&&bounds.x+bounds.width<=width,section+' dropdown overflow');
     await page.locator('main h1').click();
     assert.equal(await trigger.getAttribute('aria-expanded'),'false');
     for(const control of await page.locator('.report-select').all()){
      await control.getByRole('button').click();
      const popup=await control.locator('.report-select-options').boundingBox();
      assert(popup.x>=0&&popup.x+popup.width<=width,'All dropdowns stay inside viewport');
      await page.locator('main h1').click();
     }
     await page.screenshot({path:path.join(dir,`report-${section==='Mapa de horas'?'hours':'work'}-${theme}-${width}.png`),fullPage:true});
     if(process.env.REPORT_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.REPORT_SCREENSHOT_DIR,`report-${section==='Mapa de horas'?'hours':'work'}-${theme}-${width}.png`),fullPage:true});
    }
   }
   await page.setViewportSize({width:1440,height:1000});
  }
  // Both pages share period navigation, including ISO weeks across years.
  for(const [section,kind] of [['Mapa de horas','hours'],['Registos de trabalho','work']]){
  await page.getByRole('link',{name:section,exact:true}).click();
  const navigation=page.getByRole('region',{name:kind==='hours'?'Navegação do período do mapa de horas':'Navegação do período dos registos',exact:true});
  assert.equal(await navigation.count(),1);
  assert(await navigation.evaluate(bar=>bar.getBoundingClientRect().bottom<=document.querySelector('.hours-filter-panel, .work-filter-panel').getBoundingClientRect().top));
  const now=await page.evaluate(()=>today());
  const ranges=await page.evaluate(date=>Object.fromEntries(['month','week','day'].map(mode=>[mode,HoursReport.period(mode,date)])),now);
  const employee=page.locator('.report-select').filter({has:page.locator('#report-employee-label')});
  await employee.getByRole('button').click();await employee.getByRole('checkbox').first().check();
  await page.getByRole('button',{name:/^Aplicar (ao mapa|aos registos)$/}).click();
  for(const [mode,label,inputLabel,value,from,until] of [
   ['month','Este mês','Mês de consulta','2026-12','2026-12-01','2026-12-31'],
   ['week','Esta semana','Semana de consulta','2026-W53','2026-12-28','2027-01-03'],
   ['day','Hoje','Dia de consulta','2026-12-31','2026-12-31','2026-12-31']
  ]){
   await page.getByLabel('Período',{exact:true}).selectOption(mode);
   assert.equal(await navigation.getByRole('button',{name:label,exact:true}).count(),1);
   await navigation.getByLabel(inputLabel,{exact:true}).fill(value);
   assert.equal(await page.getByLabel('Início do período',{exact:true}).inputValue(),from);
   assert.equal(await page.getByLabel('Fim do período',{exact:true}).inputValue(),until);
   await navigation.getByRole('button',{name:'Período seguinte',exact:true}).click();
   assert.notEqual(await page.getByLabel('Início do período',{exact:true}).inputValue(),from);
   await navigation.getByRole('button',{name:'Período anterior',exact:true}).click();
   assert.equal(await page.getByLabel('Início do período',{exact:true}).inputValue(),from);
   await navigation.getByRole('button',{name:label,exact:true}).click();
   assert.equal(await page.getByLabel('Início do período',{exact:true}).inputValue(),ranges[mode].from);
   assert.equal(await page.getByLabel('Fim do período',{exact:true}).inputValue(),ranges[mode].until);
   assert.equal(await employee.locator('input:checked').count(),1,'Period controls preserve employee selection');
  }
  await navigation.getByRole('button',{name:'Todas as datas',exact:true}).click();
  assert.equal(await page.getByLabel('Início do período',{exact:true}).inputValue(),'');
  assert.equal(await page.getByLabel('Fim do período',{exact:true}).inputValue(),'');
  assert(await page.locator('.panel-head .table-period strong').evaluateAll(labels=>labels.every(label=>label.textContent==='Todas as datas')));
  await page.getByRole('button',{name:/^Aplicar (ao mapa|aos registos)$/}).click();
  assert.equal(await page.getByLabel('Início do período',{exact:true}).inputValue(),'');
  if(kind==='hours'){
   assert(await page.locator('.hours-grid').count()>0,'All dates includes historical work outside the current period');
   const download=page.waitForEvent('download');
   await page.getByRole('button',{name:'Exportar detalhe CSV',exact:true}).click();
   const csv=await download;
   assert.equal(csv.suggestedFilename(),'lino-horas-detalhe-todas-as-datas.csv');
   assert(fs.readFileSync(await csv.path(),'utf8').includes('2026-10-12'));
  }
  await navigation.getByRole('button',{name:'Hoje',exact:true}).click();
  assert.equal(await page.getByLabel('Início do período',{exact:true}).inputValue(),now);

  }

  // A shortcut may offer a return; leaving work or selecting its menu clears it.
  const openAccountsWork=async()=>{
   await page.getByRole('link',{name:'Obras',exact:true}).click();
   await page.locator('#directory-results-obras [data-action="project-costs"]').first().click();
   await page.getByRole('button',{name:'Toda a obra',exact:true}).click();
   await page.locator('[data-finance-tab="labour"]').click();
   await page.locator('#finance-labour .labour-by-employee [data-work-employee]').first().click();
   await page.getByRole('heading',{name:'Registos de trabalho',exact:true}).waitFor();
   await page.getByRole('link',{name:'Voltar às contas',exact:true}).waitFor();
  };
  await openAccountsWork();
  await page.getByLabel('Período',{exact:true}).selectOption('week');
  assert.equal(await page.getByRole('link',{name:'Voltar às contas',exact:true}).count(),1);
  await page.getByRole('link',{name:'Visão geral',exact:true}).click();
  await page.getByRole('link',{name:'Registos de trabalho',exact:true}).click();
  assert.equal(await page.getByRole('link',{name:'Voltar às contas',exact:true}).count(),0);
  await openAccountsWork();
  await page.getByRole('link',{name:'Registos de trabalho',exact:true}).click();
  assert.equal(await page.getByRole('link',{name:'Voltar às contas',exact:true}).count(),0);
  for(const theme of ['light','dark'])for(const width of [1440,390]){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await page.setViewportSize({width,height:1000});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Work period navigation fits '+width);
   if(process.env.REPORT_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.REPORT_SCREENSHOT_DIR,`work-navigation-${theme}-${width}.png`),fullPage:true});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: multi-selection, work/hours period navigation (month/week/day/all), ISO year boundary, shortcut return lifetime, light/dark, desktop/mobile, no browser errors.');
 }finally{
  if(browser)await browser.close();await app.close();
  assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'lino-report-filters-'));
  fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
