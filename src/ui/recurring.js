// إدارة العمليات المتكررة (إيجار، أقساط، راتب، اشتراكات…)
import { state, saveRecurring, deleteRecurring, applyRecurring, sortedCategories, catById, catColor, accountsList, accountName, defaultAccountId } from '../core/store.js';
import { esc, money, money2, num, parseNum, inputNum, monthLabel, currentMonthKey, cur1, cur2, shiftMonth } from '../core/format.js';
import { openSheet, confirmDialog, toast, options, $ } from './dom.js';
import { icon } from './icons.js';

const fmtAmount = (r) => (r.fixedIn === 'cur2' ? money2(r.amount) : money(r.amount));

function nextDate(r) {
  const key = r.lastApplied ? shiftMonth(r.lastApplied, 1) : r.start;
  if (r.end && key > r.end) return null;
  return `${num(r.day)} ${monthLabel(key)}`;
}

function listHTML() {
  const rules = [...state.recurring].sort((a, b) => Number(b.active) - Number(a.active) || a.day - b.day);
  if (!rules.length)
    return `<div class="empty small-empty">${icon('refresh', 'empty-ic')}<h3>لا توجد عمليات متكررة</h3><p>أضف الإيرادات والالتزامات الثابتة مرة واحدة، وهي تتسجل لوحدها كل شهر.</p></div>`;
  const sum = (type) => rules.filter((r) => r.active && catById(r.catId)?.type === type).reduce((s, r) => s + (r.fixedIn === 'cur2' ? r.amount / (state.settings.rate || 1) : r.amount), 0);
  return `<div class="sum-line"><span class="pos">إيرادات شهرية ثابتة: ${money(sum('income'))}</span><span class="neg">التزامات: ${money(sum('expense'))}</span></div>
    <div class="tx-list">${rules
      .map((r) => {
        const inc = catById(r.catId)?.type === 'income';
        const nd = nextDate(r);
        return `<button class="tx ${r.active ? '' : 'off'}" data-act="edit-rec" data-id="${esc(r.id)}">
          <span class="tx-dot" style="--c:${esc(catColor(r.catId))}">${icon(r.debtId ? 'cash' : 'refresh')}</span>
          <span class="tx-main"><span class="tx-desc">${esc(r.desc)}</span>
            <span class="tx-meta">يوم ${num(r.day)} من كل شهر · ${r.active ? (nd ? `القادمة: ${nd}` : 'انتهت') : 'متوقفة'}${accountsList().length > 1 ? ` · ${esc(accountName(r.accountId))}` : ''}</span></span>
          <span class="tx-amt ${inc ? 'pos' : 'neg'}"><b>${fmtAmount(r)}</b><small>${r.debtId ? 'قسط' : esc(catById(r.catId)?.name || '')}</small></span>
        </button>`;
      })
      .join('')}</div>`;
}

export function openRecurringList() {
  const sheet = openSheet({
    title: 'العمليات المتكررة',
    body: `<p class="muted small">تُضاف كل عملية تلقائياً في يومها من كل شهر (حتى لو التطبيق مقفول، هتتسجل أول ما تفتحه).</p><div id="rec-list">${listHTML()}</div>`,
    footer: `<button class="btn btn-primary" data-act="new-rec">${icon('plus')} عملية متكررة جديدة</button>`,
  });
  const refresh = () => ($('#rec-list', sheet.el).innerHTML = listHTML());
  sheet.el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'new-rec') recurringForm(null, refresh);
    if (a.dataset.act === 'edit-rec') recurringForm(state.recurring.find((r) => r.id === a.dataset.id), refresh);
  });
}

export function recurringForm(r = null, onDone) {
  const editing = !!r?.id;
  const cats = [...sortedCategories('income'), ...sortedCategories('expense')];
  const accs = accountsList();
  // البداية الافتراضية الشهر القادم حتى لا تتكرر عملية سجّلتها بنفسك هذا الشهر
  const v = { desc: '', catId: 'bills', fixedIn: 'cur1', amount: '', day: new Date().getDate(), start: shiftMonth(currentMonthKey(), 1), end: '', active: true, accountId: defaultAccountId(), note: '', ...(r || {}) };
  const sheet = openSheet({
    title: editing ? 'تعديل عملية متكررة' : 'عملية متكررة جديدة',
    body: `<form class="form" novalidate>
      <label class="field"><span>البيان</span><input name="desc" maxlength="120" value="${esc(v.desc)}" placeholder="مثال: إيجار الشقة، راتب، اشتراك النت" autofocus></label>
      <div class="field"><span>الفئة</span><div class="cat-chips">${cats.map((c) => `<label class="cat-chip" style="--c:${esc(c.color)}"><input type="radio" name="catId" value="${esc(c.id)}" ${c.id === v.catId ? 'checked' : ''}><span>${esc(c.name)}</span></label>`).join('')}</div></div>
      <div class="row-2">
        <label class="field"><span>المبلغ الثابت</span><input name="amount" inputmode="decimal" value="${esc(inputNum(v.amount))}"></label>
        <div class="field"><span>بعملة</span><div class="seg"><label class="seg-opt"><input type="radio" name="fixedIn" value="cur1" ${v.fixedIn !== 'cur2' ? 'checked' : ''}><span>${esc(cur1())}</span></label><label class="seg-opt"><input type="radio" name="fixedIn" value="cur2" ${v.fixedIn === 'cur2' ? 'checked' : ''}><span>${esc(cur2())}</span></label></div></div>
      </div>
      <div class="row-3">
        <label class="field"><span>يوم الشهر</span><input name="day" type="number" min="1" max="31" value="${esc(v.day)}"></label>
        <label class="field"><span>يبدأ من</span><input name="start" type="month" value="${esc(v.start)}"></label>
        <label class="field"><span>ينتهي في (اختياري)</span><input name="end" type="month" value="${esc(v.end)}"></label>
      </div>
      ${accs.length > 1 ? `<label class="field"><span>الحساب</span><select name="accountId" class="select wide">${options(accs.map((a) => [a.id, a.name]), v.accountId)}</select></label>` : ''}
      <label class="switch-row"><input type="checkbox" name="active" ${v.active ? 'checked' : ''}><span>مفعّلة</span></label>
      <p class="muted small">المبلغ بالعملة الأخرى يُحسب بسعر الصرف يوم إنشاء العملية. لو يوم الشهر أكبر من عدد أيامه (مثل 31) تُسجل في آخر يوم.</p>
      <p class="form-err" role="alert"></p>
    </form>`,
    footer: `${editing ? `<button class="btn btn-ghost danger-text" data-act="del">${icon('trash')} حذف</button>` : ''}<button class="btn btn-primary" data-act="save">${icon('check')} حفظ</button>`,
  });
  const el = sheet.el;
  $('form', el).addEventListener('submit', (e) => e.preventDefault());
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'del') {
      if (await confirmDialog({ title: 'حذف العملية المتكررة', text: `حذف «${r.desc}»؟ العمليات المسجلة سابقاً لن تُحذف.`, ok: 'حذف', danger: true })) {
        deleteRecurring(r.id);
        sheet.close();
        onDone?.();
        toast('تم الحذف');
      }
    } else if (act === 'save') {
      const fd = new FormData($('form', el));
      const amount = parseNum(fd.get('amount'));
      const err = $('.form-err', el);
      if (!String(fd.get('desc') || '').trim()) return (err.textContent = 'أدخل البيان');
      if (!(amount > 0)) return (err.textContent = 'أدخل مبلغاً صحيحاً');
      const start = fd.get('start') || currentMonthKey();
      const end = fd.get('end') || '';
      if (end && end < start) return (err.textContent = 'شهر الانتهاء قبل شهر البداية');
      const day = Number(fd.get('day')) || 1;
      // لو تغيّر شهر البداية لقاعدة جديدة نسمح بإنشاء الشهور من البداية
      const lastApplied = editing ? (start > (r.lastApplied || '') ? '' : r.lastApplied) : '';
      saveRecurring({ ...(r || {}), desc: fd.get('desc'), catId: fd.get('catId') || 'bills', amount, fixedIn: fd.get('fixedIn'), day, start, end, active: !!fd.get('active'), accountId: fd.get('accountId') || v.accountId, lastApplied });
      const n = await applyRecurring();
      sheet.close();
      onDone?.();
      toast(n ? `تم الحفظ وإضافة ${num(n)} عملية مستحقة` : 'تم الحفظ');
    }
  });
}
