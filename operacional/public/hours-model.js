(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.HoursReport=model;})(globalThis,function(){
  'use strict';
  const dayMs=86400000;
  const lisbonDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'});
  const localDate=ms=>lisbonDate.format(new Date(ms));
  const validDate=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&s>='1900-01-01'&&s<='9998-12-31'&&Number.isFinite(Date.parse(s+'T12:00Z'))&&new Date(s+'T12:00Z').toISOString().slice(0,10)===s;
  const addDays=(s,n)=>new Date(Date.parse(s+'T12:00Z')+n*dayMs).toISOString().slice(0,10);
  function period(mode,date){
    if(!['day','week','month'].includes(mode)||!validDate(date))throw Error('Escolha um período e uma data válidos.');
    const d=new Date(date+'T12:00Z');let from,until;
    if(mode==='day'){from=date;until=date;}
    else if(mode==='week'){from=addDays(date,-((d.getUTCDay()+6)%7));until=addDays(from,6);}
    else{from=date.slice(0,7)+'-01';const next=new Date(from+'T12:00Z');next.setUTCMonth(next.getUTCMonth()+1);until=addDays(next.toISOString().slice(0,10),-1);}
    const days=[];for(let v=from;v<=until;v=addDays(v,1))days.push(v);
    return {mode,from,until,days};
  }
  function shiftDays(s){
    const start=Date.parse(s.startedAt),end=Date.parse(s.endedAt);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>48*3600000)return null;
    const days=new Map();let previous=start;
    for(const i of s.intervals||[]){
      let from=Date.parse(i.start);const to=Date.parse(i.end);
      if(!Number.isFinite(from)||!Number.isFinite(to)||from<previous||from>to||to>end)return null;
      previous=to;
      while(from<to){
        const date=localDate(from);let until=to;
        if(localDate(to-1)!==date){let low=from,high=to;while(high-low>1){const mid=Math.floor((low+high)/2);if(localDate(mid)===date)low=mid;else high=mid;}until=high;}
        days.set(date,(days.get(date)||0)+until-from);from=until;
      }
    }
    const result=[...days].map(([date,ms])=>({date,minutes:Math.floor(ms/60000)})).filter(d=>d.minutes>0);
    return result.length?result:null;
  }
  function options(state){
    const employees=new Map((state.employees||[]).map(e=>[e.id,e.name])),projects=new Map((state.projects||[]).map(p=>[p.id,p.name]));
    for(const s of state.clockShifts||[]){if(!employees.has(s.employee))employees.set(s.employee,s.employeeName||'Funcionário anterior');if(!projects.has(s.project))projects.set(s.project,s.projectName||'Obra anterior');}
    for(const r of state.entries||[]){if(!employees.has(r.employee))employees.set(r.employee,'Funcionário anterior');if(!projects.has(r.project))projects.set(r.project,'Obra anterior');}
    const sorted=m=>[...m].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,'pt'));
    return {employees:sorted(employees),projects:sorted(projects)};
  }
  const selected=v=>Array.isArray(v)?v:v?[v]:[];
  const accepts=(list,value)=>!selected(list).length||selected(list).includes(value);
  function step(mode,date,delta){const p=period(mode,date);return mode==='day'?addDays(date,delta):mode==='week'?addDays(p.from,7*delta):addDays(delta<0?p.from:p.until,delta);}
  function build(state,filter){
    let range=period(filter.mode,filter.date);const choices=options(state);
    if(filter.from===''&&filter.until==='')range={mode:'all',from:'',until:'',days:[]};
    else if(filter.from||filter.until){
      const from=filter.from||'',until=filter.until||'';
      if(from&&!validDate(from)||until&&!validDate(until)||from&&until&&from>until)throw Error('Escolha um intervalo de datas válido.');
      const month=from?period('month',from):null,days=[];
      if(from&&until)for(let date=from;date<=until;date=addDays(date,1))days.push(date);
      range={mode:month&&from===month.from&&until===month.until?'month':from===range.from&&until===range.until?range.mode:'custom',from,until,days};
    }
    for(const [key,list] of [['employee',choices.employees],['project',choices.projects]])if(selected(filter[key]).some(id=>!list.some(x=>x.id===id)))throw Error('O filtro deixou de estar disponível. Atualize o mapa.');
    const employeeName=id=>choices.employees.find(e=>e.id===id)?.name||'Funcionário anterior',projectName=id=>choices.projects.find(p=>p.id===id)?.name||'Obra anterior';
    const match=r=>accepts(filter.employee,r.employee)&&accepts(filter.project,r.project);
    const inRange=date=>(!range.from||date>=range.from)&&(!range.until||date<=range.until);
    const overlaps=(a,b)=>Number.isFinite(Date.parse(a))&&Number.isFinite(Date.parse(b))&&(!range.until||localDate(Date.parse(a))<=range.until)&&(!range.from||localDate(Math.max(Date.parse(a),Date.parse(b)-1))>=range.from);
    const details=[],counts={open:0,corrections:0,review:0};
    const add=r=>{if(inRange(r.date)&&match(r)&&accepts(filter.status,r.status))details.push({...r,employeeName:employeeName(r.employee),projectName:projectName(r.project)});};
    for(const r of state.entries||[]){
      if(r.supersededBy||!['approved','pending'].includes(r.status))continue;
      add({id:r.id,date:r.date,employee:r.employee,project:r.project,status:r.status,minutes:r.minutes,source:r.mode==='clock'?'Ponto':r.mode==='days'?'Manual · dias':'Manual · horário'});
    }
    for(const s of state.clockShifts||[]){
      if(!match(s))continue;
      if(!selected(filter.status).length&&['working','paused'].includes(s.status)&&overlaps(s.startedAt,state.serverNow||s.startedAt))counts.open++;
      if(s.status==='pending'&&accepts(filter.status,'pending')){
        const days=shiftDays(s);
        if(days)for(const d of days)add({id:s.id,date:d.date,employee:s.employee,project:s.project,status:'pending',minutes:d.minutes,source:'Ponto · por validar'});
        else if(overlaps(s.startedAt,s.endedAt))counts.review++;
      }
      for(const c of s.corrections||[])if(accepts(filter.status,'pending')&&c.status==='pending'&&(overlaps(c.proposed.startedAt,c.proposed.endedAt)||overlaps(c.original.startedAt,c.original.endedAt)))counts.corrections++;
    }
    for(const c of state.corrections||[]){
      if(!accepts(filter.status,'pending')||c.status!=='pending')continue;
      const original=state.entries.find(r=>r.id===c.entry);
      if([original,c.proposed].some(r=>r&&match(r)&&inRange(r.date)))counts.corrections++;
    }
    details.sort((a,b)=>a.date.localeCompare(b.date)||a.employeeName.localeCompare(b.employeeName,'pt')||a.projectName.localeCompare(b.projectName,'pt')||a.id.localeCompare(b.id));
    // All dates shows days with work instead of creating years of empty columns.
    if(!range.from||!range.until)range.days=[...new Set(details.map(row=>row.date))];
    const pairs=new Map(),daily=new Map(range.days.map(date=>[date,{date,approved:0,pending:0}]));
    let approved=0,pending=0;
    for(const r of details){
      if(r.status==='approved')approved+=r.minutes;else pending+=r.minutes;
      daily.get(r.date)[r.status]+=r.minutes;
      const key=JSON.stringify([r.employee,r.project]);
      if(!pairs.has(key))pairs.set(key,{employee:r.employee,project:r.project,employeeName:r.employeeName,projectName:r.projectName,approved:0,pending:0,days:{}});
      const row=pairs.get(key);row[r.status]+=r.minutes;row.days[r.date]??={approved:0,pending:0};row.days[r.date][r.status]+=r.minutes;
    }
    const monthlyPairs=new Map([...pairs].map(([key,row])=>[key,{...row,imported:0}]));
    let imported=0;
    if(['month','all'].includes(range.mode)&&accepts(filter.status,'imported'))for(const r of state.monthlyHistory||[]){
      if((range.mode==='month'&&r.month!==range.from.slice(0,7))||!match(r))continue;
      const key=JSON.stringify([r.employee,r.project]),minutes=Math.round(r.totalHours*60);
      if(!monthlyPairs.has(key))monthlyPairs.set(key,{employee:r.employee,project:r.project,employeeName:employeeName(r.employee),projectName:projectName(r.project),approved:0,pending:0,imported:0});
      monthlyPairs.get(key).imported+=minutes;imported+=minutes;
    }
    const summaryRows=[...monthlyPairs.values()].sort((a,b)=>a.employeeName.localeCompare(b.employeeName,'pt')||a.projectName.localeCompare(b.projectName,'pt'));
    return {range,summaryRows,imported,filter:{...filter},options:choices,details,pairs:[...pairs.values()].sort((a,b)=>a.employeeName.localeCompare(b.employeeName,'pt')||a.projectName.localeCompare(b.projectName,'pt')),daily:[...daily.values()],totals:{approved,pending,people:new Set(summaryRows.map(r=>r.employee)).size,projects:new Set(summaryRows.map(r=>r.project)).size},counts,generatedAt:state.serverNow||null};
  }
  const hm=n=>`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
  const cell=v=>{let s=String(v??'');if(/^\s*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  function csv(report,kind='summary'){
    if(!['summary','detail'].includes(kind))throw Error('Tipo de exportação inválido.');
    const common=['Início do período','Fim do período','Dados consultados em (UTC)'];
    const context=[report.range.from,report.range.until,report.generatedAt||''];
    const withImported=['month','all'].includes(report.range.mode);
    const rows=kind==='summary'?
      [[...common,'Funcionário','Obra','Minutos validados','Horas validadas (HH:MM)','Minutos por validar','Horas por validar (HH:MM)',...(withImported?['Horas importadas (HH:MM)','Validadas + importadas (HH:MM)']:[])],...report.summaryRows.map(r=>[...context,r.employeeName,r.projectName,r.approved,hm(r.approved),r.pending,hm(r.pending),...(withImported?[hm(r.imported),hm(r.approved+r.imported)]:[])])]:
      [[...common,'Data','Funcionário','Obra','Origem','Estado','Minutos','Horas (HH:MM)','ID do registo'],...report.details.map(r=>[...context,r.date,r.employeeName,r.projectName,r.source,r.status==='approved'?'Validado':'Por validar',r.minutes,hm(r.minutes),r.id])];
    return '\ufeff'+rows.map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n';
  }
  return {selected,accepts,step,period,addDays,build,options,shiftDays,csv,hm};
});
