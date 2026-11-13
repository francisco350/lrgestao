'use strict';
const selectedMonths = new Map();
function monthRange(month) {
  if (!month) return {from:'',until:''};
  const [year, number] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return {from:month+'-01',until:month+'-'+last};
}
function currentMonthRange(){return monthRange(today().slice(0,7));}
function monthFor(section) {
  let range;
  if(section==='pagamentos') range={from:start,until:end};
  if(section==='obra') range=financeRange;
  if(section==='custos') range={from:costFrom,until:costUntil};
  if(section==='recebimentos') range=receiptRange;
  if(section==='trabalho') range=workFilter;
  if(!range) return selectedMonths.get(section)??today().slice(0,7);
  const month=(range.from||'').slice(0,7);
  const full=monthRange(month);
  return full.from===range.from && full.until===range.until ? month : '';
}
function setMonth(section,month) {
  selectedMonths.set(section,month);
  const {from,until}=monthRange(month);
  if(section==='pagamentos'){start=from||'0001-01-01';end=until||today();}
  if(section==='obra')financeRange={from,until};
  if(section==='custos'){costFrom=from;costUntil=until;}
  if(section==='recebimentos')receiptRange={from,until};
  if(section==='trabalho'){checkWorkScope();Object.assign(workFilter,{from,until});}
  if(section==='horas'&&month){hoursScope();hoursFilter.mode='month';hoursFilter.date=from;}
}
function monthPicker(section, extraFilters='') {
  const month=monthFor(section);
  const customRange=(section==='obra'&&(financeRange.from||financeRange.until))||(section==='recebimentos'&&(receiptRange.from||receiptRange.until))||
    (section==='custos'&&(costFrom||costUntil))||
    (section==='trabalho'&&(workFilter.from||workFilter.until))||
    (section==='pagamentos'&&start!=='0001-01-01');
  const periodLabel=customRange?'Intervalo personalizado':section==='obra'?'Toda a obra':'Todas as datas';
  return `<section class="month-filter" data-month-section="${section}" aria-label="Período de consulta">
    <div class="month-navigation">
      <button type="button" class="btn" data-month-step="-1" aria-label="Mês anterior">‹</button>
      <label class="month-field">
        <input class="month-input" type="month" aria-label="Mês de consulta" data-month-input value="${month}">
        ${month?'':`<span aria-hidden="true">${periodLabel}</span>`}
      </label>
      <button type="button" class="btn" data-month-step="1" aria-label="Mês seguinte">›</button>
    </div>
    <div class="month-shortcuts">
      <button type="button" class="btn" data-month-step="today">Este mês</button>
      <button type="button" class="btn" data-month-step="all">${section==='obra'?'Toda a obra':'Todas as datas'}</button>
    </div>
    ${extraFilters}
  </section>`;
}
document.addEventListener('change',e=>{
  if(!e.target.matches('[data-month-input]'))return;
  setMonth(e.target.closest('[data-month-section]').dataset.monthSection,e.target.value);render();
});
document.addEventListener('click',e=>{
  const control=e.target.closest('[data-month-step]');
  if(!control)return;
  const section=control.closest('[data-month-section]').dataset.monthSection,step=control.dataset.monthStep;
  let month=today().slice(0,7);
  if(step==='all')month='';
  else if(step!=='today'){
    const [y,m]=(monthFor(section)||month).split('-').map(Number);
    month=new Date(Date.UTC(y,m-1+Number(step),1)).toISOString().slice(0,7);
  }
  setMonth(section,month);render();
});
function inMonth(date,month){return !month||date.slice(0,7)===month;}
function balanceAt(charge,month){
  return balanceAtDate(charge,monthRange(month).until);
}
function balanceAtDate(charge,cutoff){
  if(!cutoff)return outstanding(charge);
  if(charge.due>cutoff||charge.voided&&!charge.voidedAt)return 0;
  if(charge.voided&&charge.voidedAt.slice(0,10)<=cutoff)return 0;
  return money(charge.amount-paidAt(charge.id,cutoff));
}
function paidAt(id,cutoff){
  return money(state.receipts.filter(r=>r.charge===id&&r.date<=cutoff&&(!r.voided||r.voidedAt?.slice(0,10)>cutoff)).reduce((s,r)=>s+r.amount,0));
}

function dateRangeFields(fromId,untilId,from,until,named=false){
  return `<div class="period-date-range"><label class="range-field">De<input id="${fromId}" ${named?'name="from" required':''} type="date" aria-label="Início do período" value="${from}"></label><label class="range-field">Até<input id="${untilId}" ${named?'name="until" required':''} type="date" aria-label="Fim do período" value="${until}"></label></div>`;
}

function reportChecks(name,label,options,values){
  const chosen=HoursReport.selected(values);
  const titles=options.filter(([id])=>chosen.includes(id)).map(([,title])=>title);
  const value=titles.length?titles.join(', '):'Todos';
  return `<div class="report-select"><span id="report-${name}-label" class="report-field-label">${esc(label)}</span>
    <button type="button" class="report-select-input" aria-labelledby="report-${name}-label report-${name}-value" aria-expanded="false" aria-controls="report-${name}-options"><span id="report-${name}-value" title="${esc(value)}">${esc(value)}</span><span class="report-select-arrow" aria-hidden="true"></span></button>
    <div id="report-${name}-options" class="report-select-options" role="group" aria-labelledby="report-${name}-label" hidden>${options.length?options.map(([id,title])=>`<label><input type="checkbox" name="${name}" value="${esc(id)}" ${chosen.includes(id)?'checked':''}><span>${esc(title)}</span></label>`).join(''):'<p>Sem opções disponíveis.</p>'}</div></div>`;
}
function reportTablePanel(kind, range, title, description, body) {
  const {from, until} = range;
  let dates = 'Todas as datas';
  if (from && until) dates = from === until ? fullDate(from) : fullDate(from) + ' — ' + fullDate(until);
  else if (from) dates = 'Desde ' + fullDate(from);
  else if (until) dates = 'Até ' + fullDate(until);
  const buttons = [[-1,'Período anterior','‹'], [0,'Período atual','Atual'], [1,'Período seguinte','›']];
  const navigation = `<div class="table-period" role="group" aria-label="Período · ${esc(title)}">
    <strong>${esc(dates)}</strong><div class="table-period-buttons">${buttons.map(([step,label,text]) =>
      `<button type="button" form="${kind}-filters" class="btn" data-report-step="${step}" aria-label="${label}" title="${label}">${text}</button>`).join('')}</div></div>`;
  return panel(title, description, body, navigation);
}
function reportPeriodState(f){
  const mode=f.mode||'month',reference=f.date||f.from;
  const date=reference&&reference>='1900-01-01'?reference:today();
  return {mode,date};
}
function reportWeekValue(date){
  const thursday=new Date(date+'T12:00:00Z');
  thursday.setUTCDate(thursday.getUTCDate()+3-(thursday.getUTCDay()+6)%7);
  const year=thursday.getUTCFullYear();
  const week=Math.ceil(((thursday-new Date(year+'-01-01T12:00:00Z'))/86400000+1)/7);
  return `${year}-W${String(week).padStart(2,'0')}`;
}
function reportPeriodNavigation(kind,f){
  const {mode,date}=reportPeriodState(f);
  const type={month:'month',week:'week',day:'date'}[mode];
  const title={month:'Mês',week:'Semana',day:'Dia'}[mode];
  const currentLabel={month:'Este mês',week:'Esta semana',day:'Hoje'}[mode];
  const value=mode==='month'?date.slice(0,7):mode==='week'?reportWeekValue(date):date;
  const all=f.from===''&&f.until==='';
  return `<section class="month-filter report-date-navigation" aria-label="Navegação do período ${kind==='hours'?'do mapa de horas':'dos registos'}">
    <div class="month-navigation">
      <button type="button" form="${kind}-filters" class="btn" data-report-step="-1" aria-label="Período anterior">‹</button>
      <label class="month-field"><input class="month-input" type="${type}" form="${kind}-filters" data-report-date aria-label="${title} de consulta" value="${all?'':value}">${all?'<span aria-hidden="true">Todas as datas</span>':''}</label>
      <button type="button" form="${kind}-filters" class="btn" data-report-step="1" aria-label="Período seguinte">›</button>
    </div>
    <div class="month-shortcuts">
      <button type="button" form="${kind}-filters" class="btn" data-report-step="0">${currentLabel}</button>
      <button type="button" form="${kind}-filters" class="btn" data-report-all>Todas as datas</button>
    </div>
  </section>`;
}
function reportFilters(kind,f,choices,statuses){
  const {mode,date}=reportPeriodState(f);
  const period=HoursReport.period(mode,date);
  const from=f.from??period.from,until=f.until??period.until;
  const dateFields=dateRangeFields(kind+'-from',kind+'-until',from,until,true);
  return `<form id="${kind}-filters" class="report-filters">
  <div class="report-selection-controls">${reportChecks('project','Obras',choices.projects.map(x=>[x.id,x.name]),f.project)}${reportChecks('employee','Funcionários',choices.employees.map(x=>[x.id,x.name]),f.employee)}${reportChecks('status','Estados',statuses,f.status)}</div>
  <div class="report-period-controls">
  <div class="report-period-field"><div class="report-period-heading"><label for="${kind}-mode">Período</label></div><select id="${kind}-mode" name="mode">${[['month','Mensal'],['week','Semanal'],['day','Diário']].map(([value,title])=>`<option value="${value}" ${mode===value?'selected':''}>${title}</option>`).join('')}</select></div>
  <input type="hidden" name="date" value="${date}">
  ${dateFields.replaceAll(' required','')}</div>
  <div class="report-filter-actions actions"><button class="btn primary" type="submit">${kind==='hours'?'Aplicar ao mapa':'Aplicar aos registos'}</button><button class="btn" type="button" data-report-clear>Limpar filtros</button></div></form>`;
}

function closeReportSelect(control,restoreFocus=false){
  control.querySelector('.report-select-input').setAttribute('aria-expanded','false');
  control.querySelector('.report-select-options').hidden=true;
  if(restoreFocus)control.querySelector('button').focus();
}
document.addEventListener('click',e=>{
  const button=e.target.closest('.report-select-input');
  document.querySelectorAll('.report-select').forEach(control=>{
    if(!control.contains(e.target))closeReportSelect(control);
  });
  if(button){
    const open=button.getAttribute('aria-expanded')!=='true';
    button.setAttribute('aria-expanded',String(open));
    button.nextElementSibling.hidden=!open;
  }
});
document.addEventListener('change',e=>{
  const control=e.target.closest('.report-select');if(!control)return;
  const text=[...control.querySelectorAll('input:checked')].map(input=>input.nextElementSibling.textContent).join(', ')||'Todos';
  const value=control.querySelector('.report-select-input>span');value.textContent=text;value.title=text;
});
document.addEventListener('keydown',e=>{
  const control=e.target.closest('.report-select');if(!control)return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeReportSelect(control,true);}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();control.querySelector('button').setAttribute('aria-expanded','true');control.querySelector('.report-select-options').hidden=false;
    const options=[...control.querySelectorAll('input')],index=options.indexOf(document.activeElement);
    const next=index<0?(e.key==='ArrowDown'?0:options.length-1):(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;
    options[next]?.focus();
  }
});
document.addEventListener('focusin',e=>document.querySelectorAll('.report-select').forEach(control=>{if(!control.contains(e.target))closeReportSelect(control);}));
function applyReportForm(form,step,clear=false,periodChanged=false,all=false){
  const data=new FormData(form),mode=data.get('mode');let date=data.get('date');if(!date)return;
  if(step!=null)date=step===0?today():HoursReport.step(mode,date,step);
  const range=all?{from:'',until:''}:step!=null||periodChanged?HoursReport.period(mode,date):{from:data.get('from'),until:data.get('until')};
  const untilInput=form.elements.until;
  untilInput.setCustomValidity(range.from&&range.until&&range.from>range.until?'A data de fim deve ser igual ou posterior à data de início.':'');
  if(!form.reportValidity())return;
  const f={mode,date:range.from||date,...range};for(const k of ['project','employee','status'])f[k]=clear?[]:data.getAll(k);
  if(form.id==='work-filters')workFilter=f;
  else hoursFilter=f;
  render();
}
document.addEventListener('submit',e=>{if(!e.target.matches('.report-filters'))return;e.preventDefault();applyReportForm(e.target);});
document.addEventListener('change',e=>{
  const input=e.target;
  if(input.matches('[data-report-date]')){
    if(!input.value)return;
    const form=input.form,mode=form.elements.mode.value;
    let date=input.value;
    if(mode==='month')date+='-01';
    if(mode==='week'){
      const [year,week]=date.split('-W');
      const monday=HoursReport.period('week',year+'-01-04').from;
      const day=new Date(monday+'T12:00:00Z');
      day.setUTCDate(day.getUTCDate()+(Number(week)-1)*7);
      date=day.toISOString().slice(0,10);
    }
    form.elements.date.value=date;
    applyReportForm(form,null,false,true);
  }else if(input.closest('.report-filters')&&['mode','from','until'].includes(input.name))applyReportForm(input.form,null,false,input.name==='mode');
});
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-report-step],[data-report-clear],[data-report-all]');
  if(!b)return;
  applyReportForm(b.form,b.hasAttribute('data-report-step')?Number(b.dataset.reportStep):null,b.hasAttribute('data-report-clear'),false,b.hasAttribute('data-report-all'));
});
