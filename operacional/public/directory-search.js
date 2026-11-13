'use strict';
const directoryQueries = {};
const directoryViews = {};
let directoryOwner;
const normalizeSearch = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-PT').trim();
function directoryMatches(values, query) {
  const text = values.map(normalizeSearch).join(' ');
  return normalizeSearch(query).split(/\s+/).filter(Boolean).every(term => text.includes(term));
}
function directoryResult(key) {
  const view = directoryViews[key];
  const filtered = view.rows.filter(row => directoryMatches(view.fields(row), directoryQueries[key] || ''));
  return {
    count: `${filtered.length} de ${view.rows.length} ${view.noun}`,
    content: !filtered.length && view.rows.length
      ? '<div class="empty">Sem resultados para esta pesquisa. Experimente outros termos ou limpe a pesquisa.</div>'
      : view.renderRows(filtered)
  };
}
function searchableDirectory(key, { label, placeholder, noun, rows, fields, renderRows }) {
  // A new session must not inherit searches made by another account.
  if (directoryOwner !== current?.id) {
    for (const name of Object.keys(directoryQueries)) delete directoryQueries[name];
    for (const name of Object.keys(directoryViews)) delete directoryViews[name];
    directoryOwner = current?.id;
  }
  directoryViews[key] = { noun, rows, fields, renderRows };
  const query = directoryQueries[key] || '';
  const result = directoryResult(key);
  return `<div class="directory-search" role="search" aria-label="${esc(label)}"><label class="field" for="directory-search-${key}">${esc(label)}<input type="search" id="directory-search-${key}" data-directory="${key}" placeholder="${esc(placeholder)}" value="${esc(query)}" autocomplete="off" aria-controls="directory-results-${key}"></label><button type="button" class="btn" data-clear-directory="${key}" ${query ? '' : 'disabled'}>Limpar pesquisa</button><span class="directory-count" role="status" aria-live="polite" aria-atomic="true">${result.count}</span></div><div id="directory-results-${key}">${result.content}</div>`;
}
function updateDirectory(input) {
  const key = input.dataset.directory;
  directoryQueries[key] = input.value;
  const result = directoryResult(key);
  const toolbar = input.closest('.directory-search');
  document.getElementById(`directory-results-${key}`).innerHTML = result.content;
  toolbar.querySelector('.directory-count').textContent = result.count;
  toolbar.querySelector('[data-clear-directory]').disabled = !input.value;
}
document.addEventListener('input', event => {
  if (event.target.matches('[data-directory]')) updateDirectory(event.target);
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-clear-directory]');
  if (!button) return;
  const input = button.closest('.directory-search').querySelector('input[type=search]');
  input.value = '';
  updateDirectory(input);
  input.focus();
});
