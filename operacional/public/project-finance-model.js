(function(root){
  'use strict';
  const money=n=>Math.round((n+Number.EPSILON)*100)/100;
  const sum=rows=>money(rows.reduce((n,r)=>n+r.amount,0));
  const inPeriod=(date,from,until)=>(!from||date>=from)&&(!until||date<=until);
  const activeAt=(row,until)=>!row.voided||!!(until&&row.voidedAt&&row.voidedAt.slice(0,10)>until);
  const workAmount=r=>money(r.minutes/60*r.unitRate/(r.payBasis==='hour'?1:r.dayHours));
  const earned=rows=>money(rows.reduce((n,r)=>n+workAmount(r),0));
  function costBalance(state,cost,until=''){
    const active=(!until||cost.date<=until)&&activeAt(cost,until);
    const paid=sum((state.costPayments||[]).filter(p=>p.cost===cost.id&&(!until||p.date<=until)&&activeAt(p,until)));
    const tracked=cost.paymentTracked===true;
    return {active,paid,tracked,unknown:active&&!tracked&&!cost.inventoryLot,due:active&&tracked&&!cost.inventoryLot?money(cost.amount-paid):0};
  }
  function chargeBalance(state,charge,until=''){
    if(until&&charge.due>until||!activeAt(charge,until))return 0;
    return money(charge.amount-sum((state.receipts||[]).filter(r=>r.charge===charge.id&&(!until||r.date<=until)&&activeAt(r,until))));
  }
  function chargeState(state,charge,until=''){
    const paid=sum((state.receipts||[]).filter(r=>r.charge===charge.id&&(!until||r.date<=until)&&activeAt(r,until)));
    if(!activeAt(charge,until))return {label:'Anulada',paid:0,tone:'gray'};
    return {label:paid>=charge.amount?'Recebida':paid>0?'Parcialmente recebida':'Por receber',paid,tone:paid>=charge.amount?'':'amber'};
  }
  function summary(state,project,from='',until=''){
    const costs=(state.costs||[]).filter(c=>c.project===project);
    const balances=costs.map(c=>({cost:c,...costBalance(state,c,until)}));
    const periodCosts=balances.filter(c=>c.active&&inPeriod(c.cost.date,from,until)).map(c=>c.cost);
    const payments=(state.costPayments||[]).filter(p=>p.project===project&&inPeriod(p.date,from,until)&&activeAt(p,until));
    const receipts=(state.receipts||[]).filter(r=>r.project===project&&inPeriod(r.date,from,until)&&activeAt(r,until));
    const methods=['Numerário','Transferência','MB WAY','Outro'].map(method=>({method,paid:sum(payments.filter(p=>p.method===method)),received:sum(receipts.filter(r=>r.method===method))}));
    return {materials:sum(periodCosts.filter(c=>c.kind==='material')),expenses:sum(periodCosts.filter(c=>c.kind==='expense')),paid:sum(payments),received:sum(receipts),cashBalance:money(sum(receipts)-sum(payments)),due:money(balances.reduce((n,b)=>n+b.due,0)),unknownCount:balances.filter(b=>b.unknown).length,unknownAmount:sum(balances.filter(b=>b.unknown).map(b=>b.cost)),receivable:money((state.charges||[]).filter(c=>c.project===project).reduce((n,c)=>n+chargeBalance(state,c,until),0)),methods};
  }
  function overview(state,project,from='',until=''){
    const base=summary(state,project,from,until);
    const costs=(state.costs||[]).filter(c=>c.project===project);
    const wages=(state.wagePayments||[]).filter(p=>p.project===project&&activeAt(p,until)&&(!until||p.date<=until));
    const entries=(state.entries||[]).filter(r=>r.project===project&&(!until||r.date<=until));
    const rows=['material','expense'].map(kind=>{
      const selected=costs.filter(c=>c.kind===kind),ids=new Set(selected.map(c=>c.id));
      const balances=selected.map(c=>({cost:c,...costBalance(state,c,until)}));
      return {kind,cost:sum(balances.filter(b=>b.active&&inPeriod(b.cost.date,from,until)).map(b=>b.cost)),
        paid:sum((state.costPayments||[]).filter(p=>ids.has(p.cost)&&activeAt(p,until)&&inPeriod(p.date,from,until))),
        due:money(balances.reduce((n,b)=>n+b.due,0)),unknown:sum(balances.filter(b=>b.unknown).map(b=>b.cost))};
    });
    const approved=entries.filter(r=>r.status==='approved');
    rows.push({kind:'labour',cost:earned(approved.filter(r=>inPeriod(r.date,from,until))),paid:sum(wages.filter(p=>inPeriod(p.date,from,until))),due:Math.max(0,money(earned(approved)-sum(wages))),unknown:0});
    const employees=new Set(entries.map(r=>r.employee));
    const unassignedWages=(state.wagePayments||[]).filter(p=>!p.project&&employees.has(p.employee)&&activeAt(p,until)&&(!until||p.date<=until)).length;
    const totals=Object.fromEntries(['cost','paid','due','unknown'].map(key=>[key,money(rows.reduce((n,r)=>n+r[key],0))]));
    const methods=base.methods.map(m=>({...m,paid:money(m.paid+sum(wages.filter(p=>p.method===m.method&&inPeriod(p.date,from,until))))}));
    return {...base,rows,totals,methods,unassignedWages,pending:earned(entries.filter(r=>r.status==='pending'&&inPeriod(r.date,from,until)))};
  }
  function monthly(state,from='',until=''){
    const groups=new Map();
    const group=label=>{if(!groups.has(label))groups.set(label,{label,cost:0,paid:0,due:0,unknown:0});return groups.get(label);};
    const costs=state.costs||[],payments=state.costPayments||[];
    for(const c of costs){
      const row=group(c.kind==='material'?'Materiais':c.category||'Outras despesas'),b=costBalance(state,c,until);
      if(b.active&&inPeriod(c.date,from,until))row.cost+=c.amount;
      row.due+=b.due;if(b.unknown)row.unknown+=c.amount;
      row.paid+=sum(payments.filter(p=>p.cost===c.id&&activeAt(p,until)&&inPeriod(p.date,from,until)));
    }
    const labour=group('Mão de obra');
    const entries=(state.entries||[]).filter(r=>r.status==='approved'&&(!until||r.date<=until));
    const wages=(state.wagePayments||[]).filter(p=>activeAt(p,until)&&(!until||p.date<=until));
    labour.cost=earned(entries.filter(r=>inPeriod(r.date,from,until)));
    labour.paid=sum(wages.filter(p=>inPeriod(p.date,from,until)));
    for(const employee of new Set(entries.map(r=>r.employee)))labour.due+=Math.max(0,money(earned(entries.filter(r=>r.employee===employee))-sum(wages.filter(p=>p.employee===employee))));
    const rows=[...groups.values()].map(r=>({...r,...Object.fromEntries(['cost','paid','due','unknown'].map(k=>[k,money(r[k])]))}));
    const totals=Object.fromEntries(['cost','paid','due','unknown'].map(k=>[k,money(rows.reduce((n,r)=>n+r[k],0))]));
    return {rows,totals,unassignedPaid:sum(wages.filter(p=>!p.project&&inPeriod(p.date,from,until)))};
  }
  function position(state,project,from='',until=''){
    return {
      profit:sum(accountDetails(state,'profit',project,from,until)),
      balance:sum(accountDetails(state,'balance',project,from,until))
    };
  }
  function accountDetails(state,metric,project,from='',until=''){
    const all=project===undefined;
    const matches=row=>all||row.project===project;
    const movement=row=>activeAt(row,until)&&inPeriod(row.date,from,until);
    const charges=state.charges||[], costs=state.costs||[], wages=state.wagePayments||[];
    if(metric==='balance'){
      const receipts=accountDetails(state,'received',project,from,until);
      const payments=accountDetails(state,'paid',project,from,until);
      return receipts.map(r=>({...r,category:'Recebimento'}))
        .concat(payments.map(p=>({...p,category:'Pagamento',amount:-p.amount})));
    }
    if(metric==='profit'){
      const expected=charges.filter(matches).filter(c=>inPeriod(c.due,from,until)&&activeAt(c,until))
        .map(c=>({...c,date:c.due,category:'Cobrança prevista'}));
      const expenses=costs.filter(matches).filter(movement).map(c=>({
        ...c,category:c.kind==='material'?'Material':'Despesa',party:c.supplier,amount:-c.amount
      }));
      const labour=(state.entries||[]).filter(matches)
        .filter(r=>r.status==='approved'&&inPeriod(r.date,from,until))
        .map(r=>({...r,description:'Trabalho validado',category:'Mão de obra',amount:-workAmount(r)}));
      return expected.concat(expenses,labour);
    }
    if(metric==='receivable'){
      return charges.filter(matches).map(c=>({
        project:c.project,date:c.due,description:c.description,original:c.amount,
        settled:chargeState(state,c,until).paid,amount:chargeBalance(state,c,until)
      })).filter(r=>r.amount>0);
    }
    if(metric==='received'){
      const byId=new Map(charges.map(c=>[c.id,c]));
      return (state.receipts||[]).filter(matches).filter(movement).map(r=>({
        ...r,description:byId.get(r.charge)?.description||'Recebimento'
      }));
    }
    if(metric==='paid'){
      const byId=new Map(costs.filter(matches).map(c=>[c.id,c]));
      const payments=(state.costPayments||[]).filter(p=>byId.has(p.cost)&&movement(p)).map(p=>{
        const cost=byId.get(p.cost);
        return {...p,project:cost.project,description:cost.description,party:cost.supplier};
      });
      return payments.concat(wages.filter(matches).filter(movement).map(p=>({...p,description:'Pagamento à equipa'})));
    }
    if(metric!=='due')return [];
    const debts=costs.filter(matches).map(c=>{
      const balance=costBalance(state,c,until);
      return {project:c.project,date:c.date,description:c.description,party:c.supplier,
        original:c.amount,settled:balance.paid,amount:balance.due};
    }).filter(r=>r.amount>0);
    const employees=new Map();
    function balanceFor(id){
      if(!employees.has(id))employees.set(id,{employee:id,project,description:'Mão de obra',original:0,settled:0});
      return employees.get(id);
    }
    for(const entry of state.entries||[]){
      if(matches(entry)&&entry.status==='approved'&&(!until||entry.date<=until))
        balanceFor(entry.employee).original+=workAmount(entry);
    }
    for(const payment of wages){
      if(matches(payment)&&activeAt(payment,until)&&(!until||payment.date<=until))
        balanceFor(payment.employee).settled+=payment.amount;
    }
    const labour=[...employees.values()].map(r=>({...r,amount:money(r.original-r.settled)}));
    // Company balances close per employee. A project's team balance closes as a whole.
    if(all)return debts.concat(labour.filter(r=>r.amount>0));
    return sum(labour)>0?debts.concat(labour.filter(r=>r.amount!==0)):debts;
  }
  const api={money,inPeriod,activeAt,costBalance,chargeBalance,chargeState,summary,overview,monthly,position,accountDetails};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ProjectFinance=api;
})(typeof globalThis!=='undefined'?globalThis:this);
