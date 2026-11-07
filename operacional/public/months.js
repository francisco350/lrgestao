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

function dateRangeFields(fromId,untilId,from,until){
  return `<div class="period-date-range"><label class="range-field">De<input id="${fromId}" type="date" aria-label="Início do período" value="${from}"></label><label class="range-field">Até<input id="${untilId}" type="date" aria-label="Fim do período" value="${until}"></label></div>`;
}
