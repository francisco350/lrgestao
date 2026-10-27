// Platform owner CLI. Never exposed to company administrators through HTTP.
const crypto=require('node:crypto');
const {openRegistry,createCompany,defaultDatabase}=require('./lib/companies.cjs');
(async()=>{
  const [operation,name,username,days='14']=process.argv.slice(2);
  const registry=openRegistry(process.env.DATABASE_PATH||defaultDatabase,process.env.PLATFORM_PATH);
  try{
    if(operation==='listar'){console.log(JSON.stringify(registry.list(),null,2));return;}
    if(operation!=='criar')throw Error('Uso: npm run company -- criar "Nome da empresa" utilizador [dias] | listar');
    const password=crypto.randomBytes(18).toString('base64url');
    const result=await createCompany(registry,{name,username,password,days:Number(days)});
    console.log(JSON.stringify({...result,password},null,2));
    console.log('Guarde a palavra-passe inicial e entregue-a ao administrador da empresa.');
  }finally{registry.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
