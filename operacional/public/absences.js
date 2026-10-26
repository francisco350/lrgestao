'use strict';
let absenceOwner='',absenceFilter={from:today().slice(0,7)+'-01',until:HoursReport.period('month',today()).until,employee:'',status:'active'};
const absenceKind=a=>a.kind==='holiday'?'Férias':a.kind==='unavailable'?'Indisponibilidade':'Indisponível';
const absenceTime=a=>a.mode==='full'?'Dia completo':`${a.start}–${a.end}`;
const absencePeriod=a=>`${fullDate(a.from)}${a.until!==a.from?' — '+fullDate(a.until):''} · ${absenceTime(a)}`;
function absenceScope(){
  if(absenceOwner!==current.id){absenceOwner=current.id;absenceFilter={from:today().slice(0,7)+'-01',until:HoursReport.period('month',today()).until,employee:'',status:'active'};}
  if(absenceFilter.employee&&!person(absenceFilter.employee))absenceFilter.employee='';
}
function absencesView(){
  absenceScope();
  const rows=(state.absences||[]).filter(a=>a.from<=absenceFilter.until&&a.until>=absenceFilter.from&&(!absenceFilter.employee||a.employee===absenceFilter.employee)&&(absenceFilter.status==='all'||a.status===absenceFilter.status)).sort((a,b)=>a.from.localeCompare(b.from)||a.start.localeCompare(b.start)||a.employeeName.localeCompare(b.employeeName,'pt'));
  const active=rows.filter(a=>a.status==='active');
  return heading(current.role==='worker'?'As minhas ausências':'Férias e indisponibilidades','Consulte os períodos em que não é possível planear trabalho.',admin()?btn('+ Registar ausência','absence-new',true):'')+
    `<section class="panel"><form id="absence-filters" class="hours-filters">${input('from','Ausências desde',absenceFilter.from,'date','required min="1900-01-01" max="9998-12-31"')}${input('until','Ausências até',absenceFilter.until,'date','required min="1900-01-01" max="9998-12-31"')}${optionalSelect('employee','Funcionário nas ausências',[['','Todos os disponíveis'],...state.employees.map(e=>[e.id,e.name])],absenceFilter.employee)}${select('status','Estado da ausência',[['active','Ativa'],['all','Ativa e cancelada'],['cancelled','Cancelada']],absenceFilter.status)}<div class="actions"><button class="btn primary" type="submit">Filtrar ausências</button>${btn('Este mês','absence-month')}</div></form></section>`+
    `<section class="stats planning-stats">${stat('Ausências ativas',active.length,'Que abrangem o período selecionado')}${stat('Funcionários indisponíveis',new Set(active.map(a=>a.employee)).size,'Com pelo menos uma ausência ativa')}${stat('Intervalos de horas',active.filter(a=>a.mode==='partial').length,'Indisponibilidades parciais ativas')}${stat('Canceladas',rows.length-active.length,'De acordo com o filtro de estado')}</section>`+
    `<div class="notice">${admin()?'Registe períodos já confirmados. Se houver trabalho planeado, reagende ou cancele as atribuições antes de guardar a ausência.':'O administrador regista e altera as ausências. Contacte-o se precisar de corrigir um período.'} Os dias completos incluem todas as datas selecionadas, incluindo fins de semana. Estes registos bloqueiam o planeamento; não alteram picagens, remunerações nem pagamentos.</div>`+
    panel('Períodos registados',current.role==='manager'?'Disponibilidade dos funcionários atualmente associados às suas obras. Observações pessoais não são partilhadas.':'O cancelamento mantém o registo e liberta o período para novo planeamento.',table(['Funcionário','Período','Tipo / estado','Ações'],rows.map(a=>`<tr><td><strong>${esc(person(a.employee)?.name||a.employeeName)}</strong></td><td>${fullDate(a.from)}${a.from!==a.until?` — ${fullDate(a.until)}`:''}<small>${esc(absenceTime(a))}</small></td><td>${esc(absenceKind(a))}<small>${badge(a.status==='active'?'Ativa':'Cancelada',a.status==='active'?'amber':'gray')}</small></td><td><div class="row-actions">${btn('Detalhes','absence-details',false,a.id)}${admin()&&a.status==='active'?btn('Editar','absence-edit',false,a.id)+btn('Cancelar','absence-cancel',false,a.id):''}</div></td></tr>`)));
}
function absenceForm(id){
  const a=id?state.absences?.find(a=>a.id===id):null;
  if(id&&!a)return toast('Ausência indisponível.');
  const people=state.employees.filter(e=>e.active||e.id===a?.employee);
  if(!people.length)return toast('Adicione primeiro um funcionário ativo.');
  modal(a?'Editar ausência':'Registar ausência',
    (a?`<p class="field full"><strong>${esc(a.employeeName)}</strong></p>`:select('employee','Funcionário ausente',people.map(e=>[e.id,e.name]),absenceFilter.employee||people[0].id,true))+
    select('kind','Tipo de ausência',[['holiday','Férias'],['unavailable','Indisponibilidade']],a?.kind||'holiday')+
    select('mode','Duração da ausência',[['full','Dias completos'],['partial','Intervalo de horas (um dia)']],a?.mode||'full')+
    input('from','Primeiro dia',a?.from||today(),'date','required min="1900-01-01" max="9998-12-31"')+input('until','Último dia',a?.until||today(),'date','required min="1900-01-01" max="9998-12-31"')+
    `<div class="field full absence-time-fields" id="absence-times">${input('start','Ausente desde',a?.mode==='partial'?a.start:'08:00','time','required')}${input('end','Ausente até',a?.mode==='partial'?a.end:'12:00','time','required')}</div>`+
    input('note','Observação para o funcionário',a?.note||'','text','maxlength="200"',true),
    d=>change(a?'absenceUpdate':'absenceCreate',{...d,id:a?.id,employee:a?.employee||d.employee,until:d.mode==='partial'?d.from:d.until}),
    'Use uma observação breve, sem informação clínica. O funcionário pode lê-la; o encarregado vê apenas a disponibilidade. Os registos ficam ativos ao guardar.');
  const sync=()=>{const f=$('#form').elements,partial=f.mode.value==='partial';$('#absence-times').hidden=!partial;f.start.disabled=!partial;f.end.disabled=!partial;f.until.disabled=partial;if(partial)f.until.value=f.from.value;};
  $('#form').elements.mode.addEventListener('change',sync);$('#form').elements.from.addEventListener('change',sync);sync();
}
function absenceDetails(id){
  const a=state.absences?.find(a=>a.id===id);if(!a)return toast('Ausência indisponível.');
  modalVersion++;$('#modal-title').textContent='Detalhes da ausência';const form=$('#form');form.oninput=null;form.onchange=null;form.onsubmit=e=>e.preventDefault();
  const names={absenceCreate:'Criação',absenceUpdate:'Alteração',absenceCancel:'Cancelamento'};
  form.innerHTML=`<p><strong>${esc(person(a.employee)?.name||a.employeeName)}</strong><br>${esc(absenceKind(a))} · ${a.status==='active'?'Ativa':'Cancelada'}</p><p>${esc(absencePeriod(a))}</p>${a.note?`<p>${esc(a.note)}</p>`:''}${a.cancelReason?`<p>Cancelamento: ${esc(a.cancelReason)}</p>`:''}<p class="form-help">Última alteração: ${clockStamp(a.updatedAt)} · versão ${a.revision}</p>${admin()?table(['Operação','Autor / data','Antes da alteração'],(a.history||[]).map(h=>`<tr><td>${esc(names[h.type])}${h.reason?`<small>${esc(h.reason)}</small>`:''}</td><td>${esc(h.author)}<small>${clockStamp(h.at)}</small></td><td>${h.before?`${esc(absenceKind(h.before))}<small>${esc(absencePeriod(h.before))}</small><small>${esc(h.before.note)}</small>`:'—'}</td></tr>`)):''}<div class="form-actions">${btn('Fechar','close-modal',true)}</div>`;
  $('#modal [data-action="close-modal"]').hidden=false;$('#modal').showModal();
}
function planningAbsences(date){
  const project=worksite(planningFilter.project);
  return (state.absences||[]).filter(a=>a.status==='active'&&a.from<=date&&a.until>=date&&(!planningFilter.employee||a.employee===planningFilter.employee)&&(!project||project.employees.includes(a.employee)));
}
function planningAbsenceCards(date){return planningAbsences(date).map(a=>`<article class="absence-card"><span>${esc(absenceKind(a))}</span><h3>${esc(person(a.employee)?.name||a.employeeName)}</h3><p>${esc(absenceTime(a))}</p>${btn('Ver ausência','absence-details',false,a.id)}</article>`).join('');}
document.addEventListener('submit',e=>{
  if(e.target.id!=='absence-filters')return;e.preventDefault();const data=Object.fromEntries(new FormData(e.target));
  try{HoursReport.period('week',data.from);HoursReport.period('week',data.until);if(data.until<data.from)throw Error('A data final deve ser igual ou posterior à inicial.');absenceFilter=data;render();}catch(error){toast(error.message);}
});
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-action]');if(!el||!el.dataset.action.startsWith('absence-'))return;
  const action=el.dataset.action,id=el.dataset.id;
  if(action==='absence-new')return absenceForm();
  if(action==='absence-edit')return absenceForm(id);
  if(action==='absence-details')return absenceDetails(id);
  if(action==='absence-cancel')return modal('Cancelar ausência',input('reason','Motivo do cancelamento da ausência','','text','required maxlength="200"',true),d=>change('absenceCancel',{id,reason:d.reason}),'O período fica disponível para planeamento. O registo e o motivo mantêm-se no histórico e são visíveis ao funcionário.');
  if(action==='absence-month'){absenceFilter.from=today().slice(0,7)+'-01';absenceFilter.until=HoursReport.period('month',today()).until;absenceFilter.employee='';absenceFilter.status='active';render();}
});
