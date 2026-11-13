'use strict';
let hoursOwner='',hoursFilter={mode:'week',date:today(),employee:'',project:''};
function hoursScope(){
  if(hoursOwner!==current.id){hoursOwner=current.id;hoursFilter={mode:state.monthlyHistory?.length?'month':'week',date:today(),employee:'',project:''};}
  const choices=HoursReport.options(state);
  for(const [key,list] of [['employee',choices.employees],['project',choices.projects]])hoursFilter[key]=HoursReport.selected(hoursFilter[key]).filter(id=>list.some(x=>x.id===id));
}
function hoursReport(){hoursScope();return HoursReport.build(state,hoursFilter);}
// Keep each daily matrix readable even when a report covers a full month.
function dailyHoursTables(report) {
  if (!report.pairs.length) return '<div class="empty">Sem registos neste período e nos filtros selecionados.</div>';
  const days = report.range.days;
  const tables = [];
  const dayLabel = new Intl.DateTimeFormat('pt-PT', {weekday:'short', timeZone:'UTC'});
  const cell = ({approved = 0, pending = 0} = {}) =>
    '<td>' + (approved ? hours(approved) : '—') +
    (pending ? '<small class="hours-pending">' + hours(pending) + ' por validar</small>' : '') + '</td>';
  const totals = values => ['approved', 'pending'].map(key =>
    '<td>' + hours(values.reduce((sum, value) => sum + (value?.[key] || 0), 0)) + '</td>').join('');
  for (let start = 0; start < days.length; start += 7) {
    const group = days.slice(start, start + 7);
    const label = fullDate(group[0]) + (group.length > 1 ? ' — ' + fullDate(group.at(-1)) : '');
    const headings = group.map(date => '<th scope="col">' + dayLabel.format(new Date(date + 'T12:00Z')) +
      '<small>' + date.slice(8) + '/' + date.slice(5,7) + '</small></th>').join('');
    const rows = report.pairs.map(row => {
      const values = group.map(date => row.days[date]);
      return '<tr><th scope="row">' + esc(row.employeeName) + '<small>' + esc(row.projectName) +
        '</small></th>' + values.map(value => cell(value)).join('') + totals(values) + '</tr>';
    }).join('');
    const daily = report.daily.slice(start, start + group.length);
    tables.push(`<h3 class="hours-block-title">${label}</h3>
      <div class="hours-grid table-wrap" aria-label="Mapa diário de horas · ${label}"><table>
      <thead><tr><th scope="col">Funcionário / obra</th>${headings}<th scope="col">Total validado</th><th scope="col">Total por validar</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><th scope="row">Total diário</th>${daily.map(cell).join('')}${totals(daily)}</tr></tfoot>
      </table></div>`);
  }
  return tables.join('');
}
function hoursView(){
  const report=hoursReport(),r=report.range,t=report.totals,c=report.counts;
  const date=d=>new Date(d+'T12:00:00Z').toLocaleDateString('pt-PT',{timeZone:'UTC'});
  const monthly=r.mode==='month',withImported=monthly||r.mode==='all';
  return heading('Mapa de horas','Consulte as horas por funcionário e obra, com o detalhe de cada dia.',btn('Exportar resumo CSV','hours-summary')+btn('Exportar detalhe CSV','hours-detail'))+
    `<div class="section-stack report-page">${reportPeriodNavigation('hours',hoursFilter)}<section class="panel hours-filter-panel">${reportFilters('hours',hoursFilter,report.options,[['approved','Validado'],['pending','Por validar'],['imported','Importado (mensal)']])}</section>`+
    `<section class="stats hours-stats">${withImported?stat(monthly?'Total do mês':'Total validado e importado',hours(t.approved+report.imported),hours(report.imported)+' importadas · exclui horas por validar'):''}${stat('Horas validadas',hours(t.approved),'Contam para os apuramentos')}${stat('Horas por validar',hours(t.pending),'Registos e turnos terminados')}${stat('Funcionários com registos',t.people,'Nos filtros selecionados')}${stat('Obras com registos',t.projects,'Nos filtros selecionados')}</section>`+
    `<details class="notice info-disclosure"><summary>Informação</summary><div>Turnos abertos, rejeitados e registos substituídos não entram nos totais. Pedidos de correção mantêm o horário em vigor até à decisão. A ausência de registo não significa falta; não há cálculo de horas extra.</div></details>`+
    (c.open||c.corrections||c.review?`<div class="hours-alert"><span>${c.open} turno(s) aberto(s) · ${c.corrections} correção(ões) por decidir · ${c.review} turno(s) sem duração apurável (inferiores a um minuto ou superiores a 48h). Estes avisos respeitam o período e os filtros.</span>${btn('Consultar ponto','open-clock')}</div>`:'')+
    reportTablePanel('hours',r,'Resumo por funcionário e obra',withImported?'O total soma as horas validadas e as importadas do Excel. Só os registos com data aparecem na distribuição diária.':'Horas validadas e por validar no período.',table(['Funcionário','Obra','Validadas','Por validar',...(withImported?['Importadas',monthly?'Total do mês':'Total']:[])],report.summaryRows.map(row=>`<tr><td><strong>${esc(row.employeeName)}</strong></td><td>${esc(row.projectName)}</td><td>${hours(row.approved)}</td><td>${hours(row.pending)}</td>${withImported?`<td>${hours(row.imported)}</td><td>${hours(row.approved+row.imported)}</td>`:''}</tr>`)))+
    reportTablePanel('hours',r,'Distribuição diária','Horas validadas e por validar por dia, funcionário e obra.',dailyHoursTables(report)).replace('class="panel"','class="panel activity-panel"')+
    reportTablePanel('hours',r,'Registos incluídos','O CSV de detalhe contém estes mesmos registos. Os valores são minutos completos e não incluem remunerações.',table(['Data','Funcionário / obra','Origem','Estado','Tempo'],report.details.map(d=>`<tr><td>${date(d.date)}</td><td><strong>${esc(d.employeeName)}</strong><small>${esc(d.projectName)}</small></td><td>${esc(d.source)}</td><td>${badge(d.status==='approved'?'Validado':'Por validar',d.status==='pending'?'amber':'')}</td><td>${hours(d.minutes)}</td></tr>`))).replace('class="panel"','class="panel activity-panel"')+'</div>';
}
function exportHours(kind){
  const report=hoursReport(),csv=HoursReport.csv(report,kind);
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
  const period=report.range.mode==='all'?'todas-as-datas':`${report.range.from}-${report.range.until}`;
  a.href=url;a.download=`lino-horas-${kind==='summary'?'resumo':'detalhe'}-${period}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('CSV exportado com o período e os filtros apresentados no mapa.');
}
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-action]');if(!el||!el.dataset.action.startsWith('hours-'))return;
  try{
    const action=el.dataset.action;
    if(action==='hours-summary'||action==='hours-detail')return exportHours(action==='hours-summary'?'summary':'detail');
  }catch(error){toast(error.message);}
});
