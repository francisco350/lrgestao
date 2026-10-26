const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createApplication}=require('./server.cjs'),{seed}=require('./seed.cjs'),{backup}=require('./lib/backup.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHuoAAAAASUVORK5CYII=','base64');
test('anexos: acessos, validação, arquivo e recuperação completa',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lino-files-')),database=path.join(dir,'data.sqlite'),port=47000+Math.floor(Math.random()*1000),origin=`http://127.0.0.1:${port}`;
  let app=createApplication({database,origin});const password='Ficheiros-Teste-2026!';await seed(app.db,{lino:password,antonio:password,joao:password,rui:password});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
  const a={},m={},w={},other={};
  async function call(c,url,method='GET',data,extra={}){const res=await fetch(origin+'/api/'+url,{method,headers:{Connection:'close',...(c.cookie?{Cookie:c.cookie}:{}),...(method==='POST'?{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':c.csrf||''}:{}),...extra},...(data?{body:JSON.stringify(data)}:{})});const set=res.headers.get('set-cookie');if(set)c.cookie=set.split(';')[0];const bytes=Buffer.from(await res.arrayBuffer()),body=res.headers.get('content-type')?.includes('application/json')?JSON.parse(bytes):null;if(body?.csrf)c.csrf=body.csrf;return {status:res.status,body,bytes,headers:res.headers};}
  const state=async c=>(await call(c,'state')).body;
  const upload=async(c,data={},rev)=>call(c,'project-files','POST',{project:'o1',name:'obra.png',content:png.toString('base64'),caption:'Evolução da obra',visibility:'team',...data,revision:rev??(await state(c)).revision});
  const action=async(c,type,id,reason='Ficheiro substituído')=>call(c,'action','POST',{type,data:{id,reason},revision:(await state(c)).revision});
  let photo,secret;
  try{
    for(const [c,username]of [[a,'lino'],[m,'antonio'],[w,'joao'],[other,'rui']])assert.equal((await call(c,'login','POST',{username,password})).status,200);
    await t.test('upload e download exigem perfil, obra e visibilidade autorizados',async()=>{
      assert.equal((await upload(w)).status,403);assert.equal((await upload(m,{project:'o3'})).status,403);assert.equal((await upload(m,{visibility:'admin'})).status,403);
      const result=await upload(m);assert.equal(result.status,201);photo=result.body.id;
      const confidential=await upload(a,{name:'comprovativo.pdf',content:Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF').toString('base64'),visibility:'admin'});assert.equal(confidential.status,201);secret=confidential.body.id;
      for(const c of [m,w]){assert((await state(c)).attachments.some(f=>f.id===photo));assert(!(await state(c)).attachments.some(f=>f.id===secret));assert.equal((await call(c,'project-files/'+secret)).status,404);}
      assert.equal((await call(other,'project-files/'+photo)).status,404);assert.equal((await call({},'project-files/'+photo)).status,401);
      const downloaded=await call(w,'project-files/'+photo);assert.equal(downloaded.status,200);assert.deepEqual(downloaded.bytes,png);assert(downloaded.headers.get('content-disposition').startsWith('attachment'));assert(downloaded.headers.get('cache-control').includes('no-store'));
      assert((await call(w,'project-files/'+photo+'?preview=1')).headers.get('content-disposition').startsWith('inline'));
      assert((await call(a,'project-files/'+secret+'?preview=1')).headers.get('content-disposition').startsWith('attachment'));
    });
    await t.test('ficheiros inválidos, grandes e conflitos não deixam anexos no disco',async()=>{
      const revision=(await state(a)).revision,files=fs.readdirSync(database+'.files');
      for(const input of [{name:'../photo.png'},{name:'photo.svg'},{name:'fake.png',content:Buffer.from('<script>alert(1)</script>').toString('base64')},{content:'!!!'},{caption:'x'.repeat(201)}])assert.equal((await upload(a,input)).status,400);
      assert.equal((await upload(a,{content:Buffer.alloc(5*1024*1024+1).toString('base64')})).status,413);
      assert.equal((await upload(a,{},revision-1)).status,409);assert.deepEqual(fs.readdirSync(database+'.files'),files);assert.equal((await state(a)).revision,revision);
      assert.equal((await call(a,'project-files','POST',{}, {'X-CSRF-Token':'bad'})).status,403);
    });
    await t.test('arquivar retira acesso da equipa e restaurar recupera-o',async()=>{
      assert.equal((await action(m,'archiveAttachment',photo)).status,403);assert.equal((await action(a,'archiveAttachment',photo,'')).status,400);assert.equal((await action(a,'archiveAttachment',photo)).status,200);
      assert.equal((await call(w,'project-files/'+photo)).status,404);assert(!(await state(w)).attachments.some(f=>f.id===photo));assert((await state(a)).attachments.find(f=>f.id===photo).archivedAt);
      assert.equal((await action(a,'restoreAttachment',photo)).status,200);assert.equal((await call(w,'project-files/'+photo)).status,200);
    });
    await t.test('revogar a obra retira acesso a um endereço previamente conhecido',async()=>{
      const manager=(await call(a,'users')).body.users.find(u=>u.username==='antonio');assert.equal((await call(a,'users','POST',{...manager,projects:['o2']})).status,200);assert.equal((await call(m,'project-files/'+photo)).status,401);
      await call(m,'login','POST',{username:'antonio',password});assert.equal((await call(m,'project-files/'+photo)).status,404);
    });
    await t.test('backup inclui anexos e uma base restaurada serve os mesmos ficheiros',async()=>{
      const result=backup(app.db,database+'.files',path.join(dir,'backup'));assert.equal(result.files,2);assert(JSON.parse(fs.readFileSync(path.join(result.directory,'backup.json'))).complete);
      await app.close();app=createApplication({database:result.database,origin});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
      assert.deepEqual((await call(w,'project-files/'+photo)).bytes,png);assert.equal((await call(w,'project-files/'+secret)).status,404);assert.equal((await call(a,'project-files/'+secret)).status,200);
      fs.writeFileSync(path.join(result.database+'.files',photo),'corrupt');const broken=path.join(dir,'incomplete');assert.throws(()=>backup(app.db,result.database+'.files',broken));assert(!fs.existsSync(path.join(broken,'backup.json')));
    });
  }finally{await app.close();const resolved=path.resolve(dir);assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep+'lino-files-'));fs.rmSync(resolved,{recursive:true,force:true});}
});
