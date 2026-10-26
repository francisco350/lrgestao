const crypto=require('node:crypto'),M=require('./model.cjs');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const clock=value=>typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;
const bounds=a=>a.mode==='full'?{start:0,end:1440}:{start:clock(a.start),end:clock(a.end)};
function overlaps(a,date,start,end){const b=bounds(a);return a.status==='active'&&date>=a.from&&date<=a.until&&start<b.end&&end>b.start;}
function blocked(state,employee,date,start,end){return (state.absences||[]).some(a=>a.employee===employee&&overlaps(a,date,clock(start),clock(end)));}
function list(state,user){
  const visible=new Set(user.role==='manager'?state.projects.filter(p=>user.projects.includes(p.id)).flatMap(p=>p.employees):[]);
  return (state.absences||[]).filter(a=>user.role==='admin'||(user.role==='worker'?a.employee===user.employeeId:user.role==='manager'&&visible.has(a.employee))).map(a=>{
    if(user.role==='admin')return {...a,history:a.history||[]};
    const {id,employee,employeeName,from,until,mode,start,end,status,updatedAt,revision}=a;
    const row={id,employee,employeeName,from,until,mode,start,end,status,updatedAt,revision};
    // Managers need availability, never personal descriptions or previous versions.
    return user.role==='worker'?{...row,kind:a.kind,note:a.note,cancelReason:a.cancelReason}:row;
  });
}
function apply(state,user,type,data){
  if(!['absenceCreate','absenceUpdate','absenceCancel'].includes(type))return false;
  if(user.role!=='admin')fail('Só o administrador pode gerir férias e indisponibilidades.',403);
  const rows=state.absences||[],stamp=new Date().toISOString(),old=type==='absenceCreate'?null:rows.find(a=>a.id===data.id);
  if(type!=='absenceCreate'){
    if(!old)fail('Ausência não encontrada.',404);
    if(old.status!=='active')fail('Esta ausência já foi cancelada.',409);
  }
  if(type==='absenceCancel'){
    if(typeof data.reason!=='string'||!data.reason.trim()||data.reason.trim().length>200)fail('Indique o motivo do cancelamento, até 200 caracteres.');
    old.history??=[];old.history.push({type,at:stamp,by:user.id,author:user.name||user.id,reason:data.reason.trim()});
    Object.assign(old,{status:'cancelled',cancelReason:data.reason.trim(),updatedAt:stamp,updatedBy:user.id,revision:(old.revision||1)+1});return true;
  }
  const person=state.employees.find(e=>e.id===data.employee);
  if(!person?.active)fail('Selecione um funcionário ativo.');
  // Keep the employee fixed on edits so previous personal details cannot transfer to another person.
  if(old&&old.employee!==data.employee)fail('Não pode trocar o funcionário de uma ausência. Cancele e crie outro registo.');
  if(!['holiday','unavailable'].includes(data.kind))fail('Selecione férias ou indisponibilidade.');
  if(!['full','partial'].includes(data.mode))fail('Selecione dias completos ou um intervalo de horas.');
  if(!M.validDate(data.from)||!M.validDate(data.until)||data.from<'1900-01-01'||data.until>'9998-12-31'||data.until<data.from)fail('Indique datas válidas, com fim igual ou posterior ao início.');
  if((Date.parse(data.until+'T00:00Z')-Date.parse(data.from+'T00:00Z'))/86400000>=366)fail('Cada registo pode abranger até 366 dias.');
  if(data.mode==='partial'&&(data.from!==data.until||!Number.isFinite(clock(data.start))||!Number.isFinite(clock(data.end))||clock(data.end)<=clock(data.start)))fail('O intervalo de horas deve começar e terminar no mesmo dia, com saída posterior à entrada.');
  if(typeof data.note!=='string'||data.note.trim().length>200)fail('Use uma observação até 200 caracteres.');
  const value={employee:person.id,employeeName:person.name,kind:data.kind,from:data.from,until:data.until,mode:data.mode,start:data.mode==='full'?'00:00':data.start,end:data.mode==='full'?'24:00':data.end,note:data.note.trim(),status:'active'};
  const b=bounds(value);
  if(rows.some(a=>a.id!==old?.id&&a.employee===person.id&&a.from<=value.until&&a.until>=value.from&&overlaps(a,a.from>value.from?a.from:value.from,b.start,b.end)))fail('Já existe uma ausência nesse período para este funcionário.',409);
  if((state.planning||[]).some(p=>p.employee===person.id&&p.status==='planned'&&overlaps(value,p.date,clock(p.start),clock(p.end))))fail('Existe trabalho planeado neste período. Reagende ou cancele essas atribuições antes de guardar a ausência.',409);
  if(old){
    const {history,...before}=old;old.history??=[];old.history.push({type,at:stamp,by:user.id,author:user.name||user.id,before});
    Object.assign(old,value,{updatedAt:stamp,updatedBy:user.id,revision:(old.revision||1)+1});
  }else{
    state.absences??=[];state.absences.push({id:crypto.randomUUID(),...value,revision:1,createdBy:user.id,createdAt:stamp,updatedAt:stamp,history:[{type,at:stamp,by:user.id,author:user.name||user.id}]});
  }
  return true;
}
module.exports={apply,list,blocked};
