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
  return `<div class="directory-search" role="search" aria-label="${esc(label)}"><label class="field" for="directory-search-input">${esc(label)}<input type="search" id="directory-search-input" data-directory="${key}" placeholder="${esc(placeholder)}" value="${esc(query)}" autocomplete="off" aria-controls="directory-results"></label><button type="button" class="btn" data-clear-directory="${key}" ${query ? '' : 'disabled'}>Limpar pesquisa</button><span class="directory-count" role="status" aria-live="polite" aria-atomic="true">${result.count}</span></div><div id="directory-results">${result.content}</div>`;
}
function updateDirectory(input) {
  const key = input.dataset.directory;
  directoryQueries[key] = input.value;
  const result = directoryResult(key);
  document.querySelector('#directory-results').innerHTML = result.content;
  document.querySelector('.directory-count').textContent = result.count;
  document.querySelector('[data-clear-directory]').disabled = !input.value;
}
document.addEventListener('input', event => {
  if (event.target.matches('[data-directory]')) updateDirectory(event.target);
});
document.addEventListener('click', event => {
  if (!event.target.closest('[data-clear-directory]')) return;
  const input = document.querySelector('#directory-search-input');
  input.value = '';
  updateDirectory(input);
  input.focus();
});
