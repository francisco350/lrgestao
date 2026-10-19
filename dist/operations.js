'use strict';
const M=LinoModel;
const hoursLabel=minutes=>`${Math.floor(minutes/60)}h${minutes%60?` ${String(minutes%60).padStart(2,'0')}m`:''}`;
const workState=r=>badge(({approved:'Validado',pending:'Por validar',rejected:'Rejeitado'})[r.status]||'Por validar',r.status==='pending'?'amber':r.status==='rejected'?'red':'');
const signedBalance=n=>n<0?`${euro(-n)} de crédito`:euro(n);
const employeeScope=()=>role==='worker'?db.employees.filter(e=>e.id==='e2'):db.employees;
const canValidate=()=>role==='admin'||role==='manager';
let workMonth=today().slice(0,7);
let ledgerStart=workMonth+'-01';
let ledgerEnd=new Date(Number(workMonth.slice(0,4)),Number(workMonth.slice(5)),0).toLocaleDateString('sv-SE');
let ledgerPerson='';
function monthBounds(month){return [month+'-01',new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).toLocaleDateString('sv-SE')];}
function periodPicker(){return `<label class="range-field">Mês de trabalho<input type="month" id="work-month" value="${workMonth}" required aria-label="Mês de trabalho"></label>`;}
function workInMonth(){return visibleEntries().filter(r=>r.date.startsWith(workMonth));}
function payrollToolbar(){return `<div class="toolbar range-toolbar"><div class="date-range"><label class="range-field">De<input type="date" id="ledger-start" aria-label="Início do período" value="${ledgerStart}"></label><label class="range-field">Até<input type="date" id="ledger-end" aria-label="Fim do período" value="${ledgerEnd}"></label></div>${role==='admin'?`<select id="ledger-person" aria-label="Filtrar funcionário"><option value="">Toda a equipa</option>${db.employees.map(e=>`<option value="${e.id}" ${ledgerPerson===e.id?'selected':''}>${esc(e.name)}</option>`).join('')}</select>`:''}<div class="tabs"><button class="btn small" data-action="ledger-month">Este mês</button><button class="btn small" data-action="ledger-week">Esta semana</button></div></div>`;}

function summary(){
  const own=role==='worker';
  const pending=visibleEntries().filter(r=>r.status==='pending');
  const approved=M.approved(visibleEntries());
  const dueClients=db.charges.reduce((s,p)=>s+balance(p),0);
  const wage=employeeScope().map(e=>M.ledger(db,e.id,'0001-01-01',today()));
  const salaryDue=wage.reduce((s,l)=>s+Math.max(0,l.balance),0);
  const periodText='Dados de demonstração · Outubro de 2026';
  return heading(own?'O seu dia de trabalho.':'Uma boa obra começa na organização.',own?'João Martins · Registe o trabalho e acompanhe os seus pagamentos.':'Equipa, execução e dinheiro, com cada coisa no seu lugar.',button(own?'+ Registar o meu trabalho':'+ Registar trabalho','new-entry',true))+
  `<div class="period">${periodText}</div><section class="stats">${stat(own?'Trabalho validado':'Obras em curso',own?hoursLabel(approved.reduce((s,r)=>s+r.minutes,0)):db.projects.filter(o=>o.status==='Em curso').length,own?'Apenas os seus registos aprovados':'Projetos em execução',own?'clock':'work')}${stat('Por validar',pending.length,'Registos que aguardam confirmação','calendar')}${stat(own?'O meu saldo':canFinance()?'Por receber de clientes':'Trabalho validado',own?signedBalance(wage[0]?.balance||0):canFinance()?euro(dueClients):hoursLabel(approved.reduce((s,r)=>s+r.minutes,0)),own?'Trabalho validado menos pagamentos':canFinance()?'Cobranças em aberto':'Tempo confirmado pela equipa', 'wallet')}${stat(own?'Recebido':canFinance()?'Por pagar à equipa':'Equipa ativa',own?euro(db.wagePayments.filter(p=>p.employee==='e2'&&!p.voided).reduce((s,p)=>s+p.amount,0)):role==='admin'?euro(salaryDue):db.employees.filter(e=>e.active).length,own?'Pagamentos e adiantamentos':role==='admin'?'Saldo aprovado até hoje':'Pessoas disponíveis','team')}</section>`+
  `<div class="dashboard-banner">${icon('check')}<p><strong>${pending.length?'Há trabalho à espera de validação.':'Tudo organizado para o próximo passo.'}</strong><br>${own?'Os registos submetidos entram no seu apuramento depois de aprovados.':'Valide os registos antes de apurar valores e registar pagamentos à equipa.'}</p><a href="#registos">${canValidate()?'Rever registos':'Ver o meu trabalho'} →</a></div>`+
  (own?`<section class="mobile-work-card"><span class="eyebrow">NA OBRA, SEM COMPLICAÇÕES</span><h2>Terminou o trabalho de hoje?</h2><p>Escolha a obra, indique o horário e envie para validação.</p>${button('Registar trabalho','new-entry',true)}<a href="#salarios" class="btn">Consultar os meus pagamentos →</a></section>`:'')+
  `<div class="dashboard-grid"><div>${panel('Obras em acompanhamento','Estado dos projetos e evolução do trabalho.',table(['Obra / cliente','Estado','Progresso'],projectRows(db.projects.slice(0,4),true)),`<a class="view-link" href="#obras">Ver obras →</a>`)}${panel('Últimos movimentos','Atualizações recentes da operação.',db.activity.filter(a=>role==='admin'||(!/(pagamento|cobrança|adiantamento)/i.test(a.text)&&(role!=='worker'||a.text.includes('João Martins')))).slice(0,4).map(a=>`<div class="activity-row"><span class="activity-dot">${icon('check')}</span><p>${esc(a.text)}</p><time>${date(a.date)}</time></div>`).join('')||'<div class="empty">Sem movimentos para mostrar.</div>').replace('class="panel"','class="panel activity-panel"')}</div><div class="right-column">${role==='admin'?panel('Equipa · valores apurados','Só o trabalho validado gera valor a pagar.',`<div class="payment-list">${db.employees.slice(0,4).map(e=>{const l=M.ledger(db,e.id,'0001-01-01',today());return `<div class="payment-item"><span class="avatar">${esc(initials(e.name))}</span><div class="payment-meta"><strong>${esc(e.name)}</strong><small>${esc(e.category)}</small></div><div class="payment-amount">${signedBalance(l.balance)}<small>${l.balance<0?'Adiantamento por compensar':'Saldo até hoje'}</small></div></div>`}).join('')}</div><div class="panel-foot"><span>Custo validado: ${euro(M.total(approved))}</span><a href="#salarios" class="view-link">Gerir pagamentos →</a></div>`):panel(own?'Os meus registos':'Acompanhamento da equipa','Validação antes do apuramento.',`<div class="timeline">${pending.length} registos por validar.<br>${hoursLabel(approved.reduce((s,r)=>s+r.minutes,0))} validadas.<br><a class="view-link" href="#registos">Consultar trabalho →</a></div>`)}<div class="meeting-card">${icon('leaf')}<span class="eyebrow">DEMONSTRAÇÃO · NOVOS FLUXOS</span><h2>Do trabalho registado ao pagamento confirmado.</h2><p>Registe horas ou dias, valide o trabalho e acompanhe valores devidos, pagamentos e adiantamentos.</p><a href="#registos" class="btn small">Explorar os registos →</a></div></div></div>`;
}

function team(){
  const list=db.employees.filter(e=>`${e.name} ${e.category}`.toLowerCase().includes(query.toLowerCase())&&(!filter||e.category===filter));
  return heading('A sua equipa','Função, acesso e remuneração definidos para cada pessoa.',role==='admin'?button('+ Adicionar funcionário','new-employee',true):'')+
  panel('Funcionários',`${db.employees.filter(e=>e.active).length} ativos · Valores por hora ou por dia, com referência diária configurável.`,tool('Pesquisar nome ou categoria…',`<select id="filter" aria-label="Filtrar categoria"><option value="">Todas as categorias</option>${['Oficial','Ajudante','Eletricista','Canalizador','Pintor'].map(c=>`<option ${filter===c?'selected':''}>${c}</option>`).join('')}</select>`)+table(['Funcionário','Categoria','Acesso',...(canFinance()?['Remuneração']:[]),'Estado',...(role==='admin'?['Ações']:[])],list.map(e=>`<tr><td><div class="person"><span class="avatar">${esc(initials(e.name))}</span><strong>${esc(e.name)}</strong></div></td><td>${badge(e.category,e.category==='Ajudante'?'amber':'gray')}</td><td>${esc(e.access)}</td>${canFinance()?`<td><strong>${euro(e.rate)} / ${e.payBasis==='hour'?'hora':'dia'}</strong><small>Referência: ${e.dayHours}h por dia</small></td>`:''}<td>${badge(e.active?'Ativo':'Inativo',e.active?'':'gray')}</td>${role==='admin'?`<td><div class="row-actions"><button class="btn small" data-action="edit-employee" data-id="${e.id}">Editar</button><button class="btn small text" data-action="toggle-employee" data-id="${e.id}">${e.active?'Desativar':'Ativar'}</button></div></td>`:''}</tr>`)))+
  `<p class="storage-note">O valor acordado é uma referência de remuneração. Esta demonstração não calcula encargos patronais, impostos, subsídios ou salários líquidos.</p>`;
}

function employeeForm(e){
  if(role!=='admin')return;
  openForm(e?'Editar funcionário':'Adicionar funcionário',field('name','Nome completo',e?.name,'text','required maxlength="100"',true)+select('category','Categoria profissional',['Oficial','Ajudante','Eletricista','Canalizador','Pintor'],e?.category||'Ajudante')+select('access','Perfil de acesso',['Colaborador','Encarregado','Administrador'],e?.access||'Colaborador')+select('payBasis','Remuneração por',[['day','Dia'],['hour','Hora']],e?.payBasis||'day')+field('rate','Valor acordado (€)',e?.rate??55,'number','required min="0" max="10000" step="0.01"')+field('dayHours','Horas de referência por dia',e?.dayHours??8,'number','required min="1" max="24" step="0.5"',true),d=>{
    if(!d.name.trim())throw Error('Preencha o nome do funcionário.');
    const value={name:d.name.trim(),category:d.category,access:d.access,payBasis:d.payBasis,rate:Number(d.rate),dayHours:Number(d.dayHours)};
    if(!Number.isFinite(value.rate)||value.rate<0||!Number.isFinite(value.dayHours)||value.dayHours<1||value.dayHours>24)throw Error('Verifique a remuneração e as horas diárias.');
    if(e)Object.assign(e,value);else db.employees.push({id:id(),...value,active:true});
    save(`${value.name}: ficha de funcionário ${e?'atualizada':'criada'}.`);
  },'As alterações à remuneração aplicam-se a novos registos. Os valores históricos de trabalho já registado são preservados. O perfil de acesso é apenas simulado nesta demonstração.');
}

function entryForm(r){
  if(r&&role==='worker'&&r.employee!=='e2')return;
  if(r&&db.corrections.some(c=>c.entry===r.id&&c.status==='pending'))return toast('Este registo já tem um pedido de correção pendente.');
  const correcting=role==='worker'&&r?.status==='approved';
  const people=role==='worker'?db.employees.filter(e=>e.id==='e2'&&e.active):db.employees.filter(e=>e.active||e.id===r?.employee);
  if(!people.length||!db.projects.length)return toast('É necessário um funcionário ativo e uma obra.');
  const mode=r?.mode||(role==='worker'?'hours':'days');
  openForm(correcting?'Pedir correção de trabalho':r?'Editar registo de trabalho':'Registar trabalho',select('employee','Funcionário',people.map(e=>[e.id,`${e.name} · ${e.category}`]),r?.employee,true)+select('project','Obra',db.projects.map(o=>[o.id,o.name]),r?.project,true)+field('date','Data',r?.date||today(),'date',`required max="${today()}"`)+select('mode','Forma de registo',[['days','Dias de trabalho'],['hours','Horário de entrada e saída']],mode)+`<div class="field full mode-days">${field('days','Dias de trabalho',r?.days??1,'number','required min="0.125" max="1" step="0.125"')}</div><div class="field full mode-hours"><div class="time-fields">${field('start','Entrada',r?.start||'08:00','time','required')}${field('end','Saída',r?.end||'17:00','time','required')}${field('pause','Pausa (minutos)',r?.pause??60,'number','required min="0" max="720" step="1"')}</div></div>`+field('note','Descrição do trabalho',r?.note,'text','maxlength="200"',true)+(correcting?field('reason','Motivo da correção','','text','required maxlength="200"',true):'')+`<div id="work-preview" class="form-preview field full" aria-live="polite"></div>`,d=>{
    if(d.date>today())throw Error('Não é possível registar trabalho numa data futura.');
    const person=employee(d.employee);if(!person||(!person.active&&!r))throw Error('O funcionário não está ativo.');
    if(!project(d.project))throw Error('Selecione uma obra válida.');
    const value=M.work(d,person,r);M.validateWork(value,db.entries,r?.id);
    if(correcting){if(!d.reason.trim())throw Error('Indique o motivo da correção.');db.corrections.push({id:id(),entry:r.id,employee:r.employee,proposed:value,reason:d.reason.trim(),status:'pending',created:today()});save(`Pedido de correção de ${person.name} enviado para validação.`);}
    else {if(r)Object.assign(r,value,{status:'pending',rejection:''});else db.entries.push({id:id(),...value,status:'pending'});save(`Registo de trabalho de ${person.name} enviado para validação.`);}
  },correcting?'O registo validado mantém-se no apuramento até o responsável aprovar a correção.':'Todos os novos registos aguardam validação. Não há cálculo de horas extra. Horários noturnos devem ser divididos em dois dias; pausas são descontadas em minutos.');
  if(correcting)$('#form [name="employee"]').setAttribute('disabled','');
  const form=$('#form');
  if(correcting){const hidden=document.createElement('input');hidden.type='hidden';hidden.name='employee';hidden.value=r.employee;form.append(hidden);}
  function preview(){
    const currentMode=form.elements.mode.value;
    for(const name of ['days','start','end','pause'])form.elements[name].disabled=name==='days'?currentMode!=='days':currentMode!=='hours';
    $('.mode-days').hidden=currentMode!=='days';$('.mode-hours').hidden=currentMode!=='hours';
    try{const data=Object.fromEntries(new FormData(form));const value=M.work(data,employee(data.employee),r);$('#work-preview').innerHTML=`<strong>${hoursLabel(value.minutes)} de trabalho</strong><span>${canFinance()?`${euro(M.amount(value))} · valor de referência histórico`:'Será enviado para validação pelo responsável.'}</span>`;}catch{$('#work-preview').textContent='Preencha uma duração de trabalho válida.';}
  }
  form.oninput=preview;form.onchange=preview;preview();
}

function entries(){
  const rows=workInMonth();
  const list=rows.filter(r=>`${employee(r.employee)?.name} ${project(r.project)?.name} ${r.note}`.toLowerCase().includes(query.toLowerCase())&&(!filter||r.status===filter)).sort((a,b)=>b.date.localeCompare(a.date));
  const requests=db.corrections.filter(c=>c.status==='pending'&&(role!=='worker'||c.employee==='e2'));
  return heading('O trabalho, dia a dia',role==='worker'?'Registe o seu trabalho e acompanhe a validação.':'Confirme os registos antes de apurar valores devidos.',button('+ Registar trabalho','new-entry',true))+
  `<section class="stats">${stat('Tempo registado',hoursLabel(rows.reduce((s,r)=>s+r.minutes,0)),'Inclui todos os estados do mês','clock')}${stat('Por validar',rows.filter(r=>r.status==='pending').length,'Aguardam decisão do responsável','calendar')}${stat('Validados',rows.filter(r=>r.status==='approved').length,'Entram no apuramento','check')}${stat(canFinance()?'Valor validado':'Pedidos de correção',canFinance()?euro(M.total(M.approved(rows))):requests.length,canFinance()?'Remuneração de referência do mês':'Pedidos ainda pendentes',canFinance()?'wallet':'team')}</section>`+
  panel('Registos de trabalho','As alterações são submetidas novamente para validação.',`<div class="toolbar">${periodPicker()}<input class="search" id="search" aria-label="Pesquisar" placeholder="Pesquisar pessoa, obra ou descrição…" value="${esc(query)}"><select id="filter" aria-label="Filtrar validação"><option value="">Todos os estados</option>${[['pending','Por validar'],['approved','Validados'],['rejected','Rejeitados']].map(([v,l])=>`<option value="${v}" ${filter===v?'selected':''}>${l}</option>`).join('')}</select></div>`+table(['Data / horário','Funcionário','Obra','Trabalho',...(canFinance()?['Valor']:[]),'Estado','Ações'],list.map(r=>`<tr><td><strong>${date(r.date)}</strong><small>${r.mode==='hours'?`${r.start}–${r.end} · pausa ${r.pause}m`:'Registo por dias'}</small></td><td><strong>${esc(employee(r.employee)?.name)}</strong><small>${esc(r.category)}</small></td><td>${esc(project(r.project)?.name)}<small>${esc(r.note)||'—'}</small></td><td>${hoursLabel(r.minutes)}</td>${canFinance()?`<td>${euro(M.amount(r))}</td>`:''}<td>${workState(r)}${r.rejection?`<small>${esc(r.rejection)}</small>`:''}</td><td><div class="row-actions">${canValidate()&&r.status==='pending'?`<button class="btn small" data-action="approve-work" data-id="${r.id}">Validar</button><button class="btn small text danger" data-action="reject-work" data-id="${r.id}">Rejeitar</button>`:''}<button class="btn small" data-action="edit-entry" data-id="${r.id}">${role==='worker'&&r.status==='approved'?'Pedir correção':'Editar'}</button></div></td></tr>`)))+
  panel('Pedidos de correção',`${requests.length} pedidos pendentes · O original mantém-se válido até à decisão.`,table(['Funcionário / motivo','Original','Proposta','Ações'],requests.map(c=>{const original=db.entries.find(r=>r.id===c.entry);return `<tr><td><strong>${esc(employee(c.employee)?.name)}</strong><small>${esc(c.reason)}</small></td><td>${original?`${date(original.date)} · ${hoursLabel(original.minutes)}`:'—'}<small>${esc(project(original?.project)?.name)}</small></td><td>${date(c.proposed.date)} · ${hoursLabel(c.proposed.minutes)}<small>${esc(project(c.proposed.project)?.name)}</small></td><td>${canValidate()?`<div class="row-actions"><button class="btn small" data-action="approve-correction" data-id="${c.id}">Aprovar correção</button><button class="btn small text danger" data-action="reject-correction" data-id="${c.id}">Recusar</button></div>`:badge('Em análise','amber')}</td></tr>`}))).replace('class="panel"','class="panel activity-panel"');
}

function payroll(){
  const people=employeeScope().filter(e=>(!ledgerPerson||e.id===ledgerPerson||role==='worker'));
  const rows=people.map(e=>({person:e,...M.ledger(db,e.id,ledgerStart,ledgerEnd)}));
  const sum=k=>M.money(rows.reduce((s,l)=>s+l[k],0));
  const history=db.wagePayments.filter(p=>people.some(e=>e.id===p.employee)&&p.date>=ledgerStart&&p.date<=ledgerEnd).sort((a,b)=>b.date.localeCompare(a.date));
  const own=role==='worker';
  return heading(own?'Os meus pagamentos':'Pagamentos à equipa',own?'Trabalho validado, movimentos e saldo pessoal.':'Apure valores devidos e acompanhe pagamentos e adiantamentos.',button('↓ Exportar mapa CSV','export-payroll')+(role==='admin'?button('+ Registar pagamento','new-wage',true):''))+
  `<div class="notice">Controlo interno de remuneração de referência. Não é um recibo de vencimento. Os registos por validar não entram no saldo; adiantamentos podem originar crédito a favor da empresa.</div>`+
  `<section class="stats">${stat('Saldo de abertura',signedBalance(sum('opening')),'Antes do início do período','wallet')}${stat('Apurado no período',euro(sum('earned')),'Apenas trabalho validado','check')}${stat('Pago no período',euro(sum('paid')),'Inclui adiantamentos','wallet')}${stat('Saldo de fecho',signedBalance(sum('balance')),'Abertura + apurado − pago','chart')}</section>`+
  panel(own?'O meu apuramento':'Mapa de apuramento','Selecione o período. O saldo de abertura transporta os movimentos anteriores.',payrollToolbar()+table(['Funcionário','Abertura','Apurado','Pago','Saldo','Por validar',...(own?[]:['Ações'])],rows.map(l=>`<tr><td><div class="person"><span class="avatar">${esc(initials(l.person.name))}</span><div><strong>${esc(l.person.name)}</strong><small>${esc(l.person.category)}</small></div></div></td><td>${signedBalance(l.opening)}</td><td>${euro(l.earned)}</td><td>${euro(l.paid)}</td><td><strong>${signedBalance(l.balance)}</strong></td><td>${euro(l.pending)}</td>${own?'':`<td><button class="btn small" data-action="new-wage" data-id="${l.person.id}">Registar pagamento</button></td>`}</tr>`)))+
  panel('Movimentos do período','Os movimentos anulados ficam no histórico e deixam de contar no apuramento.',table(['Data','Funcionário','Tipo','Valor','Método','Referência',...(own?[]:['Ações'])],history.map(p=>`<tr class="${p.voided?'voided':''}"><td>${date(p.date)}</td><td><strong>${esc(employee(p.employee)?.name)}</strong></td><td>${badge(p.voided?'Anulado':p.type==='advance'?'Adiantamento':'Pagamento',p.voided?'gray':p.type==='advance'?'amber':'')}</td><td>${euro(p.amount)}</td><td>${esc(p.method)}</td><td>${esc(p.note)||'—'}${p.voidReason?`<small>${esc(p.voidReason)}</small>`:''}</td>${own?'':`<td>${p.voided?'—':`<button class="btn small text danger" data-action="void-wage" data-id="${p.id}">Anular</button>`}</td>`}</tr>`))).replace('class="panel"','class="panel activity-panel"');
}

function wageForm(employeeId){
  if(role!=='admin')return;
  if(!db.employees.length)return toast('Adicione primeiro um funcionário.');
  openForm('Registar pagamento à equipa',select('employee','Funcionário',db.employees.map(e=>[e.id,`${e.name}${e.active?'':' · inativo'}`]),employeeId,true)+select('type','Tipo de movimento',[['payment','Pagamento de trabalho'],['advance','Adiantamento']], 'payment')+field('amount','Valor pago (€)','','number','required min="0.01" max="1000000" step="0.01"')+field('date','Data do pagamento',today(),'date',`required max="${today()}"`)+select('method','Método de pagamento',['Transferência','Numerário','MB WAY','Outro'],'Transferência')+field('note','Referência / observação','','text','maxlength="200"',true)+`<div class="form-preview field full" id="wage-preview" aria-live="polite"></div>`,d=>{
    if(d.date>today())throw Error('Registe apenas pagamentos já efetuados.');
    const value=M.payment(db,d);db.wagePayments.push({id:id(),...value});
    save(`${value.type==='advance'?'Adiantamento':'Pagamento'} à equipa: ${employee(value.employee).name}, ${euro(value.amount)}.`);
  },'Pagamento de trabalho fica limitado ao saldo validado na data escolhida. Use Adiantamento para antecipar valores ainda não apurados.');
  function preview(){const f=$('#form');const employeeId=f.elements.employee.value;const paymentDate=f.elements.date.value;if(!M.validDate(paymentDate))return;const l=M.ledger(db,employeeId,'0001-01-01',paymentDate);$('#wage-preview').innerHTML=`<strong>Saldo aprovado nesta data: ${signedBalance(l.balance)}</strong><span>${euro(l.pending)} por validar · Não incluído no saldo.</span>`;}
  $('#form').oninput=preview;$('#form').onchange=preview;preview();
}

function reports(){
  const rows=M.approved(db.entries.filter(r=>r.date.startsWith(workMonth)));
  return heading('Números para decidir melhor','Apuramento da remuneração de referência com base no trabalho validado.',button('↓ Exportar registos CSV','export',true))+
  `<div class="toolbar report-period">${periodPicker()}<span class="muted">${rows.length} registos validados · ${hoursLabel(rows.reduce((s,r)=>s+r.minutes,0))}</span></div>`+
  `<div class="report-grid">${panel('Por funcionário','Apenas registos validados no mês selecionado.',table(['Funcionário','Horas','Valor apurado'],db.employees.map(e=>{const own=rows.filter(r=>r.employee===e.id);return `<tr><td><strong>${esc(e.name)}</strong><small>${esc(e.category)}</small></td><td>${hoursLabel(own.reduce((s,r)=>s+r.minutes,0))}</td><td>${euro(M.total(own))}</td></tr>`}))+`<div class="panel-foot"><span>Remuneração de referência</span><strong>${euro(M.total(rows))}</strong></div>`)}${panel('Por obra','Não inclui encargos, materiais, equipamentos ou outros custos.',table(['Obra','Mão de obra de referência'],db.projects.map(o=>`<tr><td><strong>${esc(o.name)}</strong><small>${esc(client(o.client)?.name)}</small></td><td>${euro(M.total(rows.filter(r=>r.project===o.id)))}</td></tr>`)))}</div><div class="notice activity-panel">O valor apurado não equivale ao custo total para a empresa, ao salário líquido ou à margem da obra. Os valores por registo são arredondados ao cêntimo antes de serem somados.</div>`;
}

function downloadCSV(filename,rows){
  const clean=v=>`"${String(v??'').replace(/^[\s\u0000-\u001f]*[=+@-]/,"'$&").replace(/"/g,'""')}"`;
  const blob=new Blob(['\ufeff'+rows.map(row=>row.map(clean).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Mapa exportado em CSV.');
}
function exportCSV(){if(!canFinance())return;downloadCSV('lino-rua-registos-demo.csv',[['Data','Funcionário','Categoria histórica','Obra','Minutos','Tipo de remuneração','Valor de referência','Horas por dia','Estado','Valor apurado','Descrição'],...db.entries.filter(r=>r.date.startsWith(workMonth)).map(r=>[r.date,employee(r.employee)?.name,r.category,project(r.project)?.name,r.minutes,r.payBasis==='hour'?'Hora':'Dia',r.unitRate,r.dayHours,({approved:'Validado',pending:'Por validar',rejected:'Rejeitado'})[r.status],r.status==='approved'?M.amount(r):0,r.note])]);}
function exportPayroll(){
  if(!['admin','worker'].includes(role))return;
  const people=employeeScope().filter(e=>!ledgerPerson||role==='worker'||e.id===ledgerPerson);
  downloadCSV('lino-rua-apuramento-equipa.csv',[['Início','Fim','Funcionário','Saldo de abertura','Apurado','Pago','Saldo de fecho','Por validar'],...people.map(e=>{const l=M.ledger(db,e.id,ledgerStart,ledgerEnd);return [ledgerStart,ledgerEnd,e.name,l.opening,l.earned,l.paid,l.balance,l.pending];})]);
}

document.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='work-month'&&/^\d{4}-\d{2}$/.test(el.value)){workMonth=el.value;render();}
  if(el.id==='ledger-person'){ledgerPerson=el.value;render();}
  if(['ledger-start','ledger-end'].includes(el.id)){
    const start=$('#ledger-start').value,end=$('#ledger-end').value;
    if(!M.validDate(start)||!M.validDate(end)||start>end){toast('Escolha um período válido, com início anterior ao fim.');render();return;}
    ledgerStart=start;ledgerEnd=end;render();
  }
});
document.addEventListener('click',event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  const key=el.dataset.id;
  try{switch(el.dataset.action){
    case'approve-work':{if(!canValidate())return;const r=db.entries.find(r=>r.id===key);if(!r||r.status!=='pending')return;M.validateWork(r,db.entries,r.id);r.status='approved';r.validated=today();r.validatedBy=role;save(`Trabalho de ${employee(r.employee)?.name} validado.`);break;}
    case'reject-work':{if(!canValidate())return;const r=db.entries.find(r=>r.id===key);if(!r||r.status!=='pending')return;openForm('Rejeitar registo',field('reason','Motivo da rejeição','','text','required maxlength="200"',true),d=>{if(!d.reason.trim())throw Error('Indique o motivo.');r.status='rejected';r.rejection=d.reason.trim();save(`Registo de ${employee(r.employee)?.name} rejeitado.`);});break;}
    case'approve-correction':{if(!canValidate())return;const c=db.corrections.find(c=>c.id===key);if(!c||c.status!=='pending')return;const r=db.entries.find(r=>r.id===c.entry);if(!r)return;M.validateWork(c.proposed,db.entries,r.id);c.original={...r};Object.assign(r,c.proposed,{status:'approved',validated:today(),validatedBy:role});c.status='approved';c.decided=today();save(`Correção do trabalho de ${employee(r.employee)?.name} aprovada.`);break;}
    case'reject-correction':{if(!canValidate())return;const c=db.corrections.find(c=>c.id===key);if(!c||c.status!=='pending')return;c.status='rejected';c.decided=today();save(`Pedido de correção de ${employee(c.employee)?.name} recusado.`);break;}
    case'new-wage':wageForm(key);break;
    case'void-wage':{if(role!=='admin')return;const p=db.wagePayments.find(p=>p.id===key);if(!p||p.voided)return;openForm('Anular pagamento',field('reason','Motivo da anulação','','text','required maxlength="200"',true),d=>{if(!d.reason.trim())throw Error('Indique o motivo da anulação.');p.voided=true;p.voidReason=d.reason.trim();p.voidedAt=today();save(`Pagamento à equipa anulado: ${employee(p.employee)?.name}.`);},'O movimento permanece no histórico e deixa de contar no saldo.');break;}
    case'export-payroll':exportPayroll();break;
    case'ledger-month':[ledgerStart,ledgerEnd]=monthBounds(today().slice(0,7));render();break;
    case'ledger-week':{const now=new Date(today()+'T12:00:00');const day=now.getDay()||7;now.setDate(now.getDate()-day+1);ledgerStart=now.toLocaleDateString('sv-SE');now.setDate(now.getDate()+6);ledgerEnd=now.toLocaleDateString('sv-SE');render();break;}
  }}catch(error){toast(error.message||'Não foi possível concluir a operação.');}
});
render();
