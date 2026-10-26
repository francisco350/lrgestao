const crypto=require('node:crypto');
const M=require('./model.cjs');
const categories=['Transporte','Aluguer de equipamento','Subcontratação','Resíduos','Outras despesas'];
const units=['un','m','m²','m³','kg','L','saco','caixa'];
function normalize(state){state.costs??=[];return state;}
function apply(state,user,type,data,{fail,text,isoToday}){
  if(!['cost','voidCost'].includes(type))return false;
  if(user.role!=='admin')fail('Esta operação é exclusiva do administrador.',403);
  normalize(state);
  if(type==='voidCost'){
    const row=state.costs.find(c=>c.id===data.id);if(!row||row.voided)fail('Custo inexistente ou já anulado.');
    Object.assign(row,{voided:true,voidReason:text(data.reason,200),voidedBy:user.id,voidedAt:new Date().toISOString()});return true;
  }
  if(data.id)fail('Para corrigir um custo, anule-o e registe o valor correto.');
  if(!state.projects.some(p=>p.id===data.project))fail('Obra não encontrada.',404);
  if(!['material','expense'].includes(data.kind))fail('Selecione material ou despesa.');
  if(!M.validDate(data.date)||data.date>isoToday())fail('Indique a data do custo, até hoje.');
  const decimal=(v,scale,min,max,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||Math.abs(v*scale-Math.round(v*scale))>1e-6)fail(label);return Math.round(v*scale);};
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
function summary(state){return state.projects.map(p=>{
  const costs=(state.costs||[]).filter(c=>c.project===p.id&&!c.voided);
  const materials=M.money(costs.filter(c=>c.kind==='material').reduce((sum,c)=>sum+c.amount,0));
  const expenses=M.money(costs.filter(c=>c.kind==='expense').reduce((sum,c)=>sum+c.amount,0));
  const labour=M.total(state.entries.filter(r=>r.project===p.id&&r.status==='approved'));
  return {project:p.id,materials,expenses,labour,direct:M.money(materials+expenses),total:M.money(materials+expenses+labour)};
});}
module.exports={normalize,apply,summary};
