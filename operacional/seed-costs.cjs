const path=require('node:path');
const {openStore,readState,mutate}=require('./lib/store.cjs');
const D=require('./lib/domain.cjs');
const {addDemoCosts}=require('./demo-costs.cjs');
const db=openStore(process.env.DATABASE_PATH||path.join(__dirname,'data','lino.sqlite'));
try{
  const state=readState(db);if(state.costs.length)throw Error('Já existem custos. Nenhum dado foi alterado.');
  for(const [id,client]of [['o1','Maria Oliveira'],['o2','Carlos Pereira'],['o3','Ana Rodrigues']])if(!state.projects.some(p=>p.id===id&&p.client===client))throw Error('Base diferente da demonstração original.');
  const user=db.prepare("SELECT id,role FROM users WHERE username='lino' AND role='admin' AND active=1").get();if(!user)throw Error('Administrador da demonstração não encontrado.');
  mutate(db,state.revision,user.id,'demo_costs_initialized',s=>addDemoCosts(s,user,D));
  console.log('Quatro custos fictícios adicionados. Os restantes dados foram preservados.');
}finally{db.close();}
