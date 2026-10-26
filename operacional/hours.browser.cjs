const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({a,m,w})=>{
 const p=a.p;
 await p.getByRole('link',{name:'Mapa de horas',exact:true}).click();await p.getByRole('heading',{name:'Mapa de horas',exact:true}).waitFor();
 await p.getByLabel('Período do mapa',{exact:true}).selectOption('week');await p.getByLabel('Data de referência',{exact:true}).fill('2026-10-14');await p.getByRole('button',{name:'Aplicar ao mapa',exact:true}).click();
 const summary=p.locator('.panel').filter({has:p.getByRole('heading',{name:'Resumo por funcionário e obra',exact:true})});
 assert((await summary.innerText()).includes('João Martins'));assert((await summary.innerText()).includes('António Ferreira'));
 await p.getByLabel('Funcionário no mapa',{exact:true}).selectOption('e2');await p.getByLabel('Obra no mapa',{exact:true}).selectOption('o1');await p.getByRole('button',{name:'Aplicar ao mapa',exact:true}).click();assert.equal(await summary.getByRole('row').count(),2);
 const row=summary.getByRole('row').filter({hasText:'João Martins'});assert((await row.innerText()).includes('16h'));assert((await row.innerText()).includes('4h'));
 // A manual validated day + browser manual record + corrected clock entry, once each.
 const downloadText=async label=>{const event=p.waitForEvent('download');await p.getByRole('button',{name:label,exact:true}).click();const d=await event;return {name:d.suggestedFilename(),text:fs.readFileSync(await d.path(),'utf8')};};
 const csv=await downloadText('Exportar resumo CSV');assert.equal(csv.name,'lino-horas-resumo-2026-10-12-2026-10-18.csv');assert(csv.text.includes('"960";"16:00";"240";"4:00"'));assert(!csv.text.includes('António'));
 const detail=await downloadText('Exportar detalhe CSV');assert(detail.text.includes('17/10')||detail.text.includes('2026-10-17'));assert(detail.text.includes('Manual'));assert(detail.text.includes('Ponto'));assert(!detail.text.includes('Substituído'));
 await p.getByRole('button',{name:'Seguinte →',exact:true}).click();await p.getByText('19/10/2026 — 25/10/2026',{exact:true}).waitFor();await p.getByRole('button',{name:'← Anterior',exact:true}).click();await p.getByText('12/10/2026 — 18/10/2026',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Limpar filtros',exact:true}).click();await p.getByLabel('Período do mapa',{exact:true}).selectOption('month');await p.getByRole('button',{name:'Aplicar ao mapa',exact:true}).click();await p.getByText('01/10/2026 — 31/10/2026',{exact:true}).waitFor();await p.screenshot({path:'future-hours.png',fullPage:true});
 await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:'future-hours-mobile.png',fullPage:true});await p.setViewportSize({width:1440,height:1000});
 for(const user of [m,w]){
  await user.p.getByLabel('Atualizar dados',{exact:true}).click();await user.p.getByRole('link',{name:'Mapa de horas',exact:true}).click();
  await user.p.getByLabel('Data de referência',{exact:true}).fill('2026-10-14');await user.p.getByRole('button',{name:'Aplicar ao mapa',exact:true}).click();
  assert.equal(await user.p.getByLabel('Obra no mapa',{exact:true}).locator('option[value="o3"]').count(),0);
 }
 assert.equal(await w.p.getByLabel('Funcionário no mapa',{exact:true}).locator('option[value="e1"]').count(),0);
 const workerDownload=w.p.waitForEvent('download');await w.p.getByRole('button',{name:'Exportar resumo CSV',exact:true}).click();const workerCsv=fs.readFileSync(await (await workerDownload).path(),'utf8');assert(workerCsv.includes('João Martins'));assert(!workerCsv.includes('António'));assert(!workerCsv.includes('Rui Almeida'));
 await w.p.setViewportSize({width:390,height:844});assert(await w.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await w.p.setViewportSize({width:1440,height:1000});
 await p.getByLabel('Data de referência',{exact:true}).fill('2027-01-01');await p.getByRole('button',{name:'Aplicar ao mapa',exact:true}).click();await p.getByText('Sem registos neste período e nos filtros selecionados.',{exact:true}).waitFor();
 console.log('PASS: mapas semanal/mensal, filtros combinados, totais de correção, CSV de resumo/detalhe, permissões e apresentação móvel.');
};
