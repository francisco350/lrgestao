const path=require('node:path'),fs=require('node:fs');const {openStore}=require('./lib/store.cjs');const {backup}=require('./lib/backup.cjs');
const source=process.env.DATABASE_PATH||path.join(__dirname,'data','lino.sqlite'),dir=path.join(__dirname,'backups');fs.mkdirSync(dir,{recursive:true,mode:0o700});const destination=path.join(dir,`lino-${new Date().toISOString().replace(/[:.]/g,'-')}`),db=openStore(source);
try{const result=backup(db,source+'.files',destination);console.log(`Backup completo: ${result.directory} (${result.files} anexo(s)).`);}finally{db.close();}
