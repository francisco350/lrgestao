'use strict';
let clockBase=0,clockReceived=0,clockProject='',clockFilter='all',clockOwner='';
const clockLabels={working:'A trabalhar',paused:'Em pausa',pending:'Por validar',approved:'Validado',rejected:'Rejeitado'};
const clockOpen=s=>['working','paused'].includes(s.status);
const clockStamp=s=>s?new Intl.DateTimeFormat('pt-PT',{timeZone:'Europe/Lisbon',year:'numeric',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(s)):'—';
function clockSync(){clockBase=Date.parse(state.serverNow)||Date.now();clockReceived=performance.now();}
const clockNow=()=>clockBase+performance.now()-clockReceived;
function clockElapsed(s){return s.workedMs+(s.status==='working'?Math.max(0,clockNow()-clockBase):0);}
function clockDuration(ms){const n=Math.floor(ms/1000);return `${Math.floor(n/3600)}h ${String(Math.floor(n/60)%60).padStart(2,'0')}m ${String(n%60).padStart(2,'0')}s`;}
const myClock=()=>state.clockShifts?.find(s=>s.employee===current.employeeId&&clockOpen(s));
function clockNotice(){
  const own=myClock(),pending=(state.clockShifts||[]).filter(s=>s.status==='pending').length;
  return `<div class="clock-notice"><div><strong>${own?`${esc(clockLabels[own.status])} · ${esc(own.projectName)}`:'Ponto na aplicação'}</strong><p>${own?'O seu turno continua aberto, mesmo que saia da aplicação.':`${pending} turno(s) por validar · ${(state.clockShifts||[]).filter(s=>clockPending(s)).length} correção(ões) por decidir. Entre na obra e registe o início do trabalho.`}</p></div>${btn('Picar o ponto','open-clock',true)}</div>`;
}
function clockView(){
  if(clockOwner!==current.id){clockOwner=current.id;clockFilter='all';clockProject='';}
  const own=myClock(),employee=person(current.employeeId),eligible=state.projects.filter(p=>p.status!=='Concluída'&&p.employees.includes(current.employeeId));
  const shifts=state.clockShifts||[],pending=shifts.filter(s=>s.status==='pending').length;
  let card;
  if(own){
    card=`<section class="clock-card ${own.status==='paused'?'is-paused':''}"><div><span class="eyebrow">${clockLabels[own.status].toUpperCase()}</span><h2>${esc(own.projectName)}</h2><p>Entrada: ${clockStamp(own.startedAt)} · ${esc(own.employeeName)}</p><div class="clock-counter" data-clock-timer="${own.id}">${clockDuration(clockElapsed(own))}</div><p>Tempo de trabalho · pausas descontadas</p>${clockNow()-Date.parse(own.startedAt)>12*3600000?'<p class="clock-warning">Este turno está aberto há mais de 12 horas. Confirme se se esqueceu de registar a saída.</p>':''}</div><div class="clock-buttons">${own.status==='working'?btn('Iniciar pausa','clockPause',false,own.id):btn('Retomar trabalho','clockResume',true,own.id)}${btn('Terminar turno','clock-out',true,own.id)}</div></section>`;
  }else if(!employee?.active){
    card=`<div class="notice">${admin()?'Para picar o seu próprio ponto, associe a sua conta a um funcionário em Utilizadores e acessos. Pode acompanhar e validar a equipa abaixo.':'Peça ao administrador para associar a sua conta a um funcionário ativo.'}</div>`;
  }else if(!eligible.length){card='<div class="notice">Não tem obras disponíveis para picar o ponto. Peça ao responsável para confirmar a sua associação à equipa da obra.</div>';}
  else{
    if(!eligible.some(p=>p.id===clockProject))clockProject=eligible[0].id;
    card=`<section class="clock-card"><div><span class="eyebrow">PRONTO PARA COMEÇAR</span><h2>Em que obra vai trabalhar?</h2><p>${esc(employee.name)} · A entrada é registada ao confirmar.</p><form id="clock-in-form">${select('project','Obra para picar o ponto',eligible.map(p=>[p.id,p.name]),clockProject,true)}<button class="btn primary" type="submit">Iniciar trabalho</button></form></div><div class="clock-explainer"><strong>Entrada → pausas → saída</strong><p>Para mudar de obra, termine este turno e inicie outro na nova obra. As horas ficam disponíveis para validação do responsável.</p></div></section>`;
  }
  const rows=shifts.filter(s=>clockFilter==='all'||(clockFilter==='active'?clockOpen(s):s.status===clockFilter)).sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
  return heading('Picar o ponto','Registe o seu trabalho por obra. Horas apresentadas no fuso de Lisboa.',btn('Atualizar','refresh'))+card+
    `<div class="notice">É necessária ligação à aplicação para confirmar cada picagem. Fechar a página não termina o turno. Apenas os minutos completos, validados pelo responsável, entram no apuramento.</div>`+
    panel(responsible()?'Ponto da equipa':'Os meus turnos',`${pending} turno(s) por validar. As picagens originais ficam guardadas no histórico.`,
      `<div class="toolbar">${select('clock-status','Mostrar turnos',[['all','Todos'],['active','Em curso / pausa'],['pending','Por validar'],['approved','Validados'],['rejected','Rejeitados']],clockFilter)}</div>`+
      table(['Funcionário / obra','Entrada / saída','Tempo trabalhado','Estado','Ações'],rows.map(s=>`<tr><td><strong>${esc(s.employeeName)}</strong><small>${esc(s.projectName)}</small></td><td>${clockStamp(s.startedAt)}<small>${s.endedAt?clockStamp(s.endedAt):'Turno aberto'}</small></td><td><span ${s.status==='working'?`data-clock-timer="${s.id}"`:''}>${clockDuration(clockElapsed(s))}</span></td><td>${badge(clockLabels[s.status],s.status==='rejected'?'red':['pending','paused'].includes(s.status)?'amber':'')}${s.rejection?`<small>${esc(s.rejection)}</small>`:''}</td><td><div class="row-actions">${btn('Detalhes','clock-detail',false,s.id)}${clockCorrectionActions(s)}${responsible()&&(admin()||current.projects.includes(s.project))&&s.status==='pending'&&!clockPending(s)?btn('Validar turno','clockApprove',false,s.id)+btn('Rejeitar turno','clock-reject',false,s.id):''}${responsible()&&(admin()||current.projects.includes(s.project))&&clockOpen(s)&&s.employee!==current.employeeId?btn('Fechar turno','clock-force-out',false,s.id):''}</div></td></tr>`)))+clockCorrectionsPanel();
}
function clockDetails(id){
  const s=state.clockShifts.find(s=>s.id===id);if(!s)return toast('Turno indisponível. Atualize os dados.');
  modalVersion++;$('#modal-title').textContent='Detalhes do ponto';const form=$('#form');form.oninput=null;form.onchange=null;form.onsubmit=e=>e.preventDefault();
  const labels={clockIn:'Entrada',clockPause:'Início de pausa',clockResume:'Retoma',clockOut:'Saída',clockForceOut:'Fecho pelo responsável',clockApprove:'Validação',clockReject:'Rejeição',clockRequestCorrection:'Pedido de correção',clockApproveCorrection:'Correção aprovada',clockRejectCorrection:'Correção recusada',clockCancelCorrection:'Pedido cancelado'};
  form.innerHTML=`<p><strong>${esc(s.employeeName)}</strong><br>${esc(s.projectName)}</p><p>${esc(clockLabels[s.status])} · ${clockDuration(clockElapsed(s))}</p>${s.note?`<p>${esc(s.note)}</p>`:''}${s.adjustment?`<h3>Picagens originais</h3>${periodList(s.original)}<h3>Horário em vigor</h3>${periodList(s)}`:''}${s.rejection?`<p>Motivo: ${esc(s.rejection)}</p>`:''}${s.closeReason?`<p>Fecho pelo responsável: ${esc(s.closeReason)}</p>`:''}${table(['Movimento','Data / hora'],s.events.map(e=>`<tr><td>${esc(labels[e.type]||e.type)}</td><td>${clockStamp(e.at)}</td></tr>`))}<p class="form-help">Os turnos validados aparecem em Registos de trabalho, repartidos por dia quando atravessam a meia-noite. Use Pedir correção para propor alterações com validação.</p><div class="form-actions">${btn('Fechar','close-modal',true)}</div>`;
  $('#modal [data-action="close-modal"]').hidden=false;$('#modal').showModal();
}
async function clockChange(type,data){try{await change(type,data);}catch(error){if(error.status===409)await load();throw error;}}
document.addEventListener('submit',async e=>{
  if(e.target.id!=='clock-in-form')return;e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
  try{await clockChange('clockIn',{project:new FormData(e.target).get('project')});}catch(error){toast(error.message);}finally{button.disabled=false;}
});
document.addEventListener('change',e=>{if(e.target.name==='clock-status'){clockFilter=e.target.value;render();}if(e.target.closest('#clock-in-form')&&e.target.name==='project')clockProject=e.target.value;});
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action]');if(!el)return;const id=el.dataset.id;
  try{switch(el.dataset.action){
    case'open-clock':location.hash='ponto';if(id)clockDetails(id);break;
    case'project-clock':clockOwner=current.id;clockProject=id;location.hash='ponto';break;
    case'clockPause':case'clockResume':case'clockApprove':el.disabled=true;try{await clockChange(el.dataset.action,{id});}finally{el.disabled=false;}break;
    case'clock-out':modal('Terminar turno',input('note','Trabalho realizado / observação',state.clockShifts.find(s=>s.id===id)?.note||'','text','maxlength="200"',true),d=>clockChange('clockOut',{id,note:d.note}),'A saída será registada ao guardar. O turno será enviado para validação.');break;
    case'clock-reject':modal('Rejeitar turno',input('reason','Motivo da rejeição','','text','required maxlength="200"',true),d=>clockChange('clockReject',{id,reason:d.reason}),'As picagens são preservadas. Se necessário, introduza o horário correto em Registos de trabalho.');break;
    case'clock-force-out':modal('Fechar turno aberto',input('reason','Motivo do fecho','','text','required maxlength="200"',true),d=>clockChange('clockForceOut',{id,reason:d.reason}),'A saída fica registada com a hora atual. Confirme o horário antes de validar; se estiver incorreto, rejeite o turno e registe o trabalho manualmente.');break;
    case'clock-detail':clockDetails(id);break;
  }}catch(error){toast(error.message);}
});
setInterval(()=>{if(!state||!current)return;for(const el of document.querySelectorAll('[data-clock-timer]')){const s=state.clockShifts?.find(s=>s.id===el.dataset.clockTimer);if(s)el.textContent=clockDuration(clockElapsed(s));}},1000);
