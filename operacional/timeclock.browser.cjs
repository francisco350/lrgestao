const assert=require('node:assert/strict');
module.exports=async({a,m,w})=>{
 const p=w.p;
 await p.getByLabel('Atualizar dados',{exact:true}).click();await p.getByRole('link',{name:'Picar o ponto',exact:true}).click();await p.getByRole('button',{name:'Iniciar trabalho',exact:true}).waitFor();
 assert.equal(await p.getByLabel('Obra para picar o ponto').locator('option').count(),1);
 await p.getByRole('button',{name:'Iniciar trabalho',exact:true}).click();await p.getByRole('button',{name:'Iniciar pausa',exact:true}).waitFor();
 await p.reload();await p.getByRole('button',{name:'Iniciar pausa',exact:true}).waitFor();
 await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:'future-clock-mobile.png',fullPage:true});
 await p.getByRole('button',{name:'Iniciar pausa',exact:true}).click();await p.getByRole('button',{name:'Retomar trabalho',exact:true}).waitFor();
 await p.reload();await p.getByRole('button',{name:'Retomar trabalho',exact:true}).waitFor();await p.getByRole('button',{name:'Retomar trabalho',exact:true}).click();await p.getByRole('button',{name:'Iniciar pausa',exact:true}).waitFor();
 await p.getByRole('button',{name:'Terminar turno',exact:true}).click();await p.getByLabel('Trabalho realizado / observação').fill('Ponto de demonstração');await p.getByRole('button',{name:'Guardar',exact:true}).click();await p.locator('dialog').waitFor({state:'hidden'});await p.getByRole('table').getByText('Por validar',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Validar turno',exact:true}).count(),0);
 await m.p.getByLabel('Atualizar dados',{exact:true}).click();await m.p.getByRole('link',{name:'Picar o ponto',exact:true}).click();await m.p.getByRole('button',{name:'Validar turno',exact:true}).waitFor();await m.p.screenshot({path:'future-clock.png',fullPage:true});
 await m.p.getByRole('button',{name:'Rejeitar turno',exact:true}).click();await m.p.getByLabel('Motivo da rejeição').fill('Teste de apresentação, sem trabalho real.');await m.p.getByRole('button',{name:'Guardar',exact:true}).click();await m.p.locator('dialog').waitFor({state:'hidden'});await m.p.getByText('Rejeitado',{exact:true}).waitFor();
 await p.getByLabel('Atualizar dados',{exact:true}).click();await p.getByText('Rejeitado',{exact:true}).waitFor();await p.getByRole('button',{name:'Detalhes',exact:true}).click();await p.getByRole('heading',{name:'Detalhes do ponto'}).waitFor();await p.getByRole('cell',{name:'Início de pausa',exact:true}).waitFor();await p.getByRole('button',{name:'Fechar',exact:true}).last().click();
 await p.setViewportSize({width:1440,height:1000});await a.p.getByLabel('Atualizar dados',{exact:true}).click();
 console.log('PASS: picagem por conta e obra, persistência de turno e pausa, saída, decisão do encarregado, histórico e telemóvel.');
};
