const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {openStore}=require('./store.cjs');
const {hashPassword}=require('./auth.cjs');
const Trial=require('./trial.cjs');
const defaultDatabase=path.join(__dirname,'../data/lino.sqlite');
function openRegistry(database=defaultDatabase,registryPath=path.join(path.dirname(database),'platform.sqlite')){
  fs.mkdirSync(path.dirname(registryPath),{recursive:true});
  const db=new DatabaseSync(registryPath);
  db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY,database_path TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);');
  db.prepare('INSERT OR IGNORE INTO companies VALUES(?,?,?)').run('linorua',path.resolve(database),new Date().toISOString());
  return {db,path:registryPath,list:()=>db.prepare('SELECT * FROM companies ORDER BY created_at,id').all(),close:()=>db.close()};
}
function usernameExists(registry,username){
  for(const company of registry.list()){
    const db=openStore(company.database_path);
    try{if(db.prepare('SELECT 1 FROM users WHERE username=?').get(username))return true;}finally{db.close();}
  }
  return false;
}
async function createCompany(registry,{name,username,password,days=14}){
  name=String(name||'').trim();username=String(username||'').trim().toLowerCase();
  if(!name||name.length>120||!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username))throw Error('Indique o nome da empresa e um utilizador válido (3–40 caracteres).');
  if(!Number.isInteger(days)||days<1||days>3650)throw Error('Indique entre 1 e 3650 dias.');
  const hash=await hashPassword(password);
  if(usernameExists(registry,username))throw Error('Esse utilizador já existe. Escolha um nome único na aplicação.');
  const id=crypto.randomUUID(),filename=path.join(path.dirname(registry.path),'companies',id,'company.sqlite'),db=openStore(filename);
  try{
    const state={schemaVersion:2,employees:[],projects:[],entries:[],wagePayments:[],corrections:[],clients:[],charges:[],receipts:[],costs:[]};
    db.exec('BEGIN IMMEDIATE');
    db.prepare('INSERT INTO business VALUES(1,1,?)').run(JSON.stringify(state));
    db.prepare('UPDATE company_profile SET name=? WHERE id=1').run(name);
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),username,name,hash,'admin',null,'[]',1,0,new Date().toISOString());
    db.exec('COMMIT');
    Trial.change(db,'start',days);
    registry.db.prepare('INSERT INTO companies VALUES(?,?,?)').run(id,filename,new Date().toISOString());
    return {id,name,username,database:filename};
  }finally{db.close();}
}
module.exports={openRegistry,createCompany,defaultDatabase};
