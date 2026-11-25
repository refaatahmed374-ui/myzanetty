import {
  state, setPrefs, saveSettings, saveCategory, deleteCategory, sortedCategories,
  exportBackup, importBackup, exportCSV, importCSV, wipeAll, accountsList, saveAccount, deleteAccount,
} from '../core/store.js';
import { accountBalances } from '../core/calc.js';
import { CURRENCIES, maybeUpdateRate } from '../core/rates.js';
import { notificationsSupported, ensurePermission, dueItems } from '../core/notify.js';
import { isLockEnabled, setPin, removePin } from '../core/lock.js';
import { esc, money, money2, num, pct, parseNum, inputNum, todayISO, dateLabel, cur1, cur2 } from '../core/format.js';
import { APP_VERSION } from '../config.js';
import { card } from '../ui/parts.js';
import { openSheet, confirmDialog, toast, saveFile, pickFile, options, isNative, $ } from '../ui/dom.js';
import { askNewPin, askCurrentPin, bioStatus, bioVerify, bioLastError } from '../ui/lockScreen.js';
import { icon } from '../ui/icons.js';
import { checkUpdatesInteractive } from '../ui/updateUI.js';

const PALETTE = ['#0f9d76', '#e0524f', '#d4880f', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#84cc16', '#06b6d4', '#a855f7'];

const SYNC_TXT = { ok: ['cloud-check', 'متزامن'], syncing: ['refresh', 'جارٍ المزامنة…'], offline: ['cloud-off', 'غير متصل — سيتم الحفظ عند عودة الإنترنت'], error: ['alert-triangle', 'خطأ في المزامنة'], local: ['device-desktop', 'محلي فقط'] };

function categoryForm(c = {}) {
  const editing = !!c.id;
  const sheet = openSheet({
    title: editing ? 'تعديل الفئة' : 'فئة جديدة',
    body: `<form class="form" novalidate>
      <label class="field"><span>اسم الفئة</span><input name="name" maxlength="40" value="${esc(c.name || '')}" autofocus></label>
      <div class="seg">
        <label class="seg-opt exp"><input type="radio" name="type" value="expense" ${c.type !== 'income' ? 'checked' : ''}><span>مصروف</span></label>
        <label class="seg-opt inc"><input type="radio" name="type" value="income" ${c.type === 'income' ? 'checked' : ''}><span>إيراد</span></label>
      </div>
      <div class="field"><span>اللون</span><div class="swatches">${PALETTE.map((p) => `<label class="swatch" style="--c:${p}"><input type="radio" name="color" value="${p}" ${(c.color || PALETTE[4]) === p ? 'checked' : ''} aria-label="${p}"></label>`).join('')}</div></div>
      <label class="field"><span>حد الميزانية الشهري (${esc(state.settings.cur1)}) — اتركه 0 لعدم التحديد</span><input name="budget" inputmode="decimal" value="${esc(inputNum(c.budget || 0))}"></label>
    </form>`,
    footer: `${editing ? `<button class="btn btn-ghost danger-text" data-act="del">${icon('trash')} حذف</button>` : ''}<button class="btn btn-primary" data-act="save">${icon('check')} حفظ</button>`,
  });
  const el = sheet.el;
  $('form', el).addEventListener('submit', (e) => e.preventDefault());
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'save') {
      const fd = new FormData($('form', el));
      if (!String(fd.get('name') || '').trim()) return toast('أدخل اسم الفئة', 'warn');
      saveCategory({ ...c, name: fd.get('name'), type: fd.get('type'), color: fd.get('color'), budget: parseNum(fd.get('budget')) || 0 });
      sheet.close();
      toast('تم حفظ الفئة');
    } else if (act === 'del') {
      const used = state.transactions.filter((t) => t.catId === c.id).length;
      const others = state.categories.filter((x) => x.id !== c.id);
      if (!others.length) return toast('لا يمكن حذف آخر فئة', 'warn');
      if (!used) {
        if (await confirmDialog({ title: 'حذف الفئة', text: `حذف «${c.name}»؟`, ok: 'حذف', danger: true })) {
          await deleteCategory(c.id, null);
          sheet.close();
        }
        return;
      }
      const s2 = openSheet({
        title: 'نقل العمليات قبل الحذف',
        size: 'sheet-sm',
        body: `<p class="dialog-text">الفئة «${esc(c.name)}» بها ${num(used)} عملية. اختر فئة لنقلها إليها:</p>
          <select class="select wide" id="re-cat">${options(others.map((x) => [x.id, x.name]), others.find((x) => x.type === c.type)?.id)}</select>`,
        footer: `<button class="btn btn-ghost" data-close>إلغاء</button><button class="btn btn-danger" data-act="go">نقل وحذف</button>`,
      });
      s2.el.addEventListener('click', async (ev) => {
        if (!ev.target.closest('[data-act=go]')) return;
        await deleteCategory(c.id, $('#re-cat', s2.el).value);
        s2.close();
        sheet.close();
        toast('تم حذف الفئة ونقل عملياتها');
      });
    }
  });
}

const ACC_KINDS = [['bank', 'حساب بنكي'], ['cash', 'كاش'], ['wallet', 'محفظة إلكترونية'], ['card', 'بطاقة']];

function accountForm(a = null) {
  const editing = !!a?.id;
  const v = { name: '', kind: 'bank', cur: 'cur1', opening: 0, color: PALETTE[6], ...(a || {}) };
  const sheet = openSheet({
    title: editing ? 'تعديل الحساب' : 'حساب / محفظة جديدة',
    body: `<form class="form" novalidate>
      <label class="field"><span>الاسم</span><input name="name" maxlength="40" value="${esc(v.name)}" placeholder="مثال: الراجحي، كاش مصر، فودافون كاش" autofocus></label>
      <div class="row-2">
        <label class="field"><span>النوع</span><select name="kind" class="select wide">${options(ACC_KINDS, v.kind)}</select></label>
        <div class="field"><span>عملة الحساب</span><div class="seg"><label class="seg-opt"><input type="radio" name="cur" value="cur1" ${v.cur !== 'cur2' ? 'checked' : ''}><span>${esc(cur1())}</span></label><label class="seg-opt"><input type="radio" name="cur" value="cur2" ${v.cur === 'cur2' ? 'checked' : ''}><span>${esc(cur2())}</span></label></div></div>
      </div>
      <label class="field"><span>الرصيد الافتتاحي (قبل أول عملية مسجلة)</span><input name="opening" inputmode="decimal" value="${esc(inputNum(v.opening))}"></label>
      <div class="field"><span>اللون</span><div class="swatches">${PALETTE.map((p) => `<label class="swatch" style="--c:${p}"><input type="radio" name="color" value="${p}" ${v.color === p ? 'checked' : ''} aria-label="${p}"></label>`).join('')}</div></div>
    </form>`,
    footer: `${editing && accountsList().length > 1 ? `<button class="btn btn-ghost danger-text" data-act="del">${icon('trash')} حذف</button>` : ''}<button class="btn btn-primary" data-act="save">${icon('check')} حفظ</button>`,
  });
  const el = sheet.el;
  $('form', el).addEventListener('submit', (e) => e.preventDefault());
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'save') {
      const fd = new FormData($('form', el));
      if (!String(fd.get('name') || '').trim()) return toast('أدخل اسم الحساب', 'warn');
      saveAccount({ ...(a || {}), name: fd.get('name'), kind: fd.get('kind'), cur: fd.get('cur'), opening: parseNum(fd.get('opening')) || 0, color: fd.get('color') });
      sheet.close();
      toast('تم حفظ الحساب');
    } else if (act === 'del') {
      const others = accountsList().filter((x) => x.id !== a.id);
      const used = state.transactions.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length;
      const s2 = openSheet({
        title: 'حذف الحساب',
        size: 'sheet-sm',
        body: `<p class="dialog-text">${used ? `الحساب «${esc(a.name)}» عليه ${num(used)} عملية. اختر حساباً لنقلها إليه:` : `حذف «${esc(a.name)}»؟`}</p>
          ${used ? `<select class="select wide" id="mv-acc">${options(others.map((x) => [x.id, x.name]), others[0]?.id)}</select>` : ''}`,
        footer: `<button class="btn btn-ghost" data-close>إلغاء</button><button class="btn btn-danger" data-act="go">حذف</button>`,
      });
      s2.el.addEventListener('click', async (ev) => {
        if (!ev.target.closest('[data-act=go]')) return;
        await deleteAccount(a.id, $('#mv-acc', s2.el)?.value || others[0]?.id);
        s2.close();
        sheet.close();
        toast('تم حذف الحساب');
      });
    }
  });
}

async function doImportJSON() {
  const text = await pickFile('.json,application/json');
  if (!text) return;
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return toast('الملف ليس JSON صالحاً', 'err');
  }
  const count = Array.isArray(obj?.DATA) ? obj.DATA.length : (obj?.transactions || []).length;
  const sheet = openSheet({
    title: 'استيراد نسخة احتياطية',
    size: 'sheet-sm',
    body: `<p class="dialog-text">الملف يحتوي على ${num(count)} عملية${Array.isArray(obj?.DATA) ? ' (من النسخة القديمة للتطبيق)' : ''}. كيف تريد استيراده؟</p>
      <label class="radio-row"><input type="radio" name="mode" value="merge" checked><span><b>دمج</b> مع البيانات الحالية (العمليات المكررة لا تتكرر)</span></label>
      <label class="radio-row"><input type="radio" name="mode" value="replace"><span><b>استبدال</b> كل البيانات الحالية</span></label>`,
    footer: `<button class="btn btn-ghost" data-close>إلغاء</button><button class="btn btn-primary" data-act="go">${icon('database-import')} استيراد</button>`,
  });
  sheet.el.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-act=go]')) return;
    const replace = sheet.el.querySelector('input[name=mode]:checked').value === 'replace';
    if (replace && !(await confirmDialog({ title: 'استبدال البيانات', text: 'سيتم حذف كل البيانات الحالية واستبدالها بمحتوى الملف. متأكد؟', ok: 'استبدال', danger: true }))) return;
    try {
      const n = await importBackup(obj, { replace });
      sheet.close();
      toast(`تم استيراد ${num(n)} عملية`);
    } catch (err) {
      toast(err.message || 'فشل الاستيراد', 'err');
    }
  });
}

function doImportCSV() {
  const sheet = openSheet({
    title: 'استيراد من CSV / Excel',
    body: `<p class="muted small">الصيغة: <code>التاريخ,النوع,الفئة,البيان,المبلغ,سعر الصرف,المبلغ2,ملاحظات</code><br>
      مثال: <code>2026-06-01,إيراد,إيرادات,راتب,1000,14,14000</code><br>
      وتُقبل أيضاً صيغة النسخة القديمة: <code>2026,يونيو,راتب,ايرادات شهرية,1000,14,14000</code></p>
      <textarea id="csv-txt" rows="7" class="mono" placeholder="الصق الأسطر هنا، أو اختر ملفاً"></textarea>`,
    footer: `<button class="btn btn-ghost" data-act="file">${icon('file-spreadsheet')} اختيار ملف</button><button class="btn btn-primary" data-act="go">${icon('upload')} استيراد</button>`,
  });
  sheet.el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'file') {
      const t = await pickFile('.csv,text/csv,text/plain');
      if (t) $('#csv-txt', sheet.el).value = t;
    } else if (act === 'go') {
      const t = $('#csv-txt', sheet.el).value.trim();
      if (!t) return toast('لا توجد بيانات', 'warn');
      const r = await importCSV(t);
      sheet.close();
      toast(`تم استيراد ${num(r.added)} عملية${r.skipped ? ` (تم تخطي ${num(r.skipped)} سطر)` : ''}`, r.added ? 'ok' : 'warn');
    }
  });
}

async function doWipe() {
  const sheet = openSheet({
    title: 'حذف كل البيانات',
    size: 'sheet-sm',
    body: `<p class="dialog-text">سيتم حذف كل العمليات والأهداف${state.mode === 'cloud' ? ' من السحابة ومن كل أجهزتك' : ' من هذا الجهاز'}. ننصح بتصدير نسخة احتياطية أولاً.</p>
      <label class="field"><span>اكتب كلمة <b>حذف</b> للتأكيد</span><input id="wipe-ok" autocomplete="off"></label>`,
    footer: `<button class="btn btn-ghost" data-close>إلغاء</button><button class="btn btn-danger" data-act="go">${icon('trash')} حذف نهائي</button>`,
  });
  sheet.el.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-act=go]')) return;
    if ($('#wipe-ok', sheet.el).value.trim() !== 'حذف') return toast('اكتب كلمة "حذف" للتأكيد', 'warn');
    await wipeAll();
    sheet.close();
    toast('تم حذف كل البيانات');
  });
}

export default {
  title: 'الإعدادات',
  mount(root, ctx) {
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'theme') setPrefs({ theme: t.value });
      else if (t.id === 's-code1' || t.id === 's-code2') {
        const n = t.id === 's-code1' ? '1' : '2';
        const sym = CURRENCIES.find((c) => c[0] === t.value)?.[2];
        saveSettings({ ['code' + n]: t.value, ...(sym ? { ['cur' + n]: sym } : {}), rateUpdatedAt: 0 });
        if (state.settings.autoRate) maybeUpdateRate({ force: true }).then((r) => r && toast(`سعر الصرف الجديد: ${num(r, 4)}`)).catch(() => toast('تعذر جلب سعر الصرف', 'warn'));
      } else if (t.id === 's-auto') {
        saveSettings({ autoRate: t.checked });
        if (t.checked) maybeUpdateRate({ force: true }).then((r) => r && toast(`تم تحديث سعر الصرف: ${num(r, 4)}`)).catch(() => toast('تعذر جلب سعر الصرف — تأكد من الإنترنت', 'warn'));
      } else if (t.id === 'n-daily') {
        (async () => {
          if (t.checked && !(await ensurePermission())) {
            t.checked = false;
            return toast('لازم تسمح بالإشعارات من إعدادات الموبايل', 'warn', 4500);
          }
          setPrefs({ notifyDaily: t.checked });
          toast(t.checked ? `هيوصلك تذكير يومي الساعة ${state.prefs.notifyTime}` : 'تم إيقاف التذكير اليومي');
        })();
      } else if (t.id === 'n-time') setPrefs({ notifyTime: t.value || '21:00' });
      else if (t.id === 'n-due') {
        (async () => {
          if (t.checked && !(await ensurePermission())) {
            t.checked = false;
            return toast('لازم تسمح بالإشعارات من إعدادات الموبايل', 'warn', 4500);
          }
          setPrefs({ notifyDue: t.checked });
        })();
      }
      else if (t.id === 's-cur1' || t.id === 's-cur2') {
        const v = t.value.trim().slice(0, 8);
        if (v) saveSettings({ [t.id === 's-cur1' ? 'cur1' : 'cur2']: v });
      } else if (t.id === 's-rate') {
        const r = parseNum(t.value);
        if (r > 0) saveSettings({ rate: r });
        else toast('سعر صرف غير صالح', 'warn');
      } else if (t.id === 's-limit') saveSettings({ expenseLimit: Number(t.value) });
      else if (t.id === 's-minsave') saveSettings({ minSaving: Math.max(0, parseNum(t.value) || 0) });
    });
    root.addEventListener('input', (e) => {
      if (e.target.id === 's-limit') $('#v-limit', root).textContent = pct(Number(e.target.value));
    });
    root.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'edit-cat') categoryForm(state.categories.find((c) => c.id === a.dataset.id));
      else if (act === 'check-update') checkUpdatesInteractive(a);
      else if (act === 'bio-on' || act === 'bio-off') {
        const on = act === 'bio-on';
        a.disabled = true;
        const st = await bioStatus();
        const ok = await bioVerify(on ? 'تأكيد تفعيل الدخول بالبصمة' : 'تأكيد إلغاء الدخول بالبصمة', { allowDevice: !on || !st.available });
        a.disabled = false;
        if (!ok) {
          const why = bioLastError();
          if (why && why !== 'تم الإلغاء') toast(`${on ? 'تعذر التفعيل' : 'تعذر الإلغاء'}: ${why}`, 'warn', 6000);
          return;
        }
        setPrefs({ bioUnlock: on });
        toast(on ? 'تم تفعيل الدخول بالبصمة 👆' : 'تم إلغاء الدخول بالبصمة');
        ctx.rerender();
      }
      else if (act === 'new-acc') accountForm();
      else if (act === 'edit-acc') accountForm(accountsList().find((x) => x.id === a.dataset.id));
      else if (act === 'rate-now') {
        a.disabled = true;
        try {
          const r = await maybeUpdateRate({ force: true });
          toast(r ? `سعر الصرف الآن: ${num(r, 4)}` : 'لا يوجد اتصال بالإنترنت', r ? 'ok' : 'warn');
        } catch {
          toast('تعذر جلب سعر الصرف', 'err');
        }
        a.disabled = false;
      }
      else if (act === 'new-cat') categoryForm();
      else if (act === 'export-json') {
        await saveFile(`ميزانيتي-نسخة-احتياطية-${todayISO()}.json`, JSON.stringify(exportBackup(), null, 1), 'application/json');
        toast('تم تصدير النسخة الاحتياطية');
      } else if (act === 'import-json') doImportJSON();
      else if (act === 'export-csv') {
        await saveFile(`ميزانيتي-${todayISO()}.csv`, exportCSV(), 'text/csv');
        toast('تم تصدير الملف');
      } else if (act === 'import-csv') doImportCSV();
      else if (act === 'wipe') doWipe();
      else if (act === 'lock-on') {
        const pin = await askNewPin();
        if (pin) {
          await setPin(pin);
          toast('تم تفعيل قفل التطبيق');
          ctx.rerender();
        }
      } else if (act === 'lock-change') {
        if (!(await askCurrentPin())) return;
        const pin = await askNewPin();
        if (pin) {
          await setPin(pin);
          toast('تم تغيير الرمز');
        }
      } else if (act === 'lock-off') {
        if (await askCurrentPin()) {
          removePin();
          toast('تم إلغاء القفل');
          ctx.rerender();
        }
      }
    });
  },

  render(root) {
    if (isNative)
      bioStatus().then((st) => {
        const box = root.querySelector('#bio-card');
        if (!box) return;
        const on = !!state.prefs.bioUnlock;
        box.innerHTML = `
          <div class="kv"><span>الحالة</span><b class="${on ? 'pos' : 'muted'}">${on ? '✓ مفعّل' : 'غير مفعّل'}</b></div>
          ${st.available ? '' : `<p class="muted small">⚠️ ${esc(st.reason)}${st.deviceSecure ? ' — هتقدر تفتح برمز أو نمط قفل الموبايل بدلها.' : ''}</p>`}
          <p class="muted small">لما تفتح التطبيق أو ترجعله بعد دقيقة هيطلب بصمتك، ولو ما اشتغلتش تقدر تستخدم رمز قفل الموبايل.${isLockEnabled() ? ' ولأن رمز PIN مفعّل، تقدر تكتبه برضه.' : ''}</p>
          ${on
            ? `<button class="btn btn-ghost danger-text wide" data-act="bio-off">${icon('fingerprint')} إلغاء الدخول بالبصمة</button>`
            : `<button class="btn btn-primary wide" data-act="bio-on">${icon('fingerprint')} تفعيل الدخول بالبصمة</button>`}`;
      });
    const u = state.user;
    const [sIc, sTxt] = SYNC_TXT[state.sync] || SYNC_TXT.local;
    const account =
      state.mode === 'cloud' && u
        ? `<div class="account">
            ${u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar">${icon('user')}</span>`}
            <div><b>${esc(u.name || 'مستخدم')}</b><span class="muted small">${esc(u.email || '')}</span><span class="sync-line s-${state.sync}">${icon(sIc)} ${esc(sTxt)}</span></div>
            <button class="btn btn-ghost btn-sm" data-act="logout">${icon('logout')} خروج</button></div>`
        : `<p class="muted">بياناتك محفوظة حالياً على هذا الجهاز فقط. سجّل الدخول لحفظها في السحابة ومزامنتها بين أجهزتك — وسيتم نقل بياناتك الحالية تلقائياً.</p>
           <button class="btn btn-primary" data-act="login">${icon('brand-google')} تسجيل الدخول بـ Google</button>`;

    const cats = sortedCategories();
    root.innerHTML = `
      ${card('الحساب والمزامنة', 'cloud', account)}

      ${card('المظهر', 'palette', `
        <div class="field"><span>السمة</span><div class="seg three">
          ${[['auto', 'تلقائي'], ['light', 'فاتح'], ['dark', 'داكن']].map(([v, l]) => `<label class="seg-opt"><input type="radio" name="theme" value="${v}" ${state.prefs.theme === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </div></div>`)}

      ${card('الحسابات والمحافظ', 'wallet', `<div class="cat-list">${accountBalances(state.transactions, accountsList())
        .map((b) => `<button class="cat-row" data-act="edit-acc" data-id="${esc(b.acc.id)}"><i class="dot lg" style="background:${esc(b.acc.color)}"></i><span class="grow">${esc(b.acc.name)}</span><b class="${b.balance < 0 ? 'neg' : ''}">${b.acc.cur === 'cur2' ? money2(b.balance) : money(b.balance)}</b>${icon('chevron-left')}</button>`)
        .join('')}</div><button class="btn btn-ghost" data-act="new-acc">${icon('plus')} حساب / محفظة جديدة</button>
        <p class="muted small">لو عندك أكتر من حساب (بنك، كاش، محفظة) هتقدر تختار الحساب في كل عملية وتعمل تحويل بينهم.</p>`)}

      ${card('العملات وسعر الصرف', 'coins', `<div class="row-2">
        <label class="field"><span>العملة الأساسية</span><select id="s-code1" class="select wide">${options(CURRENCIES.map(([c, n]) => [c, `${n} (${c})`]), state.settings.code1)}</select></label>
        <label class="field"><span>العملة الثانية</span><select id="s-code2" class="select wide">${options(CURRENCIES.map(([c, n]) => [c, `${n} (${c})`]), state.settings.code2)}</select></label>
      </div>
      <div class="row-3">
        <label class="field"><span>رمز الأساسية</span><input id="s-cur1" maxlength="8" value="${esc(state.settings.cur1)}"></label>
        <label class="field"><span>رمز الثانية</span><input id="s-cur2" maxlength="8" value="${esc(state.settings.cur2)}"></label>
        <label class="field"><span>سعر الصرف</span><input id="s-rate" inputmode="decimal" value="${esc(inputNum(state.settings.rate))}" ${state.settings.autoRate ? 'readonly' : ''}></label>
      </div>
      <label class="switch-row"><input type="checkbox" id="s-auto" ${state.settings.autoRate ? 'checked' : ''}><span>${icon('refresh')} تحديث سعر الصرف تلقائياً من الإنترنت</span></label>
      ${state.settings.autoRate ? `<div class="kv"><span>آخر تحديث</span><span>${state.settings.rateUpdatedAt ? `${dateLabel(new Date(state.settings.rateUpdatedAt).toISOString().slice(0, 10))} ${new Date(state.settings.rateUpdatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '—'} <button class="link" data-act="rate-now">تحديث الآن</button></span></div>` : ''}
      <p class="muted small">${state.settings.autoRate ? 'السعر الرسمي من ExchangeRate-API ويتحدث كل 12 ساعة. لو بتحوّل بسعر مختلف، اقفل التحديث التلقائي واكتب السعر بنفسك، أو عدّله في كل عملية.' : 'يُستخدم كقيمة مبدئية عند إضافة عملية، ويمكن تغييره لكل عملية على حدة.'}</p>`)}

      ${card('الفئات والميزانيات', 'category', `<div class="cat-list">${cats
        .map((c) => `<button class="cat-row" data-act="edit-cat" data-id="${esc(c.id)}"><i class="dot lg" style="background:${esc(c.color)}"></i><span class="grow">${esc(c.name)}</span><span class="pill ${c.type === 'income' ? 'pos' : 'neg'}">${c.type === 'income' ? 'إيراد' : 'مصروف'}</span>${c.budget ? `<span class="muted small">حد ${money(c.budget)}</span>` : ''}${icon('chevron-left')}</button>`)
        .join('')}</div><button class="btn btn-ghost" data-act="new-cat">${icon('plus')} فئة جديدة</button>`)}

      ${card('التنبيهات', 'alert-triangle', `<div class="row-2">
        <label class="field"><span>تنبيه عندما تتجاوز المصروفات <b id="v-limit">${pct(state.settings.expenseLimit)}</b> من الإيرادات</span><input type="range" id="s-limit" min="50" max="100" step="5" value="${state.settings.expenseLimit}"></label>
        <label class="field"><span>أدنى ادخار شهري مقبول (${esc(state.settings.cur1)})</span><input id="s-minsave" inputmode="decimal" value="${esc(inputNum(state.settings.minSaving))}"></label>
      </div>`)}

      ${card('الإشعارات والتذكيرات', 'bulb', notificationsSupported()
        ? `<label class="switch-row"><input type="checkbox" id="n-daily" ${state.prefs.notifyDaily ? 'checked' : ''}><span>تذكير يومي بتسجيل المصروفات</span></label>
          <label class="field inline-field"><span>الساعة</span><input type="time" id="n-time" value="${esc(state.prefs.notifyTime || '21:00')}"></label>
          <label class="switch-row"><input type="checkbox" id="n-due" ${state.prefs.notifyDue ? 'checked' : ''}><span>تذكير قبل مواعيد الأقساط والالتزامات بيوم</span></label>
          <p class="muted small">${dueItems().length ? `مواعيد هذا الشهر: ${dueItems().slice(0, 4).map((d) => `${esc(d.title)} (يوم ${num(d.day)})`).join('، ')}${dueItems().length > 4 ? '…' : ''}` : 'أضف أقساطاً أو عمليات متكررة لتصلك تذكيرات بمواعيدها.'}</p>`
        : `<p class="muted">الإشعارات متاحة في تطبيق أندرويد. في المتصفح هتلاقي التنبيهات في الصفحة الرئيسية.</p>`)}

      ${card('الدخول بالبصمة', 'fingerprint', isNative
        ? `<div id="bio-card"><p class="muted small">جارٍ فحص البصمة على الموبايل…</p></div>`
        : `<p class="muted">الدخول بالبصمة متاح في تطبيق أندرويد. في المتصفح تقدر تستخدم رمز القفل تحت.</p>`)}

      ${card('رمز قفل التطبيق (PIN)', 'shield-lock', isLockEnabled()
        ? `<p class="muted">قفل التطبيق مفعّل على هذا الجهاز.</p><div class="btn-row"><button class="btn btn-ghost" data-act="lock-change">${icon('lock')} تغيير الرمز</button><button class="btn btn-ghost danger-text" data-act="lock-off">إلغاء القفل</button></div>`
        : `<p class="muted">اطلب رمزاً من 4 أرقام عند فتح التطبيق على هذا الجهاز.</p><button class="btn btn-ghost" data-act="lock-on">${icon('lock')} تفعيل قفل التطبيق</button>`)}

      ${card('البيانات والنسخ الاحتياطي', 'database-export', `<div class="btn-grid">
        <button class="btn btn-ghost" data-act="export-json">${icon('database-export')} تصدير نسخة احتياطية</button>
        <button class="btn btn-ghost" data-act="import-json">${icon('database-import')} استيراد نسخة احتياطية</button>
        <button class="btn btn-ghost" data-act="export-csv">${icon('file-spreadsheet')} تصدير Excel (CSV)</button>
        <button class="btn btn-ghost" data-act="import-csv">${icon('upload')} استيراد من CSV</button>
      </div>
      <p class="muted small">النسخة الاحتياطية تقبل أيضاً ملف البيانات من النسخة القديمة للتطبيق.</p>
      <button class="btn btn-ghost danger-text" data-act="wipe">${icon('trash')} حذف كل البيانات</button>`)}

      ${card('حول التطبيق', 'info-circle', `<div class="kv"><span>الإصدار</span><b>${esc(APP_VERSION)}${isNative ? ' (أندرويد)' : ''}</b></div>
        <div class="kv"><span>عدد العمليات</span><b>${num(state.transactions.length)}</b></div>
        <button class="btn btn-ghost wide" data-act="check-update" style="margin:10px 0">${icon('refresh')} التحقق من التحديثات</button>
        <p class="muted small">بياناتك خاصة بك: عند تسجيل الدخول تُحفظ في حسابك على Firebase ولا يستطيع أي مستخدم آخر قراءتها، وتعمل بدون إنترنت وتتزامن تلقائياً.</p>`)}
    `;
  },
};
