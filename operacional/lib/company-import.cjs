'use strict';

const {action} = require('./domain.cjs');
const headers = {
  Clientes: ['Código *', 'Nome *', 'Email', 'Telefone', 'Periodicidade', 'Ativo'],
  Funcionários: ['Código *', 'Nome *', 'Categoria *', 'Remuneração *', 'Valor (€) *', 'Horas por dia *', 'Ativo'],
  Obras: ['Código *', 'Nome *', 'Código do cliente *', 'Localidade *', 'Estado *', 'Orçamento (€) *', 'Morada', 'Início previsto', 'Fim previsto', 'Contacto em obra'],
  Equipas: ['Código da obra *', 'Código do funcionário *']
};
const collection = {Clientes:'clients', Funcionários:'employees', Obras:'projects'};
const kind = {Clientes:'client', Funcionários:'employee', Obras:'project'};
const maxRows = 2000;
const clean = value => String(value ?? '').trim();
const key = value => clean(value).toLocaleUpperCase('pt-PT');
const invalid = message => { throw Error(message); };

// Preserve physical row numbers so a correction can be made directly in Excel.
function readRows(sheets) {
  const rows = Object.fromEntries(Object.keys(headers).map(name => [name, []]));
  let count = 0;
  const found = new Set();
  for (const {sheet, data} of sheets) {
    if (sheet === 'Instruções') continue;
    if (!Object.hasOwn(headers, sheet) || found.has(sheet)) invalid('Folha inesperada ou repetida: ' + sheet);
    found.add(sheet);
    const fields = headers[sheet];
    const first = (data[0] || []).map(clean);
    const columns = fields.map(field => first.indexOf(field));
    if (columns.includes(-1) || first.filter(Boolean).length !== fields.length) invalid('Verifique os cabeçalhos na primeira linha de «' + sheet + '». Use os do modelo.');
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row.some(value => clean(value) !== '')) continue;
      if (++count > maxRows) invalid('O limite por ficheiro é de 2 000 linhas de dados.');
      if (row.some((v, n) => clean(v) && !first[n])) invalid(sheet + ', linha ' + (i + 1) + ' — existem dados numa coluna sem cabeçalho.');
      rows[sheet].push({line:i + 1, values:columns.map(column => row[column] ?? '')});
    }
  }
  if (!count) invalid('O ficheiro não contém linhas de dados. Preencha pelo menos uma folha do modelo.');
  return rows;
}

function code(value, label) {
  const id = key(value);
  if (!/^[A-Z0-9][A-Z0-9._-]{0,59}$/.test(id)) invalid(label + ' deve ter até 60 letras sem acentos, algarismos, pontos, hífenes ou sublinhados.');
  return id;
}
function choice(value, choices, label) {
  const match = Object.entries(choices).find(([name]) => key(name) === key(value));
  if (!match) invalid(label + ' admite ' + Object.keys(choices).join(', ') + '.');
  return match[1];
}
function number(value, label, min, max) {
  const n = Number(clean(value).replace(',', '.'));
  if (!/^\d+(?:[.,]\d+)?$/.test(clean(value)) || !Number.isFinite(n) || n < min || n > max) invalid(label + ' deve ser um número entre ' + min + ' e ' + max + '.');
  return n;
}
function date(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : clean(value);
}
function active(value) {
  return choice(clean(value) || 'Sim', {Sim:true, Não:false}, 'Ativo');
}

// The caller supplies either a disposable preview state or the transaction's state.
function applyImport(state, user, rows) {
  if (user.role !== 'admin') throw Object.assign(Error('Apenas o administrador pode importar dados.'), {status:403});
  const indexes = {};
  for (const [sheet, prop] of Object.entries(collection)) {
    indexes[sheet] = new Map(state[prop].filter(item => item.importCode).map(item => [item.importCode, item]));
  }
  const summary = {}, errors = [];
  let errorCount = 0;
  function lookup(sheet, ref, label) {
    const id = code(ref, label);
    return indexes[sheet].get(id) || invalid(label + ' «' + id + '» não encontrado.');
  }
  function fields(sheet, v) {
    if (!clean(v[1])) invalid('Preencha o nome.');
    if (sheet === 'Clientes') return {name:clean(v[1]), email:clean(v[2]), phone:clean(v[3]),
      cycle:choice(clean(v[4]) || 'Mensal', {Semanal:'weekly', Mensal:'monthly', 'Por fase':'milestone'}, 'Periodicidade'), active:active(v[5])};
    if (sheet === 'Funcionários') return {name:clean(v[1]), category:clean(v[2]), payBasis:choice(v[3], {Hora:'hour', Dia:'day'}, 'Remuneração'),
      rate:number(v[4], 'Valor', 0, 10000), dayHours:number(v[5], 'Horas por dia', 1, 24), active:active(v[6])};
    return {name:clean(v[1]), clientId:lookup('Clientes', v[2], 'Código do cliente').id, city:clean(v[3]),
      status:choice(v[4], {'Planeada':'Planeada', 'Em curso':'Em curso', 'Concluída':'Concluída'}, 'Estado'),
      budget:number(v[5], 'Orçamento', 0, 10000000), address:clean(v[6]), plannedStart:date(v[7]), plannedEnd:date(v[8]), siteContact:clean(v[9])};
  }
  for (const sheet of Object.keys(headers)) {
    const seen = new Set();
    const result = summary[sheet] = {created:0, existing:0, examples:[]};
    for (const {line, values:v} of rows[sheet]) {
      try {
        const ref = code(v[0], headers[sheet][0].replace(' *', ''));
        const rowKey = sheet === 'Equipas' ? ref + '/' + code(v[1], 'Código do funcionário') : ref;
        if (seen.has(rowKey)) invalid('Código repetido no ficheiro: ' + rowKey + '.');
        seen.add(rowKey);
        let title;
        if (sheet === 'Equipas') {
          const project = lookup('Obras', ref, 'Código da obra');
          const employee = lookup('Funcionários', v[1], 'Código do funcionário');
          if (project.employees.includes(employee.id)) { result.existing++; continue; }
          project.employees.push(employee.id);
          title = project.name + ' — ' + employee.name;
        } else {
          const data = fields(sheet, v);
          const existing = indexes[sheet].get(ref);
          if (existing) {
            if (Object.entries(data).some(([k, val]) => existing[k] !== val)) invalid('O código ' + ref + ' já existe com dados diferentes. Reveja a ficha na aplicação.');
            result.existing++;
            continue;
          }
          action(state, user, kind[sheet], data);
          const created = state[collection[sheet]].at(-1);
          created.importCode = ref;
          indexes[sheet].set(ref, created);
          title = created.name;
        }
        result.created++;
        if (result.examples.length < 4) result.examples.push(title);
      } catch (error) {
        errorCount++;
        if (errors.length < 30) errors.push(sheet + ', linha ' + line + ' — ' + error.message);
      }
    }
  }
  return {summary, errors, errorCount};
}
module.exports = {headers, readRows, applyImport};
