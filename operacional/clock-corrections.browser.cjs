const assert=require('node:assert/strict');
module.exports=async({a,m,w})=>{
 const p=w.p;
 await p.getByRole('link',{name:'Picar o ponto',exact:true}).click();
 await p.getByRole('button',{name:'Pedir correção',exact:true}).click();
 // Replace the second-long test intervals with one meaningful past work period.
 while(await p.locator('#clock-periods>fieldset').count()>1)await p.getByRole('button',{name:'Remover período',exact:true}).last().click();
 await p.getByLabel('Entrada do período 1',{exact:true}).fill('2026-10-17T08:00');
 await p.getByLabel('Saída do período 1',{exact:true}).fill('2026-10-17T12:00');
 await p.getByLabel('Motivo da correção',{exact:true}).fill('Esqueci-me de marcar a saída na obra.');
 await p.getByLabel('Descrição corrigida do trabalho',{exact:true}).fill('Correção de ponto de teste');
 await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await p.screenshot({path:'future-clock-correction-mobile.png',fullPage:true});
 await p.getByRole('button',{name:'Guardar',exact:true}).click();await p.locator('dialog').waitFor({state:'hidden'});
 await p.getByText('Correção por decidir',{exact:true}).waitFor();await p.reload();await p.getByRole('button',{name:'Rever correção',exact:true}).waitFor();
 await p.getByRole('button',{name:'Rever correção',exact:true}).click();assert.equal(await p.getByRole('button',{name:'Aprovar correção de ponto',exact:true}).count(),0);
 await p.getByRole('button',{name:'Fechar',exact:true}).last().click();
 await m.p.getByLabel('Atualizar dados',{exact:true}).click();await m.p.getByRole('button',{name:'Rever correção',exact:true}).click();
 await m.p.getByRole('heading',{name:'Horário proposto',exact:true}).waitFor();await m.p.screenshot({path:'future-clock-correction.png',fullPage:true});
 await m.p.getByRole('button',{name:'Aprovar correção de ponto',exact:true}).click();await m.p.locator('dialog').waitFor({state:'hidden'});await m.p.getByText('Correção aprovada',{exact:true}).waitFor();
 await p.getByLabel('Atualizar dados',{exact:true}).click();await p.getByRole('table').getByText('Validado',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Pedir correção',exact:true}).click();await p.getByLabel('Saída do período 1',{exact:true}).fill('2026-10-17T11:00');await p.getByLabel('Motivo da correção',{exact:true}).fill('Pedido a recusar no teste');await p.getByRole('button',{name:'Guardar',exact:true}).click();await p.locator('dialog').waitFor({state:'hidden'});
 await m.p.getByLabel('Atualizar dados',{exact:true}).click();await m.p.getByRole('button',{name:'Rever correção',exact:true}).click();await m.p.getByRole('button',{name:'Recusar correção de ponto',exact:true}).click();await m.p.getByLabel('Motivo da recusa',{exact:true}).fill('Horário original confirmado.');await m.p.getByRole('button',{name:'Guardar',exact:true}).click();await m.p.locator('dialog').waitFor({state:'hidden'});
 await p.getByLabel('Atualizar dados',{exact:true}).click();await p.getByText('Correção recusada',{exact:true}).waitFor();await p.getByRole('table').getByText('Validado',{exact:true}).waitFor();
 await p.setViewportSize({width:1440,height:1000});await a.p.getByLabel('Atualizar dados',{exact:true}).click();
 console.log('PASS: proposta de correção em telemóvel, comparação, aprovação noutra sessão, recusa e conservação do turno validado.');
};
