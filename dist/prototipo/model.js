(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.LinoModel=model;})(globalThis,function(){
  'use strict';
  const money=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
  const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00'))&&new Date(s+'T12:00:00').toISOString().slice(0,10)===s;
  const clock=s=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)?Number(s.slice(0,2))*60+Number(s.slice(3)):NaN;
  function migrate(db){
    db.schemaVersion=2;
    for(const e of db.employees){e.payBasis??='day';e.dayHours??=8;}
    for(const r of db.entries){r.dayHours??=8;r.minutes??=Math.round(r.days*r.dayHours*60);r.payBasis??='day';r.unitRate??=r.rate;r.status??='approved';r.mode??='days';r.category??=db.employees.find(e=>e.id===r.employee)?.category||'';}
    db.wagePayments??=[];db.corrections??=[];
    return db;
  }
  function amount(r){return money(r.minutes/60*r.unitRate/(r.payBasis==='hour'?1:r.dayHours));}
  const approved=rows=>rows.filter(r=>r.status==='approved');
  const total=rows=>money(rows.reduce((sum,r)=>sum+amount(r),0));
  function work(data,person,previous){
    if(!validDate(data.date))throw Error('Escolha uma data válida.');
    const keep=previous&&previous.employee===person.id;
    let minutes,start='',end='',pause=0;
    if(data.mode==='hours'){
      start=data.start;end=data.end;pause=Number(data.pause);
      const a=clock(start),b=clock(end);
      if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||a>=1440||b>1440||b<=a)throw Error('A saída deve ser posterior à entrada, no mesmo dia.');
      if(!Number.isInteger(pause)||pause<0||pause>=b-a)throw Error('A pausa deve ser inferior à duração do trabalho.');
      minutes=b-a-pause;
    }else{
      const days=Number(data.days);
      if(!Number.isFinite(days)||days<=0||days>1)throw Error('Indique entre uma fração de dia e um dia completo.');
      minutes=Math.round(days*(keep?previous.dayHours:person.dayHours)*60);
    }
    if(!Number.isInteger(minutes)||minutes<=0||minutes>1440)throw Error('Duração de trabalho inválida.');
    const dayHours=keep?previous.dayHours:person.dayHours;
    const payBasis=keep?previous.payBasis:person.payBasis;
    const unitRate=keep?previous.unitRate:person.rate;
    return {employee:person.id,project:data.project,date:data.date,mode:data.mode,minutes,start,end,pause,days:minutes/(dayHours*60),rate:payBasis==='day'?unitRate:unitRate*dayHours,payBasis,unitRate,dayHours,category:keep?previous.category:person.category,note:String(data.note||'').trim()};
  }
  function validateWork(row,rows,exclude){
    const same=rows.filter(r=>r.id!==exclude&&r.employee===row.employee&&r.date===row.date&&r.status!=='rejected');
    if(same.reduce((s,r)=>s+r.minutes,0)+row.minutes>1440)throw Error('O total de trabalho neste dia ultrapassaria 24 horas.');
    if(row.mode==='hours'&&same.some(r=>r.mode==='hours'&&clock(row.start)<clock(r.end)&&clock(row.end)>clock(r.start)))throw Error('Este horário sobrepõe-se a outro registo do funcionário.');
  }
  function ledger(db,employeeId,start,end){
    const work=approved(db.entries.filter(r=>r.employee===employeeId));
    const payments=db.wagePayments.filter(p=>p.employee===employeeId&&!p.voided);
    const opening=money(total(work.filter(r=>r.date<start))-payments.filter(p=>p.date<start).reduce((s,p)=>s+p.amount,0));
    const earned=total(work.filter(r=>r.date>=start&&r.date<=end));
    const paid=money(payments.filter(p=>p.date>=start&&p.date<=end).reduce((s,p)=>s+p.amount,0));
    const pending=total(db.entries.filter(r=>r.employee===employeeId&&r.status==='pending'&&r.date>=start&&r.date<=end));
    return {opening,earned,paid,pending,balance:money(opening+earned-paid)};
  }
  function payment(db,{employee,amount:raw,date,type,method,note}){
    const value=money(raw);
    if(!db.employees.some(e=>e.id===employee))throw Error('Selecione um funcionário.');
    if(!Number.isFinite(value)||value<=0||value>1000000)throw Error('Indique um valor válido, superior a zero.');
    if(!validDate(date))throw Error('Escolha uma data válida.');
    if(!['payment','advance'].includes(type))throw Error('Selecione o tipo de movimento.');
    const due=ledger(db,employee,'0001-01-01',date).balance;
    if(type==='payment'&&value>Math.max(0,due))throw Error('O valor excede o saldo aprovado nesta data. Use Adiantamento para um valor antecipado.');
    return {employee,amount:value,date,type,method,note:String(note||'').trim()};
  }
  return {migrate,amount,total,approved,work,validateWork,ledger,payment,money,validDate};
});
