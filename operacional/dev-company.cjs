// Local development fixture. Existing companies and credentials are never reset.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {openRegistry, createCompany, defaultDatabase} = require('./lib/companies.cjs');
const {openStore, readState, mutate, publicUser} = require('./lib/store.cjs');
const {seed} = require('./seed.cjs');
const {populate} = require('./demo-quarter.cjs');
const D = require('./lib/domain.cjs');
const KEY = 'development-test-company-v1';

async function ensureDevCompany({database = defaultDatabase, registryPath} = {}) {
  if (process.env.NODE_ENV === 'production') throw Error('Este comando destina-se apenas a desenvolvimento.');
  const registry = openRegistry(database, registryPath);
  try {
    for (const company of registry.list()) {
      const db = openStore(company.database_path);
      try {
        const row = db.prepare('SELECT document FROM business WHERE id=1').get();
        if (row && JSON.parse(row.document).developmentFixture === KEY) {
          return {alreadyExists:true, database:company.database_path, credentials:path.join(path.dirname(company.database_path), 'acessos.json')};
        }
        if (db.prepare("SELECT 1 FROM users WHERE username IN ('teste','teste.enc','teste.joao','teste.rui')").get()) {
          throw Error('Já existe um dos utilizadores de teste noutra empresa. Nenhuma conta foi substituída.');
        }
      } finally { db.close(); }
    }

    // Prepare the complete scenario before creating a registered company.
    const fixture = openStore(':memory:');
    let state, accounts;
    try {
      const credentials = await seed(fixture);
      const actor = fixture.prepare("SELECT * FROM users WHERE username='lino'").get();
      state = readState(fixture);
      populate(state, publicUser(actor), fixture.prepare('SELECT id,employee_id FROM users').all());
      const names = ['Ana', 'João', 'Pedro', 'Maria', 'Rui'];
      state.employees.forEach((e, i) => { e.name = names[i]; });
      state.clients.forEach((c, i) => { c.name = 'Cliente ' + (i + 1); });
      state.projects.forEach((p, i) => {
        p.name = 'Obra ' + (i + 1);
        p.client = state.clients.find(c => c.id === p.clientId).name;
      });
      const usernames = {lino:'teste', antonio:'teste.enc', joao:'teste.joao', rui:'teste.rui'};
      accounts = fixture.prepare('SELECT * FROM users').all().map(u => ({...u,
        username:usernames[u.username], name:u.employee_id ? state.employees.find(e => e.id === u.employee_id).name : 'Teste',
        password:credentials.find(c => c.username === u.username).password,
        projects_json:u.role === 'manager' ? JSON.stringify(state.projects.map(p => p.id)) : u.projects_json
      }));
      const admin = publicUser(accounts.find(u => u.role === 'admin'));
      const today = D.isoToday();
      const act = (type, data) => D.action(state, admin, type, data);
      // Current-month examples are immediately visible with the default filters.
      const yesterday = new Date(Date.parse(today + 'T12:00Z') - 86400000).toISOString().slice(0,10);
      for (const [employee, status] of [['e1','approved'], ['e2','pending']]) {
        if (!state.entries.some(e => e.employee === employee && e.date === yesterday)) {
          act('work', {project:'o1', employee, date:yesterday, mode:'hours', start:'08:00', end:'17:00', pause:60, note:'Exemplo de trabalho'});
          if (status === 'approved') act('approve', {id:state.entries.at(-1).id});
        }
      }
      act('payment', {employee:'e1', amount:20, date:today, type:'advance', method:'MB WAY', note:'Adiantamento de teste'});
      for (const [description, settlement] of [['Material 1','paid'], ['Material 2','partial'], ['Material 3','unpaid']]) {
        act('projectCost', {project:'o1', kind:'material', description, date:today, quantity:10, unit:'un', unitPrice:10,
          settlement, paidAmount:40, paymentDate:today, paymentMethod:'Transferência'});
      }
      act('generalCost', {description:'Gasóleo', category:'Transporte', date:today, unitPrice:50, settlement:'paid', paymentDate:today, paymentMethod:'Numerário'});
      for (const [i, description] of ['Cimento','Tinta','Tubo'].entries()) {
        act('stockReceive', {description, quantity:20, unit:['saco','L','m'][i], unitPrice:5, date:today});
      }
      act('stockIssue', {lot:state.inventory[0].id, project:'o1', quantity:2, date:today});
      act('charge', {project:'o1', description:'Parcela de teste', amount:1000, due:today});
      act('receipt', {charge:state.charges.at(-1).id, amount:400, date:today, method:'Transferência', note:'Recebimento parcial'});
      act('projectNote', {project:'o1', text:'Nota de teste'});
      const tomorrow = new Date(Date.parse(today + 'T12:00Z') + 86400000).toISOString().slice(0,10);
      act('planCreate', {project:'o1', employees:['e1'], dates:[tomorrow], start:'08:00', end:'17:00', pause:60, note:'Plano de teste'});
      state.monthlyHistory = [{month:'2026-07', project:'o1', employee:'e1', totalHours:80}];
      state.developmentFixture = KEY;
      delete state.revision;
    } finally { fixture.close(); }

    const company = await createCompany(registry, {name:'Teste', username:'teste', password:accounts.find(u => u.role === 'admin').password, days:3650});
    const db = openStore(company.database);
    try {
      mutate(db, readState(db).revision, 'development', 'development_fixture_created', draft => {
        Object.assign(draft, state);
        db.exec('DELETE FROM users');
        for (const u of accounts) db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?)').run(u.id,u.username,u.name,u.password_hash,u.role,u.employee_id,u.projects_json,1,0,u.created_at);
      });
      const admin = publicUser(accounts.find(u => u.role === 'admin'));
      require('./lib/attachments.cjs').upload(db, company.database + '.files', admin, {
        project:'o1', name:'exemplo.png', content:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHuoAAAAASUVORK5CYII=',
        caption:'Anexo de teste', visibility:'team', revision:readState(db).revision
      });
      const credentials = path.join(path.dirname(company.database), 'acessos.json');
      fs.writeFileSync(credentials, JSON.stringify(accounts.map(({username,password,role}) => ({username,password,role})), null, 2), {flag:'wx',mode:0o600});
      return {...company, credentials, counts:Object.fromEntries(Object.entries(readState(db)).filter(([,v]) => Array.isArray(v)).map(([k,v]) => [k,v.length]))};
    } finally { db.close(); }
  } finally { registry.close(); }
}

if (require.main === module) ensureDevCompany({database:process.env.DATABASE_PATH || defaultDatabase, registryPath:process.env.PLATFORM_PATH})
  .then(result => console.log(JSON.stringify(result,null,2)))
  .catch(error => {console.error(error.message);process.exitCode=1;});
module.exports = {ensureDevCompany};
