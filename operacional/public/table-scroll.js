'use strict';

// Measure real rows: descriptions and action buttons do not have a fixed height.
(() => {
  const tracked = new Map();
  let frame;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(refresh);
  };
  const resize = new ResizeObserver(schedule);
  let textDialog;
  function revealText(cell) {
    if (!textDialog) {
      textDialog = document.createElement('dialog');
      textDialog.className = 'table-text-dialog';
      textDialog.innerHTML = '<h2 id="table-text-heading"></h2><p></p><form method="dialog"><button class="btn" autofocus>Fechar</button></form>';
      textDialog.setAttribute('aria-labelledby', 'table-text-heading');
      document.body.append(textDialog);
    }
    const header = cell.closest('table').tHead.rows[0].cells[cell.cellIndex];
    textDialog.querySelector('h2').textContent = header.textContent.trim();
    textDialog.querySelector('p').textContent = cell.innerText.trim();
    textDialog.showModal();
  }
  function enableTextDisclosure(table) {
    for (const cell of table.querySelectorAll('tbody td')) {
      const allowed = ['identity', 'text'].includes(cell.dataset.column);
      let button = cell.querySelector(':scope > .table-text-open');
      const clipped = allowed && [cell, ...cell.querySelectorAll('strong,small,.movement-link')]
        .some(element => element.scrollWidth > element.clientWidth + 1);
      if (clipped && !button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'table-text-open';
        button.setAttribute('aria-haspopup', 'dialog');
        button.addEventListener('click', event => { event.stopPropagation(); revealText(cell); });
        cell.append(button);
      }
      if (button) {
        button.hidden = !clipped;
        button.setAttribute('aria-label', 'Ver conteúdo completo: ' + table.tHead.rows[0].cells[cell.cellIndex].textContent.trim());
      }
      cell.classList.toggle('table-text-expandable', clipped);
    }
  }
  function alignColumns(table) {
    if (table.closest('.hours-grid')) return; // Daily matrices have their own column layout.
    const headers = Array.from(table.tHead.rows[0].cells);
    const rows = Array.from(table.rows).slice(1).filter(row => row.cells.length === headers.length);
    const names = headers.map(th => th.textContent.trim());
    const primary = names.findIndex(name => /^(Cliente|Obra|Nome|Funcionário|Artigo|Material|Descrição|Movimento|Orçamento|Trabalho ou material|Divisão e trabalhos|Categoria|Cobrança)(?:$| \/)/i.test(name));
    headers.forEach((header, index) => {
      const name = names[index];
      const cells = rows.map(row => row.cells[index]);
      const action = name === 'Ações' || (!name && cells.some(cell => cell.querySelector('button,a')));
      const monetary = /^(?:Valor|Preço|Custo|Remuneração|Subtotal|Despesas|Materiais|Mão de obra|Total indicativo|Total a pagar|Pago|Previsto|Apurado|Abertura|Saldo|Diferença|Por receber|Por pagar|Falta receber|Em falta|Recebido|Cobrado|Gasto|Liquidações|Outros gastos|Trabalho cobrado)(?:$| )/i.test(name)
        || cells.some(cell => /^\s*[-+−]?[\d\s.,]+€/.test(cell.firstChild?.textContent || ""));
      const state = /Estado|Perfil|Periodicidade/i.test(name) || cells.some(cell => cell.querySelector('.badge'));
      const text = /Cliente|Obra|Nome|Funcionário|Artigo|Material|Descrição|Movimento|Orçamento|Trabalho ou material|Divisão e trabalhos|Categoria|Cobrança|Localidade|Equipa|Fornecedor|Contactos|Referência|Motivo|Observação|Utilizador|Operação/i.test(name);
      const role = action ? 'actions' : monetary ? 'amount' : state ? 'status' : index === primary ? 'identity' : text ? 'text' : '';
      for (const cell of [header, ...cells]) {
        if (role) cell.dataset.column = role;
        else delete cell.dataset.column;
      }
      for (const cell of cells) {
        // Some older tables put sibling buttons directly in the action cell.
        // Give those the same single-row geometry as every other action group.
        if (action && !cell.querySelector('.row-actions') && cell.querySelector('.btn')) {
          const group = document.createElement('div');
          group.className = 'row-actions';
          group.append(...cell.childNodes);
          cell.append(group);
        }
        if (role === 'identity' || role === 'text') {
          cell.title = cell.innerText.trim().replace(/\s+/g, ' ');
        }
      }
    });
  }
  function refresh() {
    frame = null;
    for (const [wrap, info] of tracked) {
      if (!wrap.isConnected || wrap.querySelector('table') !== info.table) {
        resize.unobserve(info.table);
        info.note.remove();
        tracked.delete(wrap);
      }
    }
    for (const wrap of document.querySelectorAll('.table-wrap')) {
      const table = wrap.querySelector('table');
      if (!table || !wrap.getClientRects().length || !table.getBoundingClientRect().height) continue;
      if (!tracked.has(wrap)) {
        const note = document.createElement('p');
        note.className = 'table-scroll-note';
        wrap.after(note);
        tracked.set(wrap, {table, note, originalLabel: wrap.getAttribute('aria-label')});
        resize.observe(table);
      }
      alignColumns(table);
      const info = tracked.get(wrap);
      const mobile = window.matchMedia('(max-width: 760px)').matches;
      if (mobile || mobile !== info.mobile || wrap.clientWidth !== info.width) {
        wrap.classList.remove('mobile-records');
        info.mobile = mobile;
        info.width = wrap.clientWidth;
        if (mobile && wrap.scrollWidth > wrap.clientWidth + 1) {
          const headers = Array.from(table.tHead.rows[0].cells, th => th.innerText.trim().replace(/\s+/g, ' '));
          for (const section of [...table.tBodies, ...(table.tFoot ? [table.tFoot] : [])]) {
            for (const row of section.rows) {
              for (const cell of row.cells) {
                if (cell.colSpan === 1) cell.dataset.fieldLabel = headers[cell.cellIndex] || '';
              }
            }
          }
          wrap.classList.add('mobile-records');
        }
      }
      enableTextDisclosure(table);
      const rows = [...table.tBodies].flatMap(body => [...body.rows]);
      // Short tables stay natural. Long tables show the header and first 10 rows.
      const limit = rows.length > 10
        ? Math.ceil(rows[9].getBoundingClientRect().bottom - table.getBoundingClientRect().top + 1)
        : Math.ceil(table.getBoundingClientRect().height + 1);
      wrap.style.setProperty('--table-row-limit', `${limit}px`);
      const vertical = wrap.scrollHeight > wrap.clientHeight + 2;
      const horizontal = wrap.scrollWidth > wrap.clientWidth + 2;
      const scrollable = vertical || horizontal;
      wrap.setAttribute('tabindex', scrollable ? '0' : '-1');
      wrap.setAttribute('role', 'region');
      const title = info.originalLabel || wrap.closest('.panel')?.querySelector('h2')?.textContent || 'Tabela de dados';
      const directions = [vertical && 'Desloque dentro da tabela para ver mais linhas.', horizontal && 'Desloque na horizontal para ver todas as colunas.'].filter(Boolean).join(' ');
      wrap.setAttribute('aria-label', `${title}${directions ? '. ' + directions : ''}`);
      const text = scrollable ? `${rows.length} linha(s). ${directions}` : '';
      if (info.note.textContent !== text) info.note.textContent = text;
      info.note.hidden = !scrollable;
    }
  }
  new MutationObserver(schedule).observe(document.body, {childList: true, subtree: true});
  window.addEventListener('resize', schedule);
  // A closed details element can contain a previously unmeasurable table.
  document.addEventListener('toggle', schedule, true);
  document.fonts?.ready.then(schedule);
  schedule();
})();
