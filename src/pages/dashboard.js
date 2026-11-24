import { state, catName, catColor } from '../core/store.js';
import { summarize, filterTx, monthlySeries, byCategory, topExpenses, insights, budgetStatus, sortByDateDesc } from '../core/calc.js';
import { esc, money, num, pct, signed, monthName, currentMonthKey, int } from '../core/format.js';
import { view, summaryKpis, txRow, bar, progress, card, yearSelect, monthChips, periodLabel, syncPeriod } from '../ui/parts.js';
import { drawChart, themeColors } from '../ui/charts.js';
import { emptyState, openSheet, $ } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const LVL_IC = { danger: 'alert-circle', warn: 'alert-triangle', good: 'circle-check', info: 'info-circle' };
export const insightItem = (i) => `<div class="insight ${i.level}">${icon(LVL_IC[i.level])}<span>${esc(i.text)}</span></div>`;

function bannerDismissed() {
  try {
    return localStorage.getItem('myz.v2.loginBanner') === '0';
  } catch {
    return false;
  }
}

export default {
  title: 'الرئيسية',
  mount(root, ctx) {
    root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'month') {
        view.month = a.dataset.key;
        ctx.rerender();
      } else if (a.dataset.act === 'all-insights') {
        const list = insights(state.transactions, state.categories, state.settings, view.year);
        openSheet({ title: 'التنبيهات والملاحظات', body: `<div class="insights">${list.map(insightItem).join('') || '<p class="muted">لا توجد تنبيهات</p>'}</div>` });
      } else if (a.dataset.act === 'hide-banner') {
        try {
          localStorage.setItem('myz.v2.loginBanner', '0');
        } catch {}
        ctx.rerender();
      }
    });
    root.addEventListener('change', (e) => {
      if (e.target.dataset.change === 'year') {
        view.year = Number(e.target.value);
        syncPeriod();
        ctx.rerender();
      }
    });
  },

  render(root) {
    if (view.year === 'all') view.year = new Date().getFullYear();
    syncPeriod();
    const all = state.transactions;
    const banner =
      state.mode === 'local' && !bannerDismissed()
        ? `<div class="banner">${icon('cloud')}<div><b>بياناتك محفوظة على هذا الجهاز فقط</b><p>سجّل الدخول بحساب Google لحفظها في السحابة ومزامنتها بين الموبايل والكمبيوتر.</p></div>
           <div class="banner-actions"><button class="btn btn-primary btn-sm" data-act="login">${icon('brand-google')} دخول</button><button class="icon-btn" data-act="hide-banner" aria-label="إخفاء">${icon('x')}</button></div></div>`
        : '';

    if (!all.length) {
      root.innerHTML = `${banner}${emptyState(
        'wallet',
        'أهلاً بك في ميزانيتي',
        'ابدأ بإضافة أول عملية (راتب، إيجار، مصروف…) أو استورد نسخة احتياطية من الإعدادات.',
        `<div class="empty-actions"><button class="btn btn-primary" data-act="add-tx">${icon('plus')} إضافة عملية</button><a class="btn btn-ghost" href="#/settings">${icon('database-import')} استيراد بيانات</a></div>`,
      )}`;
      return;
    }

    const period = filterTx(all, { year: view.year, month: view.month });
    const s = summarize(period);
    const series = monthlySeries(all, view.year);
    const cats = byCategory(period, state.categories, 'expense');
    const top = topExpenses(period, 6);
    const ins = insights(all, state.categories, state.settings, view.year);
    const nowKey = currentMonthKey();
    const budgets = budgetStatus(all, state.categories, nowKey);
    const recent = sortByDateDesc(period).slice(0, 6);
    const activeMonths = series.filter((m) => m.hasData).length;

    root.innerHTML = `
      ${banner}
      <div class="period">${yearSelect()}<span class="period-lbl">${esc(periodLabel())}</span></div>
      ${monthChips(view.year)}
      ${summaryKpis(s)}

      <div class="grid-2">
        ${card('الإيرادات والمصروفات', 'chart-histogram', `<div class="chart-box"><canvas id="ch-ie" role="img" aria-label="الإيرادات والمصروفات لكل شهر"></canvas></div>
          <div class="legend"><span><i style="background:var(--income)"></i>إيرادات</span><span><i style="background:var(--expense)"></i>مصروفات</span><span><i style="background:var(--info)"></i>الصافي</span></div>`)}
        ${card('توزيع المصروفات', 'chart-pie', cats.length ? `<div class="donut-wrap"><div class="chart-box sm"><canvas id="ch-pie" role="img" aria-label="توزيع المصروفات حسب الفئة"></canvas></div>
          <div class="donut-legend">${cats.map((c) => `<div><i style="background:${esc(catColor(c.catId))}"></i><span>${esc(catName(c.catId))}</span><b>${pct(c.share)}</b></div>`).join('')}</div></div>` : `<p class="muted">لا توجد مصروفات في هذه الفترة</p>`)}
      </div>

      ${ins.length ? card('تنبيهات وملاحظات', 'bulb', `<div class="insights">${ins.slice(0, 4).map(insightItem).join('')}</div>`, ins.length > 4 ? `<button class="link" data-act="all-insights">عرض الكل (${num(ins.length)})</button>` : '') : ''}

      <div class="grid-2">
        ${budgets.length ? card(`ميزانية ${monthName(nowKey)}`, 'target', budgets.map((b) => `<div class="budget"><div class="budget-h"><span>${esc(b.cat.name)}</span><span class="${b.ratio >= 1 ? 'neg' : ''}">${money(b.spent)} / ${money(b.budget)}</span></div>${progress(b.ratio)}</div>`).join('')) : ''}
        ${card('أعلى بنود الصرف', 'receipt', top.length ? top.map(([d, v]) => bar(d, v, top[0][1], 'var(--expense)')).join('') : '<p class="muted">لا توجد مصروفات</p>')}
        ${card('آخر العمليات', 'list-details', `<div class="tx-list">${recent.map((t) => txRow(t)).join('')}</div>`, `<a class="link" href="#/tx">عرض الكل</a>`)}
      </div>

      ${card(`شهور ${int(view.year)}`, 'calendar-stats', `<div class="months-grid">${series.map((m) => `<button class="month-cell ${m.hasData ? (m.net >= 0 ? 'pos' : 'neg') : 'nodata'} ${m.key === nowKey ? 'now' : ''}" data-act="month" data-key="${m.key}"><b>${monthName(m.key)}</b>${m.hasData ? `<span>${signed(m.net)}</span>` : '<span>—</span>'}</button>`).join('')}</div>
        <div class="months-foot"><span>${num(activeMonths)} من ١٢ شهراً بها بيانات</span>${progress(activeMonths / 12, 'pos')}</div>`)}
    `;

    const c = themeColors();
    drawChart($('#ch-ie', root), {
      type: 'bar',
      data: {
        labels: series.map((m) => monthName(m.key).slice(0, 3)),
        datasets: [
          { label: 'إيرادات', data: series.map((m) => (m.hasData ? Math.round(m.inc) : null)), backgroundColor: c.income, borderRadius: 5, maxBarThickness: 18 },
          { label: 'مصروفات', data: series.map((m) => (m.hasData ? Math.round(m.exp) : null)), backgroundColor: c.expense, borderRadius: 5, maxBarThickness: 18 },
          { label: 'الصافي', type: 'line', data: series.map((m) => (m.hasData ? Math.round(m.net) : null)), borderColor: c.info, backgroundColor: c.info, pointRadius: 3, tension: 0.35, spanGaps: false },
        ],
      },
    });
    if (cats.length)
      drawChart($('#ch-pie', root), {
        type: 'doughnut',
        data: { labels: cats.map((x) => catName(x.catId)), datasets: [{ data: cats.map((x) => Math.round(x.total)), backgroundColor: cats.map((x) => catColor(x.catId)), borderColor: c.surface, borderWidth: 2 }] },
        options: { cutout: '68%', plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${money(ctx.parsed)}` } } } },
      });
  },
};
