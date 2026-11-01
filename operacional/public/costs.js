'use strict';
let costProject='',costKind='material',costStatus='active',costFrom='',costUntil='',costTab='labour';
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
  return panel('Mão de obra por funcionário','Trabalho validado. Valores calculados com a remuneração guardada em cada registo, sem encargos adicionais.',table(['Funcionário','Obra','Horas validadas','Custo validado','Horas por validar','Valor por validar','Ações'],groupsList.map(g=>`<tr><td>${esc(person(g.employee)?.name||'Funcionário indisponível')}</td><td>${esc(worksite(g.project)?.name)}</td><td>${hours(g.rows.filter(r=>r.status==='approved').reduce((s,r)=>s+r.minutes,0))}</td><td><strong>${euro(total(g.rows.filter(r=>r.status==='approved')))}</strong></td><td>${hours(g.rows.filter(r=>r.status==='pending').reduce((s,r)=>s+r.minutes,0))}</td><td>${euro(total(g.rows.filter(r=>r.status==='pending')))}</td><td><div class="row-actions">${workShortcut('Ver registos',g.employee,g.project,'',from,until)}${g.rows.some(r=>r.status==='pending')?workShortcut('Ver pendentes',g.employee,g.project,'pending',from,until):''}</div></td></tr>`)))+`<p class="notice">Total de mão de obra: <strong>${euro(total(groupsList.flatMap(g=>g.rows).filter(r=>r.status==='approved')))}</strong>. Os registos por validar não entram neste total. Os pagamentos aos funcionários não são somados novamente.</p>`;
}
function costBreakdown(projectId='',kind='material',from='',until='',statusValue='active'){
  const rows=state.costs.filter(c=>(!projectId||c.project===projectId)&&c.kind===kind&&costInPeriod(c,from,until)&&(statusValue==='all'||(statusValue==='voided'?c.voided:!c.voided))).sort((a,b)=>b.date.localeCompare(a.date));
  const amount=money(rows.filter(c=>!c.voided).reduce((s,c)=>s+c.amount,0));
  return panel(kind==='material'?'Materiais':'Outras despesas',`Custo registado ativo: ${euro(amount)}. Pagamento não apurado nesta secção.`,rows.length?table(['Data / obra','Descrição / categoria','Fornecedor / documento','Quantidade','Preço unitário','Custo registado','Estado','Ações'],rows.map(c=>`<tr><td>${day(c.date)}<small>${esc(worksite(c.project)?.name)}</small></td><td>${esc(c.description)}<small>${esc(c.category)}</small><small>${esc(c.note||'')}</small></td><td>${esc(c.supplier||'—')}<small>${esc(c.reference||'')}</small></td><td>${costNumber(c.quantity)} ${esc(c.unit)}</td><td>${euro(c.unitPrice)}</td><td>${euro(c.amount)}</td><td>${badge(c.voided?'Anulado':'Registado',c.voided?'gray':'')}<small>${esc(c.voidReason||'')}</small></td><td>${c.voided?'—':btn('Anular custo','void-cost',false,c.id)}</td></tr>`)):'<p class="empty">Sem movimentos neste período.</p>');
}
function costPeriodSummary(){return state.projects.filter(p=>!costProject||p.id===costProject).map(p=>{
  const rows=state.costs.filter(c=>c.project===p.id&&!c.voided&&costInPeriod(c,costFrom,costUntil));
  const materials=money(rows.filter(c=>c.kind==='material').reduce((s,c)=>s+c.amount,0)),expenses=money(rows.filter(c=>c.kind==='expense').reduce((s,c)=>s+c.amount,0));
  const labour=total(state.entries.filter(r=>r.project===p.id&&r.status==='approved'&&costInPeriod(r,costFrom,costUntil)));
  return {project:p.id,materials,expenses,labour,total:money(materials+expenses+labour)};
});}
function costsView(){
  if(costProject&&!state.projects.some(p=>p.id===costProject))costProject='';
  const summaries=costPeriodSummary(),sum=key=>money(summaries.reduce((s,r)=>s+r[key],0));
  return heading('Custos da obra','Registe os custos de cada obra e acompanhe a sua composição.',btn('+ Material','new-material',true)+btn('+ Despesa','new-expense'))+
    `<div class="cost-filters">${costFilter('cost-project','Obra a consultar',[['','Todas as obras'],...state.projects.map(p=>[p.id,p.name])],costProject)}<label class="range-field">Desde<input id="cost-from" type="date" value="${costFrom}"></label><label class="range-field">Até<input id="cost-until" type="date" value="${costUntil}"></label>${btn('Todas as datas','cost-clear-dates')}</div><section class="stats">${stat('Materiais',euro(sum('materials')),'Custos ativos de materiais')}${stat('Outras despesas',euro(sum('expenses')),'Transporte, serviços e outros')}${stat('Mão de obra',euro(sum('labour')),'Apenas trabalho validado')}${stat('Total indicativo',euro(sum('total')),'Materiais + despesas + mão de obra')}</section>`+
    panel('Custos por obra','Período selecionado; campos de data vazios incluem todas as datas. Anulações excluídas dos totais.',table(['Obra','Materiais','Despesas','Mão de obra','Total indicativo'],summaries.map(s=>`<tr><td><strong>${esc(worksite(s.project)?.name)}</strong><small>${esc(worksite(s.project)?.client)}</small></td><td>${euro(s.materials)}</td><td>${euro(s.expenses)}</td><td>${euro(s.labour)}</td><td><strong>${euro(s.total)}</strong></td></tr>`)))+
    `<div class="notice cost-note">Registe os custos finais de materiais e despesas, incluindo IVA quando aplicável. A mão de obra é calculada pela remuneração dos registos validados, sem encargos adicionais. O total é indicativo e não representa lucro, saldo de caixa ou tratamento fiscal do IVA. Registar uma despesa não regista o seu pagamento.</div>`+
    `<div class="tabs" aria-label="Detalhe de custos">${[['labour','Funcionários'],['material','Materiais'],['expense','Outras despesas']].map(([id,label])=>`<button type="button" class="btn ${costTab===id?'selected':''}" data-cost-tab="${id}" aria-pressed="${costTab===id}">${label}</button>`).join('')}</div>`+
    (costTab==='labour'?labourCostPanel(costProject,costFrom,costUntil):`<div class="toolbar">${costFilter('cost-status','Estado do custo',[['active','Ativos'],['voided','Anulados'],['all','Todos']],costStatus)}${btn('Exportar custos CSV','export-costs')}</div>`+costBreakdown(costProject,costTab,costFrom,costUntil,costStatus));
}
function costForm(kind,projectId=''){
  if(!state.projects.length)return toast('Crie primeiro uma obra para associar o custo.');
  const material=kind==='material';
  modal(material?'Registar material':'Registar despesa',select('project','Obra',state.projects.map(p=>[p.id,p.name]),projectId||costProject||state.projects[0].id,true)+input('description',material?'Descrição do material':'Descrição da despesa','','text','required maxlength="160"',true)+input('date','Data do custo',today(),'date',`required max="${today()}"`)+(material?select('unit','Unidade',['un','m','m²','m³','kg','L','saco','caixa'],'un'):select('category','Categoria da despesa',['Transporte','Aluguer de equipamento','Subcontratação','Resíduos','Outras despesas'],'Transporte'))+(material?input('quantity','Quantidade',1,'number','required min="0.001" max="100000" step="0.001"'):'')+input('unitPrice',material?'Custo unitário final (€)':'Valor final da despesa (€)','','number','required min="0.01" max="1000000" step="0.01"')+input('supplier','Fornecedor / prestador','','text','maxlength="120"')+input('reference','Referência do documento','','text','maxlength="100"')+input('note','Observações','','text','maxlength="200"',true)+'<div class="form-preview field full" id="cost-preview" aria-live="polite"></div>',d=>change('cost',{...d,kind,quantity:material?Number(d.quantity):1,unitPrice:Number(d.unitPrice)}),'Use o custo final, com IVA quando aplicável. A referência é texto livre. Pode guardar o documento na ficha da obra, em Fotografias e documentos. Sem gestão de stock.');
  const f=$('#form');const preview=()=>{const q=material?Number(f.elements.quantity.value):1,p=Number(f.elements.unitPrice.value);$('#cost-preview').textContent=Number.isFinite(q*p)&&q>0&&p>0?`Total previsto: ${euro(Math.floor((Math.round(q*1000)*Math.round(p*100)+500)/1000)/100)}`:'Preencha o valor para consultar o total.';};f.oninput=preview;preview();
}
function exportCosts(){const cell=v=>{let value=String(v??'');if(/^\s*[=+\-@]/.test(value))value="'"+value;return '"'+value.replace(/"/g,'""')+'"';};const rows=[['Data','Obra','Tipo','Categoria','Descrição','Fornecedor','Referência','Quantidade','Unidade','Custo unitário EUR','Valor original EUR','Custo ativo EUR','Estado','Motivo de anulação'],...filteredCosts().map(c=>[c.date,worksite(c.project)?.name,costKinds[c.kind],c.category,c.description,c.supplier,c.reference,c.quantity,c.unit,c.unitPrice.toFixed(2),c.amount.toFixed(2),(c.voided?0:c.amount).toFixed(2),c.voided?'Anulado':'Registado',c.voidReason||''])];const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='lino-custos.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV exportado com os filtros dos movimentos.');}
document.addEventListener('change',e=>{if(e.target.id==='cost-project'){costProject=e.target.value;render();}if(e.target.id==='cost-kind'){costKind=e.target.value;render();}if(e.target.id==='cost-status'){costStatus=e.target.value;render();}});

document.addEventListener('click',e=>{
  const tab=e.target.closest('[data-cost-tab]');
  if(tab){costTab=tab.dataset.costTab;if(costTab!=='labour')costKind=costTab;render();}
  if(e.target.closest('[data-action="cost-clear-dates"]')){costFrom='';costUntil='';render();}
});
document.addEventListener('change',e=>{
  if(!['cost-from','cost-until'].includes(e.target.id))return;
  const from=e.target.id==='cost-from'?e.target.value:costFrom,until=e.target.id==='cost-until'?e.target.value:costUntil;
  if(from&&until&&from>until){toast('O início deve ser anterior ou igual ao fim.');render();return;}
  costFrom=from;costUntil=until;render();
});
