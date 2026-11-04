const { openStore, readState, mutate } = require('./lib/store.cjs');
const { defaultDatabase } = require('./lib/companies.cjs');
const { action, isoToday } = require('./lib/domain.cjs');
const { available } = require('./lib/costs.cjs');

const samples = [
  ['cimento', 'Cimento cinzento de 25 kg', 40, 'saco', 5.50],
  ['tinta', 'Tinta branca de interior', 60, 'L', 6.80],
  ['tubo', 'Tubo PVC de 40 mm', 120, 'm', 2.40],
  ['parafusos', 'Parafusos para gesso cartonado', 12, 'caixa', 8.75],
  ['ceramica', 'Pavimento cerâmico', 45, 'm²', 16.90],
];

const db = openStore(defaultDatabase);
try {
  const user = db.prepare("SELECT id, role FROM users WHERE username IN ('linorua','lino') AND role='admin' AND active=1").get();
  if (!user) throw Error('Administrador da demonstração não encontrado.');
  const state = readState(db);
  const missing = samples.filter(([key]) => !state.inventory?.some(lot => lot.demoKey === key));
  if (missing.length) {
    mutate(db, state.revision, user.id, 'demo_inventory_initialized', draft => {
      for (const [key, name, quantity, unit, unitPrice] of missing) {
        action(draft, user, 'stockReceive', {
          description: name + ' (demo)', quantity, unit, unitPrice, date: isoToday()
        });
        draft.inventory.at(-1).demoKey = key;
      }
    });
  }
  const saved = readState(db);
  for (const lot of saved.inventory.filter(item => item.demoKey)) {
    console.log(lot.description, available(saved, lot), lot.unit);
  }
} finally {
  db.close();
}
