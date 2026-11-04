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
  return heading(current.role==='worker'?'A minha agenda':'Agenda','Organize a semana por obra e consulte o trabalho previsto.',`<a class="btn" href="#ausencias">Consultar ausências</a>`+(responsible()?btn('+ Adicionar trabalho','plan-new',true):''))+
    `<section class="panel"><form id="planning-filters" class="hours-filters">${input('date','Semana de referência',planningFilter.date,'date','required')}${optionalSelect('project','Obra no planeamento',[['','Todas as obras'],...state.projects.map(p=>[p.id,p.name])],planningFilter.project)}${optionalSelect('employee','Funcionário no planeamento',[['','Todos os disponíveis'],...state.employees.map(e=>[e.id,e.name])],planningFilter.employee)}${select('status','Estado do planeamento',[['planned','Ativo'],['all','Ativo e cancelado'],['cancelled','Cancelado']],planningFilter.status)}<div class="actions"><button class="btn primary" type="submit">Aplicar ao planeamento</button><button class="btn" type="button" data-action="plan-clear">Limpar filtros</button></div></form></section>`+
    `<section class="stats planning-stats">${stat('Horas previstas',hours(active.reduce((n,p)=>n+p.minutes,0)),'Pausas descontadas')}${stat('Funcionários planeados',new Set(active.map(p=>p.employee)).size,'Nas obras e datas selecionadas')}${stat('Obras planeadas',new Set(active.map(p=>p.project)).size,'Com atribuições ativas')}${stat('Atribuições a rever',active.filter(p=>p.needsReview).length,'Equipa alterada ou obra concluída')}</section><details class="notice info-disclosure"><summary>Informação da agenda</summary><div>Arraste o cursor dentro de um dia ou use + para adicionar trabalho. O tipo sugerido depende do dia e da hora de saída. O planeamento guardado não é validado automaticamente com a passagem do tempo. Os horários são previstos para o mesmo dia, em Lisboa. O período inteiro, incluindo a pausa, fica reservado para impedir atribuições sobrepostas. As ausências ativas da equipa também aparecem, independentemente do filtro de estado do planeamento.</div></details>`+
    `<header class="agenda-navigation"><div class="actions">${btn('← Semana anterior','plan-prev')}${btn('Esta semana','plan-current')}${btn('Semana seguinte →','plan-next')}</div><strong>${fullDate(week.from)} — ${fullDate(week.until)}</strong></header><section class="planning-week" aria-label="Agenda semanal">${week.days.map(d=>`<section class="plan-day" data-plan-date="${d}"><div class="plan-day-heading"><h2>${date(d)}</h2>${d===today()?badge('Hoje'):''}${responsible()?`<button type="button" class="btn" data-plan-add="${d}" aria-label="Adicionar em ${date(d)}">+</button>`:''}</div>${planningAbsenceCards(d)}${calendarActualCards(d)}${rows.filter(p=>p.date===d).map(card).join('')||'<p class="plan-empty">Sem trabalho planeado.</p>'}</section>`).join('')}</section>`;
}
function planningForm(id,selectedDate=''){
  const p=id?(state.planning||[]).find(p=>p.id===id):null;
  if(id&&!p)return toast('Planeamento indisponível.');
  const projects=state.projects.filter(o=>o.status!=='Concluída'||o.id===p?.project);
  if(!projects.length)return toast('É necessária uma obra ativa para planear trabalho.');
  const week=HoursReport.period('week',planningFilter.date),project=p?.project||planningFilter.project||projects[0].id;
  const chosenDate=p?.date||selectedDate||(week.days.includes(today())?today():week.from);
  const dates=p?input('date','Dia planeado',p.date,'date','required'):`<div class="field full">Dia selecionado: <strong>${fullDate(chosenDate)}</strong><input type="hidden" name="date" value="${chosenDate}"></div>`;
  modal(p?'Editar planeamento':'Adicionar trabalho',select('project','Obra',projects.map(o=>[o.id,o.name]),project,true)+`<div class="field full" id="planning-people"></div>`+dates+(p?'':select('registration','Tipo de registo',[['planned','Trabalho previsto (sem custos)'],['approved','Trabalho realizado e validado']],'planned',true)+`<div class="field full form-preview" id="calendar-preview" aria-live="polite"></div>`)+
    input('start','Entrada',p?.start||'08:00','time','required')+input('end','Saída',p?.end||'17:00','time','required')+input('pause','Pausa (minutos)',p?.pause??60,'number','required min="0" max="1438" step="1"')+input('note','Descrição do trabalho',p?.note||'','text','maxlength="200"',true),
    d=>change(p?'planUpdate':'calendarCreate',{id:p?.id,registration:d.registration,project:d.project,...(p?{date:d.date,employee:d.employee}:{dates:[d.date],employees:d.employees}),start:d.start,end:d.end,pause:Number(d.pause),note:d.note}),
    'Selecione apenas funcionários associados à obra. A gravação é feita em conjunto: se houver uma sobreposição, nenhuma das novas atribuições é guardada.');
  const people=()=>{
    const chosen=worksite($('#form').elements.project.value),list=state.employees.filter(e=>e.active&&chosen?.employees.includes(e.id));
    if(p&&!list.some(e=>e.id===p.employee))list.push({id:p.employee,name:p.employeeName+' (associação a rever)'});
    $('#planning-people').innerHTML=p?select('employee','Funcionário planeado',list.map(e=>[e.id,e.name]),p.employee,true):checks('employees','Colaboradores',list.map(e=>[e.id,e.name]),[]);
    if(!list.length)$('#planning-people').innerHTML='<p>Esta obra não tem funcionários ativos associados. Atualize a equipa da obra antes de planear.</p>';
  };
  $('#form').elements.project.addEventListener('change',people);people();
  if(!p){
    let manualChoice=false;
    const preview=event=>{
      const f=$('#form'),now=new Date(clockNow()),date=now.toLocaleDateString('sv-SE',{timeZone:'Europe/Lisbon'}),time=now.toLocaleTimeString('en-GB',{timeZone:'Europe/Lisbon',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const end=f.elements.end.value;
      const ended=Boolean(end)&&(chosenDate<date||(chosenDate===date&&end+':00'<time));
      const type=f.elements.registration;
      if(event?.target===type)manualChoice=true;
      if(!manualChoice||(type.value==='approved'&&!ended)){
        type.value=ended?'approved':'planned';
        manualChoice=false;
      }
      type.querySelector('[value="approved"]').disabled=!ended;
      const minutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
      const duration=minutes(f.elements.end.value)-minutes(f.elements.start.value)-Number(f.elements.pause.value);
      $('#calendar-preview').textContent=`${Number.isFinite(duration)&&duration>0?hours(duration):'Horário inválido'} por colaborador/dia. ${type.value==='approved'?'O trabalho entra imediatamente nos custos.':'O trabalho fica planeado, sem custos.'}`;
    };
    $('#form').oninput=preview;preview();
  }
}
function planningDetails(id){
  const p=state.planning?.find(p=>p.id===id);if(!p)return toast('Planeamento indisponível.');
  modalVersion++;$('#modal-title').textContent='Detalhes do planeamento';const form=$('#form');form.oninput=null;form.onchange=null;form.onsubmit=e=>e.preventDefault();
  form.innerHTML=`<p><strong>${esc(p.employeeName)}</strong><br>${esc(p.projectName)}</p><p>${fullDate(p.date)} · ${esc(p.start)}–${esc(p.end)}<br>${hours(p.minutes)} previstas · pausa ${p.pause}m</p><p>${esc(p.note)}</p>${p.cancelReason?`<p>Cancelamento: ${esc(p.cancelReason)}</p>`:''}<details class="form-help info-disclosure"><summary>Mais detalhes</summary><div>Última alteração: ${clockStamp(p.updatedAt)} · versão ${p.revision}</div></details>${admin()?table(['Operação','Autor / data','Antes da alteração'],(p.history||[]).map(h=>`<tr><td>${esc({planCreate:'Criação',planUpdate:'Alteração',planCancel:'Cancelamento'}[h.type])}${h.reason?`<small>${esc(h.reason)}</small>`:''}</td><td>${esc(h.author)}<small>${clockStamp(h.at)}</small></td><td>${h.before?`${esc(h.before.employeeName)} · ${esc(h.before.projectName)}<small>${fullDate(h.before.date)} · ${esc(h.before.start)}–${esc(h.before.end)} · pausa ${h.before.pause}m</small><small>${esc(h.before.note)}</small>`:'—'}</td></tr>`)):''}<div class="form-actions">${btn('Fechar','close-modal',true)}</div>`;
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

// The rectangle selects its starting calendar day; times remain editable in the form.
let planDrag=null;
function clearPlanDrag(){
  document.querySelector('#plan-selection')?.remove();
  document.querySelectorAll('.plan-selected').forEach(el=>el.classList.remove('plan-selected'));
  document.body.classList.remove('plan-dragging');
  planDrag=null;
}
document.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.pointerType==='touch'||!responsible()||!e.target.closest('[data-plan-date]')||e.target.closest('button,a,input,select,.plan-card'))return;
  planDrag={x:e.clientX,y:e.clientY,day:e.target.closest('[data-plan-date]'),moved:false};
});
document.addEventListener('pointermove',e=>{
  if(!planDrag)return;
  if(!planDrag.moved&&Math.hypot(e.clientX-planDrag.x,e.clientY-planDrag.y)<6)return;
  planDrag.moved=true;document.body.classList.add('plan-dragging');
  let box=document.querySelector('#plan-selection');
  if(!box){box=document.createElement('div');box.id='plan-selection';document.body.append(box);}
  const left=Math.min(e.clientX,planDrag.x),top=Math.min(e.clientY,planDrag.y),right=Math.max(e.clientX,planDrag.x),bottom=Math.max(e.clientY,planDrag.y);
  Object.assign(box.style,{left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});
  planDrag.day.classList.toggle('plan-selected',(()=>{const r=planDrag.day.getBoundingClientRect();return r.left<right&&r.right>left&&r.top<bottom&&r.bottom>top;})());
});
document.addEventListener('pointerup',()=>{
  if(!planDrag)return;
  const date=planDrag.moved?planDrag.day.dataset.planDate:'';clearPlanDrag();
  if(date)planningForm(null,date);
});
document.addEventListener('pointercancel',clearPlanDrag);
window.addEventListener('blur',clearPlanDrag);
document.addEventListener('keydown',e=>{if(e.key==='Escape')clearPlanDrag();});
document.addEventListener('click',e=>{const add=e.target.closest('[data-plan-add]');if(add&&responsible())planningForm(null,add.dataset.planAdd);});

function calendarActualCards(date){
  return state.entries.filter(r=>r.date===date&&(!planningFilter.project||r.project===planningFilter.project)&&(!planningFilter.employee||r.employee===planningFilter.employee)).map(r=>`<article class="plan-card"><div class="plan-time">${esc(r.start||'')}–${esc(r.end||'')}${status(r)}</div><h3>${esc(person(r.employee)?.name||'Funcionário')}</h3><p>${esc(worksite(r.project)?.name||'Obra')}</p><small>${hours(r.minutes)} realizadas</small><div class="row-actions">${workShortcut('Ver registo',r.employee,r.project,r.status,date,date)}</div></article>`).join('');
}
