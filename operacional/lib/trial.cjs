// Deployment-owner control, deliberately outside business data and company roles.
const DAY=86400000;
function init(db){db.exec(`CREATE TABLE IF NOT EXISTS trial_access(id INTEGER PRIMARY KEY CHECK(id=1),started_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,suspended INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS trial_events(id INTEGER PRIMARY KEY AUTOINCREMENT,operation TEXT NOT NULL,at INTEGER NOT NULL,before_json TEXT,after_json TEXT NOT NULL);`);}
const read=db=>db.prepare('SELECT * FROM trial_access WHERE id=1').get();
function status(db,{required=false,now=Date.now()}={}){
 const row=read(db);
 if(!row)return {allowed:!required,state:required?'unconfigured':'local',expiresAt:null};
 const state=row.suspended?'suspended':now>=row.expires_at?'expired':'active';
 return {allowed:state==='active',state,startedAt:new Date(row.started_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),remainingDays:Math.max(0,Math.ceil((row.expires_at-now)/DAY)),revision:row.revision};
}
function assertAccess(db,options){
 const access=status(db,options);if(access.allowed)return access;
 const error=Error({suspended:'O acesso de demonstração desta empresa está suspenso. Contacte o responsável pela aplicação.',expired:'O período de demonstração terminou. Contacte o responsável pela aplicação para prolongar o acesso.',unconfigured:'O acesso desta empresa ainda não foi ativado. Contacte o responsável pela aplicação.'}[access.state]);
 throw Object.assign(error,{status:423,code:'TRIAL_BLOCKED',access});
}
function change(db,operation,days,now=Date.now()){
 if(!['start','days','extend','suspend','resume','renew'].includes(operation))throw Error('Operação desconhecida.');
 if(['start','days','extend','renew'].includes(operation)&&(!Number.isInteger(days)||days<1||days>3650))throw Error('Indique um número inteiro de dias entre 1 e 3650.');
 db.exec('BEGIN IMMEDIATE');
 try{
  const before=read(db);let next=before?{...before}:null;
  if(operation==='start'){if(before)throw Error('O período já foi configurado. Use days, extend ou renew.');next={id:1,started_at:now,expires_at:now+days*DAY,suspended:0,revision:1};}
  else{
   if(!next)throw Error('Ative primeiro o período com start.');
   if(operation==='days')next.expires_at=next.started_at+days*DAY;
   if(operation==='extend')next.expires_at=Math.max(now,next.expires_at)+days*DAY;
   if(operation==='suspend')next.suspended=1;
   if(operation==='resume'){if(next.expires_at<=now)throw Error('O prazo terminou. Prolongue-o antes de reativar.');next.suspended=0;}
   if(operation==='renew'){next.started_at=now;next.expires_at=now+days*DAY;next.suspended=0;}
   next.revision++;
  }
  db.prepare('INSERT INTO trial_access VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET started_at=excluded.started_at,expires_at=excluded.expires_at,suspended=excluded.suspended,revision=excluded.revision').run(next.started_at,next.expires_at,next.suspended,next.revision);
  // Revocation covers all current accounts, including administrators created by the client.
  db.exec('DELETE FROM sessions');
  db.prepare('INSERT INTO trial_events(operation,at,before_json,after_json) VALUES(?,?,?,?)').run(operation,now,before?JSON.stringify(before):null,JSON.stringify(next));
  db.exec('COMMIT');return status(db,{now});
 }catch(error){db.exec('ROLLBACK');throw error;}
}
module.exports={init,status,assertAccess,change,read};
