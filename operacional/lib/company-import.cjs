'use strict';

const {action} = require('./domain.cjs');
const crypto = require('node:crypto');
const headers = {
  Clientes: ['Código *', 'Nome *', 'Email', 'Telefone', 'Periodicidade', 'Ativo'],
  Funcionários: ['Código *', 'Nome *', 'Categoria *', 'Remuneração *', 'Valor (€) *', 'Horas por dia *', 'Ativo'],
  Obras: ['Código *', 'Nome *', 'Código do cliente *', 'Localidade *', 'Estado *', 'Orçamento (€) *', 'Morada', 'Início previsto', 'Fim previsto', 'Contacto em obra'],
  Equipas: ['Código da obra *', 'Código do funcionário *'],
  'Horas mensais': ['Código da obra *', 'Código do funcionário *', 'Mês (AAAA-MM) *', 'Total de horas *']
};
const payrollOverviewHeaders = ['Código do funcionário', 'Mês (AAAA-MM)', 'Funcionário', 'Custo Hora', 'Horas Trabalhadas', 'Horas Contabilizadas', 'Horas Trabalhadas Extra', 'Valor Total A Pagar', 'Valor Pago', 'Valor Em Falta'];
const optionalEmptySheets = {
  'Pagamentos a funcionários': payrollOverviewHeaders,
  Artigos: ['Código do artigo *', 'Nome *', 'Tipo', 'Preço unitário (€)', 'Unidade', 'Quantidade inicial', 'Data de entrada'],
  'Saídas de artigos': ['Data *', 'Código da obra *', 'Código do artigo *', 'Quantidade *', 'Descrição'],
  'Dados da encomenda': ['Código da obra *', 'Descrição', 'Horas previstas', 'Previsão de entrega'],
  'Observações da encomenda': ['Código da obra *', 'Data', 'Observação *'],
  'Outros gastos': ['Código da obra *', 'Data', 'Descrição *', 'Valor (€) *'],
  Viagens: ['Código da obra *', 'Nome', 'Número de viagens', 'Viagens pagas', 'Valor cobrado (€)'],
  'Liquidações do cliente': ['Código da obra *', 'Data da liquidação *', 'Tipo', 'Descrição', 'Valor cobrado (€) *'],
  'Tarifas por encomenda': ['Código da obra *', 'Código do funcionário *', 'Custo hora a pagar (€)', 'Custo hora a cobrar (€)'],
  'Artigos gastos por encomenda': ['Código da obra', 'Código do artigo', 'Artigo', 'Quantidade', 'Preço unitário (€)', 'Total (€)'],
  'Resumo das encomendas': ['Código da obra', 'Total gasto (€)', 'Total a cobrar (€)', 'Liquidações do cliente (€)', 'Saldo final (€)', 'Artigos gastos (€)', 'Outros gastos (€)', 'Tempo de trabalho (h)', 'Custo do trabalho (€)', 'Trabalho cobrado (€)']
};
const collection = {Clientes:'clients', Funcionários:'employees', Obras:'projects'};
const kind = {Clientes:'client', Funcionários:'employee', Obras:'project'};
const maxRows = 2000;
const clean = value => String(value ?? '').trim();
const key = value => clean(value).toLocaleUpperCase('pt-PT');
const invalid = message => { throw Error(message); };

// Preserve physical row numbers so a correction can be made directly in Excel.
function readRows(sheets) {
  const rows = Object.fromEntries([...Object.keys(headers), ...Object.keys(optionalEmptySheets)].map(name => [name, []]));
  let count = 0;
  const found = new Set();
  for (const {sheet, data} of sheets) {
    if (sheet === 'Instruções') continue;
    if (Object.hasOwn(optionalEmptySheets, sheet)) {
      const fields=optionalEmptySheets[sheet], first=(data[0]||[]).map(clean);
      if (found.has(sheet) || fields.some((field,i)=>first[i]!==field)) invalid('Verifique os cabeçalhos na folha «' + sheet + '».');
      found.add(sheet);
      for(let i=1;i<data.length;i++){
        const row=data[i];if(!row.some(value=>clean(value)!==''))continue;
        if(++count>maxRows)invalid('O limite por ficheiro é de 2 000 linhas de dados.');
        rows[sheet].push({line:i+1,values:row.slice(0,fields.length)});
      }
      continue;
    }
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
    if (sheet === 'Funcionários') return {name:clean(v[1]), category:clean(v[2])||'Por classificar', payBasis:choice(v[3], {Hora:'hour', Dia:'day'}, 'Remuneração'),
      rate:number(v[4], 'Valor', 0, 10000), dayHours:number(v[5], 'Horas por dia', 1, 24), active:active(v[6])};
    return {name:clean(v[1]), clientId:lookup('Clientes', v[2], 'Código do cliente').id, city:clean(v[3])||'Por indicar',
      status:choice(v[4], {'Planeada':'Planeada', 'Em curso':'Em curso', 'Concluída':'Concluída'}, 'Estado'),
      budget:number(v[5], 'Orçamento', 0, 10000000), address:clean(v[6]), plannedStart:date(v[7]), plannedEnd:date(v[8]), siteContact:clean(v[9])};
  }
  for (const sheet of Object.keys(headers)) {
    if (sheet === 'Horas mensais' && !rows[sheet]?.length) continue;
    const seen = new Set();
    const result = summary[sheet] = {created:0, existing:0, examples:[]};
    for (const {line, values:v} of rows[sheet]) {
      try {
        if(sheet==='Obras'&&!clean(v[2])){result.excluded=(result.excluded||0)+1;continue;}
        const ref = code(v[0], headers[sheet][0].replace(' *', ''));
        const monthly = sheet === 'Horas mensais';
        const month = monthly ? (v[2] instanceof Date ? date(v[2]).slice(0,7) : clean(v[2])) : '';
        if (monthly && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) invalid('Indique o mês no formato AAAA-MM.');
        const rowKey = sheet === 'Equipas' || monthly ? ref + '/' + code(v[1], 'Código do funcionário') + '/' + month : ref;
        if (seen.has(rowKey)) invalid('Código repetido no ficheiro: ' + rowKey + '.');
        seen.add(rowKey);
        let title;
        if (monthly) {
          const project = lookup('Obras', ref, 'Código da obra');
          const employee = lookup('Funcionários', v[1], 'Código do funcionário');
          const totalHours = number(v[3], 'Total de horas', 0, 744);
          state.monthlyHistory ??= [];
          const existing = state.monthlyHistory.find(r => r.project === project.id && r.employee === employee.id && r.month === month);
          if (existing) {
            if (existing.totalHours !== totalHours) invalid('Já existe um total diferente para este mês, obra e funcionário.');
            result.existing++;
            continue;
          }
          state.monthlyHistory.push({month, project:project.id, employee:employee.id, totalHours});
          title = month + ' · ' + project.name + ' · ' + employee.name;
        } else if (sheet === 'Equipas') {
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
  // Historical exports contain catalogue entries and aggregate accounting rows.
  // Keep them as source records: a monthly paid total is not an individual payment,
  // and an article without a received quantity is not an inventory lot.
  state.historicalImport ??= {};
  const articleCodes=new Set((rows.Artigos||[]).map(r=>code(r.values[0],'Código do artigo')));
  for(const sheet of Object.keys(optionalEmptySheets)){
    const result=summary[sheet]={created:0,existing:0,examples:[]};
    const saved=state.historicalImport[sheet]??=[];
    const known=new Set(saved.map(r=>r.sourceKey));
    for(const {line,values} of rows[sheet]||[]){
      try{
        const v=values;
        if(sheet==='Artigos'){
          code(v[0],'Código do artigo');if(!clean(v[1]))invalid('Indique o nome do artigo.');
          if(clean(v[3]))number(v[3],'Preço unitário',0,1000000);
        }else if(sheet==='Pagamentos a funcionários'){
          lookup('Funcionários',v[0],'Código do funcionário');
          if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(clean(v[1])))invalid('Mês inválido.');
        }else if(sheet==='Saídas de artigos'){
          lookup('Obras',v[1],'Código da obra');
          if(!articleCodes.has(code(v[2],'Código do artigo')))invalid('Artigo não encontrado.');
          number(v[3],'Quantidade',0.001,1000000);
        }else{
          lookup('Obras',v[0],'Código da obra');
          if(sheet==='Tarifas por encomenda')lookup('Funcionários',v[1],'Código do funcionário');
          if(sheet==='Outros gastos')number(v[3],'Valor',0,10000000);
          if(sheet==='Liquidações do cliente')number(v[4],'Valor cobrado',0,10000000);
        }
        const sourceKey=crypto.createHash('sha256').update(sheet+'\n'+line+'\n'+JSON.stringify(v)).digest('hex');
        if(known.has(sourceKey)){result.existing++;continue;}
        saved.push({sourceKey,values:v});known.add(sourceKey);result.created++;
      }catch(error){errorCount++;if(errors.length<30)errors.push(sheet+', linha '+line+' — '+error.message);}
    }
    state.historicalImport[sheet]=saved;
  }
  return {summary, errors, errorCount};
}
module.exports = {headers, readRows, applyImport};
