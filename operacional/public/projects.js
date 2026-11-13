'use strict';
let workFilter={project:'',employee:'',status:'',from:'',until:''},filterOwner='';
function resetWorkFilters(){workFilter={project:'',employee:'',status:'',from:'',until:''};filterOwner=current?.id;}
function checkWorkScope(){if(filterOwner!==current?.id){resetWorkFilters();Object.assign(workFilter,currentMonthRange());}workFilter.project=HoursReport.selected(workFilter.project).filter(worksite);workFilter.employee=HoursReport.selected(workFilter.employee).filter(person);}
function workMatches(r,withStatus=true){return !!r&&HoursReport.accepts(workFilter.project,r.project)&&HoursReport.accepts(workFilter.employee,r.employee)&&(!withStatus||HoursReport.accepts(workFilter.status,r.status))&&(!workFilter.from||r.date>=workFilter.from)&&(!workFilter.until||r.date<=workFilter.until);}
function optionalSelect(...args){return select(...args).replace(' required','');}
function workFilters(){checkWorkScope();const rows=state.entries.filter(r=>workMatches(r));return `${workReturn&&workReturn.owner===current.id?`<a class="btn" href="${esc(workReturn.hash)}">${esc(workReturn.label)}</a>`:''}${reportPeriodNavigation('work',workFilter)}<section class="panel work-filter-panel">${reportFilters('work',workFilter,state,[['pending','Por validar'],['approved','Validado'],['rejected','Rejeitado']])}<small>${rows.length} registo(s) · ${hours(rows.reduce((n,r)=>n+r.minutes,0))}</small></section>`;}
function navigateWork(project='',statusValue=''){workReturn=null;resetWorkFilters();workFilter.project=project;workFilter.status=statusValue;if(location.hash==='#trabalho')render();else location.hash='trabalho';}
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
  let result=heading(esc(p.name),`${esc(p.client)} · ${esc(p.city)}`,btn('Voltar às obras','back-projects')+(admin()?btn('Editar obra','edit-project',false,id):''))+(admin()?projectFinanceNavigation(id,'details'):'')+
    `<div class="project-hero"><div>${entityStatusBadge(p.status)}${p.status!=='Concluída'&&p.plannedEnd&&p.plannedEnd<today()?badge('Fim previsto ultrapassado','amber'):''}<dl><div><dt>Morada</dt><dd>${esc(p.address||'Por definir')}</dd></div><div><dt>Contacto em obra</dt><dd>${esc(p.siteContact||'Por definir')}</dd></div><div><dt>Início previsto</dt><dd>${fullDate(p.plannedStart)}</dd></div><div><dt>Fim previsto</dt><dd>${fullDate(p.plannedEnd)}</dd></div></dl></div><div class="actions project-actions">${p.employees.includes(current.employeeId)&&p.status!=='Concluída'?btn('Picar ponto nesta obra','project-clock',true,id):''}${btn('Registar trabalho nesta obra','project-work',false,id)}${btn('Consultar trabalho','project-entries',false,id)}</div></div>`;
  result+=`<section class="stats">${stat(current.role==='worker'?'O meu trabalho validado':'Trabalho validado',hours(approved.reduce((s,r)=>s+r.minutes,0)),'Acumulado dos registos acessíveis')}${stat('Por validar',pending,workShortcut('Ver pendentes','',id,'pending'))}${stat(current.role==='worker'?'A minha associação':'Equipa associada',current.role==='worker'?(p.employees.includes(current.employeeId)?'Ativa':'—'):team.length,current.role==='worker'?'Acesso apenas ao seu trabalho':'Funcionários associados')}${stat('Notas da obra',notes.length,'Acompanhamento partilhado')}</section>`;
  result+=panel(current.role==='worker'?'A minha participação':'Equipa da obra',current.role==='worker'?'O seu acesso não inclui registos de outros funcionários.':'Categoria profissional e estado dos funcionários associados.',table(['Nome','Categoria','Estado','Horas validadas','Por validar','Ações'],team.map(e=>`<tr><td>${esc(e.name)}</td><td>${esc(e.category)}</td><td>${entityStatusBadge(e.active?'Ativo':'Inativo')}</td><td>${hours(entries.filter(r=>r.employee===e.id&&r.status==='approved').reduce((sum,r)=>sum+r.minutes,0))}</td><td>${employeePending(e.id,id)}</td><td>${workShortcut('Ver registos',e.id,id)}</td></tr>`)));
  result+=panel('Trabalho nesta obra','Edite e valide os registos sem sair da obra.',projectWorkTable(entries));
  if(admin()) result+=labourCostPanel(id);
  result+=panel('Notas de acompanhamento','Partilhadas com os utilizadores que têm acesso à obra. Evite informação financeira ou pessoal sensível.',`<div class="project-notes">${responsible()?btn('+ Adicionar nota','project-note',true,id):''}${notes.length?notes.map(n=>`<article><p>${esc(n.text)}</p><small>${esc(n.author)} · ${esc(new Date(n.createdAt).toLocaleString('pt-PT'))}</small></article>`).join(''):'<p class="empty">Ainda não existem notas nesta obra.</p>'}</div>`);
  result+=attachmentsPanel(id);
  return `<div class="project-detail">${result}</div>`;
}
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-action]');if(!el)return;const id=el.dataset.id;
  switch(el.dataset.action){
    case'open-project':location.hash='obra/'+id;break;
    case'back-projects':location.hash='obras';break;
    case'project-work':workForm(null,id);break;
    case'project-entries':navigateWork(id);break;
    case'project-material':projectCostForm('material',id);break;
    case'project-expense':projectCostForm('expense',id);break;
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

let workReturn=null;
function workShortcut(label,employee='',project='',status='',from='',until=''){
  return `<button type="button" class="btn" data-work-employee="${esc(employee)}" data-work-project="${esc(project)}" data-work-status="${esc(status)}" data-work-from="${esc(from)}" data-work-until="${esc(until)}">${esc(label)}</button>`;
}
function employeePending(employee,project=''){
  const rows=state.entries.filter(r=>r.employee===employee&&(!project||r.project===project)&&r.status==='pending');
  return rows.length?`${workShortcut(`${rows.length} por validar`,employee,project,'pending')}<small>${hours(rows.reduce((s,r)=>s+r.minutes,0))}</small>`:'Sem pendências';
}
document.addEventListener('click',e=>{
  if(e.target.closest('.sidebar a[href="#trabalho"], [data-action="logout"]')){
    workReturn=null;
    if(location.hash==='#trabalho'&&e.target.closest('.sidebar a'))render();
  }
  const link=e.target.closest('[data-work-employee]');
  if(link){
    const hash=location.hash||'#resumo';
    workReturn={hash,owner:current.id,label:hash.endsWith('/contas')?'Voltar às contas':hash.startsWith('#obra/')?'Voltar à obra':hash.startsWith('#contas')?'Voltar às contas':hash==='#custos'?'Voltar aos custos':hash==='#equipa'?'Voltar à equipa':'Voltar'};
    resetWorkFilters();
    workFilter={employee:link.dataset.workEmployee,project:link.dataset.workProject,status:link.dataset.workStatus,from:link.dataset.workFrom,until:link.dataset.workUntil};
    if(location.hash==='#trabalho')render();else location.hash='trabalho';
  }
  const add=e.target.closest('[data-employee-work]');
  if(add){workForm(null,'',add.dataset.employeeWork);}
});
