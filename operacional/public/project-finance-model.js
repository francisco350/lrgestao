(function(root){
  'use strict';
  const money=n=>Math.round((n+Number.EPSILON)*100)/100;
  const sum=rows=>money(rows.reduce((n,r)=>n+r.amount,0));
  const inPeriod=(date,from,until)=>date?(!from||date>=from)&&(!until||date<=until):!from&&!until;
  const activeAt=(row,until)=>!row.voided||!!(until&&row.voidedAt&&row.voidedAt.slice(0,10)>until);
  const workAmount=r=>money(r.minutes/60*r.unitRate/(r.payBasis==='hour'?1:r.dayHours));
  const earned=rows=>money(rows.reduce((n,r)=>n+workAmount(r),0));
  // Read-only movements: the original import remains the single source of each amount.
  function withHistory(state){
    const h=state.historicalImport;
    if(!h||state.includesHistory)return state;
    const projects=new Map((state.projects||[]).map(p=>[p.importCode,p]));
    const costs=[...(state.costs||[])],receipts=[...(state.receipts||[])];
    const day=v=>String(v||'').slice(0,10);
    for(const r of h['Liquidações do cliente']||[]){
      const [code,date,,description,amount]=r.values,p=projects.get(code);
      if(p&&Number.isFinite(amount)&&day(date))receipts.push({id:r.sourceKey,project:p.id,clientId:p.clientId,date:day(date),description,amount,method:'Por identificar',historical:true});
    }
    const dates=new Map(),counts=new Map();
    const materialKey=(code,article,quantity)=>JSON.stringify([code,article,quantity]);
    for(const {values:[date,code,article,quantity]} of h['Saídas de artigos']||[]){
      const key=materialKey(code,article,quantity);
      if(!dates.has(key))dates.set(key,[]);
      dates.get(key).push(day(date));
    }
    for(const {values:[code,article,,quantity]} of h['Artigos gastos por encomenda']||[]){
      const key=materialKey(code,article,quantity);counts.set(key,(counts.get(key)||0)+1);
    }
    for(const r of h['Artigos gastos por encomenda']||[]){
      const [code,article,description,quantity,unitPrice,amount]=r.values,p=projects.get(code);
      const key=materialKey(code,article,quantity),ds=dates.get(key)||[];
      const date=ds.length===counts.get(key)&&new Set(ds).size===1?ds[0]:'';
      if(p&&Number.isFinite(amount))costs.push({id:r.sourceKey,date,project:p.id,description,quantity,unitPrice,amount,kind:'material',historical:true,historicalUsage:true});
    }
    for(const r of h['Outros gastos']||[]){
      const [code,date,description,amount]=r.values,p=projects.get(code);
      if(p&&Number.isFinite(amount))costs.push({id:r.sourceKey,date:day(date),project:p.id,description,amount,category:'Outros gastos',kind:'expense',historical:true});
    }
    const employeeCodes=new Map((state.employees||[]).map(e=>[e.id,e.importCode]));
    const rates=new Map((h['Tarifas por encomenda']||[]).map(({values:v})=>[JSON.stringify(v.slice(0,2)),v[2]]));
    const labour=[];
    for(const {values:v} of h['Resumo das encomendas']||[]){
      const p=projects.get(v[0]),amount=v[8];
      if(!p||!Number.isFinite(amount)||!amount)continue;
      const hours=(state.monthlyHistory||[]).filter(r=>r.project===p.id);
      const parts=hours.map(r=>({project:p.id,month:r.month,description:'Trabalho importado',amount:money(r.totalHours*rates.get(JSON.stringify([v[0],employeeCodes.get(r.employee)])))}));
      if(parts.length&&parts.every(r=>Number.isFinite(r.amount))&&sum(parts)===amount)labour.push(...parts);
      else labour.push({project:p.id,month:'',description:'Trabalho importado · sem repartição mensal confirmada',amount});
    }
    return {...state,costs,receipts,historicalLabour:labour,includesHistory:true};
  }
  function monthCovered(month,from,until){
    if(!month)return !from&&!until;
    const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
    return (!from||from<=month+'-01')&&(!until||until>=last);
  }
  function historicalWages(state,employeeCode,from,until){
    const records=(state.historicalImport?.['Pagamentos a funcionários']||[]).map(r=>r.values).filter(v=>v[0]===employeeCode);
    let opening=0,earned=0,paid=0;
    for(const v of records){
      if(from&&v[1]<from.slice(0,7))opening+=v[7]-v[8];
      else if(monthCovered(v[1],from,until)){earned+=v[7];paid+=v[8];}
    }
    return {opening:money(opening),earned:money(earned),paid:money(paid)};
  }
  function costBalance(state,cost,until=''){
    const active=(!until||(cost.date&&cost.date<=until))&&activeAt(cost,until);
    const paid=sum((state.costPayments||[]).filter(p=>p.cost===cost.id&&(!until||p.date<=until)&&activeAt(p,until)));
    const tracked=cost.paymentTracked===true;
    return {active,paid,tracked,unknown:active&&!tracked&&!cost.inventoryLot&&!cost.historicalUsage,due:active&&tracked&&!cost.inventoryLot?money(cost.amount-paid):0};
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
    state=withHistory(state);
    const costs=(state.costs||[]).filter(c=>c.project===project);
    const balances=costs.map(c=>({cost:c,...costBalance(state,c,until)}));
    const periodCosts=balances.filter(c=>c.active&&inPeriod(c.cost.date,from,until)).map(c=>c.cost);
    const payments=(state.costPayments||[]).filter(p=>p.project===project&&inPeriod(p.date,from,until)&&activeAt(p,until));
    const receipts=(state.receipts||[]).filter(r=>r.project===project&&inPeriod(r.date,from,until)&&activeAt(r,until));
    const methods=['Numerário','Transferência','MB WAY','Outro',...(receipts.some(r=>r.method==='Por identificar')?['Por identificar']:[])].map(method=>({method,paid:sum(payments.filter(p=>p.method===method)),received:sum(receipts.filter(r=>r.method===method))}));
    return {materials:sum(periodCosts.filter(c=>c.kind==='material')),expenses:sum(periodCosts.filter(c=>c.kind==='expense')),paid:sum(payments),received:sum(receipts),cashBalance:money(sum(receipts)-sum(payments)),due:money(balances.reduce((n,b)=>n+b.due,0)),unknownCount:balances.filter(b=>b.unknown).length,unknownAmount:sum(balances.filter(b=>b.unknown).map(b=>b.cost)),receivable:sum(receivableDetails(state,project,until)),methods};
  }
  function overview(state,project,from='',until=''){
    state=withHistory(state);
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
    rows.at(-1).cost=money(rows.at(-1).cost+sum((state.historicalLabour||[]).filter(r=>r.project===project&&monthCovered(r.month,from,until))));
    const employees=new Set(entries.map(r=>r.employee));
    const unassignedWages=(state.wagePayments||[]).filter(p=>!p.project&&employees.has(p.employee)&&activeAt(p,until)&&(!until||p.date<=until)).length;
    const totals=Object.fromEntries(['cost','paid','due','unknown'].map(key=>[key,money(rows.reduce((n,r)=>n+r[key],0))]));
    const methods=base.methods.map(m=>({...m,paid:money(m.paid+sum(wages.filter(p=>p.method===m.method&&inPeriod(p.date,from,until))))}));
    return {...base,rows,totals,methods,unassignedWages,pending:earned(entries.filter(r=>r.status==='pending'&&inPeriod(r.date,from,until)))};
  }
  function monthly(state,from='',until=''){
    state=withHistory(state);
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
    labour.cost=money(earned(entries.filter(r=>inPeriod(r.date,from,until)))+sum((state.historicalLabour||[]).filter(r=>monthCovered(r.month,from,until))));
    labour.paid=sum(wages.filter(p=>inPeriod(p.date,from,until)));
    for(const employee of new Set([...entries.map(r=>r.employee),...(state.employees||[]).map(e=>e.id)])){
      const h=historicalWages(state,(state.employees||[]).find(e=>e.id===employee)?.importCode,'',until);
      labour.due+=Math.max(0,money(h.earned-h.paid+earned(entries.filter(r=>r.employee===employee))-sum(wages.filter(p=>p.employee===employee))));
    }
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
    state=withHistory(state);
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
      return expected.concat(expenses,labour,(state.historicalLabour||[]).filter(r=>matches(r)&&monthCovered(r.month,from,until)).map(r=>({...r,category:'Mão de obra histórica',amount:-r.amount})));
    }
    if(metric==='receivable')return receivableDetails(state,project,until);
    if(metric==='received'){
      const byId=new Map(charges.map(c=>[c.id,c]));
      return (state.receipts||[]).filter(matches).filter(movement).map(r=>({
        ...r,description:r.description||byId.get(r.charge)?.description||'Recebimento'
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
    if(all)for(const e of state.employees||[]){
      const h=historicalWages(state,e.importCode,'',until);
      if(h.earned||h.paid){const row=balanceFor(e.id);row.original+=h.earned;row.settled+=h.paid;}
    }
    const labour=[...employees.values()].map(r=>({...r,amount:money(r.original-r.settled)}));
    // Company balances close per employee. A project's team balance closes as a whole.
    if(all)return debts.concat(labour.filter(r=>r.amount>0));
    return sum(labour)>0?debts.concat(labour.filter(r=>r.amount!==0)):debts;
  }
  function saleWork(state,project,from='',until='',closing=''){
    const settled=new Map();
    const chargePayments=new Map();
    for(const receipt of state.receipts||[]){
      if(receipt.project!==project||!activeAt(receipt,closing)||(closing&&receipt.date>closing))continue;
      if(receipt.charge)chargePayments.set(receipt.charge,(chargePayments.get(receipt.charge)||0)+Math.round(receipt.amount*100));
      for(const item of receipt.sale?.allocations||[]){
        const previous=settled.get(item.entry)||{minutes:0,cents:0};
        settled.set(item.entry,{minutes:previous.minutes+item.minutes,cents:previous.cents+item.cents});
      }
    }
    const billed=new Map();
    for(const charge of state.charges||[]){
      if(charge.project!==project||!charge.work?.length||!activeAt(charge,closing))continue;
      let credit=chargePayments.get(charge.id)||0;
      for(const item of charge.work){
        const centsPaid=Math.min(credit,item.cents);
        credit-=centsPaid;
        if(closing&&item.since>closing)continue;
        const minutesPaid=Math.floor(item.minutes*centsPaid/item.cents);
        billed.set(item.entry,{charge:charge.id,minutes:item.minutes,cents:item.cents,minutesPaid,centsPaid});
      }
    }
    return (state.entries||[]).filter(entry=>entry.project===project&&entry.status==='approved'&&inPeriod(entry.date,from,until)).map(entry=>{
      const category=(entry.category||state.employees?.find(e=>e.id===entry.employee)?.category||'Sem categoria').trim();
      const role={oficial:'official',ajudante:'helper'}[category.toLowerCase()]||'other';
      const paid=settled.get(entry.id)||{minutes:0,cents:0};
      const line=billed.get(entry.id);
      const freeMinutes=Math.max(0,entry.minutes-paid.minutes-(line?.minutes||0));
      const billedMinutes=line?line.minutes-line.minutesPaid:0;
      const billedCents=line?line.cents-line.centsPaid:0;
      return {entry:entry.id,date:entry.date,role,category,minutes:entry.minutes,paidMinutes:paid.minutes+(line?.minutesPaid||0),
        paidCents:paid.cents+(line?.centsPaid||0),available:freeMinutes+billedMinutes,freeMinutes,billedCents,charge:line?.charge};
    });
  }
  function receivableDetails(state,project,until){
    const rows=[];
    const projects=(state.projects||[]).filter(p=>project===undefined||p.id===project);
    for(const p of projects){
      const work=saleWork(state,p.id,'',until,until);
      const groups=new Map(),included=new Map();
      const charges=(state.charges||[]).filter(c=>c.project===p.id);
      for(const line of work){
        if(line.charge)included.set(line.charge,(included.get(line.charge)||0)+line.billedCents);
      }
      // Legacy charges can identify their included hours through an explicitly linked receipt.
      // At an earlier close, show this portion as unpaid labour at its known sale price.
      if(until){
        const byEntry=new Map(work.map(line=>[line.entry,line]));
        const charged=new Set(charges.filter(c=>activeAt(c,until)&&c.due<=until).map(c=>c.id));
        for(const r of state.receipts||[]){
          if(r.project!==p.id||!charged.has(r.charge)||r.voided||r.date<=until||!r.sale)continue;
          for(const allocation of r.sale.allocations){
            const line=byEntry.get(allocation.entry);
            if(!line?.freeMinutes||!allocation.minutes)continue;
            const minutes=Math.min(line.freeMinutes,allocation.minutes);
            const cents=Math.round(allocation.cents*minutes/allocation.minutes);
            line.freeMinutes-=minutes;
            line.billedCents+=cents;
            included.set(r.charge,(included.get(r.charge)||0)+cents);
          }
        }
      }
      for(const line of work){
        if(!line.available)continue;
        const label={official:'Oficiais',helper:'Ajudantes'}[line.role]||line.category;
        const group=groups.get(label)||{project:p.id,description:label,minutes:0,freeMinutes:0,billedCents:0,rate:p.saleRates?.[line.role]};
        group.minutes+=line.available;
        group.freeMinutes+=line.freeMinutes;
        group.billedCents+=line.billedCents;
        groups.set(label,group);
      }
      for(const g of groups.values()){
        rows.push({project:p.id,description:g.description,minutes:g.minutes,unpriced:g.rate==null?g.freeMinutes:0,
          amount:(g.billedCents+Math.round(g.freeMinutes*(g.rate||0)/60))/100});
      }
      for(const c of charges){
        const balance=chargeBalance(state,c,until);
        const amount=money(balance-(included.get(c.id)||0)/100);
        if(amount>0)rows.push({project:p.id,date:c.due,description:c.description,original:c.amount,settled:chargeState(state,c,until).paid,amount,
          included:money(balance-amount)});
      }
    }
    return rows;
  }
  const api={historicalWages,withHistory,money,inPeriod,activeAt,costBalance,chargeBalance,chargeState,summary,overview,monthly,position,accountDetails,saleWork};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ProjectFinance=api;
})(typeof globalThis!=='undefined'?globalThis:this);
