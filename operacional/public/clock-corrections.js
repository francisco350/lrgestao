'use strict';
const clockPending=s=>s.corrections?.find(c=>c.status==='pending');
const clockCanManage=s=>admin()||(current.role==='manager'&&current.projects.includes(s.project));
const clockCanRequest=s=>!clockOpen(s)&&!clockPending(s)&&(s.employee===current.employeeId||clockCanManage(s));
const clockCanDecide=(s,c)=>clockCanManage(s)&&c.requestedBy!==current.id&&s.employee!==current.employeeId;
const correctionLabels={pending:'Correção por decidir',approved:'Correção aprovada',rejected:'Correção recusada',cancelled:'Pedido cancelado'};
const correctionMs=value=>value.intervals.reduce((n,i)=>n+Date.parse(i.end)-Date.parse(i.start),0);
const clockLocal=iso=>new Date(iso).toLocaleDateString('sv-SE',{timeZone:'Europe/Lisbon'})+'T'+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso));
const periodList=value=>`<ol class="clock-period-list">${value.intervals.map(i=>`<li>${clockStamp(i.start)} → ${clockStamp(i.end)}</li>`).join('')}</ol>`;
function clockCorrectionActions(s){
  const pending=clockPending(s);
  return pending?btn('Rever correção','clock-review',false,s.id):clockCanRequest(s)?btn('Pedir correção','clock-request',false,s.id):'';
}
function clockCorrectionsPanel(){
  const rows=(state.clockShifts||[]).flatMap(s=>(s.corrections||[]).map(c=>({s,c}))).sort((a,b)=>(a.c.status==='pending'?0:1)-(b.c.status==='pending'?0:1)||b.c.requestedAt.localeCompare(a.c.requestedAt));
  if(!rows.length)return '';
  return panel('Correções de ponto','O horário atual mantém-se até à aprovação por outro responsável.',`<div class="clock-corrections">${rows.map(({s,c})=>`<article class="clock-correction-card"><div><strong>${esc(s.employeeName)} · ${esc(s.projectName)}</strong><p>${esc(c.reason)}</p><small>${esc(c.requestedName)} · ${clockStamp(c.requestedAt)}</small></div><div>${badge(correctionLabels[c.status],c.status==='pending'?'amber':c.status==='rejected'?'red':'')}${btn('Comparar horários','clock-review-record',false,c.id)}</div></article>`).join('')}</div>`).replace('class="panel"','class="panel activity-panel"');
}
function clockCorrectionForm(id){
  const s=state.clockShifts.find(s=>s.id===id);if(!s||!clockCanRequest(s))return toast('Não é possível pedir uma correção neste turno.');
  let index=0;
  const fields=`<p class="field full">${esc(s.employeeName)} · ${esc(s.projectName)}<br>Indique os períodos em que trabalhou. Os espaços entre períodos serão tratados como pausas. Datas e horas de Lisboa.</p><div id="clock-periods" class="field full"></div><button type="button" class="btn" id="add-clock-period">+ Adicionar período</button>`+
    input('reason','Motivo da correção','','text','required maxlength="200"',true)+input('note','Descrição corrigida do trabalho',s.note||'','text','maxlength="200"',true);
  modal('Pedir correção do ponto',fields,d=>clockChange('clockRequestCorrection',{id,reason:d.reason,note:d.note,intervals:[...$('#clock-periods').children].map(el=>{const i=el.dataset.index;return {startLocal:d['startLocal'+i],endLocal:d['endLocal'+i],startOffset:d['startOffset'+i],endOffset:d['endOffset'+i]};})}),
    'Horários ao minuto, até 12 períodos e 48 horas. A obra e o funcionário mantêm-se. Só a aprovação atualiza os apuramentos; pagamentos efetuados permanecem registados.');
  const add=(start='',end='')=>{
    const container=$('#clock-periods');if(container.children.length>=12)return toast('Limite de 12 períodos.');
    const i=index++,row=document.createElement('fieldset');row.className='clock-period';row.dataset.index=String(i);
    row.innerHTML=`<legend>Período de trabalho</legend><div class="clock-period-fields">${input('startLocal'+i,'Entrada do período '+(i+1),start,'datetime-local','required')}${input('endLocal'+i,'Saída do período '+(i+1),end,'datetime-local','required')}</div><details><summary>Mudança de hora (opcional)</summary><div class="clock-period-fields">${select('startOffset'+i,'Fuso da entrada '+(i+1),[['auto','Automático · Lisboa'],['60','UTC+1 · hora de verão'],['0','UTC+0 · hora de inverno']],'auto')}${select('endOffset'+i,'Fuso da saída '+(i+1),[['auto','Automático · Lisboa'],['60','UTC+1 · hora de verão'],['0','UTC+0 · hora de inverno']],'auto')}</div></details><button type="button" class="btn clock-remove-period">Remover período</button>`;
    row.querySelector('.clock-remove-period').onclick=()=>{if(container.children.length===1)return toast('Mantenha pelo menos um período.');row.remove();};container.append(row);
  };
  for(const i of s.intervals)add(clockLocal(i.start),clockLocal(i.end));
  $('#add-clock-period').onclick=()=>add();
}
function clockReviewCorrection(id,correctionId){
  const s=state.clockShifts.find(s=>s.id===id),c=s?.corrections?.find(c=>c.id===correctionId)||clockPending(s||{});
  if(!s||!c)return toast('Pedido indisponível. Atualize os dados.');
  modalVersion++;$('#modal-title').textContent='Comparar correção de ponto';
  const form=$('#form');form.oninput=null;form.onchange=null;form.onsubmit=e=>e.preventDefault();
  const previous=c.original;
  const actions=c.status==='pending'?(clockCanDecide(s,c)?btn('Aprovar correção de ponto','clock-approve-correction',true,c.id)+btn('Recusar correção de ponto','clock-reject-correction',false,c.id):c.requestedBy===current.id?btn('Cancelar pedido','clock-cancel-correction',false,c.id):''):'';
  form.innerHTML=`<p><strong>${esc(s.employeeName)} · ${esc(s.projectName)}</strong></p>${badge(correctionLabels[c.status],c.status==='pending'?'amber':'')}<p>Motivo: <strong>${esc(c.reason)}</strong></p><div class="clock-comparison"><section><h3>Antes do pedido</h3><strong>${clockDuration(correctionMs(previous))}</strong>${periodList(previous)}<p>${esc(previous.note)}</p></section><section><h3>Horário proposto</h3><strong>${clockDuration(correctionMs(c.proposed))}</strong>${periodList(c.proposed)}<p>${esc(c.proposed.note)}</p></section></div><p class="form-help">Pedido por ${esc(c.requestedName)} em ${clockStamp(c.requestedAt)}.${c.decidedAt?` Decisão: ${esc(c.decidedName)} · ${clockStamp(c.decidedAt)}.`:''}${c.decisionReason?` Motivo da recusa: ${esc(c.decisionReason)}.`:''}</p>${c.status==='pending'?'<p class="notice">A aprovação substitui o tempo apurado deste turno. Os registos anteriores e os pagamentos efetuados ficam preservados. Os valores são recalculados com a remuneração original.</p>':''}<div id="clock-decision-error" class="form-error" role="alert"></div><div class="form-actions">${btn('Fechar','close-modal')}${actions}</div>`;
  $('#modal [data-action="close-modal"]').hidden=false;$('#modal').showModal();
}
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action]');if(!el)return;const action=el.dataset.action,id=el.dataset.id;
  if(action==='clock-request')return clockCorrectionForm(id);
  if(action==='clock-review')return clockReviewCorrection(id);
  const s=state?.clockShifts?.find(s=>s.corrections?.some(c=>c.id===id));
  if(action==='clock-review-record'&&s)return clockReviewCorrection(s.id,id);
  if(!['clock-approve-correction','clock-reject-correction','clock-cancel-correction'].includes(action)||!s)return;
  if(action==='clock-reject-correction'){
    modal('Recusar correção de ponto',input('reason','Motivo da recusa','','text','required maxlength="200"',true),d=>clockChange('clockRejectCorrection',{id:s.id,correctionId:id,reason:d.reason}),'O horário anterior e os valores apurados mantêm-se.');return;
  }
  el.disabled=true;
  try{await clockChange(action==='clock-approve-correction'?'clockApproveCorrection':'clockCancelCorrection',{id:s.id,correctionId:id});$('#modal').close();}
  catch(error){if($('#clock-decision-error'))$('#clock-decision-error').textContent=error.message;else toast(error.message);}
  finally{el.disabled=false;}
});
