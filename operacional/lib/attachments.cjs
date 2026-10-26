const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {readState,mutate}=require('./store.cjs');
const LIMIT=5*1024*1024;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const scoped=(state,user,project)=>state.projects.some(p=>p.id===project&&(user.role==='admin'||user.role==='manager'&&user.projects.includes(p.id)||user.role==='worker'&&p.employees.includes(user.employeeId)));
function visible(state,user,file){return scoped(state,user,file.project)&&(user.role==='admin'||file.visibility==='team'&&!file.archived);}
function list(state,user){return (state.attachments||[]).filter(f=>visible(state,user,f));}
function filePath(directory,id){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))fail('Ficheiro inválido.',404);return path.join(directory,id);}
function decode(input){
  const name=typeof input.name==='string'?input.name.trim():'';
  if(!name||name.length>160||/[\\/\x00-\x1f\x7f]/.test(name))fail('Nome de ficheiro inválido.');
  if(typeof input.content!=='string'||input.content.length>Math.ceil(LIMIT/3)*4)fail('O ficheiro ultrapassa 5 MB.',413);
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(input.content))fail('Conteúdo inválido.');
  const bytes=Buffer.from(input.content,'base64');if(!bytes.length||bytes.length>LIMIT)fail('Escolha um ficheiro entre 1 byte e 5 MB.',413);
  if(bytes.toString('base64')!==input.content)fail('Conteúdo inválido.');
  let mime;
  if(bytes.length>=45&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.toString('ascii',bytes.length-8,bytes.length-4)==='IEND'){
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(!width||!height||width>12000||height>12000||width*height>40000000)fail('A imagem excede as dimensões permitidas.');mime='image/png';
  }else if(bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217)mime='image/jpeg';
  else if(bytes.subarray(0,5).toString()==='%PDF-'&&bytes.subarray(Math.max(0,bytes.length-1024)).includes(Buffer.from('%%EOF')))mime='application/pdf';
  if(!mime)fail('Formato inválido. Use uma fotografia JPG/PNG ou um documento PDF.');
  const ext=path.extname(name).toLowerCase();if(!(mime==='image/png'&&ext==='.png'||mime==='image/jpeg'&&['.jpg','.jpeg'].includes(ext)||mime==='application/pdf'&&ext==='.pdf'))fail('A extensão não corresponde ao conteúdo do ficheiro.');
  return {name,bytes,mime};
}
function upload(db,directory,user,input){
  if(!['admin','manager'].includes(user.role))fail('Só administradores e encarregados podem adicionar anexos.',403);
  const initial=readState(db);if(!scoped(initial,user,input.project))fail('Sem acesso a esta obra.',403);
  if(!['team','admin'].includes(input.visibility)||input.visibility==='admin'&&user.role!=='admin')fail('Visibilidade não permitida.',403);
  const {name,bytes,mime}=decode(input),caption=typeof input.caption==='string'?input.caption.trim():'';if(caption.length>200)fail('Use uma descrição até 200 caracteres.');
  const id=crypto.randomUUID(),destination=filePath(directory,id);let written=false;
  try{
    const revision=mutate(db,input.revision,user.id,'attachment_uploaded',state=>{
      state.attachments??=[];
      const own=state.attachments.filter(f=>f.project===input.project);
      if(own.length>=200||own.reduce((s,f)=>s+f.size,0)+bytes.length>100*1024*1024||state.attachments.reduce((s,f)=>s+f.size,0)+bytes.length>1024*1024*1024)fail('Limite de armazenamento atingido. Contacte o administrador.',413);
      fs.mkdirSync(directory,{recursive:true,mode:0o700});fs.writeFileSync(destination,bytes,{flag:'wx',mode:0o600});written=true;
      state.attachments.push({id,project:input.project,name,mime,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),caption,visibility:input.visibility,createdBy:user.id,author:user.name,createdAt:new Date().toISOString()});
    });return {id,revision};
  }catch(error){if(written)fs.unlinkSync(destination);throw error;}
}
function archive(state,user,type,data){
  if(!['archiveAttachment','restoreAttachment'].includes(type))return false;
  if(user.role!=='admin')fail('Só o administrador pode arquivar ou restaurar anexos.',403);
  const file=(state.attachments||[]).find(f=>f.id===data.id);if(!file)fail('Anexo inexistente.',404);
  if(type==='archiveAttachment'){
    if(file.archived)fail('O anexo já está arquivado.');
    const reason=typeof data.reason==='string'?data.reason.trim():'';if(!reason||reason.length>200)fail('Indique um motivo até 200 caracteres.');
    Object.assign(file,{archived:true,archiveReason:reason,archivedBy:user.id,archivedAt:new Date().toISOString()});
  }else{if(!file.archived)fail('O anexo já está ativo.');Object.assign(file,{archived:false,restoredBy:user.id,restoredAt:new Date().toISOString()});}
  return true;
}
function download(db,directory,user,id){const state=readState(db),file=(state.attachments||[]).find(f=>f.id===id);if(!file||!visible(state,user,file))fail('Anexo indisponível.',404);const filename=filePath(directory,file.id);if(!fs.existsSync(filename))fail('O ficheiro não está disponível no armazenamento.',404);return {file,bytes:fs.readFileSync(filename)};}
module.exports={LIMIT,list,upload,archive,download,filePath};
