const {test}=require('node:test'),assert=require('node:assert/strict');
const H=require('./public/hours-model.js'),D=require('./lib/domain.cjs'),M=require('./lib/model.cjs');
const filter={mode:'week',date:'2026-10-14',employee:'',project:''};
test('mapa: período diário e navegação atravessam meses e anos',()=>{
 assert.deepEqual(H.period('day','2026-12-31'),{mode:'day',from:'2026-12-31',until:'2026-12-31',days:['2026-12-31']});
 assert.equal(H.step('day','2026-12-31',1),'2027-01-01');
 assert.equal(H.step('day','2026-03-01',-1),'2026-02-28');
 const report=H.build(fixture(),{...filter,mode:'day',date:'2026-10-12'});
 assert(report.details.every(row=>row.date==='2026-10-12'));
 assert.equal(report.daily.length,1);
});
test('mapa: intervalo personalizado filtra dias e CSV e preserva importações apenas no mês completo',()=>{
 const state=fixture();
 state.monthlyHistory=[{employee:'e1',project:'p1',month:'2026-10',totalHours:8}];
 const report=H.build(state,{...filter,from:'2026-10-15',until:'2026-10-19'});
 assert.equal(report.range.mode,'custom');
 assert.equal(report.range.days.length,5);
 assert.equal(report.totals.approved,80);
 assert.equal(report.totals.pending,90);
 assert.equal(report.imported,0);
 assert(!report.details.some(row=>row.date<'2026-10-15'||row.date>'2026-10-19'));
 assert(H.csv(report).includes('"2026-10-15";"2026-10-19"'));
 assert.equal(H.build(state,{...filter,from:'2026-10-01',until:'2026-10-31'}).imported,480);
 assert.throws(()=>H.build(state,{...filter,from:'2026-10-20',until:'2026-10-10'}),/intervalo/);
});
test('mapa: todas as datas inclui meses distintos, histórico e turnos, respeitando filtros e CSV',()=>{
 const state=fixture();
 state.entries.push({...state.entries[0],id:'past',date:'2025-12-01',minutes:45});
 state.monthlyHistory=[{employee:'e1',project:'p1',month:'2025-11',totalHours:8},{employee:'e1',project:'p1',month:'2026-09',totalHours:4},{employee:'e2',project:'p2',month:'2026-09',totalHours:2}];
 const all={...filter,from:'',until:''};
 const report=H.build(state,all);
 assert.equal(report.range.mode,'all');
 assert.equal(report.totals.approved,635);
 assert.equal(report.totals.pending,240);
 assert.equal(report.imported,840);
 assert.deepEqual(report.range.days,['2025-12-01','2026-10-12','2026-10-13','2026-10-15','2026-10-16','2026-10-19']);
 assert.equal(report.daily.reduce((sum,row)=>sum+row.approved,0),635);
 const single=H.build(state,{...all,employee:['e1'],project:['p1']});
 assert.equal(single.totals.approved,495);assert.equal(single.imported,720);
 assert(!single.summaryRows.some(row=>row.employee==='e2'||row.project==='p2'));
 const csv=H.csv(single);assert(csv.includes('Horas importadas (HH:MM)'));assert(csv.includes('"12:00";"20:15"'));
 assert(H.csv(single,'detail').includes('2025-12-01'));
 assert.equal(H.build(state,{...all,status:['approved']}).imported,0);
 assert.equal(H.build(state,{...all,status:['imported']}).details.length,0);
 const empty=H.build({...state,entries:[],clockShifts:[],monthlyHistory:[]},all);
 assert.equal(empty.summaryRows.length,0);assert.deepEqual(empty.range.days,[]);
 assert.equal(H.build(state,{...filter,from:'2026-10-15',until:''}).totals.approved,80);
 assert.equal(H.build(state,{...filter,from:'',until:'2025-12-31'}).totals.approved,45);
});
function fixture(){
 const entries=[
  {id:'a',employee:'e1',project:'p1',date:'2026-10-12',minutes:390,status:'approved',mode:'clock'},
  {id:'b',employee:'e1',project:'p1',date:'2026-10-15',minutes:90,status:'pending',mode:'hours'},
  {id:'c',employee:'e1',project:'p2',date:'2026-10-16',minutes:20,status:'approved',mode:'hours'},
  {id:'d',employee:'e2',project:'p2',date:'2026-10-12',minutes:120,status:'approved',mode:'days'},
  {id:'excluded',employee:'e1',project:'p1',date:'2026-10-12',minutes:500,status:'rejected',mode:'clock'},
  {id:'replaced',employee:'e1',project:'p1',date:'2026-10-12',minutes:500,status:'approved',mode:'clock',supersededBy:'correction'},
  {id:'boundary',employee:'e1',project:'p1',date:'2026-10-19',minutes:60,status:'approved',mode:'hours'}
 ];
 const shift=(id,status,from,until,extra={})=>({id,employee:'e1',employeeName:'João',project:'p1',projectName:'Apartamento',status,startedAt:from,endedAt:until,intervals:[{start:from,end:until}],...extra});
 return {serverNow:'2026-10-20T12:00:00Z',revision:1,employees:[{id:'e1',name:'João',rate:80,payBasis:'day',dayHours:8},{id:'e2',name:'Rui',rate:60,payBasis:'day',dayHours:8}],projects:[{id:'p1',name:'Apartamento',employees:['e1']},{id:'p2',name:'Moradia',employees:['e1','e2']}],entries:entries.map(r=>({...r,dayHours:8,unitRate:80,payBasis:'day'})),corrections:[],wagePayments:[],clients:[],charges:[],receipts:[],clockShifts:[
  shift('pending','pending','2026-10-13T07:00:00Z','2026-10-13T10:00:00Z',{intervals:[{start:'2026-10-13T07:00:00Z',end:'2026-10-13T08:30:00Z'},{start:'2026-10-13T09:00:00Z',end:'2026-10-13T10:00:00Z'}]}),
  shift('already-counted','approved','2026-10-12T07:00:00Z','2026-10-12T13:30:00Z',{corrections:[{status:'pending',original:{startedAt:'2026-10-12T07:00:00Z',endedAt:'2026-10-12T13:30:00Z'},proposed:{startedAt:'2026-10-12T07:00:00Z',endedAt:'2026-10-12T14:00:00Z'}}]}),
  shift('open','working','2026-10-14T07:00:00Z',null),
  shift('forgotten','pending','2026-10-14T07:00:00Z','2026-10-17T07:00:00Z'),
  shift('rejected','rejected','2026-10-13T10:00:00Z','2026-10-13T11:00:00Z')
 ]};
}
test('mapa: semanas de segunda a domingo, meses, ano novo e fevereiro bissexto',()=>{
 assert.deepEqual(H.period('week','2026-10-18').days,['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18']);
 assert.equal(H.period('week','2026-12-31').until,'2027-01-03');
 assert.equal(H.period('month','2024-02-19').days.length,29);
 assert.equal(H.period('month','2026-02-19').until,'2026-02-28');
 assert.throws(()=>H.period('month','2026-02-30'),/válidos/);
 assert.throws(()=>H.period('invalid','2026-10-12'),/válidos/);
 assert.throws(()=>H.period('month','9999-12-31'),/válidos/);
});
test('mapa: manual e ponto sem duplicar aprovados ou correções, pausas e filtros combinados',()=>{
 const s=fixture(),before=JSON.stringify(s),r=H.build(s,filter);
 assert.deepEqual(r.totals,{approved:530,pending:240,people:2,projects:2});
 assert.deepEqual(r.counts,{open:1,corrections:1,review:1});
 assert.equal(r.pairs.length,3);assert.equal(r.details.length,5);
 assert.equal(r.daily.reduce((n,d)=>n+d.approved,0),530);assert.equal(r.daily.reduce((n,d)=>n+d.pending,0),240);
 assert.equal(r.pairs.reduce((n,d)=>n+d.approved,0),530);
 assert.equal(JSON.stringify(s),before);
 const single=H.build(s,{...filter,employee:'e1',project:'p1'});assert.equal(single.totals.approved,390);assert.equal(single.totals.pending,240);assert.equal(single.pairs.length,1);
 assert.equal(H.build(s,{...filter,employee:'e2',project:'p1'}).details.length,0);
 assert.throws(()=>H.build(s,{...filter,employee:'outside'}),/filtro/);
 const empty=H.build(s,{...filter,date:'2027-01-01'});assert.equal(empty.totals.approved,0);assert.equal(empty.pairs.length,0);
});
test('mapa: divisão à meia-noite de Lisboa e duração real nas mudanças de hora',()=>{
 const shift=(start,end)=>({startedAt:start,endedAt:end,intervals:[{start,end}]});
 assert.deepEqual(H.shiftDays(shift('2026-10-18T22:30:00Z','2026-10-19T00:30:00Z')),[{date:'2026-10-18',minutes:30},{date:'2026-10-19',minutes:90}]);
 assert.equal(H.shiftDays(shift('2026-10-25T00:30:00Z','2026-10-25T02:30:00Z'))[0].minutes,120);
 assert.equal(H.shiftDays(shift('2026-03-29T00:30:00Z','2026-03-29T02:30:00Z'))[0].minutes,120);
 assert.equal(H.shiftDays(shift('2026-10-18T08:00:00Z','2026-10-18T08:00:40Z')),null);
 assert.equal(H.shiftDays(shift('2026-10-18T08:00:00Z','2026-10-22T08:00:00Z')),null);
 const s=fixture();s.entries=[];s.clockShifts=[{...shift('2026-10-18T22:30:00Z','2026-10-19T00:30:00Z'),id:'night',employee:'e1',project:'p1',status:'pending'}];
 assert.equal(H.build(s,filter).totals.pending,30);assert.equal(H.build(s,{...filter,date:'2026-10-19'}).totals.pending,90);
});
test('mapa: dados e CSV respeitam o estado autorizado pelo servidor para cada perfil',()=>{
 const s=fixture(),users=[{id:'a',role:'admin',projects:[]},{id:'m',role:'manager',employeeId:'e1',projects:['p1']},{id:'w',role:'worker',employeeId:'e2',projects:[]}];
 const [a,m,w]=users.map(u=>H.build(D.sanitize(s,u),filter));
 assert.equal(a.totals.approved,530);assert.equal(m.totals.approved,390);assert.equal(w.totals.approved,120);
 for(const kind of ['summary','detail']){
  const csv=H.csv(w,kind);assert(csv.includes('Rui'));assert(!csv.includes('João'));assert(!csv.includes('Apartamento'));
  assert(!H.csv(m,kind).includes('Moradia'));assert(!H.csv(a,kind).includes('unitRate'));
 }
});
test('mapa: histórico mantém referências disponíveis e CSV protege fórmulas, aspas e UTF-8',()=>{
 const s=fixture();s.employees[0].name='=HYPERLINK("teste")';s.projects[0].name='@obra; "São João"';
 const r=H.build(s,{...filter,employee:'e1',project:'p1'}),csv=H.csv(r);
 assert(csv.startsWith('\ufeff'));assert(csv.includes(`"'=HYPERLINK(""teste"")"`));assert(csv.includes(`"'@obra; ""São João"""`));
 assert(csv.includes('"390";"6:30";"240";"4:00"'));assert(csv.includes('"2026-10-12";"2026-10-18"'));
 assert(H.csv(r,'detail').includes('Ponto · por validar'));
 s.projects=[];s.employees=[];const historic=H.build(s,filter);
 assert(historic.options.projects.some(p=>p.id==='p1'&&p.name==='Apartamento'));
 assert.equal(historic.totals.approved,530);assert.equal(H.csv(H.build(s,{...filter,date:'2027-01-01'})).split('\r\n').length,2);
});
test('mapa: totais validados coincidem com os registos que entram no apuramento',()=>{
 const s=fixture();s.entries=s.entries.filter(r=>!r.supersededBy);
 const r=H.build(s,filter),rows=s.entries.filter(e=>e.status==='approved'&&e.date>=r.range.from&&e.date<=r.range.until);
 assert.equal(r.totals.approved,rows.reduce((n,e)=>n+e.minutes,0));
 const cost=M.total(rows);assert.equal(cost,Math.round(530/60*10*100)/100);
});
