'use strict';
let planningOwner='',planningFilter={date:today(),employee:'',project:'',status:'planned'};
function planningScope(){
  if(planningOwner!==current.id){planningOwner=current.id;planningFilter={date:today(),employee:'',project:'',status:'planned'};}
  if(planningFilter.project&&!worksite(planningFilter.project))planningFilter.project='';
  if(planningFilter.employee&&!person(planningFilter.employee))planningFilter.employee='';
}
function planningRows(){planningScope();const week=HoursReport.period('week',planningFilter.date);return (state.planning||[]).filter(p=>p.date>=week.from&&p.date<=week.until&&(!planningFilter.project||p.project===planningFilter.project)&&(!planningFilter.employee||p.employee===planningFilter.employee)&&(planningFilter.status==='all'||p.status===planningFilter.status)).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.employeeName.localeCompare(b.employeeName,'pt'));}
function planningView(){
  const rows=planningRows(),week=HoursReport.period('week',planningFilter.date),active=rows.filter(p=>p.status==='planned');
  const date=d=>new Date(d+'T12:00Z').toLocaleDateString('pt-PT',{timeZone:'UTC',weekday:'short',day:'2-digit',month:'2-digit'});
  const card=p=>`<article class="plan-card ${p.status==='cancelled'?'plan-cancelled':''}"><div class="plan-time">${esc(p.start)}–${esc(p.end)}${p.status==='cancelled'?badge('Cancelado','gray'):p.needsReview?badge('Rever equipa','amber'):''}</div><h3>${esc(person(p.employee)?.name||p.employeeName)}</h3><p class="plan-project">${esc(worksite(p.project)?.name||p.projectName)}</p><p>${esc(p.note||'Trabalho em obra')}</p><small>${hours(p.minutes)} previstas · pausa ${p.pause}m</small>${p.cancelReason?`<p>Motivo: ${esc(p.cancelReason)}</p>`:''}<div class="row-actions">${btn('Detalhes','plan-details',false,p.id)}${responsible()&&p.status==='planned'?btn('Editar','plan-edit',false,p.id)+btn('Cancelar','plan-cancel',false,p.id):''}</div></article>`;
  return heading(current.role==='worker'?'O meu planeamento':'Planeamento da equipa','Organize a semana por obra e consulte o trabalho previsto.',`<a class="btn" href="#ausencias">Consultar ausências</a>`+(responsible()?btn('+ Planear trabalho','plan-new',true):''))+
    `<section class="panel"><form id="planning-filters" class="hours-filters">${input('date','Semana de referência',planningFilter.date,'date','required')}${optionalSelect('project','Obra no planeamento',[['','Todas as obras'],...state.projects.map(p=>[p.id,p.name])],planningFilter.project)}${optionalSelect('employee','Funcionário no planeamento',[['','Todos os disponíveis'],...state.employees.map(e=>[e.id,e.name])],planningFilter.employee)}${select('status','Estado do planeamento',[['planned','Ativo'],['all','Ativo e cancelado'],['cancelled','Cancelado']],planningFilter.status)}<div class="actions"><button class="btn primary" type="submit">Aplicar ao planeamento</button><button class="btn" type="button" data-action="plan-clear">Limpar filtros</button></div></form><div class="hours-period"><div class="actions">${btn('← Semana anterior','plan-prev')}${btn('Esta semana','plan-current')}${btn('Semana seguinte →','plan-next')}</div><strong>${fullDate(week.from)} — ${fullDate(week.until)}</strong></div></section>`+
    `<section class="stats planning-stats">${stat('Horas previstas',hours(active.reduce((n,p)=>n+p.minutes,0)),'Pausas descontadas')}${stat('Funcionários planeados',new Set(active.map(p=>p.employee)).size,'Nas obras e datas selecionadas')}${stat('Obras planeadas',new Set(active.map(p=>p.project)).size,'Com atribuições ativas')}${stat('Atribuições a rever',active.filter(p=>p.needsReview).length,'Equipa alterada ou obra concluída')}</section><div class="notice">O planeamento não cria picagens, horas trabalhadas ou pagamentos. Os horários são previstos para o mesmo dia, em Lisboa. O período inteiro, incluindo a pausa, fica reservado para impedir atribuições sobrepostas. As ausências ativas da equipa também aparecem, independentemente do filtro de estado do planeamento.</div>`+
    `<section class="planning-week" aria-label="Planeamento semanal">${week.days.map(d=>`<section class="plan-day"><div class="plan-day-heading"><h2>${date(d)}</h2>${d===today()?badge('Hoje'):''}</div>${planningAbsenceCards(d)}${rows.filter(p=>p.date===d).map(card).join('')||'<p class="plan-empty">Sem trabalho planeado.</p>'}</section>`).join('')}</section>`;
}
function planningForm(id){
  const p=id?(state.planning||[]).find(p=>p.id===id):null;
  if(id&&!p)return toast('Planeamento indisponível.');
  const projects=state.projects.filter(o=>o.status!=='Concluída'||o.id===p?.project);
  if(!projects.length)return toast('É necessária uma obra ativa para planear trabalho.');
  const week=HoursReport.period('week',planningFilter.date),project=p?.project||planningFilter.project||projects[0].id;
  const dates=p?input('date','Dia planeado',p.date,'date','required'):checks('planDates','Dias da semana',week.days.map(d=>[d,fullDate(d)]),[week.days.includes(today())?today():week.from]);
  modal(p?'Editar planeamento':'Planear trabalho',select('project','Obra planeada',projects.map(o=>[o.id,o.name]),project,true)+`<div class="field full" id="planning-people"></div>`+dates+
    input('start','Entrada prevista',p?.start||'08:00','time','required')+input('end','Saída prevista',p?.end||'17:00','time','required')+input('pause','Pausa prevista (minutos)',p?.pause??60,'number','required min="0" max="1438" step="1"')+input('note','Trabalho previsto',p?.note||'','text','maxlength="200"',true),
    d=>change(p?'planUpdate':'planCreate',{id:p?.id,project:d.project,...(p?{date:d.date,employee:d.employee}:{dates:[...$('#form').querySelectorAll('[name="planDates"]:checked')].map(el=>el.value),employees:d.employees}),start:d.start,end:d.end,pause:Number(d.pause),note:d.note}),
    'Selecione apenas funcionários associados à obra. A gravação é feita em conjunto: se houver uma sobreposição, nenhuma das novas atribuições é guardada.');
  const people=()=>{
    const chosen=worksite($('#form').elements.project.value),list=state.employees.filter(e=>e.active&&chosen?.employees.includes(e.id));
    if(p&&!list.some(e=>e.id===p.employee))list.push({id:p.employee,name:p.employeeName+' (associação a rever)'});
    $('#planning-people').innerHTML=p?select('employee','Funcionário planeado',list.map(e=>[e.id,e.name]),p.employee,true):checks('employees','Funcionários a planear',list.map(e=>[e.id,e.name]),[]);
    if(!list.length)$('#planning-people').innerHTML='<p>Esta obra não tem funcionários ativos associados. Atualize a equipa da obra antes de planear.</p>';
  };
  $('#form').elements.project.addEventListener('change',people);people();
}
function planningDetails(id){
  const p=state.planning?.find(p=>p.id===id);if(!p)return toast('Planeamento indisponível.');
  modalVersion++;$('#modal-title').textContent='Detalhes do planeamento';const form=$('#form');form.oninput=null;form.onchange=null;form.onsubmit=e=>e.preventDefault();
  form.innerHTML=`<p><strong>${esc(p.employeeName)}</strong><br>${esc(p.projectName)}</p><p>${fullDate(p.date)} · ${esc(p.start)}–${esc(p.end)}<br>${hours(p.minutes)} previstas · pausa ${p.pause}m</p><p>${esc(p.note)}</p>${p.cancelReason?`<p>Cancelamento: ${esc(p.cancelReason)}</p>`:''}<p class="form-help">Última alteração: ${clockStamp(p.updatedAt)} · versão ${p.revision}</p>${admin()?table(['Operação','Autor / data','Antes da alteração'],(p.history||[]).map(h=>`<tr><td>${esc({planCreate:'Criação',planUpdate:'Alteração',planCancel:'Cancelamento'}[h.type])}${h.reason?`<small>${esc(h.reason)}</small>`:''}</td><td>${esc(h.author)}<small>${clockStamp(h.at)}</small></td><td>${h.before?`${esc(h.before.employeeName)} · ${esc(h.before.projectName)}<small>${fullDate(h.before.date)} · ${esc(h.before.start)}–${esc(h.before.end)} · pausa ${h.before.pause}m</small><small>${esc(h.before.note)}</small>`:'—'}</td></tr>`)):''}<div class="form-actions">${btn('Fechar','close-modal',true)}</div>`;
  $('#modal [data-action="close-modal"]').hidden=false;$('#modal').showModal();
}
document.addEventListener('submit',e=>{if(e.target.id!=='planning-filters')return;e.preventDefault();const data=Object.fromEntries(new FormData(e.target));try{HoursReport.period('week',data.date);planningFilter=data;render();}catch(error){toast(error.message);}});
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-action]');if(!el||!el.dataset.action.startsWith('plan-'))return;
  const action=el.dataset.action,id=el.dataset.id;
  try{
    if(action==='plan-new')return planningForm();
    if(action==='plan-edit')return planningForm(id);
    if(action==='plan-details')return planningDetails(id);
    if(action==='plan-cancel')return modal('Cancelar planeamento',input('reason','Motivo do cancelamento','','text','required maxlength="200"',true),d=>change('planCancel',{id,reason:d.reason}),'O registo permanece no histórico e o horário fica disponível para outra atribuição.');
    if(action==='plan-clear'){planningFilter.project='';planningFilter.employee='';planningFilter.status='planned';}
    if(action==='plan-current')planningFilter.date=today();
    if(action==='plan-next'||action==='plan-prev')planningFilter.date=HoursReport.addDays(HoursReport.period('week',planningFilter.date).from,action==='plan-next'?7:-7);
    render();
  }catch(error){toast(error.message);}
});
