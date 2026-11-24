import { state, saveTransaction, deleteTransaction, sortedCategories, catById, knownDescriptions, lastTxFor } from '../core/store.js';
import { esc, todayISO, parseNum, inputNum, round2, cur1, cur2 } from '../core/format.js';
import { openSheet, confirmDialog, toast, $ } from './dom.js';
import { icon } from './icons.js';

let lastDate = null;
let lastType = 'expense';

function catChips(type, selected) {
  const cats = sortedCategories(type);
  return cats
    .map(
      (c) => `<label class="cat-chip" style="--c:${esc(c.color)}">
        <input type="radio" name="catId" value="${esc(c.id)}" ${c.id === selected ? 'checked' : ''}>
        <span>${esc(c.name)}</span></label>`,
    )
    .join('');
}

/** فتح نموذج إضافة/تعديل عملية. tx = عملية للتعديل أو قيم مبدئية */
export function openTxForm(tx = null) {
  const editing = !!tx?.id;
  const type = tx?.type || (tx?.catId ? catById(tx.catId)?.type : null) || lastType;
  const firstCat = sortedCategories(type)[0]?.id;
  const v = {
    type,
    catId: tx?.catId && catById(tx.catId)?.type === type ? tx.catId : firstCat,
    amount: tx?.amount ?? '',
    rate: tx?.rate ?? state.settings.rate,
    amount2: tx?.amount2 ?? '',
    desc: tx?.desc ?? '',
    date: tx?.date || lastDate || todayISO(),
    note: tx?.note ?? '',
  };

  const body = `
    <form class="form tx-form" novalidate>
      <div class="seg" role="radiogroup" aria-label="نوع العملية">
        <label class="seg-opt exp"><input type="radio" name="type" value="expense" ${v.type === 'expense' ? 'checked' : ''}><span>${icon('trending-down')} مصروف</span></label>
        <label class="seg-opt inc"><input type="radio" name="type" value="income" ${v.type === 'income' ? 'checked' : ''}><span>${icon('trending-up')} إيراد</span></label>
      </div>

      <div class="amount-field">
        <input id="f-amount" name="amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(inputNum(v.amount))}" ${editing ? '' : 'autofocus'} aria-label="المبلغ">
        <span class="amount-cur">${esc(cur1())}</span>
      </div>

      <div class="row-2">
        <label class="field"><span>سعر الصرف (${esc(cur1())} ← ${esc(cur2())})</span>
          <input id="f-rate" name="rate" inputmode="decimal" value="${esc(inputNum(v.rate))}"></label>
        <label class="field"><span>المبلغ بـ ${esc(cur2())}</span>
          <input id="f-amount2" name="amount2" inputmode="decimal" placeholder="يُحسب تلقائياً" value="${esc(inputNum(v.amount2))}"></label>
      </div>

      <div class="field"><span>الفئة</span><div class="cat-chips" id="f-cats">${catChips(v.type, v.catId)}</div></div>

      <label class="field"><span>البيان</span>
        <input id="f-desc" name="desc" list="desc-list" maxlength="120" placeholder="مثال: راتب، إيجار، بقالة…" value="${esc(v.desc)}" autocomplete="off">
        <datalist id="desc-list">${knownDescriptions().map((d) => `<option value="${esc(d)}">`).join('')}</datalist></label>

      <div class="row-2">
        <label class="field"><span>التاريخ</span><input id="f-date" type="date" name="date" value="${esc(v.date)}" required></label>
        <label class="field"><span>ملاحظات (اختياري)</span><input id="f-note" name="note" maxlength="500" value="${esc(v.note)}"></label>
      </div>
      <p class="form-err" id="f-err" role="alert"></p>
    </form>`;

  const footer = `
    ${editing ? `<button class="btn btn-ghost danger-text" data-act="del">${icon('trash')} حذف</button>` : `<button class="btn btn-ghost" data-act="again">حفظ وإضافة آخر</button>`}
    <button class="btn btn-primary" data-act="save">${icon('check')} ${editing ? 'حفظ التعديل' : 'إضافة'}</button>`;

  const sheet = openSheet({ title: editing ? 'تعديل العملية' : 'عملية جديدة', body, footer });
  const root = sheet.el;
  const form = $('form', root);
  const amount = $('#f-amount', root), rate = $('#f-rate', root), amount2 = $('#f-amount2', root), desc = $('#f-desc', root);
  let manual2 = editing && tx.amount2 && Math.abs(tx.amount2 - tx.amount * tx.rate) > 0.01;

  const recalc = (from) => {
    const a = parseNum(amount.value), r = parseNum(rate.value), b = parseNum(amount2.value);
    if (from === 'amount2') {
      manual2 = true;
      if (r > 0 && b >= 0) amount.value = inputNum(round2(b / r));
    } else if (r > 0 && a >= 0 && (from === 'rate' || !manual2 || from === 'amount')) {
      manual2 = false;
      amount2.value = inputNum(round2(a * r));
    }
  };
  amount.addEventListener('input', () => recalc('amount'));
  rate.addEventListener('input', () => recalc('rate'));
  amount2.addEventListener('input', () => recalc('amount2'));

  form.addEventListener('change', (e) => {
    if (e.target.name === 'type') {
      lastType = e.target.value;
      $('#f-cats', root).innerHTML = catChips(e.target.value, sortedCategories(e.target.value)[0]?.id);
    }
  });
  desc.addEventListener('change', () => {
    const prev = lastTxFor(desc.value.trim());
    if (prev && !amount.value) {
      amount.value = inputNum(prev.amount);
      const t = form.querySelector(`input[name=type][value=${prev.type}]`);
      if (t && !t.checked) {
        t.checked = true;
        $('#f-cats', root).innerHTML = catChips(prev.type, prev.catId);
      } else {
        const c = form.querySelector(`input[name=catId][value="${CSS.escape(prev.catId)}"]`);
        if (c) c.checked = true;
      }
      recalc('amount');
    }
  });

  const collect = () => {
    const fd = new FormData(form);
    const a = parseNum(fd.get('amount'));
    const r = parseNum(fd.get('rate'));
    const b = parseNum(fd.get('amount2'));
    const catId = fd.get('catId');
    const err = $('#f-err', root);
    if (!(a > 0)) {
      err.textContent = 'أدخل مبلغاً صحيحاً أكبر من صفر';
      amount.focus();
      return null;
    }
    if (!catId) {
      err.textContent = 'اختر الفئة';
      return null;
    }
    if (!(r > 0)) {
      err.textContent = 'سعر الصرف يجب أن يكون أكبر من صفر';
      rate.focus();
      return null;
    }
    err.textContent = '';
    return {
      ...(editing ? tx : {}),
      catId,
      amount: a,
      rate: r,
      amount2: b > 0 ? b : round2(a * r),
      desc: String(fd.get('desc') || '').trim() || catById(catId)?.name || '',
      date: fd.get('date') || todayISO(),
      note: fd.get('note'),
    };
  };

  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    e.preventDefault();
    if (act === 'del') {
      if (await confirmDialog({ title: 'حذف العملية', text: `هل تريد حذف «${tx.desc}»؟ لا يمكن التراجع.`, ok: 'حذف', danger: true })) {
        deleteTransaction(tx.id);
        sheet.close();
        toast('تم حذف العملية');
      }
      return;
    }
    const data = collect();
    if (!data) return;
    saveTransaction(data);
    lastDate = data.date;
    if (act === 'again') {
      toast('تمت الإضافة ✓');
      amount.value = '';
      amount2.value = '';
      desc.value = '';
      $('#f-note', root).value = '';
      manual2 = false;
      amount.focus();
    } else {
      sheet.close();
      toast(editing ? 'تم حفظ التعديل' : 'تمت إضافة العملية');
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    $('[data-act=save]', root).click();
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      $('[data-act=save]', root).click();
    }
  });
}
