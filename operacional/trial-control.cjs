// Run only by the deployment owner on the host; no company account can invoke this through HTTP.
const path=require('node:path'),fs=require('node:fs');
const {openStore}=require('./lib/store.cjs'),T=require('./lib/trial.cjs');
const file=process.env.DATABASE_PATH||path.join(__dirname,'data','lino.sqlite');
if(!fs.existsSync(file))throw Error('Base inexistente. Confirme DATABASE_PATH antes de gerir o acesso.');
const db=openStore(file);
try{
 const aliases={iniciar:'start',dias:'days',prolongar:'extend',suspender:'suspend',cancelar:'suspend',reativar:'resume',renovar:'renew',estado:'status'},arg=process.argv[2]||'estado',operation=aliases[arg]||arg;
 if(process.argv.length>4||(['status','suspend','resume'].includes(operation)&&process.argv[3]))throw Error('Argumentos inesperados.');
 const result=operation==='status'?T.status(db):T.change(db,operation,Number(process.argv[3]));
 console.log('Base: '+file);console.log(JSON.stringify(result,null,2));
 if(result.expiresAt)console.log('Fim em Lisboa: '+new Date(result.expiresAt).toLocaleString('pt-PT',{timeZone:'Europe/Lisbon'}));
 if(operation!=='status')console.log('Alteração aplicada. Todas as sessões anteriores foram invalidadas; os dados foram preservados.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{db.close();}
