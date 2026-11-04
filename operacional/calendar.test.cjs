const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('./lib/domain.cjs'),C=require('./lib/costs.cjs');
const admin={id:'a',role:'admin'},manager={id:'m',role:'manager',projects:['p']};
function fixture(){return {employees:['e1','e2'].map(id=>({id,name:id,active:true,payBasis:'day',rate:80,dayHours:8})),projects:[{id:'p',name:'Obra',status:'Em curso',employees:['e1','e2']}],entries:[],corrections:[],wagePayments:[],charges:[],receipts:[],costs:[]};}
const data={project:'p',employees:['e1','e2'],dates:['2000-01-01'],start:'08:00',end:'17:00',pause:60,note:'Trabalho',registration:'auto'};
test('calendário: passado validado, futuro planeado, custo sem duplicação',()=>{
 const s=fixture();D.action(s,manager,'calendarCreate',data);
 assert.equal(s.entries.length,2);assert(s.entries.every(r=>r.status==='approved'&&r.minutes===480&&r.validatedBy==='m'));
 assert.equal(s.planning.length,0);assert.equal(C.summary(s)[0].labour,160);
});
test('calendário: rejeita futuro validado e colaborador sem gravar parcialmente',()=>{
 for(const [user,body] of [[admin,{...data,dates:['2099-01-01'],registration:'approved'}],[{id:'w',role:'worker',employeeId:'e1'},data]]){
 const s=fixture(),before=structuredClone(s);assert.throws(()=>D.action(s,user,'calendarCreate',body));assert.deepEqual(s,before);
 }
});
test('calendário: conflito de trabalho e associação inválida revertem todo o lote',()=>{
 const s=fixture();D.action(s,admin,'calendarCreate',{...data,dates:['2000-01-01']});const before=structuredClone(s);
 assert.throws(()=>D.action(s,admin,'calendarCreate',data));assert.deepEqual(s,before);
 const fresh=fixture(),original=structuredClone(fresh);assert.throws(()=>D.action(fresh,admin,'calendarCreate',{...data,employees:['e1','unknown']}));assert.deepEqual(fresh,original);
});
test('calendário: escolha explícita de planeamento preserva passado sem custos',()=>{
 const s=fixture();D.action(s,admin,'calendarCreate',{...data,registration:'planned'});assert.equal(s.entries.length,0);assert.equal(s.planning.length,2);
});

test('calendário: hora de Lisboa e fronteira da hora de fim no próprio dia',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-07-01T16:00:00Z')});
 let s=fixture();D.action(s,admin,'calendarCreate',{...data,dates:['2026-07-01']});assert.equal(s.entries.length,0);assert.equal(s.planning.length,2);
 t.mock.timers.tick(1000);
 s=fixture();D.action(s,admin,'calendarCreate',{...data,dates:['2026-07-01']});assert.equal(s.entries.length,2);assert.equal(s.planning.length,0);
});

test('calendário: não aceita vários dias no mesmo gesto',()=>{
 const s=fixture(),before=structuredClone(s);
 assert.throws(()=>D.action(s,admin,'calendarCreate',{...data,dates:['2000-01-01','2099-01-01']}),/apenas um dia/);
 assert.deepEqual(s,before);
});
