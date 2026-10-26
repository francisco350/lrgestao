const crypto=require('node:crypto');
const M=require('./model.cjs');
const R=require('./receivables.cjs');
const C=require('./costs.cjs');
const A=require('./attachments.cjs');
const T=require('./timeclock.cjs');
const P=require('./planning.cjs');
const Absences=require('./absences.cjs');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const text=(value,max=200)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail('Preencha os campos obrigatórios com valores válidos.');return value.trim();};
const num=(value,min,max)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail('Valor numérico inválido.');return value;};
const isoToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Lisbon'});
const scopes=(state,user)=>user.role==='admin'?state.projects:state.projects.filter(p=>user.role==='manager'?user.projects.includes(p.id):p.employees.includes(user.employeeId));
function inProject(state,user,id){const p=scopes(state,user).find(p=>p.id===id);if(!p)fail('Sem acesso a esta obra.',403);return p;}
function canPerson(state,user,employeeId,projectId){const p=inProject(state,user,projectId);if(!p.employees.includes(employeeId))fail('O funcionário não está associado à obra.');if(user.role==='worker'&&employeeId!==user.employeeId)fail('Só pode registar o seu próprio trabalho.',403);}
function sanitize(state,user){
  const projects=scopes(state,user);const allowed=new Set(projects.map(p=>p.id));
  const employees=user.role==='admin'?state.employees:user.role==='worker'?state.employees.filter(e=>e.id===user.employeeId):state.employees.filter(e=>projects.some(p=>p.employees.includes(e.id)));
  const entries=state.entries.filter(r=>user.role==='admin'||(user.role==='worker'?r.employee===user.employeeId:allowed.has(r.project)));
  const financial=user.role!=='manager';
  const stripEntry=r=>{const out={...r};if(!financial)for(const k of ['rate','unitRate','payBasis','amount'])delete out[k];return out;};
  return {absences:Absences.list(state,user),planning:P.list(state,user),serverNow:new Date().toISOString(),clockShifts:T.list(state,user),attachments:A.list(state,user),projectNotes:(state.projectNotes||[]).filter(n=>allowed.has(n.project)),...(user.role==='admin'?{costs:state.costs||[],costSummary:C.summary(state),clients:state.clients,charges:state.charges,receipts:state.receipts}:{}),revision:state.revision,employees:employees.map(e=>{const out={...e};if(!financial)for(const k of ['rate','payBasis'])delete out[k];return out;}),projects:projects.map(p=>{const out={...p};if(user.role!=='admin'){delete out.budget;delete out.clientId;}return out;}),entries:entries.map(stripEntry),wagePayments:user.role==='admin'?state.wagePayments:user.role==='worker'?state.wagePayments.filter(p=>p.employee===user.employeeId):[],corrections:state.corrections.filter(c=>entries.some(r=>r.id===c.entry)).map(c=>({...c,proposed:stripEntry(c.proposed),...(c.original?{original:stripEntry(c.original)}:{})}))};
}
function action(state,user,type,data){
  R.normalize(state);
  if(Absences.apply(state,user,type,data))return;
  if(P.apply(state,user,type,data))return;
  if(T.apply(state,user,type,data))return;
  if(A.archive(state,user,type,data))return;
  if(C.apply(state,user,type,data,{fail,text,isoToday}))return;
  if(R.apply(state,user,type,data,{fail,text,isoToday}))return;
  const admin=()=>{if(user.role!=='admin')fail('Esta operação é exclusiva do administrador.',403);};
  const responsible=()=>{if(!['admin','manager'].includes(user.role))fail('É necessário um responsável para validar.',403);};
  const findEntry=()=>{const r=state.entries.find(r=>r.id===data.id);if(!r)fail('Registo não encontrado.',404);if(user.role==='worker'&&r.employee!==user.employeeId)fail('Sem acesso a este registo.',403);if(user.role!=='worker')inProject(state,user,r.project);return r;};
  switch(type){
    case'projectNote':{responsible();inProject(state,user,data.project);state.projectNotes??=[];state.projectNotes.push({id:crypto.randomUUID(),project:data.project,text:text(data.text,1000),createdBy:user.id,author:user.name,createdAt:new Date().toISOString()});break;}
    case'employee':{admin();const value={name:text(data.name,100),category:text(data.category,60),payBasis:data.payBasis,rate:num(data.rate,0,10000),dayHours:num(data.dayHours,1,24),active:data.active!==false};if(!['hour','day'].includes(value.payBasis))fail('Selecione remuneração por hora ou dia.');if(data.id){const e=state.employees.find(e=>e.id===data.id);if(!e)fail('Funcionário não encontrado.',404);Object.assign(e,value);}else state.employees.push({id:crypto.randomUUID(),...value});break;}
    case'project':{admin();const client=state.clients.find(c=>c.id===data.clientId);if(!client)fail('Selecione um cliente válido.');const old=state.projects.find(p=>p.id===data.id);if(!client.active&&old?.clientId!==client.id)fail('Selecione um cliente ativo.');if(old&&old.clientId!==client.id&&state.charges.some(c=>c.project===old.id&&!c.voided))fail('Esta obra tem parcelas ativas. Anule-as antes de alterar o cliente.');const employees=Array.isArray(data.employees)?[...new Set(data.employees)]:[];if(employees.some(id=>!state.employees.some(e=>e.id===id)))fail('Funcionário desconhecido.');const optional=(key,max)=>data[key]===undefined?(old?.[key]||''):data[key]===''?'':text(data[key],max);
      const address=optional('address',200),plannedStart=optional('plannedStart',10),plannedEnd=optional('plannedEnd',10),siteContact=optional('siteContact',100);
      if((plannedStart&&!M.validDate(plannedStart))||(plannedEnd&&!M.validDate(plannedEnd))||(plannedStart&&plannedEnd&&plannedEnd<plannedStart))fail('Indique datas previstas válidas, com fim igual ou posterior ao início.');
      const value={address,plannedStart,plannedEnd,siteContact,name:text(data.name,120),client:client.name,clientId:client.id,city:text(data.city,100),status:data.status,budget:num(data.budget,0,10000000),employees};if(!['Planeada','Em curso','Concluída'].includes(value.status))fail('Estado inválido.');if(data.id){const p=state.projects.find(p=>p.id===data.id);if(!p)fail('Obra não encontrada.',404);Object.assign(p,value);}else state.projects.push({id:crypto.randomUUID(),...value});break;}
    case'work':case'correction':{
      const previous=data.id?findEntry():null;
      if(previous?.clockShiftId)fail('Este registo provém de uma picagem. Consulte o turno na página Picar o ponto.');
      if(previous&&user.role==='worker'&&previous.status==='approved'&&type!=='correction')fail('Peça uma correção para alterar trabalho já validado.');
      if(previous&&state.corrections.some(c=>c.entry===previous.id&&c.status==='pending'))fail('Este registo já tem uma correção pendente.');
      const person=state.employees.find(e=>e.id===data.employee);if(!person?.active)fail('Funcionário inativo ou inexistente.');
      canPerson(state,user,person.id,data.project);
      if(!M.validDate(data.date)||data.date>isoToday())fail('Selecione uma data válida, até hoje.');
      if(!['days','hours'].includes(data.mode))fail('Forma de registo inválida.');
      const value=M.work(data,person,previous);value.note=String(data.note||'').slice(0,200);M.validateWork(value,state.entries,previous?.id);
      if(type==='correction'){
        if(!previous||previous.status!=='approved')fail('Só é possível corrigir um registo validado.');
        state.corrections.push({id:crypto.randomUUID(),entry:previous.id,employee:previous.employee,proposed:value,reason:text(data.reason),status:'pending',created:isoToday(),createdBy:user.id,baseRevision:previous.revision||1});
      }else if(previous)Object.assign(previous,value,{status:'pending',rejection:'',revision:(previous.revision||1)+1,updatedBy:user.id});
      else state.entries.push({id:crypto.randomUUID(),...value,status:'pending',createdBy:user.id,revision:1});
      break;
    }
    case'approve':case'reject':{responsible();const r=findEntry();if(r.status!=='pending')fail('O registo já foi decidido.',409);if(type==='approve'){M.validateWork(r,state.entries,r.id);r.status='approved';r.validatedBy=user.id;}else {r.status='rejected';r.rejection=text(data.reason);}r.revision=(r.revision||1)+1;break;}
    case'approveCorrection':case'rejectCorrection':{responsible();const c=state.corrections.find(c=>c.id===data.id);if(!c)fail('Pedido não encontrado.',404);const original=state.entries.find(r=>r.id===c.entry);inProject(state,user,original.project);inProject(state,user,c.proposed.project);if(c.status!=='pending'||(original.revision||1)!==c.baseRevision)fail('O registo mudou desde o pedido. Atualize e confirme.',409);if(type==='approveCorrection'){M.validateWork(c.proposed,state.entries,original.id);c.original={...original};Object.assign(original,c.proposed,{status:'approved',revision:(original.revision||1)+1,validatedBy:user.id});c.status='approved';}else c.status='rejected';c.decidedBy=user.id;c.decided=isoToday();break;}
    case'payment':{admin();if(!M.validDate(data.date)||data.date>isoToday())fail('Registe apenas pagamentos já efetuados.');const p=M.payment(state,data);if(!['Transferência','Numerário','MB WAY','Outro'].includes(p.method))fail('Método de pagamento inválido.');p.note=String(p.note).slice(0,200);state.wagePayments.push({id:crypto.randomUUID(),...p,createdBy:user.id});break;}
    case'voidPayment':{admin();const p=state.wagePayments.find(p=>p.id===data.id);if(!p||p.voided)fail('Movimento inexistente ou já anulado.');p.voided=true;p.voidReason=text(data.reason);p.voidedBy=user.id;break;}
    default:fail('Operação desconhecida.');
  }
}
module.exports={sanitize,action,scopes,fail,text,isoToday};
