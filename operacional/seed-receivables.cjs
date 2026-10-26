// Opt-in sample data for the existing local demonstration. Never overwrites movements.
const path=require('node:path');
const {openStore,readState,mutate}=require('./lib/store.cjs');
const {action}=require('./lib/domain.cjs');
const db=openStore(process.env.DATABASE_PATH||path.join(__dirname,'data','lino.sqlite'));
try{
  const state=readState(db);
  if(state.charges.length||state.receipts.length)throw Error('Já existem movimentos de clientes. Nenhum dado foi alterado.');
  if(!state.projects.some(p=>p.id==='o1'&&p.client==='Maria Oliveira')||!state.projects.some(p=>p.id==='o2'&&p.client==='Carlos Pereira'))throw Error('Esta base não corresponde à demonstração original.');
  const actor=db.prepare("SELECT id FROM users WHERE username='lino' AND role='admin' AND active=1").get();if(!actor)throw Error('Administrador da demonstração não encontrado.');
  mutate(db,state.revision,actor.id,'demo_receivables_initialized',s=>{
    s.clients.find(c=>c.id===s.projects.find(p=>p.id==='o1').clientId).cycle='weekly';
    const user={...actor,role:'admin'};
    action(s,user,'charge',{project:'o1',description:'Parcela semanal · preparação e demolições (fictício)',amount:1500,due:'2026-10-16'});
    const charge=s.charges.at(-1).id;
    action(s,user,'receipt',{charge,amount:500,date:'2026-10-15',method:'Transferência',note:'Recebimento parcial fictício'});
    action(s,user,'charge',{project:'o2',description:'Parcela mensal · outubro (fictício)',amount:2400,due:'2026-10-31'});
  });
  console.log('Demonstração preparada: duas parcelas e um recebimento parcial. Contas e trabalho preservados.');
}finally{db.close();}
