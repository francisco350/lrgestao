const {DatabaseSync}=require('node:sqlite');const fs=require('node:fs');const path=require('node:path');const {normalize}=require('./receivables.cjs');
function openStore(filename){
  if(filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
  const db=new DatabaseSync(filename);db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);`);
  if(!db.prepare('SELECT version FROM migrations WHERE version=1').get()){
    db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','manager','worker')),employee_id TEXT UNIQUE,projects_json TEXT NOT NULL DEFAULT '[]',active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),must_change INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL,last_seen INTEGER NOT NULL);
    CREATE TABLE business(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,document TEXT NOT NULL);
    CREATE TABLE audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT NOT NULL,event TEXT NOT NULL,entity_id TEXT,created_at TEXT NOT NULL);
    CREATE TABLE login_limits(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL);
    INSERT INTO migrations VALUES(1,datetime('now'));COMMIT;`);
  }
  require('./trial.cjs').init(db);
  if(filename!==':memory:')try{fs.chmodSync(filename,0o600);}catch{}
  return db;
}
const readState=db=>{const row=db.prepare('SELECT revision,document FROM business WHERE id=1').get();if(!row)throw Object.assign(Error('A base de dados ainda não foi inicializada. Execute npm run future:seed.'),{status:503});return require('./costs.cjs').normalize(normalize({revision:row.revision,...JSON.parse(row.document)}));};
function audit(db,actor,event,entity=''){db.prepare('INSERT INTO audit(actor_id,event,entity_id,created_at) VALUES(?,?,?,?)').run(actor,event,entity,new Date().toISOString());}
function mutate(db,revision,actor,event,callback){db.exec('BEGIN IMMEDIATE');try{const state=readState(db);if(!Number.isInteger(revision)||revision!==state.revision)throw Object.assign(Error('Os dados foram alterados noutra sessão. Atualize e confirme novamente.'),{status:409});callback(state);const next=state.revision+1;delete state.revision;db.prepare('UPDATE business SET document=?,revision=? WHERE id=1').run(JSON.stringify(state),next);audit(db,actor,event);db.exec('COMMIT');return next;}catch(error){db.exec('ROLLBACK');throw error;}}
function publicUser(user){return {id:user.id,username:user.username,name:user.name,role:user.role,employeeId:user.employee_id,projects:JSON.parse(user.projects_json),active:!!user.active,mustChangePassword:!!user.must_change};}
module.exports={openStore,readState,mutate,audit,publicUser};
