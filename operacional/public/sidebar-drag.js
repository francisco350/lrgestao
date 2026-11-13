'use strict';
window.LinoSidebarDrag = (() => {
  const min = 0, closeThreshold = 24, desktop = matchMedia('(min-width: 951px)');
  let visible = null, stopDrag = null;
  function mount(sidebar) {
    stopDrag?.();
    const root = sidebar.parentElement;
    const breadcrumb = root.querySelector('.breadcrumb');
    const heading = document.createElement('div');
    heading.className = 'sidebar-workspace-heading';
    breadcrumb.before(heading);
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'sidebar-restore-button';
    restore.setAttribute('aria-label', 'Mostrar barra lateral');
    restore.title = 'Mostrar barra lateral';
    sidebar.id = 'workspace-sidebar';
    restore.setAttribute('aria-controls', sidebar.id);
    restore.setAttribute('aria-expanded', 'false');
    restore.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    heading.append(restore, breadcrumb);
    const edge = document.createElement('div');
    edge.className = 'sidebar-drag-edge';
    edge.tabIndex = 0;
    edge.setAttribute('role', 'separator');
    edge.setAttribute('aria-label', 'Arrastar a barra lateral');
    edge.setAttribute('aria-orientation', 'vertical');
    root.append(edge);
    restore.onclick = () => {
      visible = null;
      update();
      edge.focus({preventScroll: true});
    };
    update();
    edge.onpointerdown = event => {
      if (!desktop.matches || event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX, startWidth = currentWidth(), previous = visible;
      edge.setPointerCapture(event.pointerId);
      document.body.classList.add('sidebar-drag-active');
      edge.onpointermove = move => { visible = snap(startWidth + move.clientX - startX); update(); };
      stopDrag = (cancel = false) => {
        edge.onpointermove = edge.onpointerup = edge.onpointercancel = edge.onlostpointercapture = null;
        document.body.classList.remove('sidebar-drag-active');
        if (edge.hasPointerCapture(event.pointerId)) edge.releasePointerCapture(event.pointerId);
        if (cancel) { visible = previous; update(); }
        stopDrag = null;
      };
      edge.onpointerup = () => stopDrag?.();
      edge.onlostpointercapture = () => stopDrag?.();
      edge.onpointercancel = () => stopDrag?.(true);
    };
    edge.onkeydown = event => {
      if (!desktop.matches) return;
      const step = event.shiftKey ? 40 : 10;
      const widths = {ArrowLeft: currentWidth() - step, ArrowRight: Math.max(closeThreshold, currentWidth()) + step, Home: min, End: maximum()};
      if (!(event.key in widths)) return;
      event.preventDefault(); visible = snap(widths[event.key]); update();
    };
    function maximum() { return parseFloat(getComputedStyle(root).getPropertyValue('--sidebar-full-width')) || 240; }
    function clamp(value) { return Math.max(min, Math.min(maximum(), value)); }
    function snap(value) { const width = clamp(value); return width <= closeThreshold ? min : width; }
    function currentWidth() { return clamp(visible ?? maximum()); }
    function update() {
      root.style.setProperty('--sidebar-visible-width', `${currentWidth()}px`);
      sidebar.inert = desktop.matches && currentWidth() === min;
      restore.hidden = !sidebar.inert;
      root.classList.toggle('sidebar-is-hidden', sidebar.inert);
      edge.setAttribute('aria-valuemin', min);
      edge.setAttribute('aria-valuemax', maximum());
      edge.setAttribute('aria-valuenow', Math.round(currentWidth()));
    }
    sidebar._updateDrag = update;
  }
  window.addEventListener('resize', () => {
    stopDrag?.();
    document.querySelector('.sidebar')?._updateDrag?.();
  });
  return {mount};
})();
