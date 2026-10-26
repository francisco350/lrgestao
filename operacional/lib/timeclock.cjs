const crypto=require('node:crypto');
const M=require('./model.cjs');
const corrections=require('./clock-corrections.cjs');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const dateFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'});
const timeFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const localDate=ms=>dateFormat.format(new Date(ms));
const localMinute=ms=>{const [h,m,s]=timeFormat.format(new Date(ms)).split(':').map(Number);return h*60+m+s/60+(ms%1000)/60000;};
const active=s=>['working','paused'].includes(s.status);
const effective=s=>({...s,...s.adjustment});
const duration=(s,now=Date.now())=>s.intervals.reduce((n,i)=>n+Math.max(0,Date.parse(i.end||new Date(now).toISOString())-Date.parse(i.start)),0);
const allowed=(s,u)=>u.role==='admin'||(u.role==='worker'?s.employee===u.employeeId:u.projects.includes(s.project)||s.employee===u.employeeId);
function list(state,user,now=Date.now()){
  return (state.clockShifts||[]).filter(s=>allowed(s,user)).map(s=>{
    const {snapshot,...out}=s;
    return {...out,...s.adjustment,original:{startedAt:s.startedAt,endedAt:s.endedAt,intervals:s.intervals,note:s.note},workedMs:duration(effective(s),now)};
  });
}
// Split elapsed time at Lisbon calendar boundaries, retaining UTC intervals for DST.
function dailyEntries(shift){
  if(Date.parse(shift.endedAt)-Date.parse(shift.startedAt)>48*3600000)fail('Este turno ultrapassa 48 horas. Rejeite-o e registe o horário correto manualmente.');
  const days=new Map();
  for(const interval of shift.intervals){
    let from=Date.parse(interval.start);const end=Date.parse(interval.end);
    while(from<end){
      const date=localDate(from);let until=end;
      if(localDate(end-1)!==date){let low=from,high=end;while(high-low>1){const mid=Math.floor((low+high)/2);if(localDate(mid)===date)low=mid;else high=mid;}until=high;}
      const row=days.get(date)||{date,elapsed:0,segments:[],clockWindows:[]};
      row.elapsed+=until-from;row.segments.push({start:new Date(from).toISOString(),end:new Date(until).toISOString()});
      // Local wall-time ranges are used only to detect overlap with manual records.
      // Inspect each minute so repeated/skipped DST hours cannot hide a collision.
      let min=1440,max=0;
      for(let cursor=from;cursor<until;){const next=Math.min(until,(Math.floor(cursor/60000)+1)*60000);min=Math.min(min,localMinute(cursor));max=Math.max(max,localMinute(next-1)+1/60000);cursor=next;}
      row.clockWindows.push([min,max]);days.set(date,row);from=until;
    }
  }
  return [...days.values()].filter(r=>r.elapsed>=60000).map(r=>({
    id:crypto.randomUUID(),employee:shift.employee,project:shift.project,date:r.date,
    mode:'clock',minutes:Math.floor(r.elapsed/60000),segments:r.segments,clockWindows:r.clockWindows,
    clockShiftId:shift.id,...shift.snapshot,days:Math.floor(r.elapsed/60000)/(shift.snapshot.dayHours*60),
    start:'',end:'',pause:0,note:shift.note||'Ponto registado na aplicação',status:'approved',revision:1,createdBy:shift.createdBy
  }));
}
function apply(state,user,type,data,now=Date.now()){
  if(corrections.apply(state,user,type,data,now,{dailyEntries,effective}))return true;
  if(!['clockIn','clockPause','clockResume','clockOut','clockForceOut','clockApprove','clockReject'].includes(type))return false;
  state.clockShifts??=[];
  const stamp=new Date(now).toISOString();
  const note=value=>{if(value===undefined)return '';if(typeof value!=='string'||value.length>200)fail('Use uma observação até 200 caracteres.');return value.trim();};
  const reason=()=>{const value=note(data.reason);if(!value)fail('Indique o motivo.');return value;};
  if(type==='clockIn'){
    const person=state.employees.find(e=>e.id===user.employeeId&&e.active);
    if(!person)fail('A sua conta precisa de um funcionário ativo associado.',403);
    const p=state.projects.find(p=>p.id===data.project&&p.employees.includes(person.id));
    if(!p||(user.role==='manager'&&!user.projects.includes(p.id)))fail('Escolha uma obra atribuída a si.',403);
    if(p.status==='Concluída')fail('Não é possível iniciar trabalho numa obra concluída.');
    if(state.clockShifts.some(s=>s.employee===person.id&&active(s)))fail('Já tem um turno aberto. Termine-o antes de iniciar outro.',409);
    state.clockShifts.push({id:crypto.randomUUID(),employee:person.id,employeeName:person.name,project:p.id,projectName:p.name,createdBy:user.id,
      startedAt:stamp,endedAt:null,status:'working',intervals:[{start:stamp,end:null}],note:note(data.note),
      snapshot:{unitRate:person.rate,payBasis:person.payBasis,dayHours:person.dayHours,rate:person.payBasis==='hour'?person.rate*person.dayHours:person.rate,category:person.category},
      events:[{type,at:stamp,by:user.id}]});return true;
  }
  const shift=state.clockShifts.find(s=>s.id===data.id);
  if(!shift)fail('Turno não encontrado.',404);
  const own=shift.employee===user.employeeId;
  const responsible=user.role==='admin'||(user.role==='manager'&&user.projects.includes(shift.project));
  if(['clockApprove','clockReject','clockForceOut'].includes(type)){
    if(!responsible)fail('Sem permissão para decidir este turno.',403);
  }else if(!own)fail('Só pode picar o seu próprio ponto.',403);
  const latest=shift.events.at(-1);if(now<Date.parse(latest.at))fail('O relógio do servidor recuou. Tente novamente mais tarde.',409);
  if(type==='clockApprove'||type==='clockReject'){
    if(shift.status!=='pending')fail('O turno já foi decidido ou ainda está aberto.',409);
    if(shift.corrections?.some(c=>c.status==='pending'))fail('Decida ou cancele primeiro a correção pendente.',409);
    if(type==='clockReject'){shift.rejection=reason();shift.status='rejected';}
    else{
      const entries=dailyEntries(shift);if(!entries.length)fail('O turno não tem um minuto completo de trabalho. Rejeite-o se foi um teste.');
      const all=[...state.entries];for(const row of entries){M.validateWork(row,all);row.validatedBy=user.id;all.push(row);}
      state.entries.push(...entries);shift.entryIds=entries.map(r=>r.id);shift.status='approved';
    }
    shift.decidedBy=user.id;shift.decidedAt=stamp;
  }else{
    if(!active(shift))fail('Este turno já foi terminado.',409);
    if(type==='clockPause'){
      if(shift.status!=='working')fail('O turno já está em pausa.',409);
      shift.intervals.at(-1).end=stamp;shift.status='paused';
    }else if(type==='clockResume'){
      if(shift.status!=='paused')fail('O turno já está a decorrer.',409);
      shift.intervals.push({start:stamp,end:null});shift.status='working';
    }else{
      if(type==='clockForceOut')shift.closeReason=reason();
      if(shift.status==='working')shift.intervals.at(-1).end=stamp;
      shift.endedAt=stamp;shift.status='pending';if(data.note!==undefined)shift.note=note(data.note);
    }
  }
  shift.revision=(shift.revision||1)+1;
  shift.events.push({type,at:stamp,by:user.id});return true;
}
module.exports={apply,list,dailyEntries,duration,localDate};
