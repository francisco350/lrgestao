const crypto=require('node:crypto'),M=require('./model.cjs');
const Absences=require('./absences.cjs');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const allowed=(state,user,id)=>state.projects.some(p=>p.id===id&&(user.role==='admin'||user.role==='manager'&&user.projects.includes(id)||user.role==='worker'&&p.employees.includes(user.employeeId)));
function list(state,user){
  return (state.planning||[]).filter(p=>allowed(state,user,p.project)&&(user.role!=='worker'||p.employee===user.employeeId)).map(p=>{
    const {history,...row}=p;
    const employee=state.employees.find(e=>e.id===p.employee),project=state.projects.find(o=>o.id===p.project);
    return {...row,...(user.role==='admin'?{history:history||[]}:{}),needsReview:p.status==='planned'&&(!employee?.active||!project?.employees.includes(p.employee)||project?.status==='Concluída')};
  });
}
const clock=value=>typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;
function apply(state,user,type,data){
  if(!['planCreate','planUpdate','planCancel'].includes(type))return false;
  if(!['admin','manager'].includes(user.role))fail('Só os responsáveis podem gerir o planeamento.',403);
  const plans=state.planning||[],stamp=new Date().toISOString();
  const existing=type==='planCreate'?null:plans.find(p=>p.id===data.id);
  if(type!=='planCreate'){
    if(!existing||!allowed(state,user,existing.project))fail('Planeamento indisponível.',403);
    if(existing.status!=='planned')fail('Este planeamento já foi cancelado.',409);
  }
  if(type==='planCancel'){
    if(typeof data.reason!=='string'||!data.reason.trim()||data.reason.trim().length>200)fail('Indique o motivo do cancelamento, até 200 caracteres.');
    existing.history??=[];existing.history.push({type,at:stamp,by:user.id,author:user.name||user.id,reason:data.reason.trim()});
    Object.assign(existing,{status:'cancelled',cancelReason:data.reason.trim(),updatedAt:stamp,updatedBy:user.id,revision:(existing.revision||1)+1});
    return true;
  }
  const project=state.projects.find(p=>p.id===data.project);
  if(!project||!allowed(state,user,project.id))fail('Sem acesso a esta obra.',403);
  if(project.status==='Concluída')fail('Não pode planear trabalho numa obra concluída.');
  const dates=type==='planUpdate'?[data.date]:data.dates,employees=type==='planUpdate'?[data.employee]:data.employees;
  if(!Array.isArray(dates)||!dates.length||dates.length>7||new Set(dates).size!==dates.length||dates.some(d=>!M.validDate(d)||d<'1900-01-01'||d>'9998-12-31'))fail('Escolha entre 1 e 7 datas válidas, sem repetições.');
  if(!Array.isArray(employees)||!employees.length||employees.length>50||new Set(employees).size!==employees.length)fail('Escolha entre 1 e 50 funcionários, sem repetições.');
  const people=employees.map(id=>state.employees.find(e=>e.id===id));
  if(people.some(e=>!e?.active||!project.employees.includes(e.id)))fail('Associe à obra apenas funcionários ativos da sua equipa.');
  const start=clock(data.start),end=clock(data.end),pause=data.pause;
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)fail('Indique entrada e saída válidas no mesmo dia.');
  if(!Number.isInteger(pause)||pause<0||pause>=end-start)fail('A pausa deve ser inferior à duração prevista.');
  if(typeof data.note!=='string'||data.note.trim().length>200)fail('Use uma descrição até 200 caracteres.');
  const values=[];
  for(const date of dates)for(const person of people){
    if(Absences.blocked(state,person.id,date,data.start,data.end))fail('O funcionário está indisponível nesse período. Consulte as ausências antes de planear.',409);
    if(plans.some(p=>p.id!==existing?.id&&p.status==='planned'&&p.employee===person.id&&p.date===date&&start<clock(p.end)&&end>clock(p.start)))fail('O funcionário já tem trabalho planeado nesse horário. Confirme a disponibilidade com o responsável.',409);
    values.push({employee:person.id,employeeName:person.name,project:project.id,projectName:project.name,date,start:data.start,end:data.end,pause,minutes:end-start-pause,note:data.note.trim()});
  }
  // Validate the complete batch before writing anything.
  if(existing){
    const {history,...before}=existing;
    existing.history??=[];existing.history.push({type,at:stamp,by:user.id,author:user.name||user.id,before});
    Object.assign(existing,values[0],{updatedAt:stamp,updatedBy:user.id,revision:(existing.revision||1)+1});
  }else{
    state.planning??=[];
    for(const value of values)state.planning.push({id:crypto.randomUUID(),...value,status:'planned',revision:1,createdBy:user.id,createdAt:stamp,updatedAt:stamp,history:[{type,at:stamp,by:user.id,author:user.name||user.id}]});
  }
  return true;
}
module.exports={apply,list};
