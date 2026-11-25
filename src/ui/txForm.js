import {
  state, saveTransaction, deleteTransaction, sortedCategories, catById, knownDescriptions, lastTxFor,
  accountsList, defaultAccountId, saveRecurring,
} from '../core/store.js';
import { budgetStatus } from '../core/calc.js';
import { esc, todayISO, parseNum, inputNum, round2, cur1, cur2, monthKeyOf, num, pct } from '../core/format.js';
import { openSheet, confirmDialog, toast, options, $ } from './dom.js';
import { icon } from './icons.js';

let lastDate = null;
let lastType = 'expense';
let lastAccount = null;

function catChips(type, selected) {
  return sortedCategories(type)
    .map(
      (c) => `<label class="cat-chip" style="--c:${esc(c.color)}">
        <input type="radio" name="catId" value="${esc(c.id)}" ${c.id === selected ? 'checked' : ''}>
        <span>${esc(c.name)}</span></label>`,
    )
    .join('');
}

const accOptions = () => accountsList().map((a) => [a.id, a.name]);

/** تنبيه فوري لو العملية جعلت فئة تقترب من حد ميزانيتها أو تتجاوزه */
function budgetWarning(tx, before) {
  if (tx.type !== 'expense') return;
  const after = budgetStatus(state.transactions, state.categories, monthKeyOf(tx.date)).find((b) => b.cat.id === tx.catId);
  if (!after) return;
  const prev = before?.ratio ?? 0;
  if (after.ratio >= 1 && prev < 1) toast(`⚠️ تجاوزت ميزانية «${after.cat.name}» لهذا الشهر (${pct(after.ratio * 100)})`, 'warn', 5000);
  else if (after.ratio >= 0.8 && prev < 0.8) toast(`انتبه: استهلكت ${pct(after.ratio * 100)} من ميزانية «${after.cat.name}»`, 'warn', 4500);
}

/** فتح نموذج إضافة/تعديل عملية. tx = عملية للتعديل أو قيم مبدئية */
export function openTxForm(tx = null) {
  const editing = !!tx?.id;
  const accounts = accountsList();
  const multiAcc = accounts.length > 1;
  const type = tx?.type || (tx?.catId ? catById(tx.catId)?.type : null) || lastType;
  const firstCat = sortedCategories(type === 'transfer' ? 'expense' : type)[0]?.id;
  const v = {
    type,
    catId: tx?.catId && catById(tx.catId)?.type === type ? tx.catId : firstCat,
    accountId: tx?.accountId || lastAccount || defaultAccountId(),
    toAccountId: tx?.toAccountId || accounts.find((a) => a.id !== (tx?.accountId || defaultAccountId()))?.id || defaultAccountId(),
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
        ${multiAcc || v.type === 'transfer' ? `<label class="seg-opt"><input type="radio" name="type" value="transfer" ${v.type === 'transfer' ? 'checked' : ''}><span>${icon('arrows-diff')} تحويل</span></label>` : ''}
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

      <div class="field only-cat"><span>الفئة</span><div class="cat-chips" id="f-cats">${catChips(v.type === 'transfer' ? 'expense' : v.type, v.catId)}</div></div>

      <div class="row-2 only-transfer">
        <label class="field"><span>من حساب</span><select name="accountIdT" class="select wide">${options(accOptions(), v.accountId)}</select></label>
        <label class="field"><span>إلى حساب</span><select name="toAccountId" class="select wide">${options(accOptions(), v.toAccountId)}</select></label>
      </div>

      <div class="row-2">
        <label class="field"><span>البيان</span>
          <input id="f-desc" name="desc" list="desc-list" maxlength="120" placeholder="مثال: راتب، إيجار، بقالة…" value="${esc(v.desc)}" autocomplete="off">
          <datalist id="desc-list">${knownDescriptions().map((d) => `<option value="${esc(d)}">`).join('')}</datalist></label>
        ${multiAcc ? `<label class="field only-cat"><span>الحساب</span><select name="accountId" class="select wide">${options(accOptions(), v.accountId)}</select></label>` : `<label class="field"><span>التاريخ</span><input id="f-date" type="date" name="date" value="${esc(v.date)}" required></label>`}
      </div>

      <div class="row-2">
        ${multiAcc ? `<label class="field"><span>التاريخ</span><input id="f-date" type="date" name="date" value="${esc(v.date)}" required></label>` : ''}
        <label class="field" ${multiAcc ? '' : 'style="grid-column:span 2"'}><span>ملاحظات (اختياري)</span><input id="f-note" name="note" maxlength="500" value="${esc(v.note)}"></label>
      </div>

      ${
        editing
          ? tx.recurringId
            ? `<p class="hint">${icon('refresh')} هذه العملية أُنشئت تلقائياً من عملية متكررة. تعديلها لا يغيّر الشهور القادمة.</p>`
            : ''
          : `<div class="only-cat rec-box">
              <label class="switch-row"><input type="checkbox" id="f-rec"><span>${icon('refresh')} كرّرها كل شهر تلقائياً (إيجار، قسط، راتب…)</span></label>
              <div class="rec-opts" hidden>
                <span class="muted small">المبلغ الثابت بالعملة:</span>
                <div class="seg"><label class="seg-opt"><input type="radio" name="fixedIn" value="cur1" checked><span>${esc(cur1())}</span></label><label class="seg-opt"><input type="radio" name="fixedIn" value="cur2"><span>${esc(cur2())}</span></label></div>
              </div>
            </div>`
      }
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

  const applyType = (t) => {
    form.classList.toggle('is-transfer', t === 'transfer');
    if (t !== 'transfer') $('#f-cats', root).innerHTML = catChips(t, sortedCategories(t)[0]?.id);
  };
  form.classList.toggle('is-transfer', v.type === 'transfer');

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
      applyType(e.target.value);
    }
    if (e.target.id === 'f-rec') $('.rec-opts', root).hidden = !e.target.checked;
  });
  desc.addEventListener('change', () => {
    const prev = lastTxFor(desc.value.trim());
    if (prev && !amount.value) {
      amount.value = inputNum(prev.amount);
      const t = form.querySelector(`input[name=type][value=${prev.type}]`);
      if (t && !t.checked) {
        t.checked = true;
        form.classList.remove('is-transfer');
      }
      $('#f-cats', root).innerHTML = catChips(prev.type, prev.catId);
      const acc = form.querySelector('select[name=accountId]');
      if (acc && prev.accountId) acc.value = prev.accountId;
      recalc('amount');
    }
  });

  const collect = () => {
    const fd = new FormData(form);
    const t = fd.get('type');
    const a = parseNum(fd.get('amount'));
    const r = parseNum(fd.get('rate'));
    const b = parseNum(fd.get('amount2'));
    const err = $('#f-err', root);
    const fail = (msg, el) => {
      err.textContent = msg;
      el?.focus();
      return null;
    };
    if (!(a > 0)) return fail('أدخل مبلغاً صحيحاً أكبر من صفر', amount);
    if (!(r > 0)) return fail('سعر الصرف يجب أن يكون أكبر من صفر', rate);
    const common = { amount: a, rate: r, amount2: b > 0 ? b : round2(a * r), date: fd.get('date') || todayISO(), note: fd.get('note') };
    if (t === 'transfer') {
      const from = fd.get('accountIdT'), to = fd.get('toAccountId');
      if (from === to) return fail('اختر حسابين مختلفين للتحويل');
      err.textContent = '';
      return { ...(editing ? tx : {}), ...common, type: 'transfer', accountId: from, toAccountId: to, desc: String(fd.get('desc') || '').trim() || 'تحويل' };
    }
    const catId = fd.get('catId');
    if (!catId) return fail('اختر الفئة');
    err.textContent = '';
    const { toAccountId, ...base } = editing ? tx : {};
    return {
      ...base,
      ...common,
      type: t,
      catId,
      accountId: fd.get('accountId') || base.accountId || defaultAccountId(),
      desc: String(fd.get('desc') || '').trim() || catById(catId)?.name || '',
      recurring: !editing && $('#f-rec', root)?.checked,
      fixedIn: fd.get('fixedIn') || 'cur1',
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
    const { recurring, fixedIn, ...txData } = data;
    if (recurring) {
      const rule = saveRecurring({
        desc: txData.desc,
        catId: txData.catId,
        accountId: txData.accountId,
        fixedIn,
        amount: fixedIn === 'cur2' ? txData.amount2 : txData.amount,
        day: Number(txData.date.slice(8, 10)),
        start: monthKeyOf(txData.date),
        lastApplied: monthKeyOf(txData.date),
      });
      txData.recurringId = rule.id;
    }
    const before = txData.type === 'expense' ? budgetStatus(state.transactions, state.categories, monthKeyOf(txData.date)).find((x) => x.cat.id === txData.catId) : null;
    const saved = saveTransaction(txData);
    budgetWarning(saved, before);
    lastDate = saved.date;
    lastAccount = saved.accountId;
    if (recurring) toast(`تم الحفظ، وستُضاف تلقائياً يوم ${num(Number(saved.date.slice(8, 10)))} من كل شهر`, 'ok', 4000);
    if (act === 'again') {
      if (!recurring) toast('تمت الإضافة ✓');
      amount.value = '';
      amount2.value = '';
      desc.value = '';
      $('#f-note', root).value = '';
      const rec = $('#f-rec', root);
      if (rec) {
        rec.checked = false;
        $('.rec-opts', root).hidden = true;
      }
      manual2 = false;
      amount.focus();
    } else {
      sheet.close();
      if (!recurring) toast(editing ? 'تم حفظ التعديل' : 'تمت إضافة العملية');
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    $('[data-act=save]', root).click();
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
      e.preventDefault();
      $('[data-act=save]', root).click();
    }
  });
}
