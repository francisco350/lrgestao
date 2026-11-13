'use strict';

const {rooms} = require('./estimate-catalog.cjs');

function specificEstimate(catalog, work) {
  const validQuantity = n => typeof n==='number' && Number.isFinite(n) && n>=0 && n<=100000 && /^\d+(\.\d{1,3})?$/.test(String(n));
  if (!validQuantity(work.hours) || !Array.isArray(work.materials) || work.materials.length>100 ||
      (!work.materials.length && !work.hours)) throw Error('Indique materiais ou horas de mão de obra válidas.');
  const prices=new Map(catalog.items.map(item=>[item.id,item]));
  const materials=work.materials.map(line=>{
    const item=prices.get(line?.materialId);
    if (!item || !validQuantity(line.quantity) || line.quantity===0) throw Error('Escolha o material e uma quantidade positiva com até três casas decimais.');
    return {...item,quantity:line.quantity,totalCents:Math.round(Math.round(line.quantity*1000)*item.unitCents/1000)};
  });
  const materialsCents=materials.reduce((sum,item)=>sum+item.totalCents,0);
  const labourCents=Math.round(Math.round(work.hours*1000)*catalog.hourlyCents/1000);
  return {kind:'specific',version:catalog.version,hourlyCents:catalog.hourlyCents,materials,hours:work.hours,
    materialsCents,labourCents,subtotalCents:materialsCents+labourCents};
}

function estimateProject(catalog, selections) {
  if (!Array.isArray(selections) || !selections.length || selections.length > 100) {
    throw Error('Inclua entre 1 e 100 linhas de divisões.');
  }
  if (selections.length===1 && selections[0]?.kind==='specific') return specificEstimate(catalog,selections[0]);
  const lines = [];
  const prices = new Map(catalog.items.map(item=>[item.id,item]));
  let areaHundredths = 0, materialsExact = 0, labourExact = 0;
  for (const selection of selections) {
    const {room, area, trades} = selection || {};
    if (typeof room !== 'string' || !Object.hasOwn(rooms, room)) throw Error('Divisão inválida.');
    if (typeof area !== 'number' || !/^\d+(\.\d{1,2})?$/.test(String(area)) || area <= 0 || area > 10000000) {
      throw Error('Indique uma área total positiva, com até duas casas decimais.');
    }
    if (!Array.isArray(trades) || !trades.length || new Set(trades).size !== trades.length ||
        trades.some(id => !rooms[room][1].includes(id))) throw Error('Seleção de trabalhos inválida.');
    areaHundredths += Math.round(area * 100);
    for (const trade of rooms[room][1].filter(id => trades.includes(id))) {
      const c = catalog.compositions[room + '-' + trade];
      const baseMaterials = c.materials.map(({materialId,quantity})=>({...prices.get(materialId),quantity}));
      const baseCents = baseMaterials.reduce((sum, item) => sum + item.quantity * item.unitCents, 0);
      const hours = c.baseHours * area / c.baseArea;
      const previousMaterials = Math.round(materialsExact), previousLabour = Math.round(labourExact);
      materialsExact += baseCents * area / c.baseArea;
      labourExact += hours * catalog.hourlyCents;
      if (!Number.isSafeInteger(Math.round(materialsExact + labourExact))) throw Error('Estimativa fora do intervalo suportado.');
      // Round running totals so line amounts reconcile with the projection.
      const materialsCents = Math.round(materialsExact) - previousMaterials;
      const labourCents = Math.round(labourExact) - previousLabour;
      lines.push({id:trade, room, area, name:c.name, baseArea:c.baseArea, baseHours:c.baseHours,
        baseMaterials, hours, materialsCents, labourCents, subtotalCents:materialsCents + labourCents});
    }
  }
  const materialsCents = Math.round(materialsExact), labourCents = Math.round(labourExact);
  return {area:areaHundredths / 100, version:catalog.version, hourlyCents:catalog.hourlyCents, lines,
    materialsCents, labourCents, subtotalCents:materialsCents + labourCents};
}

function estimateBathroom(catalog, {area, trades}) {
  if (area > 10000) throw Error('A área máxima de WC neste pedido é 10 000 m².');
  const result = estimateProject(catalog, [{room:'wc',area,trades}]);
  return {...result, baseArea:result.lines[0].baseArea};
}
module.exports = {estimateProject, estimateBathroom};
