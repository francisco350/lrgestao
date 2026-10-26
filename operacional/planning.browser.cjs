const assert=require('node:assert/strict');
module.exports=async({a,m,w})=>{
 const p=a.p;
 await p.getByRole('link',{name:'Planeamento semanal',exact:true}).click();await p.getByLabel('Semana de referência').fill('2026-10-21');await p.getByRole('button',{name:'Aplicar ao planeamento',exact:true}).click();
 await p.getByRole('button',{name:'+ Planear trabalho',exact:true}).click();await p.getByLabel('Obra planeada',{exact:true}).selectOption('o1');
 await p.getByLabel('António Ferreira',{exact:true}).check();await p.getByLabel('João Martins',{exact:true}).check();
 for(const el of await p.locator('[name="planDates"]').all())await el.uncheck();
 await p.getByLabel('21/10/2026',{exact:true}).check();await p.getByLabel('22/10/2026',{exact:true}).check();await p.getByLabel('Trabalho previsto').fill('Preparação de paredes · teste');
 await p.getByRole('button',{name:'Guardar',exact:true}).click();await p.locator('dialog').waitFor({state:'hidden'});assert.equal(await p.locator('.plan-card').count(),4);
 for(const user of [m,w]){
  await user.p.getByLabel('Atualizar dados',{exact:true}).click();await user.p.getByRole('link',{name:'Planeamento semanal',exact:true}).click();await user.p.getByLabel('Semana de referência').fill('2026-10-21');await user.p.getByRole('button',{name:'Aplicar ao planeamento',exact:true}).click();
 }
 assert.equal(await w.p.locator('.plan-card').count(),2);assert.equal(await w.p.getByRole('button',{name:'+ Planear trabalho',exact:true}).count(),0);assert.equal(await w.p.getByRole('button',{name:'Editar',exact:true}).count(),0);
 const first=m.p.locator('.plan-card').filter({hasText:'João Martins'}).first();await first.getByRole('button',{name:'Editar',exact:true}).click();await m.p.getByLabel('Saída prevista',{exact:true}).fill('16:00');await m.p.getByRole('button',{name:'Guardar',exact:true}).click();await m.p.locator('dialog').waitFor({state:'hidden'});assert((await first.innerText()).includes('08:00–16:00'));
 await p.getByLabel('Atualizar dados',{exact:true}).click();await p.getByRole('button',{name:'+ Planear trabalho',exact:true}).click();await p.getByLabel('João Martins',{exact:true}).check();for(const el of await p.locator('[name="planDates"]').all())await el.uncheck();await p.getByLabel('21/10/2026',{exact:true}).check();await p.getByRole('button',{name:'Guardar',exact:true}).click();await p.getByText('O funcionário já tem trabalho planeado nesse horário. Confirme a disponibilidade com o responsável.',{exact:true}).waitFor();await p.getByRole('button',{name:'Cancelar',exact:true}).last().click();assert.equal(await p.locator('.plan-card').count(),4);
 await p.screenshot({path:'future-planning.png',fullPage:true});
 await w.p.getByLabel('Atualizar dados',{exact:true}).click();await w.p.setViewportSize({width:390,height:844});assert(await w.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await w.p.screenshot({path:'future-planning-mobile.png',fullPage:true});
 await first.getByRole('button',{name:'Cancelar',exact:true}).click();await m.p.getByLabel('Motivo do cancelamento').fill('Alteração de sequência');await m.p.getByRole('button',{name:'Guardar',exact:true}).click();await m.p.locator('dialog').waitFor({state:'hidden'});
 await w.p.getByLabel('Atualizar dados',{exact:true}).click();await w.p.waitForFunction(()=>document.querySelectorAll('.plan-card').length===1,null,{timeout:10000});assert.equal(await w.p.locator('.plan-card').count(),1);await w.p.getByLabel('Estado do planeamento',{exact:true}).selectOption('all');await w.p.getByRole('button',{name:'Aplicar ao planeamento',exact:true}).click();assert.equal(await w.p.locator('.plan-card').count(),2);await w.p.getByText('Motivo: Alteração de sequência',{exact:true}).waitFor();
 await p.getByLabel('Atualizar dados',{exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('.plan-card').length===3,null,{timeout:10000});await p.getByLabel('Estado do planeamento',{exact:true}).selectOption('all');await p.getByRole('button',{name:'Aplicar ao planeamento',exact:true}).click();await p.locator('.plan-cancelled').getByRole('button',{name:'Detalhes',exact:true}).click();await p.getByRole('cell',{name:'Alteração',exact:true}).waitFor();await p.getByRole('button',{name:'Fechar',exact:true}).last().click();
 await w.p.setViewportSize({width:1440,height:1000});
 console.log('PASS: planeamento em lote, acessos por perfil, edição, conflitos, cancelamento com histórico e telemóvel.');
};
