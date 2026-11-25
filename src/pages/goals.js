import { state, saveGoal, deleteGoal, saveDebt, deleteDebt, debtStatus, payDebt, setDebtAuto, applyRecurring, sortedCategories, accountsList, defaultAccountId } from '../core/store.js';
import { goalPlan } from '../core/calc.js';
import { esc, money, money2, num, pct, parseNum, inputNum, monthLabel, currentMonthKey, todayISO, cur1, cur2, dateLabel } from '../core/format.js';
import { kpi, progress } from '../ui/parts.js';
import { emptyState, openSheet, confirmDialog, toast, options, $ } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const KINDS = ['ادخار', 'طوارئ', 'سداد ديون', 'استثمار', 'مشتريات', 'سفر', 'تعليم', 'أخرى'];
const PRIORITIES = ['عالية', 'متوسطة', 'منخفضة'];
const PRI_ORDER = { عالية: 0, متوسطة: 1, منخفضة: 2 };
const local = { tab: 'goals' };

// ===================== الأهداف =====================
function goalForm(g = {}) {
  const editing = !!g.id;
  const sheet = openSheet({
    title: editing ? 'تعديل الهدف' : 'هدف مالي جديد',
    body: `<form class="form" novalidate>
      <label class="field"><span>اسم الهدف</span><input name="name" maxlength="80" value="${esc(g.name || '')}" placeholder="مثال: صندوق طوارئ" autofocus></label>
      <div class="row-2">
        <label class="field"><span>المبلغ المستهدف (${esc(state.settings.cur1)})</span><input name="target" inputmode="decimal" value="${esc(inputNum(g.target ?? ''))}"></label>
        <label class="field"><span>المحقق حالياً</span><input name="current" inputmode="decimal" placeholder="0" value="${g.current ? esc(inputNum(g.current)) : ''}"></label>
      </div>
      <div class="row-3">
        <label class="field"><span>النوع</span><select name="kind" class="select">${options(KINDS.map((k) => [k, k]), g.kind || 'ادخار')}</select></label>
        <label class="field"><span>الأولوية</span><select name="priority" class="select">${options(PRIORITIES.map((k) => [k, k]), g.priority || 'متوسطة')}</select></label>
        <label class="field"><span>الموعد</span><input type="month" name="due" value="${esc(g.due || '')}" min="${currentMonthKey()}"></label>
      </div>
      <p class="form-err" role="alert"></p>
    </form>`,
    footer: `${editing ? `<button class="btn btn-ghost danger-text" data-act="del">${icon('trash')} حذف</button>` : ''}<button class="btn btn-primary" data-act="save">${icon('check')} حفظ</button>`,
  });
  const el = sheet.el;
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'del') {
      if (await confirmDialog({ title: 'حذف الهدف', text: `حذف «${g.name}»؟`, ok: 'حذف', danger: true })) {
        deleteGoal(g.id);
        sheet.close();
        toast('تم حذف الهدف');
      }
    } else if (act === 'save') {
      const fd = new FormData($('form', el));
      const name = String(fd.get('name') || '').trim();
      const target = parseNum(fd.get('target'));
      if (!name) return ($('.form-err', el).textContent = 'أدخل اسم الهدف');
      if (!(target > 0)) return ($('.form-err', el).textContent = 'أدخل مبلغاً مستهدفاً صحيحاً');
      saveGoal({ ...g, name, target, current: parseNum(fd.get('current')) || 0, kind: fd.get('kind'), priority: fd.get('priority'), due: fd.get('due') });
      sheet.close();
      toast(editing ? 'تم حفظ الهدف' : 'تمت إضافة الهدف');
    }
  });
  $('form', el).addEventListener('submit', (e) => e.preventDefault());
}

function contribute(g) {
  const sheet = openSheet({
    title: `إضافة مبلغ إلى «${g.name}»`,
    size: 'sheet-sm',
    body: `<div class="amount-field"><input id="g-add" inputmode="decimal" placeholder="0" autofocus><span class="amount-cur">${esc(state.settings.cur1)}</span></div>
      <p class="muted small">المحقق حالياً ${money(g.current)} من ${money(g.target)}. استخدم قيمة سالبة للسحب.</p>`,
    footer: `<button class="btn btn-primary" data-act="ok">${icon('check')} إضافة</button>`,
  });
  const go = () => {
    const v = parseNum($('#g-add', sheet.el).value);
    if (!Number.isFinite(v) || v === 0) return;
    saveGoal({ ...g, current: Math.max(0, g.current + v) });
    sheet.close();
    if (g.current < g.target && g.current + v >= g.target) toast(`🎉 مبروك! حققت هدف «${g.name}»`, 'ok', 4000);
    else toast('تم التحديث');
  };
  sheet.el.addEventListener('click', (e) => e.target.closest('[data-act=ok]') && go());
  $('#g-add', sheet.el).addEventListener('keydown', (e) => e.key === 'Enter' && go());
}

function goalsHTML() {
  const goals = [...state.goals].sort((a, b) => (PRI_ORDER[a.priority] ?? 9) - (PRI_ORDER[b.priority] ?? 9) || (a.due || '9').localeCompare(b.due || '9'));
  const newBtn = `<button class="btn btn-primary" data-act="new-goal">${icon('plus')} هدف جديد</button>`;
  if (!goals.length) return emptyState('target', 'لا توجد أهداف بعد', 'حدد هدفاً مالياً (صندوق طوارئ، سفر، شراء…) وتابع تقدمك نحوه.', newBtn);
  const tot = goals.reduce((s, g) => s + g.target, 0);
  const done = goals.reduce((s, g) => s + Math.min(g.current, g.target), 0);
  return `
    <div class="kpis three">
      ${kpi({ label: 'إجمالي الأهداف', value: money(tot), ic: 'target' })}
      ${kpi({ label: 'المحقق', value: money(done), tone: 'pos', ic: 'pig-money' })}
      ${kpi({ label: 'التقدم الكلي', value: pct(tot ? (done / tot) * 100 : 0), tone: 'info', ic: 'chart-line' })}
    </div>
    <div class="page-actions">${newBtn}</div>
    <div class="goals">${goals
      .map((g) => {
        const ratio = g.target > 0 ? g.current / g.target : 0;
        const plan = goalPlan(g);
        const doneG = ratio >= 1;
        const late = plan.monthsLeft !== null && plan.monthsLeft <= 0 && !doneG;
        return `<article class="goal card ${doneG ? 'done' : ''}">
          <header class="goal-h">
            <div><h3>${esc(g.name)}</h3><div class="goal-tags"><span class="pill ${g.priority === 'عالية' ? 'neg' : g.priority === 'متوسطة' ? 'warn' : 'info'}">${esc(g.priority)}</span><span class="pill">${esc(g.kind)}</span>${g.due ? `<span class="pill ${late ? 'neg' : ''}">${icon('calendar')} ${monthLabel(g.due)}</span>` : ''}</div></div>
            <button class="icon-btn" data-act="edit-goal" data-id="${esc(g.id)}" aria-label="تعديل">${icon('pencil')}</button>
          </header>
          <div class="goal-nums"><b>${money(g.current)}</b><span>من ${money(g.target)}</span><strong>${pct(Math.min(100, ratio * 100))}</strong></div>
          ${progress(Math.min(1, ratio), doneG ? 'pos' : ratio >= 0.4 ? 'info' : 'warn')}
          <footer class="goal-f">
            <span class="muted small">${doneG ? '✓ تم تحقيق الهدف' : late ? `انتهى الموعد — متبقٍ ${money(plan.remaining)}` : plan.perMonth ? `تحتاج ${money(plan.perMonth)} شهرياً لمدة ${num(plan.monthsLeft)} شهر` : `متبقٍ ${money(plan.remaining)}`}</span>
            <button class="btn btn-ghost btn-sm" data-act="add-goal" data-id="${esc(g.id)}">${icon('plus')} إضافة مبلغ</button>
          </footer>
        </article>`;
      })
      .join('')}</div>`;
}

// ===================== الأقساط والديون =====================
const fmtD = (d, v) => (d.fixedIn === 'cur2' ? money2(v) : money(v));

function debtForm(d = null) {
  const editing = !!d?.id;
  const st = editing ? debtStatus(d) : null;
  const accs = accountsList();
  const v = { name: '', total: '', installment: '', fixedIn: 'cur2', initialPaid: 0, dueDay: 1, catId: 'bills', accountId: defaultAccountId(), note: '', ...(d || {}) };
  const sheet = openSheet({
    title: editing ? 'تعديل القسط' : 'قسط / دين جديد',
    body: `<form class="form" novalidate>
      <label class="field"><span>الاسم</span><input name="name" maxlength="80" value="${esc(v.name)}" placeholder="مثال: تساهيل، قرض البنك، جمعية" autofocus></label>
      <div class="field"><span>العملة</span><div class="seg"><label class="seg-opt"><input type="radio" name="fixedIn" value="cur1" ${v.fixedIn !== 'cur2' ? 'checked' : ''}><span>${esc(cur1())}</span></label><label class="seg-opt"><input type="radio" name="fixedIn" value="cur2" ${v.fixedIn === 'cur2' ? 'checked' : ''}><span>${esc(cur2())}</span></label></div></div>
      <div class="row-3">
        <label class="field"><span>إجمالي المبلغ</span><input name="total" inputmode="decimal" value="${esc(inputNum(v.total))}"></label>
        <label class="field"><span>القسط الشهري</span><input name="installment" inputmode="decimal" value="${esc(inputNum(v.installment))}"></label>
        <label class="field"><span>مدفوع قبل كده</span><input name="initialPaid" inputmode="decimal" placeholder="0" value="${v.initialPaid ? esc(inputNum(v.initialPaid)) : ''}"></label>
      </div>
      <div class="row-2">
        <label class="field"><span>يوم الاستحقاق</span><input name="dueDay" type="number" min="1" max="31" value="${esc(v.dueDay)}"></label>
        <label class="field"><span>الفئة</span><select name="catId" class="select wide">${options(sortedCategories('expense').map((c) => [c.id, c.name]), v.catId)}</select></label>
      </div>
      ${accs.length > 1 ? `<label class="field"><span>يُدفع من حساب</span><select name="accountId" class="select wide">${options(accs.map((a) => [a.id, a.name]), v.accountId)}</select></label>` : ''}
      <label class="switch-row"><input type="checkbox" name="auto" ${st?.auto ? 'checked' : ''}><span>${icon('refresh')} سجّل القسط تلقائياً كل شهر في يوم الاستحقاق</span></label>
      <label class="field"><span>ملاحظات</span><input name="note" maxlength="300" value="${esc(v.note)}"></label>
      ${st ? `<p class="muted small">تم تسجيل ${num(st.payments.length)} دفعة بإجمالي ${fmtD(d, st.paid - (d.initialPaid || 0))}.</p>` : ''}
      <p class="form-err" role="alert"></p>
    </form>`,
    footer: `${editing ? `<button class="btn btn-ghost danger-text" data-act="del">${icon('trash')} حذف</button>` : ''}<button class="btn btn-primary" data-act="save">${icon('check')} حفظ</button>`,
  });
  const el = sheet.el;
  $('form', el).addEventListener('submit', (e) => e.preventDefault());
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'del') {
      if (await confirmDialog({ title: 'حذف القسط', text: `حذف «${d.name}»؟ الدفعات المسجلة ستبقى في العمليات.`, ok: 'حذف', danger: true })) {
        deleteDebt(d.id);
        sheet.close();
        toast('تم حذف القسط');
      }
    } else if (act === 'save') {
      const fd = new FormData($('form', el));
      const err = $('.form-err', el);
      const total = parseNum(fd.get('total'));
      const installment = parseNum(fd.get('installment'));
      if (!String(fd.get('name') || '').trim()) return (err.textContent = 'أدخل الاسم');
      if (!(total > 0)) return (err.textContent = 'أدخل إجمالي المبلغ');
      if (!(installment > 0)) return (err.textContent = 'أدخل قيمة القسط الشهري');
      const saved = saveDebt({ ...(d || {}), name: fd.get('name'), total, installment, fixedIn: fd.get('fixedIn'), initialPaid: parseNum(fd.get('initialPaid')) || 0, dueDay: Number(fd.get('dueDay')) || 1, catId: fd.get('catId'), accountId: fd.get('accountId') || v.accountId, note: fd.get('note') });
      setDebtAuto(saved, !!fd.get('auto'));
      const n = await applyRecurring();
      sheet.close();
      toast(n ? `تم الحفظ وتسجيل ${num(n)} قسط مستحق` : 'تم الحفظ');
    }
  });
}

function payForm(d) {
  const st = debtStatus(d);
  const sheet = openSheet({
    title: `دفعة «${d.name}»`,
    size: 'sheet-sm',
    body: `<div class="amount-field"><input id="p-amount" inputmode="decimal" value="${esc(inputNum(Math.min(d.installment, st.remaining)))}" autofocus><span class="amount-cur">${esc(d.fixedIn === 'cur2' ? cur2() : cur1())}</span></div>
      <label class="field"><span>التاريخ</span><input id="p-date" type="date" value="${todayISO()}"></label>
      <p class="muted small">المتبقي ${fmtD(d, st.remaining)}. هتتسجل كمصروف في العمليات.</p>`,
    footer: `<button class="btn btn-primary" data-act="pay">${icon('check')} تسجيل الدفعة</button>`,
  });
  sheet.el.addEventListener('click', (e) => {
    if (!e.target.closest('[data-act=pay]')) return;
    const v = parseNum($('#p-amount', sheet.el).value);
    if (!(v > 0)) return toast('أدخل مبلغاً صحيحاً', 'warn');
    payDebt(d, v, $('#p-date', sheet.el).value || todayISO());
    sheet.close();
    const after = debtStatus(d);
    toast(after.done ? `🎉 مبروك! خلّصت «${d.name}»` : `تم التسجيل — متبقٍ ${fmtD(d, after.remaining)}`, 'ok', 4000);
  });
}

function debtsHTML() {
  const list = state.debts.map((d) => ({ d, st: debtStatus(d) })).sort((a, b) => Number(a.st.done) - Number(b.st.done) || a.d.dueDay - b.d.dueDay);
  const newBtn = `<button class="btn btn-primary" data-act="new-debt">${icon('plus')} قسط / دين جديد</button>`;
  if (!list.length) return emptyState('cash', 'لا توجد أقساط', 'أضف أقساطك وديونك لتعرف المدفوع والمتبقي ومتى تنتهي، ويمكن تسجيلها تلقائياً كل شهر.', newBtn);
  const rate = Number(state.settings.rate) || 1;
  const inCur1 = (d, v) => (d.fixedIn === 'cur2' ? v / rate : v);
  const open = list.filter((x) => !x.st.done);
  const remaining = open.reduce((s, x) => s + inCur1(x.d, x.st.remaining), 0);
  const monthly = open.reduce((s, x) => s + inCur1(x.d, x.d.installment), 0);
  const nowKey = currentMonthKey();
  return `
    <div class="kpis three">
      ${kpi({ label: 'إجمالي المتبقي', value: money(remaining), sub: money2(remaining * rate), tone: 'neg', ic: 'cash' })}
      ${kpi({ label: 'الأقساط الشهرية', value: money(monthly), sub: money2(monthly * rate), tone: 'warn', ic: 'calendar' })}
      ${kpi({ label: 'أقساط مفتوحة', value: num(open.length), sub: `${num(list.length - open.length)} منتهية`, ic: 'list-details' })}
    </div>
    <div class="page-actions">${newBtn}</div>
    <div class="goals">${list
      .map(({ d, st }) => `<article class="goal card ${st.done ? 'done' : ''}">
        <header class="goal-h">
          <div><h3>${esc(d.name)}</h3><div class="goal-tags">
            <span class="pill">${icon('calendar')} يوم ${num(d.dueDay)}</span>
            ${st.auto ? `<span class="pill info">${icon('refresh')} تلقائي</span>` : ''}
            ${st.done ? '<span class="pill pos">✓ منتهي</span>' : st.paidThisMonth ? '<span class="pill pos">مدفوع هذا الشهر</span>' : `<span class="pill warn">مستحق ${monthLabel(nowKey)}</span>`}
          </div></div>
          <button class="icon-btn" data-act="edit-debt" data-id="${esc(d.id)}" aria-label="تعديل">${icon('pencil')}</button>
        </header>
        <div class="goal-nums"><b>${fmtD(d, st.paid)}</b><span>من ${fmtD(d, d.total)}</span><strong>${pct(Math.min(100, st.ratio * 100))}</strong></div>
        ${progress(Math.min(1, st.ratio), st.done ? 'pos' : 'info')}
        <div class="debt-facts">
          <div><span>المتبقي</span><b class="neg">${fmtD(d, st.remaining)}</b></div>
          <div><span>القسط</span><b>${fmtD(d, d.installment)}</b></div>
          <div><span>أقساط باقية</span><b>${st.left ?? '—'}</b></div>
          <div><span>ينتهي في</span><b>${st.endMonth ? monthLabel(st.endMonth) : '—'}</b></div>
        </div>
        ${st.done ? '' : `<footer class="goal-f"><span class="muted small">${st.payments[0] ? `آخر دفعة: ${dateLabel([...st.payments].sort((a, b) => b.date.localeCompare(a.date))[0].date)}` : 'لا توجد دفعات مسجلة'}</span>
          <button class="btn btn-ghost btn-sm" data-act="pay-debt" data-id="${esc(d.id)}">${icon('plus')} تسجيل دفعة</button></footer>`}
      </article>`)
      .join('')}</div>`;
}

export default {
  title: 'الأهداف والأقساط',
  mount(root, ctx) {
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) {
        local.tab = t.dataset.tab;
        ctx.rerender();
        return;
      }
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const g = state.goals.find((x) => x.id === a.dataset.id);
      const d = state.debts.find((x) => x.id === a.dataset.id);
      if (a.dataset.act === 'new-goal') goalForm();
      else if (a.dataset.act === 'edit-goal' && g) goalForm(g);
      else if (a.dataset.act === 'add-goal' && g) contribute(g);
      else if (a.dataset.act === 'new-debt') debtForm();
      else if (a.dataset.act === 'edit-debt' && d) debtForm(d);
      else if (a.dataset.act === 'pay-debt' && d) payForm(d);
    });
  },
  render(root) {
    const tabs = [
      ['goals', 'الأهداف', 'target'],
      ['debts', 'الأقساط والديون', 'cash'],
    ];
    root.innerHTML = `
      <nav class="tabs" role="tablist">${tabs.map(([k, l, ic]) => `<button role="tab" aria-selected="${local.tab === k}" class="tab ${local.tab === k ? 'active' : ''}" data-tab="${k}">${icon(ic)}<span>${l}</span></button>`).join('')}</nav>
      ${local.tab === 'debts' ? debtsHTML() : goalsHTML()}`;
  },
};
