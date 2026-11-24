import { state, sortedCategories, copyMonth, exportCSV, catName } from '../core/store.js';
import { filterTx, summarize, sortByDateDesc, monthsWithData } from '../core/calc.js';
import { esc, money, signedMoney, num, monthLabel, monthKeyOf, currentMonthKey, shiftMonth, todayISO } from '../core/format.js';
import { view, txRow, yearSelect, syncPeriod } from '../ui/parts.js';
import { emptyState, options, openSheet, toast, saveFile, preserveFocus, $, $$ } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const local = { q: '', catId: 'all', type: 'all', limit: 150 };

function current() {
  return sortByDateDesc(filterTx(state.transactions, { year: view.year, month: view.month, catId: local.catId, type: local.type, q: local.q }));
}

function listHTML(list) {
  if (!list.length) return emptyState('search', 'لا توجد عمليات مطابقة', 'جرّب تغيير الفلاتر أو البحث');
  const groups = new Map();
  for (const t of list.slice(0, local.limit)) {
    const k = monthKeyOf(t.date);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  let html = '';
  for (const [k, rows] of groups) {
    const s = summarize(list.filter((t) => monthKeyOf(t.date) === k));
    html += `<section class="tx-group"><header class="tx-group-h"><b>${monthLabel(k)}</b><span class="${s.net >= 0 ? 'pos' : 'neg'}">${signedMoney(s.net)}</span></header>
      <div class="tx-list card flush">${rows.map((t) => txRow(t)).join('')}</div></section>`;
  }
  if (list.length > local.limit) html += `<button class="btn btn-ghost wide" data-act="more">عرض المزيد (${num(list.length - local.limit)})</button>`;
  return html;
}

function summaryHTML(list) {
  const s = summarize(list);
  return `<span>${num(list.length)} عملية</span><span class="pos">${signedMoney(s.inc, 0, '+')}</span><span class="neg">${signedMoney(s.exp, 0, '-')}</span><span class="${s.net >= 0 ? 'pos' : 'neg'}">= ${money(s.net)}</span>`;
}

function openCopyMonth() {
  const months = monthsWithData(state.transactions);
  if (!months.length) return toast('لا توجد شهور بها عمليات', 'warn');
  const src = months.includes(view.month) ? view.month : months[months.length - 1];
  const target = src < currentMonthKey() ? currentMonthKey() : shiftMonth(src, 1);
  const rowsFor = (k) =>
    sortByDateDesc(state.transactions.filter((t) => monthKeyOf(t.date) === k))
      .map((t) => `<label class="check-row"><input type="checkbox" name="ids" value="${esc(t.id)}" ${t.type === 'income' || t.catId === 'bills' ? 'checked' : ''}><span>${esc(t.desc)}</span><small>${esc(catName(t.catId))}</small><b>${money(t.amount)}</b></label>`)
      .join('');
  const sheet = openSheet({
    title: 'نسخ عمليات شهر',
    body: `<p class="muted">مفيد للالتزامات الثابتة (إيجار، أقساط، راتب). اختر العمليات التي تريد تكرارها في شهر آخر، ويمكنك تعديل مبالغها بعد النسخ.</p>
      <div class="row-2">
        <label class="field"><span>من شهر</span><select id="cp-from" class="select">${options(months.slice().reverse().map((k) => [k, monthLabel(k)]), src)}</select></label>
        <label class="field"><span>إلى شهر</span><input id="cp-to" type="month" value="${target}"></label>
      </div>
      <div class="check-tools"><button class="link" data-act="all">تحديد الكل</button><button class="link" data-act="none">إلغاء التحديد</button></div>
      <div class="check-list" id="cp-list">${rowsFor(src)}</div>`,
    footer: `<button class="btn btn-ghost" data-close>إلغاء</button><button class="btn btn-primary" data-act="do">${icon('copy')} نسخ</button>`,
  });
  const el = sheet.el;
  $('#cp-from', el).addEventListener('change', (e) => ($('#cp-list', el).innerHTML = rowsFor(e.target.value)));
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'all' || act === 'none') $$('input[name=ids]', el).forEach((c) => (c.checked = act === 'all'));
    if (act === 'do') {
      const ids = $$('input[name=ids]:checked', el).map((c) => c.value);
      const to = $('#cp-to', el).value;
      if (!ids.length) return toast('اختر عملية واحدة على الأقل', 'warn');
      if (!/^\d{4}-\d{2}$/.test(to)) return toast('اختر الشهر الهدف', 'warn');
      const n = await copyMonth($('#cp-from', el).value, to, ids);
      sheet.close();
      view.year = Number(to.slice(0, 4));
      view.month = to;
      toast(`تم نسخ ${num(n)} عملية إلى ${monthLabel(to)}`);
    }
  });
}

export default {
  title: 'العمليات',
  mount(root, ctx) {
    root.addEventListener('input', (e) => {
      if (e.target.id === 'tx-q') {
        local.q = e.target.value;
        local.limit = 150;
        const list = current();
        $('#tx-results', root).innerHTML = listHTML(list);
        $('#tx-sum', root).innerHTML = summaryHTML(list);
      }
    });
    root.addEventListener('change', (e) => {
      const k = e.target.dataset.change;
      if (!k) return;
      if (k === 'year') {
        view.year = e.target.value === 'all' ? 'all' : Number(e.target.value);
        syncPeriod();
      } else if (k === 'month') view.month = e.target.value;
      else if (k === 'cat') local.catId = e.target.value;
      else if (k === 'type') local.type = e.target.value;
      local.limit = 150;
      ctx.rerender();
    });
    root.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'more') {
        local.limit += 300;
        ctx.rerender();
      } else if (act === 'copy-month') openCopyMonth();
      else if (act === 'export') {
        await saveFile(`ميزانيتي-${todayISO()}.csv`, exportCSV(current()), 'text/csv');
        toast('تم تصدير الملف');
      } else if (act === 'clear-filters') {
        Object.assign(local, { q: '', catId: 'all', type: 'all' });
        view.month = 'all';
        ctx.rerender();
      }
    });
  },
  render(root) {
    if (!state.transactions.length) {
      root.innerHTML = emptyState('list-details', 'لا توجد عمليات بعد', 'اضغط زر + لإضافة أول عملية', `<button class="btn btn-primary" data-act="add-tx">${icon('plus')} إضافة عملية</button>`);
      return;
    }
    const monthsOfYear = monthsWithData(state.transactions).filter((k) => view.year === 'all' || k.startsWith(String(view.year)));
    const list = current();
    const filtered = local.q || local.catId !== 'all' || local.type !== 'all' || view.month !== 'all';
    preserveFocus(root, () => {
      root.innerHTML = `
        <div class="toolbar">
          <label class="search">${icon('search')}<input id="tx-q" type="search" placeholder="بحث في البيان والملاحظات…" value="${esc(local.q)}" autocomplete="off"></label>
          <div class="toolbar-actions">
            <button class="btn btn-ghost btn-sm" data-act="copy-month" title="نسخ عمليات شهر">${icon('copy')}<span>نسخ شهر</span></button>
            <button class="btn btn-ghost btn-sm" data-act="export" title="تصدير CSV">${icon('download')}<span>تصدير</span></button>
          </div>
        </div>
        <div class="filters">
          ${yearSelect('tx-year', true)}
          <select class="select" data-change="month" aria-label="الشهر">${options([['all', 'كل الشهور'], ...monthsOfYear.slice().reverse().map((k) => [k, monthLabel(k)])], view.month)}</select>
          <select class="select" data-change="cat" aria-label="الفئة">${options([['all', 'كل الفئات'], ...sortedCategories().map((c) => [c.id, c.name])], local.catId)}</select>
          <select class="select" data-change="type" aria-label="النوع">${options([['all', 'الكل'], ['income', 'إيرادات'], ['expense', 'مصروفات']], local.type)}</select>
          ${filtered ? `<button class="link" data-act="clear-filters">مسح الفلاتر</button>` : ''}
        </div>
        <div class="sum-line" id="tx-sum">${summaryHTML(list)}</div>
        <div id="tx-results">${listHTML(list)}</div>`;
    });
  },
};
