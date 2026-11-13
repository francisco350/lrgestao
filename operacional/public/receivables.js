'use strict';
const cycles={weekly:'Semanal',monthly:'Mensal',milestone:'Por fase da obra'};
const clientById=id=>state.clients.find(c=>c.id===id);
const received=id=>money(state.receipts.filter(r=>r.charge===id&&!r.voided).reduce((sum,r)=>sum+r.amount,0));
const outstanding=c=>c.voided?0:money(c.amount-received(c.id));
const chargeStatus=c=>c.voided?'Anulada':outstanding(c)===0?'Liquidada':c.due<today()?'Em atraso':received(c.id)>0?'Parcial':'Por receber';
function clientView(){const month=monthFor("clientes");return heading('Clientes','Contactos e condições de pagamento, ligados a cada obra.',btn('+ Adicionar cliente','new-client',true))+monthPicker('clientes')+panel('Carteira de clientes','A periodicidade é uma referência comercial. As cobranças e datas são definidas em Recebimentos.',searchableDirectory('clientes',{
  label:'Pesquisar clientes',placeholder:'Nome, telefone ou email',noun:'clientes',rows:state.clients,fields:c=>[c.name,c.phone,c.email,String(c.phone||'').replace(/\D/g,'')],
  renderRows:rows=>table(['Cliente','Contactos','Periodicidade','Obras','Recebido no período','Por receber no fecho','Estado','Ações'],rows.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.phone)||'—'}<small>${esc(c.email)}</small></td><td>${cycles[c.cycle]}</td><td>${state.projects.filter(p=>p.clientId===c.id).length}</td><td>${euro(state.receipts.filter(r=>!r.voided&&r.clientId===c.id&&inMonth(r.date,month)).reduce((sum,r)=>sum+r.amount,0))}</td><td>${euro(state.charges.filter(r=>r.clientId===c.id).reduce((sum,r)=>sum+balanceAt(r,month),0))}</td><td>${entityStatusBadge(c.active?'Ativo':'Inativo')}</td><td>${btn('Editar','edit-client',false,c.id)}</td></tr>`))
}));}
let chargeFilter='open';
let receiptRange=currentMonthRange();
function inReceiptRange(date){
  const {from,until}=receiptRange;
  return (!from||date>=from)&&(!until||date<=until);
}
document.addEventListener('change',e=>{
  if(!['receipt-from','receipt-until'].includes(e.target.id))return;
  const from=$('#receipt-from').value,until=$('#receipt-until').value;
  if(from&&until&&from>until){toast('O início deve ser anterior ou igual ao fim.');render();return;}
  receiptRange={from,until};render();
});
function receivablesView(){
  const closingDate=receiptRange.until,cutoff=closingDate||today();
  const due=state.charges.filter(c=>inReceiptRange(c.due));
  const balance=c=>balanceAtDate(c,closingDate),paidToDate=c=>closingDate?paidAt(c.id,cutoff):received(c.id);
  const statusAt=c=>c.voided&&(!closingDate||!c.voidedAt||c.voidedAt.slice(0,10)<=cutoff)?'Anulada':balance(c)===0?'Liquidada':c.due<cutoff?'Em atraso':paidToDate(c)>0?'Parcial':'Por receber';
  const receipts=state.receipts.filter(r=>inReceiptRange(r.date));
  const chargeRow=c=>({...c,date:c.due,party:clientById(c.clientId)?.name,group:clientById(c.clientId)?.name||'Cobranças'});
  const unpaid=state.charges.filter(c=>balance(c)>0).map(c=>({...chargeRow(c),original:c.amount,settled:paidToDate(c),amount:balance(c)}));
  const chargesById=new Map(state.charges.map(c=>[c.id,c]));
  const payments=receipts.filter(r=>!r.voided).map(r=>({...r,description:r.description||chargesById.get(r.charge)?.description,party:clientById(r.clientId)?.name,group:r.method||'Recebimentos'}));
  const cards=sectionAccountCards([
    ['Por receber no fecho','Saldo das cobranças em aberto',unpaid,true],
    ['Em atraso','Vencidas antes do fecho',unpaid.filter(c=>c.due<cutoff),true],
    ['Recebido','Recebimentos não anulados',payments],
    ['Com vencimento no período','Pela data de vencimento',due.filter(c=>statusAt(c)!=='Anulada').map(chargeRow)]
  ],receiptRange.from,receiptRange.until,'Todas as obras');
  const rows=due.filter(c=>chargeFilter==='all'||chargeFilter==='late'&&statusAt(c)==='Em atraso'||chargeFilter==='open'&&balance(c)>0||chargeFilter==='paid'&&statusAt(c)==='Liquidada').sort((a,b)=>a.due.localeCompare(b.due));
  return heading('Recebimentos de clientes','Defina quanto e quando cada cliente deve pagar e acompanhe o que falta receber.',btn('Exportar cobranças CSV','export-receivables')+btn('+ Nova cobrança','new-charge',true))+monthPicker('recebimentos',dateRangeFields('receipt-from','receipt-until',receiptRange.from,receiptRange.until))+`<details class="notice info-disclosure"><summary>Informação</summary><div>Controlo interno de valores acordados e recebidos. Não emite faturas nem recibos fiscais. As cobranças seguem a data de vencimento. Os recebimentos seguem a data de entrada do dinheiro.</div></details>${cards}`+panel('Plano de recebimentos','Uma cobrança é um valor previsto: sinal, semana, mês ou fase da obra. Um recebimento regista o dinheiro que já entrou.',`<div class="toolbar"><label class="range-field">Mostrar<select id="charge-filter" aria-label="Filtrar cobranças">${[['open','Em aberto'],['late','Em atraso'],['paid','Liquidadas'],['all','Todas, incluindo anuladas']].map(([id,label])=>`<option value="${id}" ${chargeFilter===id?'selected':''}>${label}</option>`).join('')}</select></label></div>`+table(['Cliente / obra','Cobrança','Vencimento','Previsto','Recebido','Falta receber','Estado','Ações'],rows.map(c=>`<tr><td><strong>${esc(clientById(c.clientId)?.name)}</strong><small>${esc(worksite(c.project)?.name)}</small></td><td>${esc(c.description)}${c.voidReason?`<small>${esc(c.voidReason)}</small>`:''}</td><td>${day(c.due)}<small>${c.due.slice(0,4)}</small></td><td>${euro(c.amount)}</td><td>${euro(paidToDate(c))}</td><td><strong>${euro(balance(c))}</strong></td><td>${badge(statusAt(c),c.voided?'gray':outstanding(c)>0&&c.due<today()?'red':outstanding(c)>0?'amber':'')}</td><td><div class="row-actions">${outstanding(c)>0?btn('Registar recebimento','new-receipt',false,c.id):''}${!c.voided&&received(c.id)===0?btn('Anular cobrança','voidCharge',false,c.id):''}</div></td></tr>`)))+panel('Histórico de recebimentos','Anular um recebimento reabre o saldo da cobrança e mantém o movimento no histórico.',table(['Data','Cliente / obra','Cobrança','Valor','Método / referência','Estado','Ações'],[...receipts].sort((a,b)=>b.date.localeCompare(a.date)).map(r=>`<tr><td>${day(r.date)}<small>${r.date.slice(0,4)}</small></td><td>${esc(clientById(r.clientId)?.name)}<small>${esc(worksite(r.project)?.name)}</small></td><td>${esc(state.charges.find(c=>c.id===r.charge)?.description||r.description)}</td><td>${euro(r.amount)}</td><td>${esc(r.method)}<small>${esc(r.note)}</small>${r.voidReason?`<small>${esc(r.voidReason)}</small>`:''}</td><td>${badge(r.voided?'Anulado':'Confirmado',r.voided?'gray':'')}</td><td>${r.voided?'—':btn('Anular recebimento','voidReceipt',false,r.id)}</td></tr>`))).replace('class="panel"','class="panel activity-panel"');
}
function clientForm(c){modal(c?'Editar cliente':'Adicionar cliente',input('name','Nome do cliente',c?.name,'text','required maxlength="120"',true)+input('phone','Telefone',c?.phone,'tel','maxlength="40"')+input('email','Email',c?.email,'email','maxlength="160"')+select('cycle','Periodicidade de pagamento',Object.entries(cycles),c?.cycle||'monthly')+select('active','Estado',[['true','Ativo'],['false','Inativo']],c?.active===false?'false':'true'),d=>change('client',{...d,id:c?.id,active:d.active==='true'}));}
function chargeForm(projectId='',due=today()){
  const projects=state.projects.filter(p=>clientById(p.clientId)?.active);
  if(!projects.length)return toast('Crie primeiro uma obra associada a um cliente ativo.');
  const projectField=projectId?`<p class="field full">${esc(worksite(projectId).name)} · ${esc(worksite(projectId).client)}</p>`:
    select('project','Obra',projects.map(p=>[p.id,`${p.name} · ${clientById(p.clientId)?.name}`]),null,true);
  modal(projectId?'Nova cobrança nesta obra':'Nova cobrança a receber',projectField+
    input('description','Descrição da cobrança','','text','required maxlength="160"',true)+
    input('amount','Valor da cobrança (€)','','number','required min="0.01" max="10000000" step="0.01"')+
    input('due','Data de vencimento',due,'date','required')+
    '<details class="field full info-disclosure"><summary>Incluir horas validadas nesta cobrança</summary><div id="charge-work"></div></details>',
    d=>change('charge',{...d,project:projectId||d.project,amount:Number(d.amount),workEntries:new FormData(form).getAll('workEntry')}));
  const form=$('#form'),amount=form.elements.amount;
  let suggested='';
  function renderWork(){
    const p=worksite(projectId||form.elements.project.value);
    const entries=new Map(state.entries.map(e=>[e.id,e]));
    const rows=ProjectFinance.saleWork(state,p.id).filter(r=>r.freeMinutes&&!r.charge&&Math.round(r.freeMinutes*(p.saleRates?.[r.role]||0)/60)>0)
      .sort((a,b)=>a.date.localeCompare(b.date)||a.entry.localeCompare(b.entry));
    $('#charge-work').innerHTML=rows.length?`<p>Selecione os registos incluídos no valor total. Os recebimentos desta cobrança liquidam primeiro as horas, da mais antiga para a mais recente.</p>
      <div class="charge-work-list">${rows.map(r=>{
        const cents=Math.round(r.freeMinutes*p.saleRates[r.role]/60);
        return `<label><input type="checkbox" name="workEntry" value="${esc(r.entry)}" data-cents="${cents}"> ${fullDate(r.date)} · ${esc(person(entries.get(r.entry).employee)?.name)} · ${esc(r.category)} · ${hours(r.freeMinutes)} · ${euro(cents/100)}</label>`;
      }).join('')}</div><p id="charge-work-total" aria-live="polite"></p>`:'<p>Sem horas validadas disponíveis com preço definido nesta obra.</p>';
    syncAmount();
  }
  function syncAmount(){
    const cents=[...form.querySelectorAll('[name="workEntry"]:checked')].reduce((sum,el)=>sum+Number(el.dataset.cents),0);
    if(!amount.value||amount.value===suggested)amount.value=cents?(cents/100).toFixed(2):'';
    suggested=cents?(cents/100).toFixed(2):'';
    amount.min=String(Math.max(1,cents)/100);
    if($('#charge-work-total'))$('#charge-work-total').textContent='Horas incluídas no total da cobrança · '+euro(cents/100);
  }
  form.onchange=event=>{
    if(event.target.name==='project')renderWork();
    if(event.target.name==='workEntry')syncAmount();
  };
  renderWork();
}
function receiptForm(id){const c=state.charges.find(c=>c.id===id);if(!c||outstanding(c)<=0)return toast('Esta cobrança não tem saldo por receber.');modal('Registar recebimento',`<p class="field full">${esc(clientById(c.clientId)?.name)} · ${esc(c.description)}<br>Saldo por receber: <strong>${euro(outstanding(c))}</strong></p>`+input('amount','Valor recebido (€)',outstanding(c),'number',`required min="0.01" max="${outstanding(c)}" step="0.01"`)+input('date','Data do recebimento',today(),'date',`required max="${today()}"`)+select('method','Método',['Transferência','Numerário','MB WAY','Outro'],'Transferência')+input('note','Referência / observação','','text','maxlength="200"',true),d=>change('receipt',{...d,charge:id,amount:Number(d.amount)}),'Registe apenas valores efetivamente recebidos. Pode registar vários recebimentos parciais.');}
function exportReceivables(){const cell=v=>{let value=String(v??'');if(/^[\s]*[=+\-@]/.test(value))value="'"+value;return '"'+value.replace(/"/g,'""')+'"';};const cutoff=receiptRange.until;const rows=[['Cliente','Obra','Cobrança','Vencimento','Previsto EUR','Recebido até ao fecho EUR','Por receber no fecho EUR'],...state.charges.filter(c=>inReceiptRange(c.due)).map(c=>[clientById(c.clientId)?.name,worksite(c.project)?.name,c.description,c.due,c.amount.toFixed(2),(cutoff?paidAt(c.id,cutoff):received(c.id)).toFixed(2),balanceAtDate(c,cutoff).toFixed(2)]),[],['Cliente','Obra','Data do recebimento','Valor EUR','Estado'],...state.receipts.filter(r=>inReceiptRange(r.date)).map(r=>[clientById(r.clientId)?.name,worksite(r.project)?.name,r.date,r.amount.toFixed(2),r.voided?'Anulado':'Confirmado'])];const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='lino-cobranças.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.addEventListener('change',e=>{if(e.target.id==='charge-filter'){chargeFilter=e.target.value;render();}});
