const crypto=require('node:crypto');
const M=require('./model.cjs');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const dateFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'});
const timeFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const local=ms=>dateFormat.format(new Date(ms))+'T'+timeFormat.format(new Date(ms));
// Resolve Lisbon wall time on the server, independent of the browser's time zone.
function resolveLocal(value,offset='auto'){
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)||!M.validDate(value.slice(0,10)))fail('Indique datas e horas válidas.');
  if(!['auto','0','60'].includes(offset))fail('Selecione um fuso horário válido.');
  const naive=Date.parse(value+':00Z');
  const candidates=[0,60].filter(n=>offset==='auto'||offset===String(n)).map(n=>naive-n*60000).filter(ms=>Number.isFinite(ms)&&local(ms)===value);
  if(!candidates.length)fail('Esta hora não existe em Lisboa ou não corresponde ao fuso escolhido. Confirme a mudança de hora.');
  if(candidates.length>1)fail('Esta hora ocorre duas vezes em Lisboa. Em Mudança de hora, escolha UTC+1 (primeira ocorrência) ou UTC+0 (segunda).');
  return new Date(candidates[0]).toISOString();
}
function proposed(data,now){
  if(!Array.isArray(data.intervals)||!data.intervals.length||data.intervals.length>12)fail('Indique entre 1 e 12 períodos de trabalho.');
  const intervals=data.intervals.map(i=>{
    if(!i||typeof i!=='object')fail('Período de trabalho inválido.');
    return {start:resolveLocal(i.startLocal,i.startOffset??'auto'),end:resolveLocal(i.endLocal,i.endOffset??'auto')};
  });
  for(let n=0;n<intervals.length;n++){
    const i=intervals[n];
    if(i.start>=i.end)fail('Cada saída deve ser posterior à entrada.');
    if(Date.parse(i.end)>now)fail('Não pode propor trabalho no futuro.');
    if(n&&i.start<intervals[n-1].end)fail('Ordene os períodos sem sobreposição. Os intervalos entre períodos são pausas.');
  }
  if(Date.parse(intervals.at(-1).end)-Date.parse(intervals[0].start)>48*3600000)fail('A proposta não pode abranger mais de 48 horas.');
  if(typeof data.reason!=='string'||!data.reason.trim()||data.reason.trim().length>200)fail('Indique um motivo até 200 caracteres.');
  if(data.note!==undefined&&(typeof data.note!=='string'||data.note.length>200))fail('Use uma observação até 200 caracteres.');
  return {startedAt:intervals[0].start,endedAt:intervals.at(-1).end,intervals,note:(data.note||'').trim()};
}
const timing=s=>({startedAt:s.startedAt,endedAt:s.endedAt,intervals:structuredClone(s.intervals),note:s.note||''});
function apply(state,user,type,data,now,{dailyEntries,effective}){
  if(!['clockRequestCorrection','clockApproveCorrection','clockRejectCorrection','clockCancelCorrection'].includes(type))return false;
  const shift=state.clockShifts?.find(s=>s.id===data.id);
  if(!shift)fail('Turno não encontrado.',404);
  const own=user.employeeId===shift.employee;
  const responsible=user.role==='admin'||(user.role==='manager'&&user.projects.includes(shift.project));
  if(!own&&!responsible)fail('Sem acesso a este turno.',403);
  const stamp=new Date(now).toISOString();
  if(now<Date.parse(shift.events.at(-1).at))fail('O relógio do servidor recuou. Tente novamente mais tarde.',409);
  let correction;
  if(type==='clockRequestCorrection'){
    if(!['pending','approved','rejected'].includes(shift.status))fail('Termine o turno antes de pedir uma correção.');
    if(shift.corrections?.some(c=>c.status==='pending'))fail('Este turno já tem uma correção pendente.',409);
    const value=proposed(data,now);
    const rows=dailyEntries({...shift,...value});
    if(!rows.length)fail('A proposta precisa de pelo menos um minuto completo de trabalho.');
    const original=timing(effective(shift));
    if(JSON.stringify(value)===JSON.stringify(original))fail('A proposta é igual ao horário atual.');
    correction={id:crypto.randomUUID(),status:'pending',reason:data.reason.trim(),proposed:value,original,
      baseRevision:shift.revision||1,baseStatus:shift.status,requestedBy:user.id,requestedName:user.name||user.id,requestedAt:stamp};
    shift.corrections??=[];shift.corrections.push(correction);
  }else{
    correction=shift.corrections?.find(c=>c.id===data.correctionId);
    if(!correction)fail('Pedido de correção não encontrado.',404);
    if(correction.status!=='pending')fail('Este pedido já foi decidido.',409);
    if(type==='clockCancelCorrection'){
      if(correction.requestedBy!==user.id)fail('Só o autor pode cancelar o pedido.',403);
      correction.status='cancelled';
    }else{
      if(!responsible)fail('É necessário um responsável desta obra para decidir.',403);
      if(correction.requestedBy===user.id||own)fail('A correção precisa de ser decidida por outro responsável.',403);
      if(type==='clockRejectCorrection'){
        if(typeof data.reason!=='string'||!data.reason.trim()||data.reason.trim().length>200)fail('Indique o motivo da recusa até 200 caracteres.');
        correction.status='rejected';correction.decisionReason=data.reason.trim();
      }else{
        if((shift.revision||1)!==correction.baseRevision||shift.status!==correction.baseStatus)fail('O turno mudou desde o pedido. Recuse o pedido e confirme uma nova proposta.',409);
        const oldIds=new Set(shift.entryIds||[]);
        const oldRows=state.entries.filter(r=>oldIds.has(r.id));
        if(oldRows.length!==oldIds.size||oldRows.some(r=>r.clockShiftId!==shift.id||r.status!=='approved'))fail('Os registos de origem foram alterados. Reveja o turno.',409);
        const rows=dailyEntries({...shift,...correction.proposed});
        if(!rows.length)fail('A proposta não contém trabalho válido.');
        const all=state.entries.filter(r=>!oldIds.has(r.id));
        for(const row of rows){M.validateWork(row,all);row.validatedBy=user.id;row.clockCorrectionId=correction.id;all.push(row);}
        // Commit only after validating every day; store.mutate also wraps this in SQLite.
        for(const row of oldRows){row.status='rejected';row.supersededBy=correction.id;row.rejection='Substituído por correção de picagem.';row.revision=(row.revision||1)+1;}
        state.entries.push(...rows);
        shift.adjustment=structuredClone(correction.proposed);shift.entryIds=rows.map(r=>r.id);
        shift.status='approved';shift.rejection='';shift.decidedBy=user.id;shift.decidedAt=stamp;shift.revision=(shift.revision||1)+1;
        correction.status='approved';correction.entryIds=rows.map(r=>r.id);correction.replacedEntryIds=[...oldIds];
      }
    }
    correction.decidedBy=user.id;correction.decidedName=user.name||user.id;correction.decidedAt=stamp;
  }
  shift.events.push({type,at:stamp,by:user.id,correctionId:correction.id});
  return true;
}
module.exports={apply,resolveLocal,proposed};
