const crypto=require('node:crypto');
const M=require('./model.cjs');
const {saleWork}=require('../public/project-finance-model.js');
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
function normalize(state){
  state.clients??=[];state.charges??=[];state.receipts??=[];
  for(const p of state.projects){if(!p.clientId){let c=state.clients.find(c=>c.name===p.client);if(!c){c={id:crypto.createHash('sha256').update(p.client||p.id).digest('hex').slice(0,24),name:p.client||'Cliente por identificar',email:'',phone:'',cycle:'monthly',active:true};state.clients.push(c);}p.clientId=c.id;}}
  return state;
}
const paid=(state,id)=>round(state.receipts.filter(r=>r.charge===id&&!r.voided).reduce((sum,r)=>sum+r.amount,0));
function apply(state,user,type,data,{fail,text,isoToday}){
  if(!['client','charge','receipt','saleReceipt','voidCharge','voidReceipt'].includes(type))return false;
  if(user.role!=='admin')fail('Esta operação é exclusiva do administrador.',403);
  const amount=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<.01||value>10000000||Math.abs(value-round(value))>1e-8)fail('Indique um valor positivo com até duas casas decimais.');return round(value);};
  const date=value=>{if(!M.validDate(value))fail('Data inválida.');return value;};
  const optional=(v,max)=>v==null||v===''?'':text(v,max);
  const stamp={createdBy:user.id,createdAt:new Date().toISOString()};
  if(type==='saleReceipt'){
    const project=state.projects.find(p=>p.id===data.project);
    if(!project||!['official','helper'].includes(data.role))fail('Obra ou categoria inválida.');
    const rate=project.saleRates?.[data.role];
    if(!Number.isSafeInteger(rate)||rate<=0)fail('Defina um preço de venda positivo para esta categoria.');
    if(!Number.isSafeInteger(data.minutes)||data.minutes<=0)fail('Indique o tempo recebido em minutos completos.');
    date(data.date);
    if(data.date>isoToday()||!['Transferência','Numerário','MB WAY','Outro'].includes(data.method))fail('Confirme a data e o método de recebimento.');
    const from=data.from||'',until=data.until||'';
    if((from&&!M.validDate(from))||(until&&!M.validDate(until))||(from&&until&&from>until))fail('Período de trabalho inválido.');
    const work=saleWork(state,project.id,from,until).filter(r=>r.role===data.role&&r.freeMinutes>0&&r.date<=data.date)
      .sort((a,b)=>a.date.localeCompare(b.date)||a.entry.localeCompare(b.entry));
    let minutes=0,cents=0;
    const allocations=[];
    for(const row of work){
      const portion=Math.min(data.minutes-minutes,row.freeMinutes);
      minutes+=portion;
      const total=Math.round(minutes*rate/60);
      allocations.push({entry:row.entry,minutes:portion,cents:total-cents});
      cents=total;
      if(minutes===data.minutes)break;
    }
    if(minutes!==data.minutes)fail('As horas excedem o trabalho validado ainda por receber nessa data.');
    const value=amount(cents/100);
    if(data.charge){
      const charge=state.charges.find(c=>c.id===data.charge&&c.project===project.id&&!c.voided);
      if(charge?.work?.length)fail('Registe o recebimento diretamente na cobrança que inclui as horas.');
      if(!charge||value>round(charge.amount-paid(state,charge.id)))fail('A cobrança selecionada não tem saldo suficiente.');
    }
    const description='Trabalho de '+(data.role==='official'?'oficiais':'ajudantes');
    state.receipts.push({id:crypto.randomUUID(),project:project.id,clientId:project.clientId,charge:data.charge||null,description,amount:value,date:data.date,method:data.method,note:optional(data.note,200),sale:{role:data.role,minutes,rate,allocations},...stamp});
  }
  if(type==='client'){
    const value={name:text(data.name,120),email:optional(data.email,160),phone:optional(data.phone,40),cycle:data.cycle,active:data.active!==false};
    if(value.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))fail('Email inválido.');
    if(!['weekly','monthly','milestone'].includes(value.cycle))fail('Periodicidade inválida.');
    if(data.id){const c=state.clients.find(c=>c.id===data.id);if(!c)fail('Cliente não encontrado.',404);Object.assign(c,value,{updatedAt:stamp.createdAt});for(const p of state.projects.filter(p=>p.clientId===c.id))p.client=c.name;}
    else state.clients.push({id:crypto.randomUUID(),...value,...stamp});
  }
  if(type==='charge'){
    const p=state.projects.find(p=>p.id===data.project);if(!p)fail('Obra não encontrada.',404);
    if(!state.clients.some(c=>c.id===p.clientId&&c.active))fail('Associe um cliente ativo à obra.');
    const value={id:crypto.randomUUID(),project:p.id,clientId:p.clientId,description:text(data.description,160),amount:amount(data.amount),due:date(data.due),...stamp};
    if(data.workEntries!==undefined){
      if(!Array.isArray(data.workEntries)||new Set(data.workEntries).size!==data.workEntries.length)fail('Seleção de registos de trabalho inválida.');
      const selected=new Set(data.workEntries);
      const work=saleWork(state,p.id).filter(r=>selected.has(r.entry)).sort((a,b)=>a.date.localeCompare(b.date)||a.entry.localeCompare(b.entry));
      if(work.length!==selected.size)fail('Escolha registos validados desta obra.');
      if(work.length)value.work=work.map(r=>{
        const rate=p.saleRates?.[r.role];
        const cents=Math.round(r.freeMinutes*rate/60);
        if(r.charge||!r.freeMinutes||!Number.isSafeInteger(cents)||cents<=0)fail('Escolha horas em aberto com preço definido e disponíveis para cobrança.');
        // A replacement link must not supersede an earlier link in a closed month.
        const releases=state.charges.filter(c=>c.voided&&c.work?.some(w=>w.entry===r.entry)).map(c=>c.voidedAt?.slice(0,10));
        for(const receipt of state.receipts){
          if(receipt.voided&&receipt.sale?.allocations.some(a=>a.entry===r.entry))releases.push(receipt.voidedAt?.slice(0,10));
        }
        const since=[r.date,...releases.filter(Boolean)].sort().at(-1);
        return {entry:r.entry,date:r.date,role:r.role,minutes:r.freeMinutes,rate,cents,since};
      });
      if(work.length&&value.work.reduce((n,r)=>n+r.cents,0)>Math.round(value.amount*100))fail('O valor da cobrança deve cobrir as horas selecionadas.');
    }
    state.charges.push(value);
  }
  if(type==='receipt'){
    const charge=state.charges.find(c=>c.id===data.charge&&!c.voided);if(!charge)fail('Cobrança inexistente ou anulada.');
    const value=amount(data.amount);if(value>round(charge.amount-paid(state,charge.id)))fail('O recebimento excede o saldo desta cobrança.');
    date(data.date);if(data.date>isoToday())fail('Registe apenas recebimentos já efetuados.');
    if(charge.work?.some(w=>w.since>data.date))fail('A data do recebimento deve abranger o trabalho incluído na cobrança.');
    if(!['Transferência','Numerário','MB WAY','Outro'].includes(data.method))fail('Método inválido.');
    state.receipts.push({id:crypto.randomUUID(),charge:charge.id,project:charge.project,clientId:charge.clientId,amount:value,date:data.date,method:data.method,note:optional(data.note,200),...stamp});
  }
  if(type==='voidCharge'||type==='voidReceipt'){
    const record=(type==='voidCharge'?state.charges:state.receipts).find(r=>r.id===data.id&&!r.voided);if(!record)fail('Movimento inexistente ou já anulado.');
    if(type==='voidCharge'&&paid(state,record.id)>0)fail('Anule primeiro os recebimentos associados a esta cobrança.');
    Object.assign(record,{voided:true,voidReason:text(data.reason,200),voidedBy:user.id,voidedAt:new Date().toISOString()});
  }
  return true;
}
function ensureWorkEditable(state,entryId){
  if((state.charges||[]).some(c=>!c.voided&&c.work?.some(w=>w.entry===entryId))){
    throw Object.assign(new Error('Anule a cobrança associada antes de alterar estas horas.'),{status:409});
  }
  if((state.receipts||[]).some(r=>!r.voided&&r.sale?.allocations.some(item=>item.entry===entryId))){
    throw Object.assign(new Error('Anule o recebimento do cliente associado antes de alterar estas horas.'),{status:409});
  }
}
module.exports={normalize,apply,paid,ensureWorkEditable};
