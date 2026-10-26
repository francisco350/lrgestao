const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {openStore,readState}=require('./store.cjs');
const {filePath}=require('./attachments.cjs');
function backup(db,sourceDirectory,targetDirectory){
  fs.mkdirSync(targetDirectory,{recursive:false,mode:0o700});
  const destination=path.join(targetDirectory,'lino.sqlite');db.prepare('VACUUM INTO ?').run(destination);
  const snapshot=openStore(destination);let files;try{files=readState(snapshot).attachments||[];}finally{snapshot.close();}
  const out=destination+'.files';fs.mkdirSync(out,{mode:0o700});
  for(const file of files){const source=filePath(sourceDirectory,file.id),bytes=fs.readFileSync(source);if(bytes.length!==file.size||crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Anexo ausente ou alterado: backup incompleto.');fs.writeFileSync(filePath(out,file.id),bytes,{flag:'wx',mode:0o600});}
  fs.writeFileSync(path.join(targetDirectory,'backup.json'),JSON.stringify({version:1,complete:true,createdAt:new Date().toISOString(),database:'lino.sqlite',filesDirectory:'lino.sqlite.files',files:files.length},null,2),{flag:'wx',mode:0o600});
  try{fs.chmodSync(destination,0o600);}catch{}
  return {directory:targetDirectory,database:destination,files:files.length};
}
module.exports={backup};
