'use strict';
let workFilter={project:'',employee:'',status:'',from:'',until:''},filterOwner='';
function resetWorkFilters(){workFilter={project:'',employee:'',status:'',from:'',until:''};filterOwner=current?.id;}
function checkWorkScope(){if(filterOwner!==current?.id)resetWorkFilters();if(workFilter.project&&!worksite(workFilter.project))workFilter.project='';if(workFilter.employee&&!person(workFilter.employee))workFilter.employee='';}
function workMatches(r,withStatus=true){checkWorkScope();return !!r&&(!workFilter.project||r.project===workFilter.project)&&(!workFilter.employee||r.employee===workFilter.employee)&&(!withStatus||!workFilter.status||r.status===workFilter.status)&&(!workFilter.from||r.date>=workFilter.from)&&(!workFilter.until||r.date<=workFilter.until);}
function optionalSelect(...args){return select(...args).replace(' required','');}
function workFilters(){checkWorkScope();const rows=state.entries.filter(r=>workMatches(r));return `<section class="panel work-filter-panel"><form id="work-filters" class="work-filters">${optionalSelect('project','Filtrar por obra',[['','Todas as obras'],...state.projects.map(p=>[p.id,p.name])],workFilter.project)}${optionalSelect('employee','Filtrar por funcionário',[['','Todos os funcionários'],...state.employees.map(e=>[e.id,e.name])],workFilter.employee)}${optionalSelect('status','Filtrar por estado',[['','Todos os estados'],['pending','Por validar'],['approved','Validado'],['rejected','Rejeitado']],workFilter.status)}${input('from','Trabalho desde',workFilter.from,'date')}${input('until','Trabalho até',workFilter.until,'date')}<div class="actions"><button type="submit" class="btn primary">Aplicar filtros</button>${btn('Limpar filtros','work-clear')}</div></form><div class="filter-foot"><span>${rows.length} registo(s) · ${hours(rows.reduce((s,r)=>s+r.minutes,0))} no filtro · inclui os estados selecionados</span><div class="actions">${btn('Hoje','work-today')}${btn('Esta semana','work-week')}</div></div></section>`;}
function navigateWork(project='',statusValue=''){resetWorkFilters();workFilter.project=project;workFilter.status=statusValue;if(location.hash==='#trabalho')render();else location.hash='trabalho';}
const fullDate=s=>s?new Date(s+'T12:00:00').toLocaleDateString('pt-PT'):'Por definir';
const lateProjects=()=>state.projects.filter(p=>p.status!=='Concluída'&&p.plannedEnd&&p.plannedEnd<today());
function wageDue(){return money(state.employees.reduce((sum,e)=>{const earned=total(state.entries.filter(r=>r.employee===e.id&&r.status==='approved'&&r.date<=today()));const paid=state.wagePayments.filter(p=>p.employee===e.id&&!p.voided&&p.date<=today()).reduce((s,p)=>s+p.amount,0);return sum+Math.max(0,money(earned-paid));},0));}
function attentionPanel(){
  const pending=state.entries.filter(r=>r.status==='pending').length,corrections=state.corrections.filter(c=>c.status==='pending').length,rejected=state.entries.filter(r=>r.status==='rejected'&&!r.supersededBy).length;
  const card=(title,description,button)=>`<article class="attention-item"><h3>${esc(title)}</h3><p>${esc(description)}</p>${button}</article>`;
  let cards=card(`${pending} registo(s) por validar`,responsible()?'Trabalho que aguarda confirmação.':'Os seus registos aguardam confirmação do responsável.',btn('Ver registos por validar','pending-work'))+card(`${corrections} correção(ões) pendente(s)`,'Pedidos que ainda aguardam decisão.',btn('Ver pedidos de correção','pending-corrections'));
  if(rejected)cards+=card(`${rejected} registo(s) rejeitado(s)`,'Consulte o motivo e corrija os dados.',btn('Ver registos rejeitados','rejected-work'));
  if(admin()){const late=state.charges.filter(c=>!c.voided&&c.due<today()&&outstanding(c)>0);cards+=card(`${late.length} cobrança(s) em atraso`,`${euro(late.reduce((s,c)=>s+outstanding(c),0))} por receber nas cobranças vencidas.`,btn('Ver cobranças em atraso','late-charges'))+card('Saldo da equipa até hoje',`${euro(wageDue())} de remuneração validada por regularizar. Não indica vencimento contratual.`,btn('Consultar pagamentos','due-payroll'));}
  for(const p of lateProjects())cards+=card(p.name,`Fim previsto ultrapassado: ${fullDate(p.plannedEnd)}. Confirme a evolução da obra.`,btn('Consultar obra','open-project',false,p.id));
  return panel('A acompanhar','Pendências calculadas a partir dos dados disponíveis ao seu perfil.',`<div class="attention-grid">${cards}</div>`).replace('class="panel"','class="panel attention-panel"');
}
function projectDetail(id){
  const p=worksite(id);if(!p)return heading('Obra indisponível','A obra não existe ou não está abrangida pelo seu acesso.',btn('Voltar às obras','back-projects'));
  const entries=state.entries.filter(r=>r.project===id),pending=entries.filter(r=>r.status==='pending').length,approved=entries.filter(r=>r.status==='approved');
  const team=state.employees.filter(e=>p.employees.includes(e.id)),notes=(state.projectNotes||[]).filter(n=>n.project===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  let result=heading(esc(p.name),`${esc(p.client)} · ${esc(p.city)}`,btn('Voltar às obras','back-projects')+(admin()?btn('Editar obra','edit-project',false,id):''))+
    `<div class="project-hero"><div>${entityStatusBadge(p.status)}${p.status!=='Concluída'&&p.plannedEnd&&p.plannedEnd<today()?badge('Fim previsto ultrapassado','amber'):''}<dl><div><dt>Morada</dt><dd>${esc(p.address||'Por definir')}</dd></div><div><dt>Contacto em obra</dt><dd>${esc(p.siteContact||'Por definir')}</dd></div><div><dt>Início previsto</dt><dd>${fullDate(p.plannedStart)}</dd></div><div><dt>Fim previsto</dt><dd>${fullDate(p.plannedEnd)}</dd></div></dl></div><div class="actions project-actions">${p.employees.includes(current.employeeId)&&p.status!=='Concluída'?btn('Picar ponto nesta obra','project-clock',true,id):''}${btn('Registar trabalho nesta obra','project-work',false,id)}${btn('Consultar trabalho','project-entries',false,id)}${admin()?btn('Registar material nesta obra','project-material',false,id)+btn('Registar despesa nesta obra','project-expense',false,id):''}</div></div>`+
    `<section class="stats">${stat(current.role==='worker'?'O meu trabalho validado':'Trabalho validado',hours(approved.reduce((s,r)=>s+r.minutes,0)),'Acumulado dos registos acessíveis')}${stat('Por validar',pending,'Registos desta obra')}${stat(current.role==='worker'?'A minha associação':'Equipa associada',current.role==='worker'?(p.employees.includes(current.employeeId)?'Ativa':'—'):team.length,current.role==='worker'?'Acesso apenas ao seu trabalho':'Funcionários associados')}${stat('Notas da obra',notes.length,'Acompanhamento partilhado')}</section>`;
  if(admin()){
    const costs=state.costSummary.find(s=>s.project===id),charges=state.charges.filter(c=>c.project===id&&!c.voided),receipts=state.receipts.filter(r=>r.project===id&&!r.voided),receivedTotal=money(receipts.reduce((s,r)=>s+r.amount,0));
    result+=panel('Resumo financeiro','Acumulado de todas as datas. Custos indicativos, sem cálculo de lucro.',`<div class="project-financial"><dl><div><dt>Valor acordado</dt><dd>${euro(p.budget)}</dd></div><div><dt>Cobranças ativas</dt><dd>${euro(charges.reduce((s,c)=>s+c.amount,0))}</dd></div><div><dt>Recebido</dt><dd>${euro(receivedTotal)}</dd></div><div><dt>Saldo das cobranças</dt><dd>${euro(charges.reduce((s,c)=>s+outstanding(c),0))}</dd></div><div><dt>Materiais</dt><dd>${euro(costs?.materials)}</dd></div><div><dt>Despesas</dt><dd>${euro(costs?.expenses)}</dd></div><div><dt>Mão de obra · referência</dt><dd>${euro(costs?.labour)}</dd></div><div><dt>Total indicativo de custos</dt><dd>${euro(costs?.total)}</dd></div></dl><p>O saldo refere-se às cobranças criadas, não à diferença para o valor acordado. A mão de obra não inclui encargos.</p>${btn('Ver custos','project-costs',false,id)}</div>`);
    result+=panel('Cobranças desta obra','As cobranças anuladas não entram neste plano.',table(['Cobrança','Vencimento','Valor','Por receber','Estado','Ações'],charges.map(c=>`<tr><td>${esc(c.description)}</td><td>${fullDate(c.due)}</td><td>${euro(c.amount)}</td><td>${euro(outstanding(c))}</td><td>${badge(chargeStatus(c),outstanding(c)>0&&c.due<today()?'red':'')}</td><td>${outstanding(c)>0?btn('Registar recebimento','new-receipt',false,c.id):'—'}</td></tr>`)));
  }
  result+=panel(current.role==='worker'?'A minha participação':'Equipa da obra',current.role==='worker'?'O seu acesso não inclui registos de outros funcionários.':'Categoria profissional e estado dos funcionários associados.',table(['Nome','Categoria','Estado'],team.map(e=>`<tr><td>${esc(e.name)}</td><td>${esc(e.category)}</td><td>${entityStatusBadge(e.active?'Ativo':'Inativo')}</td></tr>`)));
  result+=panel('Trabalho recente nesta obra','Últimos seis registos acessíveis ao seu perfil.',table(['Data','Funcionário','Tempo','Estado'],[...entries].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6).map(r=>`<tr><td>${fullDate(r.date)}</td><td>${esc(person(r.employee)?.name)}</td><td>${hours(r.minutes)}</td><td>${status(r)}</td></tr>`)));
  result+=panel('Notas de acompanhamento','Partilhadas com os utilizadores que têm acesso à obra. Evite informação financeira ou pessoal sensível.',`<div class="project-notes">${responsible()?btn('+ Adicionar nota','project-note',true,id):''}${notes.length?notes.map(n=>`<article><p>${esc(n.text)}</p><small>${esc(n.author)} · ${esc(new Date(n.createdAt).toLocaleString('pt-PT'))}</small></article>`).join(''):'<p class="empty">Ainda não existem notas nesta obra.</p>'}</div>`);
  result+=attachmentsPanel(id);
  return `<div class="project-detail">${result}</div>`;
}
document.addEventListener('submit',e=>{if(e.target.id!=='work-filters')return;e.preventDefault();const data=Object.fromEntries(new FormData(e.target));if(data.from&&data.until&&data.from>data.until)return toast('O início do período deve ser anterior ou igual ao fim.');workFilter=data;render();});
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-action]');if(!el)return;const id=el.dataset.id;
  switch(el.dataset.action){
    case'open-project':location.hash='obra/'+id;break;
    case'back-projects':location.hash='obras';break;
    case'project-work':workForm(null,id);break;
    case'project-entries':navigateWork(id);break;
    case'project-material':costForm('material',id);break;
    case'project-expense':costForm('expense',id);break;
    case'project-note':modal('Adicionar nota à obra','<label class="field full">Nota de acompanhamento<textarea name="text" required maxlength="1000" rows="5"></textarea></label>',d=>change('projectNote',{project:id,text:d.text}),'A nota fica visível à equipa com acesso à obra e mantém autor e data.');break;
    case'pending-work':navigateWork('','pending');break;
    case'rejected-work':navigateWork('','rejected');break;
    case'pending-corrections':navigateWork();setTimeout(()=>[...document.querySelectorAll('.panel h2')].find(h=>h.textContent==='Pedidos de correção')?.scrollIntoView({block:'start'}),0);break;
    case'late-charges':chargeFilter='late';location.hash='recebimentos';break;
    case'due-payroll':start=today().slice(0,7)+'-01';end=today();location.hash='pagamentos';break;
    case'work-clear':resetWorkFilters();render();break;
    case'work-today':workFilter.from=today();workFilter.until=today();render();break;
    case'work-week':{const t=today(),d=new Date(t+'T12:00:00Z'),weekday=d.getUTCDay();d.setUTCDate(d.getUTCDate()-((weekday+6)%7));workFilter.from=d.toISOString().slice(0,10);workFilter.until=t;render();break;}
  }
});
