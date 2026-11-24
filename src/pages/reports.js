import { state, catName, catColor } from '../core/store.js';
import { summarize, filterTx, monthlySeries, byCategory, compareMonths, cumulative, forecast, monthsWithData, sortByDateDesc, previousMonthWithData } from '../core/calc.js';
import { esc, money, money2, num, pct, signed, monthLabel, monthName, monthKeyOf, int } from '../core/format.js';
import { view, summaryKpis, kpi, txRow, bar, card, yearSelect } from '../ui/parts.js';
import { drawChart, themeColors } from '../ui/charts.js';
import { emptyState, options, $ } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const TABS = [
  ['monthly', 'شهري', 'calendar-stats'],
  ['categories', 'الفئات', 'category'],
  ['compare', 'مقارنة', 'arrows-diff'],
  ['cashflow', 'التدفق', 'chart-line'],
  ['forecast', 'التوقعات', 'crystal-ball'],
];
const local = { tab: 'monthly', month: null, m1: null, m2: null, incG: 0, expG: 0 };

function yearOrCurrent() {
  return view.year === 'all' ? new Date().getFullYear() : view.year;
}

// ---------- شهري ----------
function monthly(root) {
  const months = monthsWithData(state.transactions);
  if (!local.month || !months.includes(local.month)) local.month = months.includes(view.month) ? view.month : months[months.length - 1];
  const k = local.month;
  const rows = sortByDateDesc(state.transactions.filter((t) => monthKeyOf(t.date) === k));
  const s = summarize(rows);
  const exp = byCategory(rows, state.categories, 'expense');
  const inc = byCategory(rows, state.categories, 'income');
  return `
    <div class="period"><select class="select" data-change="month" aria-label="الشهر">${options(months.slice().reverse().map((m) => [m, monthLabel(m)]), k)}</select></div>
    ${summaryKpis(s)}
    <div class="grid-2">
      ${card('المصروفات حسب الفئة', 'chart-pie', exp.length ? exp.map((c) => bar(catName(c.catId), c.total, exp[0].total, catColor(c.catId), `${money(c.total)} <small>${pct(c.share)}</small>`)).join('') : '<p class="muted">لا توجد مصروفات</p>')}
      ${card('الإيرادات حسب الفئة', 'trending-up', inc.length ? inc.map((c) => bar(catName(c.catId), c.total, inc[0].total, catColor(c.catId))).join('') : '<p class="muted">لا توجد إيرادات</p>')}
    </div>
    ${card(`عمليات ${monthLabel(k)}`, 'list-details', `<div class="tx-list">${rows.map((t) => txRow(t)).join('')}</div>`)}`;
}

// ---------- الفئات ----------
function categories() {
  const y = yearOrCurrent();
  const list = filterTx(state.transactions, { year: y });
  const activeMonths = new Set(list.map((t) => monthKeyOf(t.date))).size || 1;
  const section = (type, title) => {
    const cats = byCategory(list, state.categories, type);
    if (!cats.length) return '';
    return `<h3 class="sec-h">${esc(title)}</h3>
      <div class="kpis">${cats.map((c) => kpi({ label: catName(c.catId), value: money(c.total), sub: `${pct(c.share, 1)} · ${num(c.count)} عملية · متوسط ${money(c.total / activeMonths)}/شهر` })).join('')}</div>
      <div class="grid-2">${cats
        .map((c) => {
          const items = c.items.slice(0, 8);
          return card(`${catName(c.catId)} — ${money(c.total)}`, 'tag', items.map(([d, v]) => bar(d, v, items[0][1], catColor(c.catId))).join(''));
        })
        .join('')}</div>`;
  };
  return `<div class="period">${yearSelect()}</div>
    ${list.length ? section('expense', 'المصروفات') + section('income', 'الإيرادات') : emptyState('category', `لا توجد بيانات في ${int(y)}`)}`;
}

// ---------- مقارنة ----------
function compare() {
  const months = monthsWithData(state.transactions);
  if (months.length < 1) return emptyState('arrows-diff', 'لا توجد بيانات كافية للمقارنة');
  if (!local.m2 || !months.includes(local.m2)) local.m2 = months[months.length - 1];
  if (!local.m1 || !months.includes(local.m1)) local.m1 = previousMonthWithData(state.transactions, local.m2);
  const { s1, s2, cats } = compareMonths(state.transactions, state.categories, local.m1, local.m2);
  const opts = months.slice().reverse().map((m) => [m, monthLabel(m)]);
  const pill = (d, goodWhenUp) => `<span class="pill ${d === 0 ? '' : (d > 0) === goodWhenUp ? 'pos' : 'neg'}">${signed(d)}</span>`;
  return `
    <div class="period cmp-sel">
      <select class="select" data-change="m1" aria-label="الشهر الأول">${options(opts, local.m1)}</select>
      ${icon('arrows-diff')}
      <select class="select" data-change="m2" aria-label="الشهر الثاني">${options(opts, local.m2)}</select>
    </div>
    <div class="kpis">
      ${kpi({ label: `إيرادات ${monthName(local.m2)}`, value: money(s2.inc), sub: pill(s2.inc - s1.inc, true), tone: 'pos' })}
      ${kpi({ label: `مصروفات ${monthName(local.m2)}`, value: money(s2.exp), sub: pill(s2.exp - s1.exp, false), tone: 'neg' })}
      ${kpi({ label: `صافي ${monthName(local.m2)}`, value: money(s2.net), sub: pill(s2.net - s1.net, true), tone: s2.net >= 0 ? 'pos' : 'neg' })}
      ${kpi({ label: 'معدل الادخار', value: pct(s2.saveRate, 1), sub: `كان ${pct(s1.saveRate, 1)}` })}
    </div>
    ${card('حسب الفئة', 'category', `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>الفئة</th><th>${esc(monthLabel(local.m1))}</th><th>${esc(monthLabel(local.m2))}</th><th>الفرق</th></tr></thead>
      <tbody>${cats.map((c) => `<tr><td><i class="dot" style="background:${esc(catColor(c.catId))}"></i>${esc(catName(c.catId))}</td><td>${num(c.v1)}</td><td>${num(c.v2)}</td><td>${pill(c.diff, c.cat?.type === 'income')}</td></tr>`).join('')}
      <tr class="total"><td>الصافي</td><td>${num(s1.net)}</td><td>${num(s2.net)}</td><td>${pill(s2.net - s1.net, true)}</td></tr></tbody></table></div>`)}
    ${card('مقارنة بصرية', 'chart-histogram', `<div class="chart-box"><canvas id="ch-cmp" role="img" aria-label="مقارنة الشهرين"></canvas></div>`)}`;
}

// ---------- التدفق ----------
function cashflow() {
  const y = yearOrCurrent();
  const series = monthlySeries(state.transactions, y);
  const active = series.filter((m) => m.hasData);
  if (!active.length) return `<div class="period">${yearSelect()}</div>${emptyState('chart-line', `لا توجد بيانات في ${int(y)}`)}`;
  const cum = cumulative(series);
  const tot = summarize(active.flatMap((m) => m.rows));
  const best = [...active].sort((a, b) => b.net - a.net)[0];
  const worst = [...active].sort((a, b) => a.net - b.net)[0];
  const pos = [
    [`إجمالي الإيرادات (${num(active.length)} شهر)`, money(tot.inc), 'pos'],
    [`إجمالي المصروفات (${num(active.length)} شهر)`, money(tot.exp), 'neg'],
    ['الصافي التراكمي', money(tot.net), tot.net >= 0 ? 'pos' : 'neg'],
    ['متوسط الصافي الشهري', money(tot.net / active.length), tot.net >= 0 ? 'pos' : 'neg'],
    ['أفضل شهر', `${monthName(best.key)} (${money(best.net)})`, 'info'],
    ['أضعف شهر', `${monthName(worst.key)} (${money(worst.net)})`, worst.net >= 0 ? '' : 'neg'],
    ['معدل الادخار الفعلي', pct(tot.saveRate, 1), tot.saveRate >= 10 ? 'pos' : 'neg'],
  ];
  return `<div class="period">${yearSelect()}</div>
    ${card(`التدفق النقدي التراكمي ${int(y)}`, 'chart-line', `<div class="chart-box tall"><canvas id="ch-cf" role="img" aria-label="التدفق النقدي التراكمي"></canvas></div>`)}
    <div class="grid-2">
      ${card('ملخص شهري', 'receipt', `<div class="table-wrap"><table class="tbl"><thead><tr><th>الشهر</th><th>إيرادات</th><th>مصروفات</th><th>الصافي</th><th>التراكمي</th></tr></thead><tbody>
        ${series.map((m, i) => (m.hasData ? `<tr><td>${monthName(m.key)}</td><td class="pos">${num(m.inc)}</td><td class="neg">${num(m.exp)}</td><td class="${m.net >= 0 ? 'pos' : 'neg'}"><b>${signed(m.net)}</b></td><td>${num(cum[i])}</td></tr>` : '')).join('')}
      </tbody></table></div>`)}
      ${card('المركز المالي', 'coins', pos.map(([l, v, t]) => `<div class="kv"><span>${esc(l)}</span><b class="${t}">${v}</b></div>`).join(''))}
    </div>`;
}

// ---------- التوقعات ----------
function forecastOut() {
  const y = yearOrCurrent();
  const f = forecast(state.transactions, y, { incGrowth: local.incG, expGrowth: local.expG });
  const rate = Number(state.settings.rate) || 1;
  const future = f.rows.filter((r) => !r.actual);
  return `
    <div class="kpis">
      ${kpi({ label: 'إيرادات السنة (متوقع)', value: money(f.yearInc), sub: money2(f.yearInc * rate), tone: 'pos' })}
      ${kpi({ label: 'مصروفات السنة (متوقع)', value: money(f.yearExp), sub: money2(f.yearExp * rate), tone: 'neg' })}
      ${kpi({ label: 'صافي نهاية العام', value: money(f.yearNet), sub: money2(f.yearNet * rate), tone: f.yearNet >= 0 ? 'pos' : 'neg' })}
      ${kpi({ label: 'معدل الادخار السنوي', value: pct(f.saveRate, 1), tone: f.saveRate >= 20 ? 'pos' : f.saveRate >= 0 ? 'warn' : 'neg' })}
    </div>
    <p class="muted small">الأساس: متوسط آخر ${num(f.baseMonths)} شهر فعلي — إيرادات ${money(f.baseInc)} ومصروفات ${money(f.baseExp)} شهرياً. القيم بـ ${esc(state.settings.cur2)} محسوبة بسعر ${num(rate, 2)}.</p>
    ${card('الفعلي والمتوقع', 'chart-histogram', `<div class="chart-box tall"><canvas id="ch-fc" role="img" aria-label="الإيرادات والمصروفات الفعلية والمتوقعة"></canvas></div>
      <div class="legend"><span><i style="background:var(--income)"></i>إيرادات</span><span><i style="background:var(--expense)"></i>مصروفات</span><span><i class="hatch"></i>متوقع (فاتح)</span></div>`)}
    ${future.length ? card('الأشهر القادمة', 'calendar', `<div class="table-wrap"><table class="tbl"><thead><tr><th>الشهر</th><th>إيرادات</th><th>مصروفات</th><th>الصافي</th></tr></thead><tbody>
      ${future.map((r) => `<tr><td>${monthName(r.key)}</td><td class="pos">${num(r.inc)}</td><td class="neg">${num(r.exp)}</td><td class="${r.net >= 0 ? 'pos' : 'neg'}"><b>${signed(r.net)}</b></td></tr>`).join('')}
      </tbody></table></div>`) : ''}`;
}

function forecastTab() {
  return `<div class="period">${yearSelect()}</div>
    ${card('ضبط التوقع', 'settings', `<div class="row-2">
      <label class="field"><span>نمو الإيرادات شهرياً: <b id="v-incg">${pct(local.incG, 1)}</b></span><input type="range" id="sl-incg" min="-10" max="10" step="0.5" value="${local.incG}"></label>
      <label class="field"><span>نمو المصروفات شهرياً: <b id="v-expg">${pct(local.expG, 1)}</b></span><input type="range" id="sl-expg" min="-10" max="10" step="0.5" value="${local.expG}"></label>
    </div>`)}
    <div id="fc-out">${forecastOut()}</div>`;
}

function drawFor(root) {
  const c = themeColors();
  if (local.tab === 'compare' && $('#ch-cmp', root)) {
    const { cats } = compareMonths(state.transactions, state.categories, local.m1, local.m2);
    drawChart($('#ch-cmp', root), {
      type: 'bar',
      data: {
        labels: cats.map((x) => catName(x.catId)),
        datasets: [
          { label: monthLabel(local.m1), data: cats.map((x) => Math.round(x.v1)), backgroundColor: c.muted, borderRadius: 5, maxBarThickness: 22 },
          { label: monthLabel(local.m2), data: cats.map((x) => Math.round(x.v2)), backgroundColor: c.primary, borderRadius: 5, maxBarThickness: 22 },
        ],
      },
      options: { plugins: { legend: { display: true, position: 'bottom', rtl: true } } },
    });
  }
  if (local.tab === 'cashflow' && $('#ch-cf', root)) {
    const series = monthlySeries(state.transactions, yearOrCurrent());
    const cum = cumulative(series);
    drawChart($('#ch-cf', root), {
      type: 'line',
      data: {
        labels: series.map((m) => monthName(m.key).slice(0, 3)),
        datasets: [{ label: 'التراكمي', data: cum.map((v) => (v == null ? null : Math.round(v))), borderColor: c.info, backgroundColor: c.info + '22', fill: true, cubicInterpolationMode: 'monotone', pointBackgroundColor: cum.map((v) => (v >= 0 ? c.income : c.expense)), pointRadius: series.map((m) => (m.hasData ? 4 : 0)) }],
      },
    });
  }
  if (local.tab === 'forecast' && $('#ch-fc', root)) {
    const f = forecast(state.transactions, yearOrCurrent(), { incGrowth: local.incG, expGrowth: local.expG });
    drawChart($('#ch-fc', root), {
      type: 'bar',
      data: {
        labels: f.rows.map((r) => monthName(r.key).slice(0, 3)),
        datasets: [
          { label: 'إيرادات', data: f.rows.map((r) => Math.round(r.inc)), backgroundColor: f.rows.map((r) => (r.actual ? c.income : c.income + '66')), borderRadius: 4, maxBarThickness: 16 },
          { label: 'مصروفات', data: f.rows.map((r) => Math.round(r.exp)), backgroundColor: f.rows.map((r) => (r.actual ? c.expense : c.expense + '66')), borderRadius: 4, maxBarThickness: 16 },
        ],
      },
    });
  }
}

export default {
  title: 'التقارير',
  mount(root, ctx) {
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) {
        local.tab = t.dataset.tab;
        ctx.rerender();
        window.scrollTo({ top: 0 });
      }
    });
    root.addEventListener('change', (e) => {
      const k = e.target.dataset.change;
      if (!k) return;
      if (k === 'year') view.year = Number(e.target.value);
      else local[k] = e.target.value;
      if (k === 'year') view.month = 'all';
      ctx.rerender();
    });
    root.addEventListener('input', (e) => {
      if (e.target.id === 'sl-incg' || e.target.id === 'sl-expg') {
        local.incG = Number($('#sl-incg', root).value);
        local.expG = Number($('#sl-expg', root).value);
        $('#v-incg', root).textContent = pct(local.incG, 1);
        $('#v-expg', root).textContent = pct(local.expG, 1);
        $('#fc-out', root).innerHTML = forecastOut();
        drawFor(root);
      }
    });
  },
  render(root) {
    if (!state.transactions.length) {
      root.innerHTML = emptyState('chart-histogram', 'لا توجد بيانات للتقارير بعد', 'أضف عملياتك أولاً لتظهر التقارير هنا');
      return;
    }
    const body = { monthly, categories, compare, cashflow, forecast: forecastTab }[local.tab]();
    root.innerHTML = `
      <nav class="tabs" role="tablist">${TABS.map(([k, l, ic]) => `<button role="tab" aria-selected="${local.tab === k}" class="tab ${local.tab === k ? 'active' : ''}" data-tab="${k}">${icon(ic)}<span>${l}</span></button>`).join('')}</nav>
      <div class="tab-body">${body}</div>`;
    drawFor(root);
  },
};
