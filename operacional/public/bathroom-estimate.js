'use strict';

function bathroomEstimateView() {
  return heading('Simulador de orçamentos', 'Calcule os trabalhos de cada divisão com o preçário da empresa.',
    '<button class="btn" id="manage-estimate-catalog" disabled>Gerir preçário</button>') +
    '<div id="estimate-workspace" aria-live="polite">A carregar o preçário…</div>';
}

async function openEstimateWorkspace() {
  const host = document.querySelector('#estimate-workspace');
  if (!host) return;
  try {
    const catalog = await api('estimate-catalog');
    if (host.isConnected) showEstimateForm(host, catalog);
  } catch (error) { host.textContent = error.message; }
}

function showEstimateForm(host, catalog, draft) {
  const getRoom = id => catalog.rooms.find(room => room.id === id);
  host.innerHTML = '<div data-simulation>'+panel('Divisões da obra','Agrupe divisões com a mesma área ou adicione linhas para áreas diferentes.', `
    <form id="project-estimate" class="estimate-form">
      <div class="estimate-rooms"></div>
      <div class="actions"><button type="button" class="btn" data-add>Adicionar divisão</button>
      <button type="button" class="btn" data-map>Carregar obra de exemplo</button></div>
      <label class="field estimate-note">Outros trabalhos por orçamentar (opcional)
        <input name="pending" maxlength="400" placeholder="Ex. remoção de azulejos"></label>
      <button class="btn primary" type="submit">Calcular estimativa</button>
      <span class="form-error" role="alert"></span>
    </form>`) + '<div id="estimate-result" aria-live="polite"></div><div data-saved></div></div>' +
    `<section class="panel estimate-settings" hidden><header class="estimate-settings-head">
      <div><h2>Preçário da empresa</h2><p>Mão de obra a ${euro(catalog.hourlyCents/100)}/h · ${catalog.items.length} materiais</p></div>
      <div class="actions"><button class="btn" type="button" data-rate>Editar mão de obra</button>
      <button class="btn" type="button" data-new-material>Adicionar material</button></div>
    </header>
    <div id="estimate-editor" class="estimate-form"></div>
    <details class="estimate-reference"><summary>Importar preçário de Excel</summary>
    <form class="estimate-form" id="estimate-import">
      <label class="field">Substituir o preçário atual por um mapa de quantidades (.xlsx, até 3 MB)<input name="file" type="file" accept=".xlsx" required></label>
      <button class="btn" type="submit">Importar e usar este Excel</button>
      <span role="status"></span></form></details></section>`;
  const settings=host.querySelector('.estimate-settings');
  const simulation=host.querySelector('[data-simulation]');
  const saved=host.querySelector('[data-saved]');
  showSavedEstimates(saved);
  const manage=document.querySelector('#manage-estimate-catalog');
  manage.disabled=false;
  function setSettings(open){
    settings.hidden=!open;
    simulation.hidden=open;
    manage.textContent=open?'Voltar à simulação':'Gerir preçário';
    manage.setAttribute('aria-expanded',String(open));
  }
  setSettings(Boolean(draft?.settings));
  manage.onclick=()=>setSettings(settings.hidden);
  const form = host.querySelector('#project-estimate');
  const roomList = form.querySelector('.estimate-rooms');
  const result = host.querySelector('#estimate-result');
  const errorBox = form.querySelector('[role="alert"]');
  let revision = 0;
  const invalidate = () => { revision++; result.replaceChildren(); errorBox.textContent = ''; };

  function row(initial) {
    const item = document.createElement('fieldset');
    item.className = 'estimate-room';
    item.innerHTML = `<legend>Divisão</legend><div class="form-grid">
      <label class="field">Tipo de divisão<select name="room">${catalog.rooms.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></label>
      <label class="field">Quantidade de divisões<input name="copies" type="number" value="1" step="1" min="1" max="1000" required></label>
      <label class="field">Área por divisão (m²)<input name="area" type="number" inputmode="decimal" step="0.01" min="0.01" max="10000000" required></label>
      <label class="field">Trabalhos a incluir<select name="trade"></select></label>
      </div><button type="button" class="btn" data-remove>Remover divisão</button>`;
    const roomInput = item.querySelector('[name="room"]');
    const select = item.querySelector('[name="trade"]');
    function updateTrades() {
      const trades = getRoom(roomInput.value).trades;
      select.innerHTML = (trades.length > 1 ? '<option value="both">Eletricidade e pichelaria</option>' : '') +
        trades.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    }
    roomInput.value = initial?.room ?? 'wc';
    updateTrades();
    if (initial) {
      select.value = initial.trades.length === 1 ? initial.trades[0] : 'both';
      item.querySelector('[name="copies"]').value = initial.copies;
      item.querySelector('[name="area"]').value = initial.area;
    }
    roomInput.addEventListener('change', updateTrades);
    item.querySelector('[data-remove]').onclick = () => { item.remove(); invalidate(); };
    roomList.append(item);
  }
  if (draft) {
    draft.selections.forEach(row);
    form.elements.pending.value = draft.note;
  } else row();
  form.querySelector('[data-add]').onclick = () => { row(); invalidate(); roomList.lastChild.querySelector('select').focus(); };
  form.querySelector('[data-map]').onclick = () => {
    roomList.replaceChildren();
    for (const entry of catalog.defaults) {
      const cents = Math.round(entry.area * 100);
      // A project total with indivisible hundredths stays together on one line.
      const copies = cents % entry.quantity === 0 ? entry.quantity : 1;
      row({...entry,copies,area:cents / copies / 100});
    }
    invalidate();
  };
  form.addEventListener('input', invalidate);
  function readSelections() {
    return [...roomList.children].map(item=>{
      const room = item.querySelector('[name="room"]').value;
      const scope = item.querySelector('[name="trade"]').value;
      const trades = scope === 'both' ? getRoom(room).trades.map(t=>t.id) : [scope];
      return {room, copies:item.querySelector('[name="copies"]').value, area:item.querySelector('[name="area"]').value, trades};
    });
  }
  form.onsubmit = async event => {
    event.preventDefault();
    const selections = readSelections().map(s=>({room:s.room,trades:s.trades,area:Math.round(Number(s.area)*100)*Number(s.copies)/100}));
    if (!selections.length) { errorBox.textContent = 'Adicione pelo menos uma divisão.'; return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    const request = ++revision;
    try {
      const estimate = await api('estimate','POST',{version:catalog.version,selections});
      if (form.isConnected && revision === request) {
        const note=form.elements.pending.value.trim();
        result.innerHTML = estimateResult(estimate,note,getRoom)+'<button class="btn primary" data-save>Guardar orçamento</button>';
        const saveButton=result.querySelector('[data-save]');
        saveButton.onclick=()=>{
          if(!state.projects.length)return toast('Crie uma obra para poder associar o orçamento.');
          const id=crypto.randomUUID();
          modal('Guardar orçamento',`<label class="field full">Nome do orçamento<input name="title" maxlength="120" required></label>
            <label class="field full">Obra<select name="project" required><option value="">Escolher obra</option>${state.projects.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>`,
            async data=>{
              await api('project-estimates','POST',{id,title:data.title,project:data.project,note,selections,version:estimate.version});
              saveButton.remove();
              await showSavedEstimates(saved);
              toast('Orçamento guardado na obra.');
            });
        };
      }
    } catch (error) { if (revision === request) errorBox.textContent = error.message; }
    finally { button.disabled = false; }
  };
  const upload = host.querySelector('#estimate-import');
  function applyCatalog(next) {
    showEstimateForm(host,next,{selections:readSelections(),note:form.elements.pending.value,settings:true});
    manage.focus();
  }
  bindEstimateEditor(settings, catalog, async change=>{
    const next=await api('estimate-catalog/edit','POST',{...change,version:catalog.version});
    if (form.isConnected) { applyCatalog(next); toast('Preçário guardado.'); }
  });
  upload.onsubmit = async event => {
    event.preventDefault();
    const file = upload.elements.file.files[0];
    const message = upload.querySelector('[role="status"]');
    if (!file || !/\.xlsx$/i.test(file.name) || file.size > 3*1024*1024) { message.textContent = 'Selecione um ficheiro .xlsx até 3 MB.'; return; }
    const button = upload.querySelector('button');
    button.disabled = true;
    message.textContent = 'A validar o mapa de quantidades…';
    try {
      const content = await new Promise((resolve,reject)=>{
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(Error('Não foi possível ler o ficheiro.'));
        reader.readAsDataURL(file);
      });
      const next = await api('estimate-catalog','POST',{version:catalog.version,content});
      if (upload.isConnected) {
        // Keep the administrator's current project; the map button loads the new workbook's example.
        applyCatalog(next);
        toast('Excel importado. O novo preçário está ativo.');
      }
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  };
}

async function showSavedEstimates(host,project='') {
  try {
    const {rows}=await api('project-estimates'+(project?'?project='+encodeURIComponent(project):''));
    if(!host.isConnected)return;
    host.innerHTML=panel('Orçamentos guardados',project?'Orçamentos associados a esta obra.':'Consulte cada orçamento com os preços da data em que foi guardado.',
      rows.length?table(['Orçamento','Obra','Data','Subtotal indicativo',''],rows.map(r=>
        `<tr><td>${esc(r.title)}</td><td>${esc(worksite(r.project)?.name??'Obra')}</td><td>${esc(new Date(r.created).toLocaleDateString('pt-PT'))}</td>
        <td>${euro(r.total_cents/100)}</td><td><button type="button" class="btn" data-quote="${esc(r.id)}">Consultar</button></td></tr>`)):
      '<p class="estimate-pending">Ainda não há orçamentos guardados.</p>')+'<div data-record aria-live="polite"></div>';
    let latest=0;
    host.onclick=async event=>{
      const button=event.target.closest('[data-quote]');
      if(!button)return;
      const request=++latest;
      try{
        const record=await api('project-estimates?id='+encodeURIComponent(button.dataset.quote));
        if(!host.isConnected||request!==latest)return;
        const output=host.querySelector('[data-record]');
        output.innerHTML=estimateResult(record.result,record.note,id=>({name:id==='wc'?'WC':id.charAt(0).toUpperCase()+id.slice(1)}),record.title);
        const close=document.createElement('button');
        close.type='button';
        close.className='icon-button quote-close';
        close.textContent='×';
        close.setAttribute('aria-label','Fechar orçamento');
        close.title='Fechar orçamento';
        output.querySelector('.panel-head').append(close);
        close.onclick=()=>{
          latest++;
          output.replaceChildren();
          button.focus();
        };
        close.focus({preventScroll:true});
        output.scrollIntoView({block:'start'});
      }catch(error){toast(error.message);}
    };
  }catch(error){host.textContent=error.message;}
}

function estimateResult(result, pending, getRoom, title) {
  const price = cents => euro(cents/100);
  const number = n => n.toLocaleString('pt-PT',{maximumFractionDigits:3});
  const label = line => esc(getRoom(line.room).name + (line.id === 'geral' ? '' : ' · ' + line.name));
  const rows = result.lines.map(line=>`<tr><td>${label(line)}</td><td>${number(line.area)} m²</td><td>${number(line.hours)} h</td>
    <td>${price(line.labourCents)}</td><td>${price(line.materialsCents)}</td><td>${price(line.subtotalCents)}</td></tr>`);
  rows.push(`<tr><td><strong>Subtotal indicativo</strong></td><td>${number(result.area)} m²</td><td></td><td>${price(result.labourCents)}</td>
    <td>${price(result.materialsCents)}</td><td><strong>${price(result.subtotalCents)}</strong></td></tr>`);
  const details = result.lines.map(line=>`<details class="estimate-reference"><summary>${label(line)} · referência de ${number(line.baseArea)} m²</summary>
    <p>${number(line.baseHours)} horas de referência</p>${table(['Material','Quantidade de referência','Preço unitário provisório'],line.baseMaterials.map(item=>
    `<tr><td>${esc(item.name)}</td><td>${number(item.quantity)} ${esc(item.unit)}</td><td>${price(item.unitCents)}</td></tr>`))}</details>`).join('');
  const areaLabel=`Estimativa para ${number(result.area)} m²`;
  return panel(title ? esc(title) : areaLabel,`${title ? areaLabel+'. ' : ''}Mão de obra a ${price(result.hourlyCents)}/h. Materiais provisórios. IVA por rever para esta obra.`,
    table(['Divisão e trabalhos','Área','Horas estimadas','Mão de obra','Materiais provisórios','Subtotal'],rows) +
    (pending ? `<p class="estimate-pending"><strong>Por orçamentar</strong> · ${esc(pending)}</p>` : '') + details);
}
