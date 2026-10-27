const http=require('node:http');
const {createApplication}=require('./server.cjs');
const {openRegistry,defaultDatabase}=require('./lib/companies.cjs');
function createPlatform({database=defaultDatabase,registryPath,origin='http://127.0.0.1:4174',production=false}={}){
  const registry=openRegistry(database,registryPath),applications=new Map(),configured=new URL(origin);
  const cookieName=production?'__Host-lino_session':'lino_session';
  function sync(){
    for(const company of registry.list())if(!applications.has(company.id)){
      const app=createApplication({database:company.database_path,origin,production,companyId:company.id,usernameAvailable:(username,exceptId)=>{
        sync();
        for(const [id,other]of applications){const found=other.db.prepare('SELECT id FROM users WHERE username=?').get(username);if(found&&(id!==company.id||found.id!==exceptId))return false;}
        return true;
      }});
      applications.set(company.id,app);
    }
  }
  sync();
  const json=(res,status,error)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error}));};
  async function handle(req,res){
    try{
      sync();
      const url=new URL(req.url,origin);
      let app;
      if(req.method==='POST'&&url.pathname==='/api/login'){
        if(req.headers.host!==configured.host||req.headers.origin!==configured.origin)return json(res,403,'Origem do pedido inválida.');
        if(!String(req.headers['content-type']).startsWith('application/json'))return json(res,415,'Use JSON neste pedido.');
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>65536)return json(res,413,'Pedido demasiado grande.');chunks.push(chunk);}
        let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return json(res,400,'Pedido JSON inválido.');}
        if(!input||typeof input!=='object'||Array.isArray(input))return json(res,400,'Pedido inválido.');
        const username=String(input.username||'').trim().toLowerCase();
        const matches=[...applications.values()].filter(a=>a.db.prepare('SELECT 1 FROM users WHERE username=?').get(username));
        if(matches.length>1)return json(res,401,'Utilizador ou palavra-passe inválidos.');
        app=matches[0]||applications.get('linorua');
        // This property is internal; neither headers nor request JSON choose a company.
        req.loginInput=input;
      }else{
        const raw=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
        const id=raw.split('.')[0];app=applications.get(id);
        if(!app&&['/api/session','/api/access'].includes(url.pathname))return json(res,401,'Inicie sessão para continuar.');
        app=app||applications.get('linorua');
      }
      app.server.emit('request',req,res);
    }catch{if(!res.headersSent)json(res,500,'Não foi possível concluir o pedido.');else res.end();}
  }
  const server=http.createServer((req,res)=>{handle(req,res);});
  server.headersTimeout=15000;server.requestTimeout=20000;
  return {server,registry,applications,close:()=>new Promise(resolve=>{server.close(()=>{for(const app of applications.values())app.db.close();registry.close();resolve();});server.closeIdleConnections();})};
}
if(require.main===module){const port=Number(process.env.PORT||4174),host=process.env.HOST||'127.0.0.1',origin=process.env.APP_ORIGIN||`http://127.0.0.1:${port}`;const app=createPlatform({database:process.env.DATABASE_PATH||defaultDatabase,registryPath:process.env.PLATFORM_PATH,origin,production:process.env.NODE_ENV==='production'});app.server.listen(port,host,()=>console.log(`LR Gestão: ${origin}/`));}
module.exports={createPlatform};
