const crypto=require('node:crypto');
const M=require('./model.cjs');
const categories=['Transporte','Aluguer de equipamento','Subcontratação','Resíduos','Outras despesas'];
const units=['un','m','m²','m³','kg','L','saco','caixa'];
function normalize(state){state.costs??=[];state.costPayments??=[];return state;}
function apply(state,user,type,data,{fail,text,isoToday,general=false}){
  if(!['cost','voidCost','stockReceive','stockIssue','projectCost','generalCost','costPayment','voidCostPayment','trackCostPayment'].includes(type))return false;
  if(user.role!=='admin')fail('Esta operação é exclusiva do administrador.',403);
  normalize(state);
  const decimal=(v,scale,min,max,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||Math.abs(v*scale-Math.round(v*scale))>1e-6)fail(label);return Math.round(v*scale);};
  if(type==='projectCost'||type==='generalCost'){
    if(!['unpaid','paid','partial'].includes(data.settlement))fail('Escolha o estado do pagamento.');
    const draft=structuredClone(state);
    apply(draft,user,'cost',type==='generalCost'?{...data,project:null,kind:'expense'}:data,{fail,text,isoToday,general:type==='generalCost'});
    const cost=draft.costs.at(-1);cost.paymentTracked=true;
    if(data.settlement!=='unpaid')apply(draft,user,'costPayment',{cost:cost.id,amount:data.settlement==='paid'?cost.amount:data.paidAmount,date:data.paymentDate,method:data.paymentMethod,note:data.paymentNote},{fail,text,isoToday});
    Object.assign(state,draft);return true;
  }
  if(type==='costPayment'||type==='trackCostPayment'){
    const cost=state.costs.find(c=>c.id===data.cost&&!c.voided);
    if(!cost)fail('Custo inexistente ou anulado.');
    if(cost.inventoryLot)fail('Uma saída de armazém não é um pagamento ao fornecedor.');
    if(type==='trackCostPayment'){
      if(cost.paymentTracked)fail('Este custo já tem o estado de pagamento confirmado.');
      Object.assign(cost,{paymentTracked:true,paymentConfirmedBy:user.id,paymentConfirmedAt:new Date().toISOString()});return true;
    }
    const cents=decimal(data.amount,100,.01,10000000,'Indique um pagamento positivo com até duas casas decimais.');
    const paid=state.costPayments.filter(p=>p.cost===cost.id&&!p.voided).reduce((sum,p)=>sum+Math.round(p.amount*100),0);
    if(cents>Math.round(cost.amount*100)-paid)fail('O pagamento excede o saldo deste custo.');
    if(!M.validDate(data.date)||data.date>isoToday()||data.date<cost.date)fail('A data do pagamento deve estar entre a data do custo e hoje.');
    if(!['Transferência','Numerário','MB WAY','Outro'].includes(data.method))fail('Método de pagamento inválido.');
    const note=data.note==null||data.note===''?'':text(data.note,200);
    state.costPayments.push({id:crypto.randomUUID(),cost:cost.id,project:cost.project,amount:cents/100,date:data.date,method:data.method,note,createdBy:user.id,createdAt:new Date().toISOString()});
    cost.paymentTracked=true;return true;
  }
  if(type==='voidCostPayment'){
    const payment=state.costPayments.find(p=>p.id===data.id&&!p.voided);
    if(!payment)fail('Pagamento inexistente ou já anulado.');
    Object.assign(payment,{voided:true,voidReason:text(data.reason,200),voidedBy:user.id,voidedAt:new Date().toISOString()});return true;
  }
  if(type==='stockReceive'){
    const quantity=decimal(data.quantity,1000,.001,100000,'Quantidade inválida.')/1000;
    const unitPrice=decimal(data.unitPrice,100,.01,1000000,'Preço unitário inválido.')/100;
    if(!units.includes(data.unit))fail('Unidade inválida.');
    if(!M.validDate(data.date)||data.date>isoToday())fail('Indique uma data de entrada até hoje.');
    const lot={id:crypto.randomUUID(),description:text(data.description,160),quantity,unit:data.unit,unitPrice,date:data.date,createdBy:user.id};
    (state.inventory??=[]).push(lot);
    return true;
  }
  if(type==='stockIssue'){
    const lot=(state.inventory||[]).find(item=>item.id===data.lot);
    if(!lot)fail('Entrada de inventário inexistente.');
    const quantity=decimal(data.quantity,1000,.001,100000,'Quantidade inválida.')/1000;
    if(quantity>available(state,lot))fail('Quantidade superior ao stock disponível.');
    if(data.date<lot.date)fail('A saída deve ocorrer após a entrada ou no mesmo dia.');
    apply(state,user,'cost',{kind:'material',project:data.project,description:lot.description,date:data.date,unit:lot.unit,unitPrice:lot.unitPrice,quantity},{fail,text,isoToday});
    state.costs.at(-1).inventoryLot=lot.id;
    return true;
  }
  if(type==='voidCost'){
    const row=state.costs.find(c=>c.id===data.id);if(!row||row.voided)fail('Custo inexistente ou já anulado.');
    if(state.costPayments.some(p=>p.cost===row.id&&!p.voided))fail('Anule primeiro os pagamentos deste custo na ficha da obra.');
    Object.assign(row,{voided:true,voidReason:text(data.reason,200),voidedBy:user.id,voidedAt:new Date().toISOString()});return true;
  }
  if(data.id)fail('Para corrigir um custo, anule-o e registe o valor correto.');
  if(!general&&!state.projects.some(p=>p.id===data.project))fail('Obra não encontrada.',404);
  if(!['material','expense'].includes(data.kind))fail('Selecione material ou despesa.');
  if(!M.validDate(data.date)||data.date>isoToday())fail('Indique a data do custo, até hoje.');

  const quantity=data.kind==='expense'?1:data.quantity;
  const q=decimal(quantity,1000,.001,100000,'Quantidade inválida: use até três casas decimais.');
  const cents=decimal(data.unitPrice,100,.01,1000000,'Custo inválido: use até duas casas decimais.');
  const totalCents=Math.floor((q*cents+500)/1000);
  if(!Number.isSafeInteger(totalCents)||totalCents<1||totalCents>1000000000)fail('O total deve ficar entre 0,01 € e 10 000 000 €.');
  const unit=data.kind==='expense'?'serviço':data.unit;
  if(data.kind==='material'&&!units.includes(unit))fail('Unidade inválida.');
  const category=data.kind==='material'?'Materiais':data.category;
  if(data.kind==='expense'&&!categories.includes(category))fail('Categoria de despesa inválida.');
  const optional=(v,max)=>v==null||v===''?'':text(v,max);
  state.costs.push({id:crypto.randomUUID(),project:data.project,kind:data.kind,category,description:text(data.description,160),date:data.date,quantity:q/1000,unit,unitPrice:cents/100,amount:totalCents/100,supplier:optional(data.supplier,120),reference:optional(data.reference,100),note:optional(data.note,200),createdBy:user.id,createdAt:new Date().toISOString()});
  return true;
}
function available(state,lot){
  const issued=(state.costs||[]).filter(c=>c.inventoryLot===lot.id&&!c.voided);
  return (Math.round(lot.quantity*1000)-issued.reduce((sum,c)=>sum+Math.round(c.quantity*1000),0))/1000;
}
function summary(state){return state.projects.map(p=>{
  const costs=(state.costs||[]).filter(c=>c.project===p.id&&!c.voided);
  const materials=M.money(costs.filter(c=>c.kind==='material').reduce((sum,c)=>sum+c.amount,0));
  const expenses=M.money(costs.filter(c=>c.kind==='expense').reduce((sum,c)=>sum+c.amount,0));
  const labour=M.total(state.entries.filter(r=>r.project===p.id&&r.status==='approved'));
  return {project:p.id,materials,expenses,labour,direct:M.money(materials+expenses),total:M.money(materials+expenses+labour)};
});}
module.exports={normalize,apply,available,summary};
