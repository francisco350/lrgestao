(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.LinoOverview=model;})(globalThis,function(){
  'use strict';
  const money=n=>Math.round((n+Number.EPSILON)*100)/100;
  const amount=r=>money(r.minutes/60*r.unitRate/(r.payBasis==='hour'?1:r.dayHours));
  function summary(state,role,today){
    const approved=state.entries.filter(r=>r.status==='approved'&&r.date<=today);
    const balances=role==='manager'?[]:state.employees.map(e=>{
      const earned=money(approved.filter(r=>r.employee===e.id).reduce((sum,r)=>sum+amount(r),0));
      const paid=money(state.wagePayments.filter(p=>p.employee===e.id&&!p.voided&&p.date<=today).reduce((sum,p)=>sum+p.amount,0));
      return {employee:e.id,balance:money(earned-paid)};
    });
    const result={works:state.projects.length,activeWorks:state.projects.filter(p=>p.status==='Em curso').length,pending:state.entries.filter(r=>r.status==='pending').length,minutes:approved.reduce((sum,r)=>sum+r.minutes,0),team:state.employees.filter(e=>e.active).length,balances};
    if(role!=='manager'){result.earned=money(approved.reduce((sum,r)=>sum+amount(r),0));result.wagesDue=money(balances.reduce((sum,b)=>sum+Math.max(0,b.balance),0));}
    if(role==='admin'){
      result.clients=(state.clients||[]).length;
      result.receivable=money((state.charges||[]).filter(c=>!c.voided).reduce((sum,c)=>{
        const paid=money((state.receipts||[]).filter(r=>r.charge===c.id&&!r.voided).reduce((s,r)=>s+r.amount,0));
        return sum+Math.max(0,money(c.amount-paid));
      },0));
    }
    return result;
  }
  function activity(state,role){
    const rows=[];
    const person=id=>state.employees.find(e=>e.id===id)?.name||'Funcionário';
    const project=id=>state.projects.find(p=>p.id===id)?.name||'Obra';
    const client=id=>(state.clients||[]).find(c=>c.id===id)?.name||'Cliente';
    const add=(kind,record,details,fallback=record.date)=>{
      const at=record.voidedAt||record.updatedAt||record.createdAt||fallback;
      if(!at)return;
      rows.push({id:`${kind}:${record.id}`,kind,at,dated:!String(at).includes('T'),date:record.date||'',...details});
    };
    for(const r of state.entries.filter(r=>!r.clockShiftId||!(state.clockShifts||[]).some(s=>s.id===r.clockShiftId)))add('trabalho',r,{title:person(r.employee),detail:project(r.project),minutes:r.minutes,status:r.supersededBy?'Substituído':({approved:'Validado',pending:'Por validar',rejected:'Rejeitado'}[r.status]||r.status),tone:r.status==='pending'?'amber':r.status==='rejected'?'red':'',href:'#trabalho'});
    for(const s of state.clockShifts||[]){const last=s.events?.at(-1);add('trabalho',{...s,updatedAt:last?.at||s.decidedAt||s.endedAt||s.startedAt},{title:person(s.employee)+' · Ponto',detail:project(s.project),minutes:Math.floor((s.workedMs||0)/60000),status:({working:'A trabalhar',paused:'Em pausa',pending:'Por validar',approved:'Validado',rejected:'Rejeitado'}[s.status]||s.status),tone:['paused','pending'].includes(s.status)?'amber':s.status==='rejected'?'red':'',href:'#ponto'});}
    if(role!=='manager')for(const p of state.wagePayments)add('pagamentos',p,{title:person(p.employee),detail:p.type==='advance'?'Adiantamento à equipa':p.note||p.method||'Pagamento à equipa',value:p.amount,status:p.voided?'Anulado':'Pago',tone:p.voided?'gray':'',href:'#pagamentos'});
    if(role==='admin'){
      for(const r of state.receipts||[])add('recebimentos',r,{title:client(r.clientId),detail:project(r.project),value:r.amount,status:r.voided?'Anulado':'Recebido',tone:r.voided?'gray':'',href:'#recebimentos'});
      for(const c of state.charges||[]){const paid=money((state.receipts||[]).filter(r=>r.charge===c.id&&!r.voided).reduce((s,r)=>s+r.amount,0));add('cobrancas',c,{title:client(c.clientId),detail:c.description,value:c.amount,status:c.voided?'Anulada':paid>=c.amount?'Liquidada':paid>0?'Parcial':'Por receber',tone:c.voided?'gray':paid<c.amount?'amber':'',href:'#recebimentos'},null);}
      for(const c of state.costs||[])add('custos',c,{title:c.description,detail:project(c.project),value:c.amount,status:c.voided?'Anulado':c.kind==='material'?'Material':'Despesa',tone:c.voided?'gray':'',href:'#custos'});
      for(const c of state.clients||[])add('clientes',c,{title:c.name,detail:'Ficha do cliente',status:c.active?'Ativo':'Inativo',tone:c.active?'':'gray',href:'#clientes'},null);
      for(const e of state.employees)add('equipa',e,{title:e.name,detail:e.category,status:e.active?'Ativo':'Inativo',tone:e.active?'':'gray',href:'#equipa'},null);
    }
    for(const p of state.projects)add('obras',p,{title:p.name,detail:[p.client,p.city].filter(Boolean).join(' · '),status:p.status,tone:p.status==='Planeada'?'amber':'',href:'#obra/'+encodeURIComponent(p.id)},null);
    for(const n of state.projectNotes||[])add('obras',n,{title:'Nota em '+project(n.project),detail:n.text,status:'Nota',tone:'gray',href:'#obra/'+encodeURIComponent(n.project)},null);
    return rows.sort((a,b)=>{
      const timestamp=r=>Date.parse(r.dated?r.at+'T00:00:00Z':r.at)||0;
      return timestamp(b)-timestamp(a)||a.id.localeCompare(b.id);
    });
  }
  return {summary,activity};
});
