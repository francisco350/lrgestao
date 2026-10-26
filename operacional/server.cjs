const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {openStore,readState,mutate,audit,publicUser}=require('./lib/store.cjs');
const {hashPassword,verifyPassword,validatePassword,token,digest}=require('./lib/auth.cjs');
const D=require('./lib/domain.cjs');
const A=require('./lib/attachments.cjs');
const Trial=require('./lib/trial.cjs');
const JSON_LIMIT=65536,SESSION_HOURS=8;
function createApplication({database=path.join(__dirname,'data','lino.sqlite'),origin='http://127.0.0.1:4174',production=false}={}){
  const configured=new URL(origin);if(production&&configured.protocol!=='https:')throw Error('Em produção, APP_ORIGIN deve usar HTTPS.');
  const db=openStore(database);const cookieName=production?'__Host-lino_session':'lino_session';let hashesInFlight=0,uploadsInFlight=0;const attachmentsDirectory=database+'.files';
  const dummy=hashPassword(crypto.randomBytes(30).toString('base64url'));
  const cookie=(value,max=SESSION_HOURS*3600)=>`${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${max}${production?'; Secure':''}`;
  function json(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data));}
  function session(req){const cookies=Object.fromEntries(String(req.headers.cookie||'').split(';').map(s=>s.trim().split('=')));const raw=cookies[cookieName];if(!raw||!/^[A-Za-z0-9_-]{43}$/.test(raw))return null;const row=db.prepare('SELECT s.token_hash,s.csrf,s.expires_at,s.last_seen,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').get(digest(raw));if(!row||!row.active||row.expires_at<Date.now()||row.last_seen<Date.now()-60*60*1000)return null;db.prepare('UPDATE sessions SET last_seen=? WHERE token_hash=?').run(Date.now(),row.token_hash);return row;}
  function startSession(userId){const raw=token(),csrf=token();db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(digest(raw),userId,csrf,Date.now()+SESSION_HOURS*3600000,Date.now());return {raw,csrf};}
  function access(){return Trial.assertAccess(db,{required:production});}
  function authenticated(req){access();const s=session(req);if(!s)D.fail('Inicie sessão para continuar.',401);return s;}
  function requireAdmin(s){if(s.role!=='admin')D.fail('Esta operação é exclusiva do administrador.',403);}
  function throttle(key,max=8,window=900000){const now=Date.now();db.prepare('DELETE FROM login_limits WHERE expires_at<?').run(now);const row=db.prepare('SELECT * FROM login_limits WHERE key=?').get(key);if(row&&row.attempts>=max)D.fail('Demasiadas tentativas. Aguarde antes de voltar a tentar.',429);db.prepare('INSERT INTO login_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1').run(key,now+window);}
  async function hashTask(callback){if(hashesInFlight>=2)D.fail('O serviço está ocupado. Tente novamente dentro de instantes.',429);hashesInFlight++;try{return await callback();}finally{hashesInFlight--;}}
  async function body(req,limit=JSON_LIMIT){const chunks=[];let size=0;if(Number(req.headers['content-length'])>limit)D.fail('Pedido demasiado grande.',413);for await(const chunk of req){size+=chunk.length;if(size>limit)D.fail('Pedido demasiado grande.',413);chunks.push(chunk);}try{const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))D.fail('Pedido inválido.');return parsed;}catch{D.fail('Pedido JSON inválido.');}}
  async function handle(req,res){
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Permissions-Policy','geolocation=(), camera=(), microphone=()');
    try{
      const url=new URL(req.url,origin);
      if(!['GET','POST','HEAD'].includes(req.method))D.fail('Método não suportado.',405);
      if(url.pathname.startsWith('/api/')){
        if(req.headers.host!==configured.host)D.fail('Host inválido.',403);
        if(req.method==='POST'&&req.headers.origin!==configured.origin)D.fail('Origem do pedido inválida.',403);
        if(req.method==='POST'&&!String(req.headers['content-type']).startsWith('application/json'))D.fail('Use JSON neste pedido.',415);
        if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{status:'ok',version:'0.13.0'});
        access();
        if(req.method==='GET'&&url.pathname==='/api/access')return json(res,200,{access:access()});
        if(req.method==='POST'&&url.pathname==='/api/login'){
          const input=await body(req);const username=String(input.username||'').trim().toLowerCase();if(username.length>64)D.fail('Credenciais inválidas.',401);
          throttle('ip:'+digest(req.socket.remoteAddress||''),60);throttle('account:'+digest(username));
          const user=db.prepare('SELECT * FROM users WHERE username=?').get(username);
          const valid=await hashTask(async()=>verifyPassword(input.password,user?.password_hash||await dummy));
          if(!valid||!user?.active)D.fail('Utilizador ou palavra-passe inválidos.',401);
          access();const current=db.prepare('SELECT * FROM users WHERE id=? AND active=1 AND password_hash=?').get(user.id,user.password_hash);if(!current)D.fail('Credenciais inválidas.',401);
          db.prepare('DELETE FROM login_limits WHERE key=?').run('account:'+digest(username));const s=startSession(user.id);audit(db,user.id,'login');return json(res,200,{user:publicUser(current),csrf:s.csrf},{'Set-Cookie':cookie(s.raw)});
        }
        const s=authenticated(req),user=publicUser(s);
        if(req.method==='POST'&&req.headers['x-csrf-token']!==s.csrf)D.fail('Sessão de formulário inválida. Atualize a página.',403);
        if(req.method==='GET'&&url.pathname==='/api/session')return json(res,200,{user,csrf:s.csrf});
        if(req.method==='POST'&&url.pathname==='/api/logout'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(s.token_hash);return json(res,200,{ok:true},{'Set-Cookie':cookie('',0)});}
        if(req.method==='POST'&&url.pathname==='/api/change-password'){
          throttle('password:'+s.id,10);const input=await body(req);validatePassword(input.newPassword);if(input.newPassword===input.currentPassword)D.fail('Escolha uma palavra-passe diferente.');
          const valid=await hashTask(()=>verifyPassword(input.currentPassword,s.password_hash));if(!valid)D.fail('A palavra-passe atual está incorreta.');
          const hash=await hashTask(()=>hashPassword(input.newPassword));authenticated(req);db.exec('BEGIN IMMEDIATE');try{const changed=db.prepare('UPDATE users SET password_hash=?,must_change=0 WHERE id=? AND password_hash=? AND active=1').run(hash,s.id,s.password_hash);if(!changed.changes)D.fail('A conta foi alterada. Inicie sessão novamente.',409);db.prepare('DELETE FROM sessions WHERE user_id=?').run(s.id);audit(db,s.id,'password_changed');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
          const fresh=startSession(s.id);return json(res,200,{user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(s.id)),csrf:fresh.csrf},{'Set-Cookie':cookie(fresh.raw)});
        }
        if(user.mustChangePassword)D.fail('Altere a palavra-passe provisória antes de continuar.',428);
        if(req.method==='POST'&&url.pathname==='/api/project-files'){
          if(!['admin','manager'].includes(user.role))D.fail('Só administradores e encarregados podem adicionar anexos.',403);
          if(uploadsInFlight>=2)D.fail('Existem carregamentos em curso. Tente novamente.',429);
          throttle('upload:'+user.id,40);uploadsInFlight++;
          try{const input=await body(req,7*1024*1024);const fresh=publicUser(authenticated(req));if(fresh.mustChangePassword)D.fail('Altere a palavra-passe antes de continuar.',428);const result=A.upload(db,attachmentsDirectory,fresh,input);return json(res,201,result);}finally{uploadsInFlight--;}
        }
        if(req.method==='GET'&&url.pathname.startsWith('/api/project-files/')){
          const id=url.pathname.slice('/api/project-files/'.length);const {file,bytes}=A.download(db,attachmentsDirectory,user,id);
          const preview=url.searchParams.get('preview')==='1'&&file.mime.startsWith('image/');
          res.writeHead(200,{'Content-Type':file.mime,'Content-Length':bytes.length,'Cache-Control':'private, no-store','Content-Security-Policy':"sandbox; default-src 'none'",'X-Frame-Options':'DENY','Content-Disposition':(preview?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(file.name)});res.end(bytes);return;
        }
        if(req.method==='GET'&&url.pathname==='/api/state')return json(res,200,D.sanitize(readState(db),user));
        if(req.method==='POST'&&url.pathname==='/api/action'){
          const input=await body(req);const fresh=authenticated(req);const revision=mutate(db,input.revision,fresh.id,String(input.type).slice(0,50),state=>D.action(state,publicUser(fresh),input.type,input.data||{}));return json(res,200,{ok:true,revision});
        }
        if(url.pathname==='/api/users'){
          requireAdmin(s);
          if(req.method==='GET')return json(res,200,{users:db.prepare('SELECT * FROM users ORDER BY created_at').all().map(publicUser)});
          const input=await body(req);requireAdmin(authenticated(req));
          if(input.mode==='reset'){
            const target=db.prepare('SELECT * FROM users WHERE id=?').get(input.id);if(!target)D.fail('Conta não encontrada.',404);if(target.id===s.id)D.fail('Use Alterar palavra-passe na sua conta.');const password=crypto.randomBytes(16).toString('base64url');const hash=await hashTask(()=>hashPassword(password));requireAdmin(authenticated(req));db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET password_hash=?,must_change=1 WHERE id=?').run(hash,target.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);audit(db,s.id,'user_password_reset',target.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return json(res,200,{temporaryPassword:password,username:target.username});
          }
          const username=D.text(input.username,40).toLowerCase();if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username))D.fail('O utilizador deve ter 3–40 caracteres: letras sem acentos, números, ponto, hífen ou underscore.');
          const name=D.text(input.name,100);if(!['admin','manager','worker'].includes(input.role))D.fail('Perfil inválido.');
          const state=readState(db);const employeeId=input.employeeId||null;
          if(input.role!=='admin'&&!employeeId)D.fail('Associe esta conta a um funcionário.');if(employeeId&&!state.employees.some(e=>e.id===employeeId&&e.active))D.fail('Funcionário inexistente ou inativo.');
          const projects=Array.isArray(input.projects)?[...new Set(input.projects)]:[];if(projects.some(id=>!state.projects.some(p=>p.id===id)))D.fail('Obra inválida.');
          if(input.id){
            const old=db.prepare('SELECT * FROM users WHERE id=?').get(input.id);if(!old)D.fail('Conta não encontrada.',404);
            if(old.role==='admin'&&old.active&&(input.role!=='admin'||input.active===false)&&db.prepare("SELECT count(*) n FROM users WHERE role='admin' AND active=1").get().n<=1)D.fail('É necessário manter pelo menos um administrador ativo.');
            try{db.exec('BEGIN IMMEDIATE');db.prepare('UPDATE users SET username=?,name=?,role=?,employee_id=?,projects_json=?,active=? WHERE id=?').run(username,name,input.role,employeeId,JSON.stringify(projects),input.active===false?0:1,old.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(old.id);audit(db,s.id,'user_updated',old.id);db.exec('COMMIT');}catch(e){try{db.exec('ROLLBACK');}catch{}if(e.code?.startsWith('ERR_SQLITE'))D.fail('O utilizador ou funcionário já está associado a outra conta.');throw e;}
            return json(res,200,{ok:true});
          }
          const password=input.password||crypto.randomBytes(16).toString('base64url');validatePassword(password);const hash=await hashTask(()=>hashPassword(password)),id=crypto.randomUUID();requireAdmin(authenticated(req));
          try{db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,username,name,hash,input.role,employeeId,JSON.stringify(projects),1,1,new Date().toISOString());audit(db,s.id,'user_created',id);db.exec('COMMIT');}catch(e){try{db.exec('ROLLBACK');}catch{}if(e.code?.startsWith('ERR_SQLITE'))D.fail('O utilizador ou funcionário já está associado a outra conta.');throw e;}
          return json(res,201,{user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)),temporaryPassword:password});
        }
        if(req.method==='GET'&&url.pathname==='/api/audit'){requireAdmin(s);return json(res,200,{events:db.prepare('SELECT a.id,a.event,a.entity_id,a.created_at,u.name actor FROM audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 150').all()});}
        if(req.method==='GET'&&url.pathname==='/api/backup'){requireAdmin(s);audit(db,s.id,'business_export');return json(res,200,{exportedAt:new Date().toISOString(),data:readState(db),users:db.prepare('SELECT * FROM users').all().map(publicUser)},{'Content-Disposition':'attachment; filename="lino-dados.json"'});}
        D.fail('Endpoint não encontrado.',404);
      }
      if(req.method!=='GET'&&req.method!=='HEAD')D.fail('Método inválido.',405);
      const appRoute=url.pathname==='/app'||url.pathname.startsWith('/app/');
      const root=appRoute?path.join(__dirname,'public'):path.resolve(__dirname,'../dist');
      let relative=appRoute?url.pathname.slice(4):url.pathname;if(relative==='/'||relative==='')relative='/index.html';
      let file;try{file=path.resolve(root,'.'+decodeURIComponent(relative));}catch{D.fail('Endereço inválido.');}
      if(!file.startsWith(root+path.sep))D.fail('Sem acesso.',403);
      if(!fs.existsSync(file)||!fs.statSync(file).isFile())D.fail('Página não encontrada.',404);
      const contentType={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(file)]||'application/octet-stream';
      if(appRoute)res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'self'");
      let payload=fs.readFileSync(file);if(!appRoute&&relative==='/index.html')payload=Buffer.from(payload.toString().replace('<span class="planned-label">A definir após validação do projeto</span>','<a class="primary" href="/app/">Abrir versão em desenvolvimento <span>↗</span></a>').replace('Funcionalidades, prazos e condições a acordar','Contas individuais · Servidor local · Dados fictícios').replace('Próxima fase','Em desenvolvimento'));
      res.writeHead(200,{'Content-Type':contentType,'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:payload);
    }catch(error){const status=error.status||400;if(!res.headersSent)json(res,status,{error:status>=500?'Não foi possível concluir a operação. Consulte o responsável.':error.message,...(error.code==='TRIAL_BLOCKED'?{code:error.code,access:error.access}:{})});else res.end();}
  }
  const server=http.createServer((req,res)=>{handle(req,res).catch(()=>{if(!res.headersSent)json(res,500,{error:'Erro interno.'});});});
  server.headersTimeout=15000;server.requestTimeout=20000;
  return {server,db,close:()=>new Promise(resolve=>{server.close(()=>{db.close();resolve();});server.closeIdleConnections();})};
}
if(require.main===module){const port=Number(process.env.PORT||4174),host=process.env.HOST||'127.0.0.1',origin=process.env.APP_ORIGIN||`http://127.0.0.1:${port}`;const app=createApplication({database:process.env.DATABASE_PATH||path.join(__dirname,'data','lino.sqlite'),origin,production:process.env.NODE_ENV==='production'});app.server.listen(port,host,()=>console.log(`Lino Rua · versão futura: ${origin}/app/`));}
module.exports={createApplication};
