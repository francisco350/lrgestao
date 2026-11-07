'use strict';
let costProject='',costKind='material',costStatus='active',costFrom=currentMonthRange().from,costUntil=currentMonthRange().until,costTab='labour';
const costKinds={material:'Material',expense:'Despesa'};
const costNumber=n=>new Intl.NumberFormat('pt-PT',{maximumFractionDigits:3}).format(n);
const costInPeriod=(r,from='',until='')=>(!from||r.date>=from)&&(!until||r.date<=until);
function filteredCosts(){return state.costs.filter(c=>costInPeriod(c,costFrom,costUntil)&&(!costProject||c.project===costProject)&&(!costKind||c.kind===costKind)&&(costStatus==='all'||costStatus==='active'&&!c.voided||costStatus==='voided'&&c.voided)).sort((a,b)=>b.date.localeCompare(a.date));}
function costFilter(id,label,options,value){return `<label class="range-field">${label}<select id="${id}" aria-label="${label}">${options.map(([v,t])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;}
function labourCostPanel(projectId='',from='',until=''){
  if(!admin())return '';
  const groups=new Map();
  for(const r of state.entries.filter(r=>['approved','pending'].includes(r.status)&&costInPeriod(r,from,until)&&(!projectId||r.project===projectId))){
    const key=JSON.stringify([r.project,r.employee]);
    if(!groups.has(key))groups.set(key,{project:r.project,employee:r.employee,rows:[]});
    groups.get(key).rows.push(r);
  }
  const groupsList=[...groups.values()];
  return panel('Mão de obra por funcionário','Trabalho e pagamentos associados a cada obra. Horas pagas proporcionais ao valor de cada registo.',table(['Funcionário','Obra','Horas validadas','Custo validado','Por validar','Pago','Em falta','Ações'],groupsList.map(g=>{
    const approved=g.rows.filter(r=>r.status==='approved'),ids=new Set(approved.map(r=>r.id));
    const payments=state.wagePayments.filter(p=>!p.voided&&ids.has(p.entry)&&(!until||p.date<=until));
    const paid=money(payments.reduce((s,p)=>s+p.amount,0)),due=money(total(approved)-paid);
    const minutes=approved.reduce((s,r)=>s+r.minutes,0),paidMinutes=payments.reduce((s,p)=>s+(p.paidMinutes||0),0);
    const pending=g.rows.filter(r=>r.status==='pending');
    return `<tr><td>${esc(person(g.employee)?.name)}</td><td>${esc(worksite(g.project)?.name)}</td><td>${hours(minutes)}</td><td>${euro(total(approved))}</td><td>${euro(total(pending))}<small>${hours(pending.reduce((s,r)=>s+r.minutes,0))}</small></td><td class="settlement-paid">${euro(paid)}<small>${hours(Math.round(paidMinutes))}</small></td><td class="${due>0?'settlement-due':'settlement-paid'}">${euro(Math.max(0,due))}<small>${hours(Math.max(0,Math.round(minutes-paidMinutes)))}</small></td><td><div class="row-actions">${workShortcut('Ver registos',g.employee,g.project,'',from,until)}${pending.length?workShortcut('Ver pendentes',g.employee,g.project,'pending',from,until):''}<button class="btn" data-project-wage="${esc(g.project)}" data-employee="${esc(g.employee)}">Registar pagamento</button></div></td></tr>`;
  })))+panel('Pagamentos de trabalho','Histórico de pagamentos associados à obra.',table(['Data','Funcionário','Valor','Estado','Ações'],state.wagePayments.filter(p=>p.entry&&(!projectId||p.project===projectId)).map(p=>`<tr><td>${fullDate(p.date)}</td><td>${esc(person(p.employee)?.name)}</td><td>${euro(p.amount)}</td><td>${badge(p.voided?'Anulado':'Pago')}</td><td>${p.voided?'':btn('Anular','voidPayment',false,p.id)}</td></tr>`)))+`<details class="notice"><summary>Pagamentos anteriores sem obra</summary><p>Os pagamentos sem registo associado continuam no apuramento geral e não são distribuídos automaticamente pelas obras. Consulte-os antes de efetuar novos pagamentos.</p></details>`;

}
function costBreakdown(projectId='',kind='material',from='',until='',statusValue='active'){
  const rows=state.costs.filter(c=>(!projectId||c.project===projectId)&&c.kind===kind&&costInPeriod(c,from,until)&&(statusValue==='all'||(statusValue==='voided'?c.voided:!c.voided))).sort((a,b)=>b.date.localeCompare(a.date));
  const amount=money(rows.filter(c=>!c.voided).reduce((s,c)=>s+c.amount,0));
  return panel(kind==='material'?'Materiais':'Outras despesas',`Custo registado ativo: ${euro(amount)}. Pagamento não apurado nesta secção.`,rows.length?table(['Data / obra','Descrição / categoria','Fornecedor / documento','Quantidade','Preço unitário','Custo registado','Estado','Ações'],rows.map(c=>`<tr><td>${day(c.date)}<small>${esc(worksite(c.project)?.name||'Custos gerais')}</small></td><td>${esc(c.description)}<small>${esc(c.category)}</small><small>${esc(c.note||'')}</small></td><td>${esc(c.supplier||'—')}<small>${esc(c.reference||'')}</small></td><td>${costNumber(c.quantity)} ${esc(c.unit)}</td><td>${euro(c.unitPrice)}</td><td>${euro(c.amount)}</td><td>${badge(c.voided?'Anulado':'Registado',c.voided?'gray':'')}<small>${esc(c.voidReason||'')}</small></td><td>${c.voided?'—':btn('Anular custo','void-cost',false,c.id)}</td></tr>`)):'<p class="empty">Sem movimentos neste período.</p>');
}
function costPeriodSummary(project=costProject,from=costFrom,until=costUntil){return [...state.projects,...(!project&&state.costs.some(c=>c.project===null)?[{id:null}]:[])].filter(p=>!project||p.id===project).map(p=>{
  const rows=state.costs.filter(c=>c.project===p.id&&!c.voided&&costInPeriod(c,from,until));
  const materials=money(rows.filter(c=>c.kind==='material').reduce((s,c)=>s+c.amount,0)),expenses=money(rows.filter(c=>c.kind==='expense').reduce((s,c)=>s+c.amount,0));
  const labour=total(state.entries.filter(r=>r.project===p.id&&r.status==='approved'&&costInPeriod(r,from,until)));
  return {project:p.id,materials,expenses,labour,total:money(materials+expenses+labour)};
});}
function costsView(){
  if(costProject&&!state.projects.some(p=>p.id===costProject))costProject='';
  const summaries=costPeriodSummary(),sum=key=>money(summaries.reduce((s,r)=>s+r[key],0));
  return heading('Custos da obra','Registe os custos de cada obra e acompanhe a sua composição.','<a class="btn" href="#inventario">Inventário</a>'+btn('+ Material','new-material',true)+btn('+ Despesa','new-expense')+(costProject?btn('Ver contas desta obra','project-costs',true,costProject):'<a class="btn primary" href="#obras/contas">Contas mensais</a>'))+
    monthPicker('custos',dateRangeFields('cost-from','cost-until',costFrom,costUntil))+`<div class="cost-filters">${costFilter('cost-project','Obra a consultar',[['','Todas as obras'],...state.projects.map(p=>[p.id,p.name])],costProject)}</div><section class="stats">${stat('Materiais',euro(sum('materials')),'Custos ativos de materiais')}${stat('Outras despesas',euro(sum('expenses')),'Transporte, serviços e outros')}${stat('Mão de obra',euro(sum('labour')),'Apenas trabalho validado')}${stat('Total indicativo',euro(sum('total')),'Materiais + despesas + mão de obra')}</section>`+
    panel('Custos por obra','Período selecionado; campos de data vazios incluem todas as datas. Anulações excluídas dos totais.',table(['Obra','Materiais','Despesas','Mão de obra','Total indicativo','Ações'],summaries.map(s=>`<tr><td><strong>${esc(worksite(s.project)?.name||'Custos gerais')}</strong><small>${esc(worksite(s.project)?.client)}</small></td><td>${euro(s.materials)}</td><td>${euro(s.expenses)}</td><td>${euro(s.labour)}</td><td><strong>${euro(s.total)}</strong></td><td>${btn('Ver contas','project-costs',false,s.project)}</td></tr>`)))+
    `<details class="notice cost-note info-disclosure"><summary>Informação</summary><div>Registe os custos finais de materiais e despesas, incluindo IVA quando aplicável. A mão de obra é calculada pela remuneração dos registos validados, sem encargos adicionais. O total é indicativo e não representa lucro, saldo de caixa ou tratamento fiscal do IVA. Registar uma despesa não regista o seu pagamento.</div></details>`+
    `<div class="tabs" aria-label="Detalhe de custos">${[['labour','Funcionários'],['material','Materiais'],['expense','Outras despesas']].map(([id,label])=>`<button type="button" class="btn ${costTab===id?'selected':''}" data-cost-tab="${id}" aria-pressed="${costTab===id}">${label}</button>`).join('')}</div>`+
    (costTab==='labour'?labourCostPanel(costProject,costFrom,costUntil):`<div class="toolbar">${costFilter('cost-status','Estado do custo',[['active','Ativos'],['voided','Anulados'],['all','Todos']],costStatus)}${btn('Exportar custos CSV','export-costs')}</div>`+costBreakdown(costProject,costTab,costFrom,costUntil,costStatus));
}
function costForm(kind,projectId=''){
  if(!state.projects.length)return toast('Crie primeiro uma obra para associar o custo.');
  const material=kind==='material';
  modal(material?'Registar material':'Registar despesa',select('project','Obra',state.projects.map(p=>[p.id,p.name]),projectId||costProject||state.projects[0].id,true)+input('description',material?'Descrição do material':'Descrição da despesa','','text','required maxlength="160"',true)+input('date','Data do custo',today(),'date',`required max="${today()}"`)+(material?select('unit','Unidade',['un','m','m²','m³','kg','L','saco','caixa'],'un'):select('category','Categoria da despesa',['Transporte','Aluguer de equipamento','Subcontratação','Resíduos','Outras despesas'],'Transporte'))+(material?input('quantity','Quantidade',1,'number','required min="0.001" max="100000" step="0.001"'):'')+input('unitPrice',material?'Custo unitário final (€)':'Valor final da despesa (€)','','number','required min="0.01" max="1000000" step="0.01"')+input('supplier','Fornecedor / prestador','','text','maxlength="120"')+input('reference','Referência do documento','','text','maxlength="100"')+input('note','Observações','','text','maxlength="200"',true)+'<div class="form-preview field full" id="cost-preview" aria-live="polite"></div>',d=>change('cost',{...d,kind,quantity:material?Number(d.quantity):1,unitPrice:Number(d.unitPrice)}),'Use o custo final, com IVA quando aplicável. A referência é texto livre. Pode guardar o documento na ficha da obra, em Fotografias e documentos.');
  const f=$('#form');const preview=()=>{const q=material?Number(f.elements.quantity.value):1,p=Number(f.elements.unitPrice.value);$('#cost-preview').textContent=Number.isFinite(q*p)&&q>0&&p>0?`Total previsto: ${euro(Math.floor((Math.round(q*1000)*Math.round(p*100)+500)/1000)/100)}`:'Preencha o valor para consultar o total.';};f.oninput=preview;preview();
}
function exportCosts(){const cell=v=>{let value=String(v??'');if(/^\s*[=+\-@]/.test(value))value="'"+value;return '"'+value.replace(/"/g,'""')+'"';};const rows=[['Data','Obra','Tipo','Categoria','Descrição','Fornecedor','Referência','Quantidade','Unidade','Custo unitário EUR','Valor original EUR','Custo ativo EUR','Estado','Motivo de anulação'],...filteredCosts().map(c=>[c.date,worksite(c.project)?.name||'Custos gerais',costKinds[c.kind],c.category,c.description,c.supplier,c.reference,c.quantity,c.unit,c.unitPrice.toFixed(2),c.amount.toFixed(2),(c.voided?0:c.amount).toFixed(2),c.voided?'Anulado':'Registado',c.voidReason||''])];const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='lino-custos.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV exportado com os filtros dos movimentos.');}
document.addEventListener('change',e=>{if(e.target.id==='cost-project'){costProject=e.target.value;render();}if(e.target.id==='cost-kind'){costKind=e.target.value;render();}if(e.target.id==='cost-status'){costStatus=e.target.value;render();}});

document.addEventListener('click',e=>{
  const tab=e.target.closest('[data-cost-tab]');
  if(tab){costTab=tab.dataset.costTab;if(costTab!=='labour')costKind=costTab;render();}
});
document.addEventListener('change',e=>{
  if(!['cost-from','cost-until'].includes(e.target.id))return;
  const from=e.target.id==='cost-from'?e.target.value:costFrom,until=e.target.id==='cost-until'?e.target.value:costUntil;
  if(from&&until&&from>until){toast('O início deve ser anterior ou igual ao fim.');render();return;}
  costFrom=from;costUntil=until;render();
});

function inventoryView(){
  const lots=[...(state.inventory||[])].reverse();
  return heading('Inventário','Materiais disponíveis para atribuir às obras.',btn('+ Entrada de material','stock-receive',true))+
    panel('Materiais em stock','Cada entrada conserva o seu preço de compra. A atribuição cria um custo de material na obra selecionada.',
      lots.length?table(['Artigo','Entrada','Recebido','Disponível','Preço unitário','Ações'],lots.map(lot=>`<tr><td>${esc(lot.description)}</td><td>${fullDate(lot.date)}</td><td>${costNumber(lot.quantity)} ${esc(lot.unit)}</td><td>${costNumber(lot.available)} ${esc(lot.unit)}</td><td>${euro(lot.unitPrice)}</td><td>${lot.available>0?btn('Atribuir a obra','stock-issue',false,lot.id):'Esgotado'}</td></tr>`)):'<p class="empty">Ainda não há entradas de material.</p>');
}
function inventoryForm(id){
  const lot=id&&state.inventory.find(item=>item.id===id);
  if(id&&!lot)return toast('Entrada indisponível.');
  if(lot&&!state.projects.length)return toast('Crie uma obra antes de atribuir material.');
  const fields=lot?select('project','Obra',state.projects.map(p=>[p.id,p.name]),state.projects[0].id,true):
    input('description','Artigo / material','','text','required maxlength="160"',true)+
    select('unit','Unidade',['un','m','m²','m³','kg','L','saco','caixa'],'un')+input('unitPrice','Preço unitário (€)','','number','required min="0.01" max="1000000" step="0.01"');
  modal(lot?'Atribuir material a obra':'Entrada de material no inventário',
    (lot?`<p>${esc(lot.description)} · Disponível: ${costNumber(lot.available)} ${esc(lot.unit)}</p>`:'')+fields+
    input('quantity','Quantidade','','number',`required min="0.001" max="${lot?lot.available:100000}" step="0.001"`)+
    input('date',lot?'Data da saída':'Data da entrada',today(),'date',`required max="${today()}" ${lot?'min="'+lot.date+'"':''}`),
    d=>change(lot?'stockIssue':'stockReceive',{...d,lot:id,quantity:Number(d.quantity),unitPrice:Number(d.unitPrice)}));
}

document.addEventListener('click',event=>{
  const el=event.target.closest('[data-project-wage]');if(!el||!admin())return;
  const rows=state.entries.filter(r=>r.project===el.dataset.projectWage&&r.employee===el.dataset.employee&&r.status==='approved');
  if(!rows.length)return toast('Não existe trabalho validado para pagar.');
  modal('Pagar trabalho nesta obra',select('entry','Registo de trabalho',rows.map(r=>[r.id,`${fullDate(r.date)} · ${hours(r.minutes)} · ${euro(amount(r))}`]),null,true)+input('amount','Valor pago (€)','','number','required min="0.01" step="0.01"')+input('date','Data do pagamento',today(),'date',`required max="${today()}"`)+select('method','Método',['Transferência','Numerário','MB WAY','Outro'],'Transferência')+input('note','Observação','','text','maxlength="200"',true),d=>change('payment',{...d,employee:el.dataset.employee,type:'payment',amount:Number(d.amount)}));
});
