'use strict';
let financeRange=currentMonthRange();
let financeDetailOwner='',financeDetailTab='charges';
function projectFinanceNavigation(id,active){
  return `<nav class="project-finance-navigation" aria-label="Secções da obra"><a class="btn ${active==='accounts'?'selected':''}" ${active==='accounts'?'aria-current="page"':''} href="#obra/${esc(id)}/contas">Contas da obra</a><a class="btn ${active==='details'?'selected':''}" ${active==='details'?'aria-current="page"':''} href="#obra/${esc(id)}">Ficha e equipa</a></nav>`;
}
function openProjectAccounts(id){
  if(location.hash==='#custos')financeRange={from:costFrom,until:costUntil};
  location.hash=id?'obra/'+id+'/contas':'obras/contas';
}
function projectAccountsPage(id=''){
  if(!admin())return '';
  const p=id?worksite(id):null;
  if(id&&!p)return heading('Obra indisponível','Selecione uma obra existente.','<a class="btn" href="#obras/contas">Contas das obras</a>');
  const selector=`<label class="range-field finance-project-field">Obra<select id="finance-project" aria-label="Obra das contas"><option value="">Todas as obras</option>${state.projects.map(p=>`<option value="${esc(p.id)}" ${p.id===id?'selected':''}>${esc(p.name)} · ${esc(p.client)}</option>`).join('')}</select></label>`;
  const filters=`<div class="finance-filters">${selector}${monthPicker('obra',dateRangeFields('finance-from','finance-until',financeRange.from,financeRange.until))}</div>`;
  const header=heading(p?esc(p.name):'Contas mensais',p?`${esc(p.client)} · Resumo de recebimentos, pagamentos e custos.`:'Selecione a obra e o mês para consultar e organizar as contas.','<a class="btn" href="#obras">Voltar às obras</a>'+(p?'<a class="btn" href="#obras/contas">Contas mensais</a>':btn('+ Custo geral','general-cost',true)));
  if(p)return header+projectFinanceNavigation(id,'accounts')+filters+projectFinanceView(id);
  const monthly=ProjectFinance.monthly(state,financeRange.from,financeRange.until);
  const rows=state.projects.map(p=>{const s=ProjectFinance.overview(state,p.id,financeRange.from,financeRange.until);return {p,...s,paid:s.totals.paid,due:s.totals.due};});
  const general=ProjectFinance.summary(state,null,financeRange.from,financeRange.until);
  rows.push({p:{id:'',name:'Custos gerais',client:'Sem obra associada'},...general});
  const projectCosts=rows.filter(r=>r.p.id).reduce((n,r)=>n+r.totals.cost,0);
  const sum=key=>money(rows.reduce((n,r)=>n+r[key],0));
  return header+filters+`<section class="stats">${stat('Custos das obras',euro(projectCosts),'Materiais, despesas e mão de obra no período')}${stat('Custos gerais',euro(general.expenses),'Despesas sem obra no período')}${stat('Total de custos',euro(money(projectCosts+general.expenses)),'Obras e custos gerais no período')}</section>`+financeMainStats({receivable:sum('receivable'),received:sum('received'),due:monthly.totals.due,paid:monthly.totals.paid},true)+financePositionStats()+monthlyCostCategories(monthly)+panel('Contas por obra','Saldos até ao fim do período, incluindo pendências anteriores. Recebimentos e pagamentos efetuados no período.',table(['Obra / cliente','Por receber','Recebido','Por pagar','Pago','Por confirmar','Ações'],rows.map(r=>`<tr><td><strong>${esc(r.p.name)}</strong><small>${esc(r.p.client)}</small></td><td>${euro(r.receivable)}</td><td>${euro(r.received)}</td><td>${euro(r.due)}</td><td>${euro(r.paid)}</td><td>${r.unknownCount?`${r.unknownCount} custo(s)<small>${euro(r.unknownAmount)}</small>`:'—'}</td><td>${r.p.id?btn('Ver contas','project-costs',true,r.p.id):'<button class="btn" data-finance-jump="general">Consultar custos gerais</button>'}</td></tr>`)))+`<p class="finance-scope">Os totais mensais incluem todos os pagamentos à equipa, mesmo sem obra atribuída. Os saldos por obra consideram apenas pagamentos associados à respetiva obra. ${monthly.unassignedPaid?`${euro(monthly.unassignedPaid)} pagos à equipa no período sem obra atribuída.`:''}</p>`+generalCostsPanel();
}
function financePositionStats(project){
  const s=ProjectFinance.position(state,project,financeRange.from,financeRange.until);
  const card=key=>financeCard(key,s[key],s[key]<0?'settlement-due':'settlement-paid');
  return `<section class="stats finance-result-stats" aria-label="Lucro estimado e saldo atual">${card('profit')}${card('balance')}</section>`;
}
function monthlyCostCategories(s){
  const row=(r,total=false)=>`<tr class="${total?'finance-total':''}"><td>${esc(r.label)}</td><td>${euro(r.cost)}</td><td class="settlement-paid">${euro(r.paid)}</td><td class="${r.due>0?'settlement-due':'settlement-paid'}">${euro(r.due)}</td><td>${r.unknown?badge(euro(r.unknown),'amber'):'—'}</td></tr>`;
  return panel('Custos por categoria','Custos e pagamentos do período. O saldo por pagar inclui pendências anteriores até ao fecho.',table(['Categoria','Custo no período','Pago no período','Por pagar no fecho','Por confirmar'],s.rows.map(r=>row(r)).concat(row({label:'Total',...s.totals},true))))+`<p class="finance-scope">A mão de obra inclui apenas trabalho validado. Adiantamentos e pagamentos à equipa sem obra atribuída entram no apuramento mensal. Valores por confirmar ainda não entram no saldo por pagar.</p>`;
}
const financeCards={
  receivable:['Por receber','Horas validadas e cobranças em aberto até ao fecho'],
  received:['Recebido','Do cliente · entradas no período'],
  due:['Por pagar','Materiais, despesas e mão de obra · saldo até ao fim do período'],
  paid:['Pago','Materiais, despesas e mão de obra · saídas no período'],
  profit:['Lucro estimado','Cobranças previstas − custos registados no período selecionado.'],
  balance:['Saldo atual','Recebimentos − pagamentos no período selecionado.']
};
function financeCard(key,value,tone=''){
  const [label,note]=financeCards[key];
  return `<button type="button" class="stat finance-card" data-finance-card="${key}" aria-haspopup="dialog">
    <span class="stat-top">${label}<span aria-hidden="true">↗</span></span>
    <span class="stat-value ${tone}">${euro(value)}</span><span class="stat-note">${note}</span>
  </button>`;
}
function financeMainStats(s){
  const cards=['receivable','received','due','paid'].map(key=>financeCard(key,s[key])).join('');
  return `<section class="stats project-finance-stats" aria-label="Resumo de recebimentos e pagamentos">${cards}</section>`;
}
function openFinanceDetail(card){
  const metric=card.dataset.financeCard;
  const project=$('#finance-project').value||undefined;
  const {from,until}=financeRange;
  const isBalance=metric==='due'||metric==='receivable';
  const incoming=metric==='received'||metric==='receivable';
  const label=financeCards[metric][0];
  const rows=ProjectFinance.accountDetails(state,metric,project,from,until)
    .sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const total=ProjectFinance.money(rows.reduce((n,r)=>n+r.amount,0));
  let calculation='';
  if(metric==='receivable'){
    const categories=new Map([['Oficiais',{minutes:0,cents:0,unpriced:0}],['Ajudantes',{minutes:0,cents:0,unpriced:0}]]);
    for(const row of rows.filter(r=>r.minutes!==undefined)){
      const category=categories.get(row.description)||{minutes:0,cents:0,unpriced:0};
      category.minutes+=row.minutes;category.cents+=Math.round(row.amount*100);category.unpriced+=row.unpriced;
      categories.set(row.description,category);
    }
    calculation=`<section class="finance-calculation" aria-label="Horas por receber"><h3>Horas por receber</h3>
      <dl>${[...categories].map(([name,c])=>`<div><dt>${esc(name)}</dt><dd><strong>${hours(c.minutes)}</strong> · ${c.unpriced&&c.unpriced===c.minutes?'Sem preço':euro(c.cents/100)}${c.unpriced&&c.unpriced<c.minutes?' · '+hours(c.unpriced)+' sem preço':''}</dd></div>`).join('')}</dl></section>`;
  }
  if(metric==='profit'||metric==='balance'){
    const profit=metric==='profit';
    let additions=0, deductions=0;
    for(const {amount} of rows){
      const cents=Math.round(Math.abs(amount)*100);
      if(amount<0)deductions+=cents;
      else additions+=cents;
    }
    const added=euro(additions/100), deducted=euro(deductions/100);
    calculation=`<section class="finance-calculation" aria-labelledby="finance-calculation-title">
      <h3 id="finance-calculation-title">Resumo do cálculo</h3>
      <dl><div><dt>${profit?'Cobranças previstas':'Recebimentos'}</dt><dd>${added}</dd></div>
        <div><dt>${profit?'Custos registados':'Pagamentos'}</dt><dd>${deducted}</dd></div></dl>
      <div class="finance-equation"><strong>${label}</strong><b>${added} − ${deducted} = ${euro(total)}</b></div>
    </section>`;
  }
  const period=isBalance
    ? (until?'Saldo até '+fullDate(until):'Saldo acumulado')
    : [from&&'Desde '+fullDate(from),until&&'até '+fullDate(until)].filter(Boolean).join(' ')||'Todo o período';
  const scope=project?worksite(project).name:'Todas as obras';
  const items=rows.map(r=>{
    const employee=r.employee&&person(r.employee)?.name;
    const context=[];
    if(!project){
      if(r.project)context.push(worksite(r.project)?.name);
      else if(!r.employee)context.push('Custos gerais');
      else if(!isBalance)context.push('Sem obra atribuída');
    }
    context.push(r.category,r.party,r.date&&fullDate(r.date),r.method,r.note);
    const labour=r.minutes!==undefined&&metric==='receivable';
    const amounts=labour?`<small>${hours(r.minutes)} por receber${r.unpriced?' · '+hours(r.unpriced)+' sem preço definido':''}</small>`:
      isBalance?`<small>${r.employee?'Trabalho validado':incoming?'Cobrança':'Custo'} ${euro(r.original)} · ${incoming?'Recebido':'Pago'} ${euro(r.settled)}${r.included?' · '+euro(r.included)+' incluídos na mão de obra':''}</small>`:'';
    return `<li><div><strong>${esc(employee||r.description)}</strong>
      <small>${esc([employee&&r.description,...context].filter(Boolean).join(' · '))}</small>${amounts}</div>
      <b>${labour&&r.unpriced===r.minutes?'Sem preço':euro(r.amount)}</b></li>`;
  }).join('');
  showAccountDialog(card,label,total,scope+' · '+period,items,calculation);
}
function showAccountDialog(card,label,total,context,items,calculation){
  const dialog=document.createElement('dialog');
  dialog.className='finance-detail';
  dialog.setAttribute('aria-labelledby','finance-detail-title');
  dialog.innerHTML=`<div class="modal-head"><h2 id="finance-detail-title">${esc(label)}</h2>
    <form method="dialog"><button class="icon-button" aria-label="Fechar detalhe" autofocus>×</button></form></div>
    <p>${esc(context)}</p>
    <div class="finance-detail-total"><span>Total</span><strong>${euro(total)}</strong></div>
    ${card.dataset.financeCard==='receivable'?calculation:''}
    ${items?'<ul>'+items+'</ul>':'<p class="empty">Sem valores a apresentar para esta seleção.</p>'}
    ${card.dataset.financeCard==='receivable'?'':calculation}`;
  card.parentElement.after(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.showModal();
}
let sectionDetails=[];
function sectionAccountCards(cards,from,until,scope){
  const dates=[from&&'Desde '+fullDate(from),until&&'até '+fullDate(until)].filter(Boolean).join(' ');
  sectionDetails=cards.map(([label,note,rows,subtract])=>({
    label,note,rows,subtract,context:scope+' · '+(dates||'Todo o período'),
    total:money(rows.reduce((sum,row)=>sum+row.amount,0))
  }));
  return '<section class="stats">'+sectionDetails.map((card,index)=>`<button type="button" class="stat finance-card" data-section-detail="${index}" aria-haspopup="dialog">
    <span class="stat-top">${esc(card.label)}<span aria-hidden="true">↗</span></span><span class="stat-value">${euro(card.total)}</span><span class="stat-note">${esc(card.note)}</span></button>`).join('')+'</section>';
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-section-detail]');
  if(!button)return;
  const {label,rows,subtract,total,context}=sectionDetails[button.dataset.sectionDetail];
  const groups=new Map();
  let original=0,settled=0;
  const items=[...rows].sort((a,b)=>b.date.localeCompare(a.date)).map(r=>{
    groups.set(r.group,(groups.get(r.group)||0)+r.amount);
    if(subtract){original+=r.original;settled+=r.settled;}
    const info=[...new Set([worksite(r.project)?.name||'Custos gerais',r.party,fullDate(r.date),r.group].filter(value=>value&&value!==r.description))];
    return `<li><div><strong>${esc(r.description||r.group)}</strong><small>${esc(info.join(' · '))}</small>
      ${subtract?`<small>Cobrança ${euro(r.original)} · Recebido ${euro(r.settled)}</small>`:''}</div><b>${euro(r.amount)}</b></li>`;
  }).join('');
  const parts=subtract?[['Cobranças em aberto',original],['Já recebido nessas cobranças',settled]]:[...groups];
  const terms=parts.map(([,value])=>euro(money(value))).join(subtract?' − ':' + ')||euro(0);
  const calculation=`<section class="finance-calculation"><h3>Resumo do cálculo</h3><dl>${parts.map(([name,value])=>`<div><dt>${esc(name)}</dt><dd>${euro(money(value))}</dd></div>`).join('')}</dl>
    <div class="finance-equation"><strong>${esc(label)}</strong><b>${terms} = ${euro(total)}</b></div></section>`;
  showAccountDialog(button,label,total,context,items,calculation);
});
function generalCostsPanel(){
  const {from,until}=financeRange,F=ProjectFinance;
  const costs=state.costs.filter(c=>c.project===null&&(F.inPeriod(c.date,from,until)||c.date<from&&F.costBalance(state,c,until).due>0)).sort((a,b)=>b.date.localeCompare(a.date));
  const payments=(state.costPayments||[]).filter(p=>p.project===null&&F.inPeriod(p.date,from,until)).sort((a,b)=>b.date.localeCompare(a.date));
  return `<div id="finance-general">`+panel('Custos gerais','Despesas sem obra associada, incluídas uma vez nas contas mensais.',table(['Data','Descrição / fornecedor','Custo','Pago até ao fecho','Por pagar no fecho','Estado','Ações'],costs.map(c=>{
    const b=F.costBalance(state,c,until),now=F.costBalance(state,c);
    return `<tr><td>${fullDate(c.date)}</td><td><strong>${esc(c.description)}</strong><small>${esc(c.category)} · ${esc(c.supplier||'Sem fornecedor')}</small><small>${esc(c.reference||'')} ${esc(c.note||'')}</small></td><td>${euro(c.amount)}</td><td>${euro(b.paid)}</td><td>${euro(b.due)}</td><td>${badge(!b.active?'Anulado':b.due===0?'Pago':b.paid>0?'Parcialmente pago':'Por pagar',b.due>0?'amber':'')}</td><td><div class="row-actions">${!c.voided&&now.due>0?btn('Registar pagamento','project-cost-payment',false,c.id):''}${!c.historical&&!c.voided&&now.paid===0?btn('Anular custo','void-cost',false,c.id):''}</div></td></tr>`;
  })))+panel('Pagamentos de custos gerais','Movimentos do período, incluindo anulações.',table(['Data','Descrição','Valor','Método','Estado','Ações'],payments.map(p=>`<tr><td>${fullDate(p.date)}</td><td>${esc(state.costs.find(c=>c.id===p.cost)?.description)}<small>${esc(p.note||'')}</small></td><td>${euro(p.amount)}</td><td>${esc(p.method)}</td><td>${badge(p.voided?'Anulado':'Confirmado',p.voided?'gray':'')}</td><td>${p.voided?'—':btn('Anular pagamento','project-void-cost-payment',false,p.id)}</td></tr>`)))+`</div>`;
}
function projectFinanceDate(){
  const {until}=financeRange;
  return until&&until<today()?until:today();
}
function projectFinanceSummary(p,s){
  const labour=s.rows.find(r=>r.kind==='labour').cost;
  return financeMainStats({...s,paid:s.totals.paid,due:s.totals.due},true)+financePositionStats(p.id)+`
    <section class="panel finance-cost-summary" aria-labelledby="finance-cost-summary-title">
      <div class="panel-head"><h2 id="finance-cost-summary-title">Contrato e custos</h2></div>
      <div class="finance-contract"><div><span>Valor do contrato</span><small>Valor total acordado para a obra</small></div><strong>${euro(p.budget)}</strong></div>
      <div class="finance-cost-composition"><h3>Custos no período</h3><dl>
        <div><dt>Materiais</dt><dd>${euro(s.materials)}</dd></div>
        <div><dt>Outras despesas</dt><dd>${euro(s.expenses)}</dd></div>
        <div><dt>Mão de obra</dt><dd>${euro(labour)}</dd></div>
        <div class="finance-cost-total"><dt>Total de custos</dt><dd>${euro(s.totals.cost)}</dd></div>
      </dl></div>
      ${s.unknownCount||s.unassignedWages?`<details class="finance-payment-review info-disclosure"><summary>Pagamentos por confirmar · ${s.unknownCount+s.unassignedWages}</summary><div>${s.unknownCount?`${euro(s.unknownAmount)} em custos sem estado de pagamento confirmado, fora do saldo por pagar. `:''}${s.unassignedWages?'Existem pagamentos à equipa sem obra atribuída. O saldo de mão de obra pode estar sobreavaliado até esses pagamentos serem conferidos.':''}</div></details>`:''}
    </section>`;
}
function projectSaleRatesForm(id){
  const project=worksite(id);
  const fields=[['official','Oficial'],['helper','Ajudante']].map(([role,label])=>{
    const cents=project.saleRates?.[role];
    return input(role,label+' (€/hora)',cents==null?'':cents/100,'number','min="0" max="1000000" step="0.01"');
  }).join('');
  modal('Preços de venda por hora',`<p class="field full">${esc(project.name)}</p>`+fields,data=>{
    const cents=value=>value===''?null:Math.round(Number(value)*100);
    return change('projectSaleRates',{project:id,official:cents(data.official),helper:cents(data.helper)});
  });
}
function projectSaleLabour(project,from,until){
  const work=ProjectFinance.saleWork(state,project.id,from,until);
  const sum=(rows,key)=>rows.reduce((n,r)=>n+r[key],0);
  const otherMinutes=sum(work.filter(r=>r.role==='other'),'minutes');
  const rows=[['official','Oficiais'],['helper','Ajudantes']].map(([role,label])=>{
    const entries=work.filter(r=>r.role===role);
    const received=sum(entries,'paidCents'),remaining=sum(entries,'available');
    const cents=project.saleRates?.[role];
    const price=cents==null?btn('Definir preço','project-sale-rates',false,project.id):euro(cents/100);
    const free=sum(entries,'freeMinutes'),billed=sum(entries,'billedCents');
    const due=free&&cents==null?null:billed+Math.round(free*(cents||0)/60);
    const actions=[];
    if(free>0&&cents>0)actions.push(`<button type="button" class="btn" data-action="sale-receipt" data-id="${esc(project.id)}" data-role="${role}">Registar recebimento do cliente</button>`);
    const linked=new Set(entries.filter(r=>r.billedCents>0).map(r=>r.charge));
    for(const id of linked){
      const charge=state.charges.find(c=>c.id===id);
      actions.push(btn('Receber · '+charge.description,'new-receipt',false,id));
    }
    const action=actions.join(' ')||'—';
    return `<tr><td>${label}</td><td>${hours(sum(entries,'minutes'))}</td><td>${price}</td><td>${due==null?'—':euro((received+due)/100)}</td><td class="settlement-paid">${euro(received/100)}<small>${hours(sum(entries,'paidMinutes'))}</small></td><td class="${remaining?'settlement-due':'settlement-paid'}">${due==null?'—':euro(due/100)}<small>${hours(remaining)}</small></td><td>${action}</td></tr>`;
  });
  const extra=otherMinutes?`<p class="finance-scope">Outras categorias profissionais: ${hours(otherMinutes)} validadas, sem preço de venda definido.</p>`:'';
  return `<section class="panel"><div class="panel-head"><div><h2>Mão de obra a cobrar ao cliente</h2><p>Trabalho validado no período e recebimentos registados até hoje. As horas incluídas numa cobrança mantêm o preço acordado.</p></div>${btn('Editar preços','project-sale-rates',false,project.id)}</div>${table(['Categoria','Horas validadas','Preço por hora','Valor do trabalho','Recebido','Por receber','Ações'],rows)}${extra}</section>`;
}
function saleReceiptForm(projectId,role){
  const project=worksite(projectId),rate=project.saleRates[role];
  const {from,until}=financeRange;
  const work=ProjectFinance.saleWork(state,projectId,from,until).filter(r=>r.role===role&&r.freeMinutes>0);
  const charges=state.charges.filter(c=>c.project===projectId&&!c.voided&&!c.work?.length&&outstanding(c)>0);
  const fields=`<p class="field full">${esc(project.name)} · ${role==='official'?'Oficiais':'Ajudantes'} · ${euro(rate/100)}/h</p>`+
    input('hours','Horas inteiras',0,'number','required min="0" step="1"')+input('minutes','Minutos adicionais',0,'number','required min="0" max="59" step="1"')+
    input('date','Data do recebimento',today(),'date',`required max="${today()}"`)+select('method','Método do recebimento',['Transferência','Numerário','MB WAY','Outro'],'Transferência')+
    optionalSelect('charge','Associar a cobrança',[['','Sem cobrança associada'],...charges.map(c=>[c.id,`${c.description} · ${euro(outstanding(c))}`])],'',true)+
    input('note','Observação','','text','maxlength="200"',true)+'<div class="field full form-preview" id="sale-receipt-preview" aria-live="polite"></div>';
  modal('Registar recebimento do cliente',fields,d=>change('saleReceipt',{project:projectId,role,from,until,minutes:Number(d.hours)*60+Number(d.minutes),date:d.date,method:d.method,charge:d.charge,note:d.note}));
  const form=$('#form');
  const update=()=>{
    const f=form.elements,minutes=Number(f.hours.value)*60+Number(f.minutes.value);
    const available=work.filter(r=>r.date<=f.date.value).reduce((n,r)=>n+r.freeMinutes,0);
    f.hours.setCustomValidity(minutes<=0||minutes>available?'Indique um tempo superior a zero e dentro das horas disponíveis.':'');
    $('#sale-receipt-preview').textContent=`Disponível nessa data: ${hours(available)} · Valor recebido: ${euro(Math.round(minutes*rate/60)/100)}`;
  };
  form.oninput=update;update();
}
function currentFinanceState(){return ProjectFinance.withHistory(state);}
function projectFinanceView(id,state=currentFinanceState()){
  const owner=current.id+':'+id;
  if(financeDetailOwner!==owner){financeDetailOwner=owner;financeDetailTab='charges';}
  const p=worksite(id),{from,until}=financeRange,F=ProjectFinance,s=F.summary(state,id,from,until);
  const overview=F.overview(state,id,from,until);
  const costs=state.costs.filter(c=>c.project===id&&(F.inPeriod(c.date,from,until)||c.date<from&&(F.costBalance(state,c,until).due>0||F.costBalance(state,c,until).unknown))).sort((a,b)=>b.date.localeCompare(a.date));
  const charges=state.charges.filter(c=>c.project===id&&(F.inPeriod(c.due,from,until)||c.due<from&&F.chargeBalance(state,c,until)>0||state.receipts.some(r=>r.charge===c.id&&F.inPeriod(r.date,from,until)))).sort((a,b)=>a.due.localeCompare(b.due));
  const movements=[...(state.wagePayments||[]).filter(r=>r.project===id&&F.inPeriod(r.date,from,until)).map(r=>({...r,direction:'out',wage:true,description:'Pagamento de trabalho: '+(person(r.employee)?.name||'')})),...(state.costPayments||[]).filter(r=>r.project===id&&F.inPeriod(r.date,from,until)).map(r=>({...r,direction:'out',description:state.costs.find(c=>c.id===r.cost)?.description||'Custo'})),...state.receipts.filter(r=>r.project===id&&F.inPeriod(r.date,from,until)).map(r=>({...r,direction:'in',description:r.description||state.charges.find(c=>c.id===r.charge)?.description||'Recebimento'}))].sort((a,b)=>b.date.localeCompare(a.date));
  const actions=`<div class="project-finance-actions">${btn('+ Material','project-material',false,id)}${btn('+ Despesa','project-expense',false,id)}${btn('+ Cobrança','project-charge',false,id)}${btn('+ Recebimento','project-receipt',true,id)}</div>`;
  return `<section class="project-monthly" aria-label="Contas da obra"><div class="project-finance-heading"><div><h2>Contas da obra</h2><span>${from||until?`${from?fullDate(from):'Início'} a ${until?fullDate(until):'hoje'}`:'Toda a obra'}</span></div>${actions}</div>
    ${projectFinanceSummary(p,overview)}
    ${projectSaleLabour(p,from,until)}
    <nav class="finance-jumps" aria-label="Detalhes das contas">${[['charges','Cobranças e recebimentos'],['costs','Materiais e despesas'],['movements','Movimentos'],['labour','Mão de obra']].map(([key,label])=>`<button class="btn ${financeDetailTab===key?'selected':''}" type="button" data-finance-tab="${key}" aria-pressed="${financeDetailTab===key}" aria-controls="finance-${key}">${label}</button>`).join('')}</nav>

    <details class="notice info-disclosure"><summary>Como são apurados estes valores</summary><div>Os custos seguem a data do custo; entradas e saídas seguem a data do pagamento. Os saldos incluem pendências anteriores até ao fecho. Custos antigos sem informação de pagamento ficam por confirmar. As saídas de armazém contam como custo, mas não como dívida ao fornecedor. As saídas incluem materiais, despesas e pagamentos à equipa associados à obra. A diferença de entradas e saídas não representa o lucro da obra.</div></details>
    <div id="finance-costs" class="section-stack finance-detail-panel" data-finance-pane="costs" ${financeDetailTab==='costs'?'':'hidden'}>${panel('Materiais e despesas desta obra','Custos do período e pendências anteriores. Pode registar pagamentos parciais.',table(['Data / tipo','Descrição / fornecedor','Custo','Pago até ao fecho','Por pagar no fecho','Estado no fecho','Ações'],costs.map(c=>{
      const b=F.costBalance(state,c,until),now=F.costBalance(state,c);
      const label=!b.active?'Anulado':c.inventoryLot?'Saída de armazém':c.historicalUsage?'Consumo histórico':b.unknown?'Por confirmar':b.due===0?'Pago':b.paid>0?'Parcial':'Por pagar';
      return `<tr><td>${c.date?fullDate(c.date):'Sem mês atribuído'}<small>${costKinds[c.kind]}${from&&c.date<from?' · Anterior ao mês':''}</small></td><td><strong>${esc(c.description)}</strong><small>${esc(c.category)} · ${esc(c.supplier||'Sem fornecedor')}</small><small>${esc(c.reference||'')} ${esc(c.note||'')}</small>${c.kind==='material'?`<small>${costNumber(c.quantity)} ${esc(c.unit)} × ${euro(c.unitPrice)}</small>`:''}</td><td>${euro(c.amount)}</td><td>${c.inventoryLot||b.unknown?'—':euro(b.paid)}</td><td>${c.inventoryLot||b.unknown?'—':euro(b.due)}</td><td>${badge(label,b.unknown||b.due>0?'amber':!b.active?'gray':'')}</td><td><div class="row-actions">${!c.historical&&!c.voided&&!c.inventoryLot&&(now.unknown||now.due>0)?btn('Registar pagamento','project-cost-payment',false,c.id):''}${!c.historical&&!c.voided&&now.unknown?btn('Confirmar por pagar','project-cost-unpaid',false,c.id):''}${!c.historical&&!c.voided&&now.paid===0?btn('Anular custo','void-cost',false,c.id):''}</div></td></tr>`;
    })))}</div>
    <div id="finance-charges" class="section-stack finance-detail-panel" data-finance-pane="charges" ${financeDetailTab==='charges'?'':'hidden'}>${panel('Cobranças e recebimentos desta obra','Estado dos recebimentos até ao fim do período selecionado.',table(['Cobrança','Vencimento','Valor','Recebido até ao fecho','Por receber no fecho','Estado','Ações'],charges.map(c=>{
      const status=F.chargeState(state,c,until);
      return `<tr><td>${esc(c.description)}</td><td>${fullDate(c.due)}${from&&c.due<from?'<small>Anterior ao mês</small>':''}</td><td>${euro(c.amount)}</td><td>${euro(status.paid)}</td><td>${euro(F.chargeBalance(state,c,until))}</td><td>${badge(status.label,status.tone)}</td><td><div class="row-actions">${outstanding(c)>0?btn('Registar recebimento','new-receipt',false,c.id):''}${!c.voided&&received(c.id)===0?btn('Anular cobrança','voidCharge',false,c.id):''}</div></td></tr>`;
    })))}</div>
    <div id="finance-movements" class="section-stack finance-detail-panel" data-finance-pane="movements" ${financeDetailTab==='movements'?'':'hidden'}>${labourPaymentsPanel(id)}${panel('Movimentos financeiros da obra','Histórico do período, incluindo anulações. Corrija um movimento anulando-o e registando o correto.',table(['Data','Movimento / descrição','Valor','Método / observação','Estado','Ações'],movements.map(r=>`<tr><td>${fullDate(r.date)}</td><td><strong>${r.direction==='in'?'Recebimento':'Pagamento'}</strong><small>${esc(r.description)}</small></td><td>${euro(r.amount)}</td><td>${esc(r.method)}<small>${esc(r.note||'')}</small></td><td>${badge(r.voided?'Anulado':'Confirmado',r.voided?'gray':'')}<small>${esc(r.voidReason||'')}</small></td><td>${r.historical||r.voided?'—':btn('Anular movimento',r.direction==='in'?'voidReceipt':r.wage?'voidPayment':'project-void-cost-payment',false,r.id)}</td></tr>`)))}
    ${panel('Entradas e saídas por método','Os movimentos seguem a data em que o dinheiro foi recebido ou pago.',table(['Método','Recebido','Pago (inclui equipa)','Diferença'],overview.methods.map(r=>`<tr><td>${r.method==='Numerário'?'Numerário (dinheiro)':esc(r.method)}</td><td>${euro(r.received)}</td><td>${euro(r.paid)}</td><td>${euro(money(r.received-r.paid))}</td></tr>`).concat(`<tr class="finance-total"><td>Total</td><td>${euro(s.received)}</td><td>${euro(overview.totals.paid)}</td><td>${euro(money(s.received-overview.totals.paid))}</td></tr>`)))}</div>
    <div id="finance-labour" class="section-stack finance-detail-panel" data-finance-pane="labour" ${financeDetailTab==='labour'?'':'hidden'}>${labourCostPanel(id,from,until,false)}${panel('Trabalho nesta obra','Edite e valide os registos do período.',projectWorkTable(state.entries.filter(r=>r.project===id&&ProjectFinance.inPeriod(r.date,from,until))))}</div>
    </section>`;
}
function projectCostForm(kind,id){
  const general=id===null,p=general?{name:'Custos gerais · sem obra associada'}:worksite(id),material=kind==='material',date=projectFinanceDate();
  if(!p)return;
  modal(general?'Adicionar custo geral':material?'Adicionar material à obra':'Adicionar despesa à obra',`<p class="field full">${esc(p.name)}</p>`+input('description',material?'Descrição do material':'Descrição da despesa','','text','required maxlength="160"',true)+input('date','Data do custo',date,'date',`required max="${today()}"`)+(material?select('unit','Unidade',['un','m','m²','m³','kg','L','saco','caixa'],'un'):select('category','Categoria da despesa',['Transporte','Aluguer de equipamento','Subcontratação','Resíduos','Outras despesas'],'Transporte'))+(material?input('quantity','Quantidade',1,'number','required min="0.001" max="100000" step="0.001"'):'')+input('unitPrice',material?'Custo unitário final (€)':'Valor final da despesa (€)','','number','required min="0.01" max="1000000" step="0.01"')+input('supplier','Fornecedor / prestador','','text','maxlength="120"')+input('reference','Referência do documento','','text','maxlength="100"')+input('note','Observações','','text','maxlength="200"',true)+`<div class="field full form-preview" id="project-cost-total" aria-live="polite"></div>`+select('settlement','Estado do pagamento',[['unpaid','Por pagar'],['paid','Totalmente pago'],['partial','Parcialmente pago']],'unpaid',true)+`<div class="field full" id="project-payment-fields"><div class="form-grid">${input('paidAmount','Valor já pago (€)','','number','required min="0.01" step="0.01"')}${input('paymentDate','Data do pagamento',date,'date',`required max="${today()}"`)}${select('paymentMethod','Método do pagamento',[['Transferência','Transferência bancária'],['Numerário','Numerário (dinheiro)'],['MB WAY','MB WAY'],['Outro','Outro']],'Transferência')}</div></div>`,d=>change(general?'generalCost':'projectCost',{...d,project:id,kind,quantity:material?Number(d.quantity):1,unitPrice:Number(d.unitPrice),paidAmount:Number(d.paidAmount)}),'Indique o custo final com IVA quando aplicável. Um pagamento reduz o saldo a pagar e não acrescenta um segundo custo. O custo entra no período correspondente à data indicada.');
  const form=$('#form');
  const update=()=>{const paying=form.elements.settlement.value!=='unpaid',partial=form.elements.settlement.value==='partial';$('#project-payment-fields').hidden=!paying;for(const n of ['paidAmount','paymentDate','paymentMethod'])form.elements[n].disabled=!paying;form.elements.paidAmount.disabled=!partial;form.elements.paidAmount.closest('label').hidden=!partial;form.elements.paymentDate.min=form.elements.date.value;const total=money(Math.floor((Math.round(Number(material?form.elements.quantity.value:1)*1000)*Math.round(Number(form.elements.unitPrice.value)*100)+500)/1000)/100);$('#project-cost-total').textContent=`Total do custo: ${euro(total)}`;form.elements.paidAmount.max=total;};
  form.oninput=update;form.onchange=update;update();
}
function projectCostPaymentForm(id){
  const c=state.costs.find(c=>c.id===id);if(!c||c.voided)return;
  const b=ProjectFinance.costBalance(state,c),date=[c.date,projectFinanceDate()].sort().at(-1);
  modal('Registar pagamento do custo',`<p class="field full">${esc(worksite(c.project)?.name||'Custos gerais')} · ${esc(c.description)}<br>${b.unknown?'Confirme todos os pagamentos deste custo para apurar o saldo.':`Saldo atual: ${euro(b.due)}`}</p>`+input('amount','Valor pago (€)',b.unknown?c.amount:b.due,'number',`required min="0.01" max="${b.unknown?c.amount:b.due}" step="0.01"`)+input('date','Data do pagamento',date,'date',`required min="${c.date}" max="${today()}"`)+select('method','Método do pagamento',[['Transferência','Transferência bancária'],['Numerário','Numerário (dinheiro)'],['MB WAY','MB WAY'],['Outro','Outro']],'Transferência')+input('note','Observação do pagamento','','text','maxlength="200"',true),d=>change('costPayment',{...d,cost:id,amount:Number(d.amount)}),'Pode registar pagamentos parciais e diferentes métodos. O saldo restante passa a ser considerado por pagar.');
}
function projectReceiptForm(id){
  const charges=state.charges.filter(c=>c.project===id&&outstanding(c)>0);
  if(!charges.length)return projectChargeForm(id);
  modal('Registar recebimento na obra',`<p class="field full">${esc(worksite(id)?.name)}</p>`+select('charge','Cobrança',charges.map(c=>[c.id,`${c.description} · ${euro(outstanding(c))} por receber`]),charges[0].id,true)+input('amount','Valor recebido (€)',outstanding(charges[0]),'number','required min="0.01" step="0.01"')+input('date','Data do recebimento',projectFinanceDate(),'date',`required max="${today()}"`)+select('method','Método do recebimento',[['Transferência','Transferência bancária'],['Numerário','Numerário (dinheiro)'],['MB WAY','MB WAY'],['Outro','Outro']],'Transferência')+input('note','Observação do recebimento','','text','maxlength="200"',true),d=>change('receipt',{...d,amount:Number(d.amount)}));
  const form=$('#form'),update=()=>{const c=charges.find(c=>c.id===form.elements.charge.value);form.elements.amount.value=outstanding(c);form.elements.amount.max=outstanding(c);};form.elements.charge.onchange=update;update();
}
function projectChargeForm(id){
  chargeForm(id,financeRange.until||today());
}
document.addEventListener('change',event=>{
  if(event.target.id==='finance-project'){location.hash=event.target.value?'obra/'+event.target.value+'/contas':'obras/contas';return;}
  if(!['finance-from','finance-until'].includes(event.target.id))return;
  const from=$('#finance-from').value,until=$('#finance-until').value;
  if(from&&until&&from>until){toast('O início deve ser anterior ou igual ao fim.');render();return;}
  financeRange={from,until};render();
});
document.addEventListener('click',event=>{
  const tab=event.target.closest('[data-finance-tab]');
  if(tab){
    financeDetailTab=tab.dataset.financeTab;
    const root=tab.closest('.project-monthly');
    for(const button of root.querySelectorAll('[data-finance-tab]')){
      const active=button.dataset.financeTab===financeDetailTab;
      button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));
    }
    for(const pane of root.querySelectorAll('[data-finance-pane]'))pane.hidden=pane.dataset.financePane!==financeDetailTab;
    window.dispatchEvent(new Event('resize'));
    return;
  }
  const card=event.target.closest('[data-finance-card]');
  if(card){openFinanceDetail(card);return;}
  const jump=event.target.closest('[data-finance-jump]');
  if(jump){document.getElementById('finance-'+jump.dataset.financeJump)?.scrollIntoView({block:'start',behavior:'smooth'});return;}
  const el=event.target.closest('[data-action]');if(!el)return;const id=el.dataset.id;
  switch(el.dataset.action){
    case'project-sale-rates':projectSaleRatesForm(id);break;
    case'sale-receipt':saleReceiptForm(id,el.dataset.role);break;
    case'general-cost':projectCostForm('expense',null);break;
    case'project-charge':projectChargeForm(id);break;
    case'project-receipt':projectReceiptForm(id);break;
    case'project-cost-payment':projectCostPaymentForm(id);break;
    case'project-cost-unpaid':modal('Confirmar custo por pagar',`<p class="field full">Confirma que o custo «${esc(state.costs.find(c=>c.id===id)?.description)}» ainda não teve qualquer pagamento? O valor completo passará a ser apresentado por pagar.</p>`,()=>change('trackCostPayment',{cost:id}));break;
    case'project-void-cost-payment':modal('Anular pagamento do custo',input('reason','Motivo da anulação','','text','required maxlength="200"',true),d=>change('voidCostPayment',{id,reason:d.reason}));break;
  }
});
