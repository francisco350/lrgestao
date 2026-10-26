const path=require('node:path'),fs=require('node:fs');
const {openStore,readState,mutate}=require('./lib/store.cjs'),{backup}=require('./lib/backup.cjs');
const {populate,KEY}=require('./demo-quarter.cjs');
const file=process.env.DATABASE_PATH||path.join(__dirname,'data','lino.sqlite'),db=openStore(file);
try{
 const state=readState(db),actor=db.prepare("SELECT * FROM users WHERE username='lino' AND role='admin' AND active=1").get();
 if(!actor)throw Error('Administrador da demonstração não encontrado.');
 if(state.demoDatasets?.[KEY]){console.log('Este cenário já foi carregado. Nenhum dado alterado.');process.exitCode=0;}
 else{
  const admin={id:actor.id,name:actor.name,role:'admin',projects:[]},accounts=db.prepare('SELECT id,employee_id FROM users').all();
  const result=populate(structuredClone(state),admin,accounts);console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'preview',...result},null,2));
  if(process.argv.includes('--apply')){
   const root=path.join(__dirname,'backups');fs.mkdirSync(root,{recursive:true});const target=path.join(root,'before-quarter-demo-'+new Date().toISOString().replace(/[:.]/g,'-'));
   backup(db,file+'.files',target);console.log('Backup completo: '+target);
   mutate(db,state.revision,actor.id,'demo_aug_oct_2026_initialized',s=>{
    const manifest=populate(s,admin,accounts);
    const manager=db.prepare("SELECT id,projects_json FROM users WHERE username='antonio' AND role='manager'").get();
    if(manager){const projects=[...new Set([...JSON.parse(manager.projects_json),...manifest.managerProjects])];db.prepare('UPDATE users SET projects_json=? WHERE id=?').run(JSON.stringify(projects),manager.id);}
   });console.log('Dados de demonstração carregados. Contas e movimentos anteriores preservados.');
  }
 }
}finally{db.close();}
