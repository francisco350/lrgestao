// Local demonstration only. Regular accounts continue to require 12+ characters.
const path=require('node:path');
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const {openStore,readState,audit}=require('./lib/store.cjs');
const {verifyPassword}=require('./lib/auth.cjs');
const scrypt=promisify(crypto.scrypt);
const database=path.join(__dirname,'data','lino.sqlite');
const expected=[
  ['lino','admin',null],
  ['antonio','manager','e1'],
  ['joao','worker','e2'],
  ['rui','worker','e5']
];
async function reset(){
  if(process.env.NODE_ENV==='production')throw Error('Este comando é apenas para a demonstração local.');
  const db=openStore(database);
  try{
    const state=readState(db);
    for(const [id,client] of [['o1','Maria Oliveira'],['o2','Carlos Pereira'],['o3','Ana Rodrigues']]){
      if(!state.projects.some(p=>p.id===id&&p.client===client))throw Error('Esta base não corresponde à demonstração fictícia.');
    }
    const accounts=expected.map(([username,role,employee])=>{
      const row=db.prepare('SELECT * FROM users WHERE username=?').get(username);
      if(!row||row.role!==role||row.employee_id!==employee||!row.active)throw Error(`Conta de demonstração inesperada: ${username}.`);
      return row;
    });
    const hashed=[];
    for(const row of accounts){
      const password=`${row.username}1234`,salt=crypto.randomBytes(16).toString('hex');
      const result=await scrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024});
      hashed.push([row.id,`scrypt$32768$8$3$${salt}$${result.toString('hex')}`]);
    }
    db.exec('BEGIN IMMEDIATE');
    try{
      for(const [id,hash] of hashed){db.prepare('UPDATE users SET password_hash=?,must_change=0 WHERE id=?').run(hash,id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);}
      for(const row of accounts)db.prepare('DELETE FROM login_limits WHERE key=?').run('account:'+crypto.createHash('sha256').update(row.username).digest('hex'));
      audit(db,accounts[0].id,'demo_passwords_reset');
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    for(const row of accounts){const hash=db.prepare('SELECT password_hash FROM users WHERE id=?').get(row.id).password_hash;if(!await verifyPassword(`${row.username}1234`,hash))throw Error(`Verificação falhou para ${row.username}.`);}
    console.log('Quatro contas fictícias atualizadas para utilizador+1234; sessões anteriores terminadas.');
  }finally{db.close();}
}
reset().catch(error=>{console.error(error.message);process.exitCode=1;});
