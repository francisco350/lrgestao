'use strict';

const {createHash,randomUUID} = require('node:crypto');
const {readWorkbook} = require('./read-workbook.cjs');

const rooms = {
  quarto: ['Quarto', ['geral']], wc: ['WC', ['electricidade', 'pichelaria']],
  corredor: ['Corredor', ['geral']], sala: ['Sala', ['geral']], garagem: ['Garagem', ['geral']],
  cozinha: ['Cozinha', ['electricidade', 'pichelaria']]
};
const names = {geral: 'Composição da divisão', electricidade: 'Eletricidade', pichelaria: 'Pichelaria'};
const normalize = value => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function numeric(value, location, min, max, decimals) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max ||
      Math.abs(value * 10 ** decimals - Math.round(value * 10 ** decimals)) > 0.000001) {
    throw Error(`Valor inválido em ${location}.`);
  }
  return value;
}

function buildCatalog(sheets) {
  const find = name => sheets.find(s => normalize(s.sheet) === name)?.data;
  const prices = find('tabela de precos');
  const map = find('mapa de quantidades');
  if (!prices || !map) throw Error('São necessárias as folhas Tabela de Preços e Mapa de Quantidades.');
  const items = new Map();
  for (const [index, row] of prices.entries()) {
    if (index < 2 || row.every(cell => cell == null)) continue;
    const [name,, unit, price] = row;
    const key = normalize(name);
    if (typeof name !== 'string' || !key || name.length > 250 || typeof unit !== 'string' || !unit.trim() || unit.length > 30 || items.has(key)) throw Error(`Artigo inválido ou repetido na Tabela de Preços, linha ${index + 1}.`);
    numeric(price, `Tabela de Preços!D${index + 1}`, 0, 100000, 2);
    items.set(key, {name: name.trim(), unit: unit.trim(), unitCents: Math.round(price * 100)});
  }
  const hourlyCents = items.get('horas')?.unitCents;
  if (!hourlyCents) throw Error('Falta a tarifa positiva «horas» na Tabela de Preços.');
  const compositions = {};
  for (const {sheet, data} of sheets) {
    if (data === prices || data === map) continue;
    const heading = normalize(data[0]?.[0]).replace(/^\d+ ambiente /, '');
    const [room, specialty] = heading.split(' ');
    const trade = specialty === 'eletricidade' ? 'electricidade' : specialty || 'geral';
    if (!rooms[room]?.[1]?.includes(trade)) throw Error(`Composição desconhecida na folha «${sheet}».`);
    const id = room + '-' + trade;
    if (compositions[id]) throw Error(`Composição duplicada em «${sheet}».`);
    const baseArea = numeric(data[1]?.[5], sheet + '!F2', 0.01, 10000, 2);
    const baseHours = numeric(data[1]?.[3], sheet + '!D2', 0, 100000, 3);
    const materials = [];
    for (let i = 3; i < data.length; i++) {
      const row = data[i];
      if (row[0] == null && row[1] == null && row[2] == null) continue;
      const item = items.get(normalize(row[1]));
      if (!item || !normalize(row[1]) || normalize(row[1]) === 'horas') throw Error(`Material sem correspondência em ${sheet}!B${i + 1}.`);
      const quantity = numeric(row[2], sheet + '!C' + (i + 1), 0, 100000, 3);
      materials.push({...item, quantity});
    }
    if (!materials.length) throw Error(`Faltam materiais na folha «${sheet}».`);
    compositions[id] = {id, room, trade, name: names[trade], sourceSheet: sheet, baseArea, baseHours, materials};
  }
  const defaults = [];
  for (const [room,[label,trades]] of Object.entries(rooms)) {
    for (const trade of trades) {
      const composition = compositions[room + '-' + trade];
      if (!composition) throw Error(`Falta a composição de ${label} · ${names[trade]}.`);
      const mapName = normalize(label + (trade === 'geral' ? '' : ' ' + names[trade]));
      const rows = map.filter(row => normalize(row[0]) === mapName);
      if (rows.length !== 1) throw Error(`Verifique a linha «${mapName}» no Mapa de Quantidades.`);
      const row = rows[0];
      const quantity = numeric(row[1], 'Mapa de Quantidades · ' + mapName, 0, 1000, 0);
      if (quantity === 0) continue;
      const shared = defaults.find(d => d.room === room && d.quantity === quantity);
      const projectedArea = row[7] == null ? null : numeric(row[7], 'Metragem em Projeto · ' + mapName, 0, 10000000, 2);
      if (shared && (projectedArea == null || projectedArea === shared.area)) shared.trades.push(trade);
      else defaults.push({room, quantity, area: projectedArea ?? composition.baseArea * quantity, trades:[trade]});
    }
  }
  items.delete('horas');
  return linkMaterials({hourlyCents, compositions, defaults:defaults.filter(d=>d.area>0)}, [...items.values()]);
}

// Earlier catalogues stored a copy of each price in every composition.
function linkMaterials(catalog, priceList = Object.values(catalog.compositions).flatMap(c=>c.materials)) {
  const items = new Map();
  for (const {name,unit,unitCents} of priceList) {
    const key=normalize(name);
    items.set(key,{id:'m-'+key.replaceAll(' ','-'),name,unit,unitCents});
  }
  for (const c of Object.values(catalog.compositions)) {
    c.materials=c.materials.map(({name,quantity})=>({materialId:items.get(normalize(name)).id,quantity}));
  }
  return {...catalog,items:[...items.values()]};
}

async function importWorkbook(bytes) {
  const catalog = await readWorkbook(bytes, 'catalog');
  return {...catalog, version:createHash('sha256').update(bytes).digest('hex').slice(0,12)};
}
function activeCatalog(db) {
  const saved = db.prepare('SELECT document FROM estimate_catalog WHERE id=1').get();
  const initial = require('../catalogo/precario-inicial.json');
  let catalog=saved ? JSON.parse(saved.document) : initial;
  if (saved && catalog.items) return catalog;
  if (saved) catalog=catalog.version===initial.version ? initial : linkMaterials(catalog);
  db.prepare('INSERT OR REPLACE INTO estimate_catalog VALUES(1,?)').run(JSON.stringify(catalog));
  return structuredClone(catalog);
}
function description(catalog) {
  return {version:catalog.version, hourlyCents:catalog.hourlyCents, defaults:catalog.defaults,
    items:catalog.items, compositions:Object.values(catalog.compositions),
    rooms:Object.entries(rooms).map(([id,[name,trades]])=>({id,name,trades:trades.map(key=>{
      const c=catalog.compositions[id+'-'+key];
      return {id:key,name:c.name,baseArea:c.baseArea};
    })}))};
}
function editCatalog(catalog, change) {
  switch(change.type) {
    case 'hourlyRate':
      catalog.hourlyCents=numeric(change.hourlyCents,'preço da mão de obra',1,10000000,0);
      break;
    case 'material': {
      const name=typeof change.name==='string' ? change.name.trim() : '';
      const unit=typeof change.unit==='string' ? change.unit.trim() : '';
      if (!normalize(name) || name.length>250 || !unit || unit.length>30) throw Error('Indique um nome e uma unidade válidos.');
      if (catalog.items.some(i=>i.id!==change.id && normalize(i.name)===normalize(name))) throw Error('Já existe um material com esse nome.');
      const unitCents=numeric(change.unitCents,'preço do material',0,10000000,0);
      if (change.id==null) catalog.items.push({id:randomUUID(),name,unit,unitCents});
      else {
        const item=catalog.items.find(i=>i.id===change.id);
        if (!item) throw Error('Material desconhecido.');
        Object.assign(item,{name,unit,unitCents});
      }
      break;
    }
    case 'composition': {
      if (!Object.hasOwn(catalog.compositions,change.id)) throw Error('Composição desconhecida.');
      const c=catalog.compositions[change.id];
      const baseHours=numeric(change.baseHours,'horas de referência',0,100000,3);
      const baseArea=numeric(change.baseArea,'área de referência',0.01,10000,2);
      if (!Array.isArray(change.materials) || change.materials.length>1000) throw Error('Lista de materiais inválida.');
      const ids=new Set(catalog.items.map(i=>i.id));
      const materials=change.materials.map(line=>{
        if (!line || !ids.has(line.materialId)) throw Error('Selecione um material do preçário em cada linha.');
        return {materialId:line.materialId,quantity:numeric(line.quantity,'quantidade de material',0,100000,3)};
      });
      Object.assign(c,{baseArea,baseHours,materials});
      break;
    }
    default: throw Error('Alteração de preçário desconhecida.');
  }
  catalog.version=randomUUID();
  return catalog;
}
module.exports = {buildCatalog, importWorkbook, activeCatalog, description, editCatalog, rooms};
