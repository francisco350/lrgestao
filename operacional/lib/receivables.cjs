const crypto=require('node:crypto');
const M=require('./model.cjs');
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
function normalize(state){
  state.clients??=[];state.charges??=[];state.receipts??=[];
  for(const p of state.projects){if(!p.clientId){let c=state.clients.find(c=>c.name===p.client);if(!c){c={id:crypto.createHash('sha256').update(p.client||p.id).digest('hex').slice(0,24),name:p.client||'Cliente por identificar',email:'',phone:'',cycle:'monthly',active:true};state.clients.push(c);}p.clientId=c.id;}}
  return state;
}
const paid=(state,id)=>round(state.receipts.filter(r=>r.charge===id&&!r.voided).reduce((sum,r)=>sum+r.amount,0));
function apply(state,user,type,data,{fail,text,isoToday}){
  if(!['client','charge','receipt','voidCharge','voidReceipt'].includes(type))return false;
  if(user.role!=='admin')fail('Esta operação é exclusiva do administrador.',403);
  const amount=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<.01||value>10000000||Math.abs(value-round(value))>1e-8)fail('Indique um valor positivo com até duas casas decimais.');return round(value);};
  const date=value=>{if(!M.validDate(value))fail('Data inválida.');return value;};
  const optional=(v,max)=>v==null||v===''?'':text(v,max);
  const stamp={createdBy:user.id,createdAt:new Date().toISOString()};
  if(type==='client'){
    const value={name:text(data.name,120),email:optional(data.email,160),phone:optional(data.phone,40),cycle:data.cycle,active:data.active!==false};
    if(value.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))fail('Email inválido.');
    if(!['weekly','monthly','milestone'].includes(value.cycle))fail('Periodicidade inválida.');
    if(data.id){const c=state.clients.find(c=>c.id===data.id);if(!c)fail('Cliente não encontrado.',404);Object.assign(c,value);for(const p of state.projects.filter(p=>p.clientId===c.id))p.client=c.name;}
    else state.clients.push({id:crypto.randomUUID(),...value,...stamp});
  }
  if(type==='charge'){
    const p=state.projects.find(p=>p.id===data.project);if(!p)fail('Obra não encontrada.',404);
    if(!state.clients.some(c=>c.id===p.clientId&&c.active))fail('Associe um cliente ativo à obra.');
    const value={id:crypto.randomUUID(),project:p.id,clientId:p.clientId,description:text(data.description,160),amount:amount(data.amount),due:date(data.due),...stamp};
    state.charges.push(value);
  }
  if(type==='receipt'){
    const charge=state.charges.find(c=>c.id===data.charge&&!c.voided);if(!charge)fail('Parcela inexistente ou anulada.');
    const value=amount(data.amount);if(value>round(charge.amount-paid(state,charge.id)))fail('O recebimento excede o saldo desta parcela.');
    date(data.date);if(data.date>isoToday())fail('Registe apenas recebimentos já efetuados.');
    if(!['Transferência','Numerário','MB WAY','Outro'].includes(data.method))fail('Método inválido.');
    state.receipts.push({id:crypto.randomUUID(),charge:charge.id,project:charge.project,clientId:charge.clientId,amount:value,date:data.date,method:data.method,note:optional(data.note,200),...stamp});
  }
  if(type==='voidCharge'||type==='voidReceipt'){
    const record=(type==='voidCharge'?state.charges:state.receipts).find(r=>r.id===data.id&&!r.voided);if(!record)fail('Movimento inexistente ou já anulado.');
    if(type==='voidCharge'&&paid(state,record.id)>0)fail('Anule primeiro os recebimentos associados a esta parcela.');
    Object.assign(record,{voided:true,voidReason:text(data.reason,200),voidedBy:user.id,voidedAt:new Date().toISOString()});
  }
  return true;
}
module.exports={normalize,apply,paid};
