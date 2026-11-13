'use strict';

function bindEstimateEditor(container, catalog, save) {
  const items = [...catalog.items].sort((a,b)=>a.name.localeCompare(b.name,'pt'));
  const compositions = catalog.compositions;
  const compositionName = c => {
    const room = catalog.rooms.find(r=>r.id===c.room).name;
    return c.trade==='geral' ? room : room+' · '+c.name;
  };
  const options = compositions.map(c=>`<option value="${esc(c.id)}">${esc(compositionName(c))}</option>`).join('');
  container.querySelector('#estimate-editor').innerHTML = `<details class="catalog-materials"><summary>Consultar e editar materiais (${items.length})</summary>
    <label class="field">Pesquisar material<input type="search" placeholder="Nome do material"></label>
    <div data-material-list></div>
  </details>
  <div class="catalog-composition"><label class="field">Composição de referência<select aria-label="Composição de referência">${options}</select></label>
    <button class="btn" type="button" data-composition>Editar composição</button>
  </div>`;

  const cents = euros => Math.round(Number(euros)*100);
  const materialList = container.querySelector('[data-material-list]');
  function renderItems(search='') {
    const matches = items.filter(i=>directoryMatches([i.name, i.unit], search));
    materialList.innerHTML = table(['Material','Unidade','Preço unitário',''],matches.map(i=>
      `<tr><td>${esc(i.name)}</td><td>${esc(i.unit)}</td><td>${euro(i.unitCents/100)}</td>
      <td><button class="btn" type="button" data-material="${esc(i.id)}" aria-label="Editar ${esc(i.name)}">Editar</button></td></tr>`));
  }
  renderItems();
  container.querySelector('input[type=search]').oninput = event=>renderItems(event.target.value);
  materialList.onclick = event=>{
    const button=event.target.closest('[data-material]');
    if (button) editMaterial(items.find(i=>i.id===button.dataset.material));
  };
  function editMaterial(item) {
    modal(item?'Editar material':'Adicionar material',`
      <label class="field full">Nome do material<input name="name" required maxlength="250" value="${esc(item?.name)}"></label>
      <label class="field">Unidade<input name="unit" required maxlength="30" placeholder="m², m, un…" value="${esc(item?.unit)}"></label>
      <label class="field">Preço por unidade (€)<input name="price" type="number" required step="0.01" min="0" max="100000" value="${item ? item.unitCents/100 : ''}"></label>`,
      data=>save({type:'material',id:item?.id,name:data.name,unit:data.unit,unitCents:cents(data.price)}));
  }
  container.querySelector('[data-new-material]').onclick = ()=>editMaterial();
  container.querySelector('[data-rate]').onclick = ()=>modal('Editar mão de obra',`
    <label class="field full">Preço cobrado ao cliente (€/h)<input name="rate" type="number" required step="0.01" min="0.01" max="100000" value="${catalog.hourlyCents/100}"></label>`,
    data=>save({type:'hourlyRate',hourlyCents:cents(data.rate)}));
  container.querySelector('[data-composition]').onclick = ()=>{
    const id=container.querySelector('.catalog-composition select').value;
    const c=compositions.find(entry=>entry.id===id);
    modal('Editar composição · '+compositionName(c),`
      <label class="field">Área de referência (m²)<input name="area" type="number" required min="0.01" max="10000" step="0.01" value="${c.baseArea}"></label>
      <label class="field">Horas de mão de obra<input name="hours" type="number" required min="0" max="100000" step="0.001" value="${c.baseHours}"></label>
      <div class="field full"><strong>Materiais para esta área</strong><div id="composition-materials"></div>
        <button type="button" class="btn" id="composition-add">Associar material</button></div>`,
      data=>save({type:'composition',id,baseArea:Number(data.area),baseHours:Number(data.hours),
        materials:[...list.children].map(row=>({materialId:row.querySelector('select').value,quantity:row.querySelector('input').valueAsNumber}))}));
    const list=document.querySelector('#composition-materials');
    const materialOptions=items.map(i=>`<option value="${esc(i.id)}">${esc(i.name)} (${esc(i.unit)})</option>`).join('');
    function add(line) {
      const row=document.createElement('div');
      row.className='catalog-material-row';
      row.innerHTML=`<label class="field">Material<select aria-label="Material" required><option value="">Escolher material</option>${materialOptions}</select></label>
        <label class="field">Quantidade<input type="number" required min="0" max="100000" step="0.001"></label>
        <button type="button" class="btn">Retirar</button>`;
      row.querySelector('select').value=line?.materialId??'';
      row.querySelector('input').value=line?.quantity??1;
      row.querySelector('button').onclick=()=>row.remove();
      list.append(row);
      return row;
    }
    c.materials.forEach(add);
    document.querySelector('#composition-add').onclick=()=>add().querySelector('select').focus();
  };
}
