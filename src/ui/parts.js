import { esc, money, money2, signedMoney, num, pct, dateLabel, monthLabel, MONTHS, int, monthKeyOf } from '../core/format.js';
import { catName, catColor, state, accountsList, accountName } from '../core/store.js';
import { yearsWithData, monthsWithData } from '../core/calc.js';
import { icon } from './icons.js';
import { options } from './dom.js';

/** حالة الفترة المختارة — مشتركة بين الصفحات */
export const view = {
  year: new Date().getFullYear(),
  month: 'all',
};

export function kpi({ label, value, sub = '', tone = '', ic = '' }) {
  return `<div class="kpi ${tone}">
    <div class="kpi-l">${ic ? icon(ic) : ''}<span>${esc(label)}</span></div>
    <div class="kpi-v">${value}</div>
    ${sub ? `<div class="kpi-s">${sub}</div>` : ''}
  </div>`;
}

export function summaryKpis(s) {
  return `<div class="kpis">
    ${kpi({ label: 'الإيرادات', value: money(s.inc), sub: money2(s.inc2), tone: 'pos', ic: 'trending-up' })}
    ${kpi({ label: 'المصروفات', value: money(s.exp), sub: money2(s.exp2), tone: 'neg', ic: 'trending-down' })}
    ${kpi({ label: 'الصافي', value: money(s.net), sub: money2(s.net2), tone: s.net >= 0 ? 'pos' : 'neg', ic: 'scale' })}
    ${kpi({ label: 'معدل الادخار', value: pct(s.saveRate, 1), sub: `${num(s.count)} عملية`, tone: s.saveRate >= 20 ? 'pos' : s.saveRate >= 0 ? 'warn' : 'neg', ic: 'pig-money' })}
  </div>`;
}

export function txRow(t, { showDate = true } = {}) {
  const inc = t.type === 'income';
  const tr = t.type === 'transfer';
  const multi = accountsList().length > 1;
  const meta = tr
    ? `${esc(accountName(t.accountId))} ← ${esc(accountName(t.toAccountId))}`
    : `${esc(catName(t.catId))}${multi ? ` · ${esc(accountName(t.accountId))}` : ''}`;
  const badges = `${t.recurringId ? icon('refresh', 'mini') : ''}${t.debtId ? icon('cash', 'mini') : ''}`;
  return `<button class="tx" data-act="edit-tx" data-id="${esc(t.id)}">
    <span class="tx-dot" style="--c:${esc(catColor(t.catId))}">${icon(tr ? 'arrows-diff' : inc ? 'trending-up' : 'receipt')}</span>
    <span class="tx-main">
      <span class="tx-desc">${esc(t.desc || catName(t.catId))}${badges}</span>
      <span class="tx-meta">${meta}${showDate ? ` · ${dateLabel(t.date)}` : ''}${t.note ? ` · ${esc(t.note)}` : ''}</span>
    </span>
    <span class="tx-amt ${tr ? 'muted' : inc ? 'pos' : 'neg'}">
      <b>${tr ? money(t.amount, 2) : signedMoney(t.amount, 2, inc ? '+' : '-')}</b>
      <small>${money2(t.amount2)}</small>
    </span>
  </button>`;
}

export function bar(label, value, max, color, right) {
  const w = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return `<div class="bar-row">
    <span class="bar-lbl" title="${esc(label)}">${esc(label)}</span>
    <span class="bar-track"><span class="bar-fill" style="width:${w.toFixed(1)}%;background:${esc(color)}"></span></span>
    <span class="bar-val">${right ?? money(value)}</span>
  </div>`;
}

export function progress(ratio, tone) {
  const p = Math.max(0, Math.min(100, ratio * 100));
  const t = tone || (ratio >= 1 ? 'neg' : ratio >= 0.8 ? 'warn' : 'pos');
  return `<div class="progress ${t}"><span style="width:${p.toFixed(1)}%"></span></div>`;
}

export function card(title, ic, content, extra = '') {
  return `<section class="card">
    <header class="card-h">${icon(ic)}<h2>${esc(title)}</h2>${extra ? `<div class="card-x">${extra}</div>` : ''}</header>
    ${content}
  </section>`;
}

export function yearSelect(id = 'sel-year', withAll = false) {
  const ys = yearsWithData(state.transactions);
  if (!ys.includes(Number(view.year)) && view.year !== 'all') ys.push(Number(view.year));
  const opts = [...(withAll ? [['all', 'كل السنوات']] : []), ...ys.sort((a, b) => b - a).map((y) => [y, int(y)])];
  return `<select id="${id}" class="select" data-change="year" aria-label="السنة">${options(opts, view.year)}</select>`;
}

/** شريط شهور السنة المختارة (الشهور التي بها بيانات مميزة) */
export function monthChips(year) {
  const has = new Set(monthsWithData(state.transactions));
  const chips = MONTHS.map((m, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    return `<button class="chip ${view.month === key ? 'active' : ''} ${has.has(key) ? '' : 'dim'}" data-act="month" data-key="${key}">${m}</button>`;
  }).join('');
  return `<div class="chips" role="tablist"><button class="chip ${view.month === 'all' ? 'active' : ''}" data-act="month" data-key="all">كل السنة</button>${chips}</div>`;
}

export function periodLabel() {
  if (view.month !== 'all') return monthLabel(view.month);
  return view.year === 'all' ? 'كل الفترات' : `سنة ${int(view.year)}`;
}

/** التأكد من أن الشهر المختار ينتمي للسنة المختارة */
export function syncPeriod() {
  if (view.month !== 'all' && view.year !== 'all' && monthKeyOf(view.month).slice(0, 4) !== String(view.year)) view.month = 'all';
}
