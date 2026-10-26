// Additive, repeatable demonstration dataset. Never changes existing movements or credentials.
const D=require('./lib/domain.cjs'),M=require('./lib/model.cjs'),T=require('./lib/timeclock.cjs');
const {resolveLocal}=require('./lib/clock-corrections.cjs');
const KEY='demo-aug-oct-2026-v1',AS_OF='2026-10-22';
const days=(from,until)=>{const out=[];for(let d=from;d<=until;d=new Date(Date.parse(d+'T12:00Z')+86400000).toISOString().slice(0,10))out.push(d);return out;};
const weekday=d=>new Date(d+'T12:00Z').getUTCDay();
function populate(state,admin,accounts=[]){
 if(state.demoDatasets?.[KEY])return {alreadyApplied:true,...state.demoDatasets[KEY]};
 if(D.isoToday()<AS_OF)throw Error('Este cenário exige uma data de execução igual ou posterior a 22/10/2026.');
 for(const [id,name] of [['e1','António Ferreira'],['e2','João Martins'],['e3','Miguel Santos'],['e4','Pedro Costa'],['e5','Rui Almeida']])if(!state.employees.some(e=>e.id===id&&e.name===name&&e.active))throw Error('Esta base não corresponde à equipa fictícia esperada.');
 for(const id of ['o1','o2','o3'])if(!state.projects.some(p=>p.id===id))throw Error('Obra original da demonstração em falta.');
 const initial=Object.fromEntries(Object.entries(state).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length]));
 const act=(type,data)=>{const before=Object.fromEntries(Object.entries(state).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length]));D.action(state,admin,type,data);for(const [k,v]of Object.entries(state))if(Array.isArray(v))for(const row of v.slice(before[k]||0))row.demoDataset=KEY;};
 const specs=[
  ['Cozinha e sala · agosto','Helena Duarte','Maia',14800,['e1','e2'],'2026-08-03','2026-08-28','Concluída','weekly'],
  ['Instalações técnicas · agosto','Manuel Teixeira','Porto',13200,['e3','e4','e5'],'2026-08-03','2026-08-28','Concluída','monthly'],
  ['Remodelação de loja · setembro','Comércio Exemplo, Lda.','Maia',18500,['e1','e2'],'2026-09-01','2026-09-30','Concluída','milestone'],
  ['Renovação de moradia · setembro','Sofia Matos','Matosinhos',16400,['e3','e4','e5'],'2026-09-01','2026-09-25','Concluída','weekly'],
  ['Escritório · preparação de outubro','Empresa Demonstração, Lda.','Porto',7600,['e1','e2'],'2026-10-26','2026-10-30','Planeada','milestone']
 ];
 const added=[];
 for(const [name,client,city,budget,employees,from,until,status,cycle]of specs){
  act('client',{name:client,email:'',phone:'',cycle,active:true});const clientId=state.clients.at(-1).id;
  act('project',{name,clientId,city,budget,employees,status:status==='Concluída'?'Em curso':status,address:'Morada de demonstração · '+city,siteContact:state.employees.find(e=>e.id===employees[0]).name,plannedStart:from,plannedEnd:until});
  added.push(state.projects.at(-1));
 }
 // Historical absences are entered before generating work, so no fictitious work is created during leave.
 for(const a of [
  {employee:'e2',kind:'holiday',from:'2026-08-17',until:'2026-08-21',mode:'full'},
  {employee:'e5',kind:'holiday',from:'2026-09-10',until:'2026-09-11',mode:'full'},
  {employee:'e2',kind:'unavailable',from:'2026-10-23',until:'2026-10-23',mode:'partial',start:'08:00',end:'10:00'},
  {employee:'e5',kind:'holiday',from:'2026-10-26',until:'2026-10-27',mode:'full'}
 ]){
  const candidate={...a,note:'Período fictício para demonstração'};
  // Preserve existing scheduling, even if someone has already used this demo.
  const copy=structuredClone(state);try{D.action(copy,admin,'absenceCreate',candidate);}catch(e){if(e.status===409)continue;throw e;}act('absenceCreate',candidate);
 }
 const schedules=[...added.slice(0,4).map(p=>[p,p.plannedStart,p.plannedEnd]),...['o1','o2','o3'].map(id=>{const p=state.projects.find(p=>p.id===id);return [p,p.plannedStart>'2026-10-01'?p.plannedStart:'2026-10-01',AS_OF];})];
 const absence=require('./lib/absences.cjs');
 for(const [project,from,until]of schedules)for(const date of days(from,until)){
  if([0,6].includes(weekday(date)))continue;
  for(const employee of project.employees){
   if(state.entries.some(r=>r.employee===employee&&r.date===date)||state.clockShifts?.some(s=>s.employee===employee&&s.startedAt.slice(0,10)<=date&&(!s.endedAt||s.endedAt.slice(0,10)>=date))||absence.blocked(state,employee,date,'08:00','17:00'))continue;
   const end=weekday(date)===5?'16:00':'17:00',pending=date>='2026-10-20';
   if(weekday(date)===5){
    const owner=accounts.find(u=>u.employee_id===employee),user={...admin,id:owner?.id||admin.id,employeeId:employee};
    const at=time=>Date.parse(resolveLocal(date+'T'+time));
    const n=state.clockShifts?.length||0;
    T.apply(state,user,'clockIn',{project:project.id,note:'DEMO · '+project.name},at('08:00'));const shift=state.clockShifts.at(-1);
    T.apply(state,user,'clockPause',{id:shift.id},at('12:00'));T.apply(state,user,'clockResume',{id:shift.id},at('13:00'));T.apply(state,user,'clockOut',{id:shift.id},at(end));
    const count=state.entries.length;if(!pending)T.apply(state,admin,'clockApprove',{id:shift.id},at('17:30'));
    for(const s of state.clockShifts.slice(n))s.demoDataset=KEY;for(const r of state.entries.slice(count))r.demoDataset=KEY;
   }else{
    act('work',{project:project.id,employee,date,mode:'hours',start:'08:00',end,pause:60,note:'DEMO · '+({e1:'Execução e coordenação',e2:'Apoio e preparação',e3:'Instalação elétrica',e4:'Canalização',e5:'Pintura e acabamentos'}[employee])});
    const row=state.entries.at(-1);
    if(date==='2026-10-21'&&employee==='e5')act('reject',{id:row.id,reason:'DEMO · confirmar a hora de saída antes de voltar a submeter'});
    else if(!pending)act('approve',{id:row.id});
   }
  }
 }
 // One pending correction makes the review workflow demonstrable without changing approved hours.
 const original=state.entries.find(r=>r.demoDataset===KEY&&r.employee==='e2'&&r.date==='2026-10-15'&&r.mode==='hours');
 if(original)act('correction',{id:original.id,project:original.project,employee:original.employee,date:original.date,mode:'hours',start:'08:00',end:'16:30',pause:60,note:'DEMO · ajuste da saída',reason:'DEMO · saída antecipada por confirmar'});
 // Weekly payments with fully settled August and partial balances in September/October.
 for(const date of days('2026-08-01',AS_OF))if(weekday(date)===5||['2026-08-31','2026-09-30'].includes(date))for(const e of state.employees){
  const due=M.ledger(state,e.id,'1900-01-01',date).balance;
  const fraction=date==='2026-08-31'?1:date==='2026-09-30'?(e.id==='e2'?0.6:1):date<'2026-09-01'?0.9:date<'2026-10-01'?0.8:0.7;
  const amount=M.money(Math.max(0,due)*fraction);if(amount>=0.01)act('payment',{employee:e.id,amount,date,type:'payment',method:e.id==='e2'?'Numerário':'Transferência',note:'DEMO · acerto '+date.slice(0,7)});
 }
 act('payment',{employee:'e2',amount:100,date:'2026-10-20',type:'advance',method:'MB WAY',note:'DEMO · adiantamento a descontar no próximo acerto'});
 for(const project of [...added.slice(0,4),...state.projects.filter(p=>['o1','o2','o3'].includes(p.id))]){
  const month=project.plannedStart.slice(0,7),historical=month<'2026-10';
  const dates=historical?[project.plannedStart,month+'-14',project.plannedEnd]:['2026-10-05','2026-10-16','2026-10-22'];
  for(let i=0;i<3;i++){
   act('cost',{project:project.id,kind:'material',description:'DEMO · '+['Argamassas e consumíveis','Revestimentos e materiais técnicos','Tintas e acabamentos'][i],date:dates[i],quantity:10+i*5,unit:i===1?'m²':'un',unitPrice:[19.5,34.9,42.5][i],supplier:'Fornecedor de demonstração',reference:'DEMO-'+project.id.slice(0,8)+'-'+i});
   act('cost',{project:project.id,kind:'expense',category:['Transporte','Resíduos','Aluguer de equipamento'][i],description:'DEMO · '+['Entrega de materiais','Recolha de entulho','Aluguer de ferramenta'][i],date:dates[i],unitPrice:[75,180,125][i],supplier:'Serviços fictícios',reference:'DEMO-DESP-'+i});
  }
  const charged=state.charges.filter(c=>c.project===project.id&&!c.voided).reduce((n,c)=>n+c.amount,0),remaining=M.money(Math.max(0,project.budget-charged));
  for(let i=0;i<3;i++){
   const amount=i===2?M.money(remaining-M.money(remaining*.3)-M.money(remaining*.5)):M.money(remaining*[.3,.5][i]);if(!amount)continue;
   const due=historical?dates[i]:['2026-10-08','2026-10-22','2026-10-30'][i];
   act('charge',{project:project.id,description:'DEMO · '+['Adjudicação','Execução','Conclusão'][i],amount,due});const charge=state.charges.at(-1);
   if(due<=AS_OF){const ratio=historical?(project===added[3]&&i===2?0.5:1):(i===0?1:0.4);act('receipt',{charge:charge.id,amount:M.money(amount*ratio),date:due,method:'Transferência',note:'DEMO · recebimento '+(ratio===1?'integral':'parcial')});}
  }
  act('projectNote',{project:project.id,text:'DEMO · '+(historical?'Obra concluída. Conferir os registos e o histórico de recebimentos.':'Materiais entregues. Próximo passo: confirmar os acabamentos com o cliente.')});
 }
 // The future work has a deposit still to collect, but no fabricated work or payments.
 act('charge',{project:added[4].id,description:'DEMO · adjudicação do escritório',amount:2280,due:'2026-10-26'});
 for(const date of days('2026-10-19','2026-10-30')){
  if([0,6].includes(weekday(date)))continue;
  for(const e of state.employees){
   const project=date>='2026-10-26'&&['e1','e2'].includes(e.id)?added[4]:state.projects.find(p=>({e1:'o1',e2:'o1',e3:'o2',e4:'o2',e5:'o3'}[e.id])===p.id);
   if(absence.blocked(state,e.id,date,'08:00','17:00'))continue;
   if((state.planning||[]).some(p=>p.employee===e.id&&p.date===date&&p.status==='planned'))continue;
   act('planCreate',{project:project.id,employees:[e.id],dates:[date],start:'08:00',end:weekday(date)===5?'16:00':'17:00',pause:60,note:'DEMO · '+(date<=AS_OF?'Execução prevista':'Próxima fase e acabamentos')});
  }
 }
 for(const p of added.slice(0,4))act('project',{...p,status:'Concluída'});
 const addedCounts=Object.fromEntries(Object.entries(state).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length-(initial[k]||0)]));
 const manifest={asOf:AS_OF,from:'2026-08-01',until:'2026-10-31',addedCounts,managerProjects:added.slice(0,1).concat(added.slice(2,3),added.slice(4)).map(p=>p.id)};
 state.demoDatasets??={};state.demoDatasets[KEY]=manifest;return manifest;
}
module.exports={populate,KEY,AS_OF};
