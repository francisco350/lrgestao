// Apply the preference before styles load, including when storage is unavailable.
(() => {
  'use strict';
  const key = 'lino-gestao-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference;
  try { preference = localStorage.getItem(key); } catch {}
  const valid = value => value === 'dark' || value === 'light';
  function apply() {
    const dark = valid(preference) ? preference === 'dark' : system.matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111b18' : '#172f29');
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.setAttribute('aria-pressed', String(dark));
      button.title = dark ? 'Ativar modo claro' : 'Ativar modo noturno';
    });
  }
  window.LinoTheme = {
    button() {
      const dark = document.documentElement.dataset.theme === 'dark';
      return `<button type="button" class="btn small theme-toggle" data-theme-toggle aria-label="Modo noturno" aria-pressed="${dark}" title="${dark ? 'Ativar modo claro' : 'Ativar modo noturno'}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20.5 13.1A8.5 8.5 0 0 1 10.9 3.5a8.5 8.5 0 1 0 9.6 9.6Z"/></svg><span>Modo noturno</span></button>`;
    }
  };
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-theme-toggle]')) return;
    preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, preference); } catch {}
    apply();
  });
  system.addEventListener('change', () => { if (!valid(preference)) apply(); });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) { preference = event.newValue; apply(); }
  });
  apply();
})();
