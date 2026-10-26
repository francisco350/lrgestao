'use strict';
let hoursOwner='',hoursFilter={mode:'week',date:today(),employee:'',project:''};
function hoursScope(){
  if(hoursOwner!==current.id){hoursOwner=current.id;hoursFilter={mode:'week',date:today(),employee:'',project:''};}
  const choices=HoursReport.options(state);
  if(hoursFilter.employee&&!choices.employees.some(e=>e.id===hoursFilter.employee))hoursFilter.employee='';
  if(hoursFilter.project&&!choices.projects.some(p=>p.id===hoursFilter.project))hoursFilter.project='';
}
function hoursReport(){hoursScope();return HoursReport.build(state,hoursFilter);}
function hoursView(){
  const report=hoursReport(),r=report.range,t=report.totals,c=report.counts;
  const date=d=>new Date(d+'T12:00:00Z').toLocaleDateString('pt-PT',{timeZone:'UTC'});
  const dayLabel=d=>new Date(d+'T12:00:00Z').toLocaleDateString('pt-PT',{timeZone:'UTC',weekday:'short'});
  const h=n=>n?hours(n):'—';
  return heading('Mapa de horas','Consulte as horas por funcionário e obra, com o detalhe de cada dia.',btn('Exportar resumo CSV','hours-summary')+btn('Exportar detalhe CSV','hours-detail'))+
    `<section class="panel hours-filter-panel"><form id="hours-filters" class="hours-filters">${select('mode','Período do mapa',[['week','Semanal'],['month','Mensal']],hoursFilter.mode)}${input('date','Data de referência',hoursFilter.date,'date','required')}${optionalSelect('employee','Funcionário no mapa',[['','Todos os disponíveis'],...report.options.employees.map(e=>[e.id,e.name])],hoursFilter.employee)}${optionalSelect('project','Obra no mapa',[['','Todas as disponíveis'],...report.options.projects.map(p=>[p.id,p.name])],hoursFilter.project)}<div class="actions"><button type="submit" class="btn primary">Aplicar ao mapa</button><button type="button" class="btn" data-action="hours-clear">Limpar filtros</button></div></form><div class="hours-period"><div class="actions">${btn('← Anterior','hours-prev')}${btn('Período atual','hours-current')}${btn('Seguinte →','hours-next')}</div><strong>${date(r.from)} — ${date(r.until)}</strong><small>${hoursFilter.mode==='week'?'Segunda-feira a domingo':'Mês completo'} · Dados da última atualização</small></div></section>`+
    `<section class="stats hours-stats">${stat('Horas validadas',hours(t.approved),'Contam para os apuramentos')}${stat('Horas por validar',hours(t.pending),'Registos e turnos terminados')}${stat('Funcionários com registos',t.people,'Nos filtros selecionados')}${stat('Obras com registos',t.projects,'Nos filtros selecionados')}</section>`+
    `<div class="notice">Turnos abertos, rejeitados e registos substituídos não entram nos totais. Pedidos de correção mantêm o horário em vigor até à decisão. A ausência de registo não significa falta; não há cálculo de horas extra.</div>`+
    (c.open||c.corrections||c.review?`<div class="hours-alert"><span>${c.open} turno(s) aberto(s) · ${c.corrections} correção(ões) por decidir · ${c.review} turno(s) sem duração apurável (inferiores a um minuto ou superiores a 48h). Estes avisos respeitam o período e os filtros.</span>${btn('Consultar ponto','open-clock')}</div>`:'')+
    panel('Resumo por funcionário e obra','Horas validadas e horas por validar em colunas separadas.',table(['Funcionário','Obra','Validadas','Por validar'],report.pairs.map(row=>`<tr><td><strong>${esc(row.employeeName)}</strong></td><td>${esc(row.projectName)}</td><td class="number">${hours(row.approved)}</td><td class="number">${hours(row.pending)}</td></tr>`)))+
    panel('Distribuição diária','Cada célula mostra o tempo validado e, por baixo, o tempo por validar. Deslize horizontalmente para consultar todos os dias.',
      `<div class="hours-grid table-wrap" tabindex="0" role="region" aria-label="Mapa diário de horas"><table><thead><tr><th>Funcionário / obra</th>${r.days.map(d=>`<th>${dayLabel(d)}<small>${d.slice(8)}/${d.slice(5,7)}</small></th>`).join('')}<th>Total validado</th><th>Total por validar</th></tr></thead><tbody>${report.pairs.length?report.pairs.map(row=>`<tr><th scope="row">${esc(row.employeeName)}<small>${esc(row.projectName)}</small></th>${r.days.map(d=>{const v=row.days[d]||{};return `<td>${h(v.approved)}${v.pending?`<small class="hours-pending">${hours(v.pending)} por validar</small>`:''}</td>`;}).join('')}<td><strong>${hours(row.approved)}</strong></td><td>${hours(row.pending)}</td></tr>`).join(''):`<tr><td colspan="${r.days.length+3}"><div class="empty">Sem registos neste período e nos filtros selecionados.</div></td></tr>`}</tbody>${report.pairs.length?`<tfoot><tr><th>Total diário</th>${report.daily.map(d=>`<td>${h(d.approved)}${d.pending?`<small class="hours-pending">${hours(d.pending)} por validar</small>`:''}</td>`).join('')}<td>${hours(t.approved)}</td><td>${hours(t.pending)}</td></tr></tfoot>`:''}</table></div>`).replace('class="panel"','class="panel activity-panel"')+
    panel('Registos incluídos','O CSV de detalhe contém estes mesmos registos. Os valores são minutos completos e não incluem remunerações.',table(['Data','Funcionário / obra','Origem','Estado','Tempo'],report.details.map(d=>`<tr><td>${date(d.date)}</td><td><strong>${esc(d.employeeName)}</strong><small>${esc(d.projectName)}</small></td><td>${esc(d.source)}</td><td>${badge(d.status==='approved'?'Validado':'Por validar',d.status==='pending'?'amber':'')}</td><td>${hours(d.minutes)}</td></tr>`))).replace('class="panel"','class="panel activity-panel"');
}
function exportHours(kind){
  const report=hoursReport(),csv=HoursReport.csv(report,kind);
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download=`lino-horas-${kind==='summary'?'resumo':'detalhe'}-${report.range.from}-${report.range.until}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('CSV exportado com o período e os filtros apresentados no mapa.');
}
document.addEventListener('submit',e=>{
  if(e.target.id!=='hours-filters')return;e.preventDefault();const proposed=Object.fromEntries(new FormData(e.target));
  try{HoursReport.build(state,proposed);hoursFilter=proposed;render();}catch(error){toast(error.message);}
});
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-action]');if(!el||!el.dataset.action.startsWith('hours-'))return;
  try{
    const action=el.dataset.action;
    if(action==='hours-summary'||action==='hours-detail')return exportHours(action==='hours-summary'?'summary':'detail');
    if(action==='hours-clear'){hoursFilter.employee='';hoursFilter.project='';}
    else if(action==='hours-current')hoursFilter.date=today();
    else if(action==='hours-prev'||action==='hours-next'){
      const range=HoursReport.period(hoursFilter.mode,hoursFilter.date),step=action==='hours-prev'?-1:1;
      hoursFilter.date=hoursFilter.mode==='week'?HoursReport.addDays(range.from,step*7):HoursReport.addDays(step<0?range.from:range.until,step);
    }
    render();
  }catch(error){toast(error.message);}
});
