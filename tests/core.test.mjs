// اختبارات منطق البيانات والحسابات — تشغيل: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };

const store = await import('../src/core/store.js');
const calc = await import('../src/core/calc.js');
const fmt = await import('../src/core/format.js');

const legacy = {
  DATA: [
    { y: 2026, m: 'يناير', d: 'راتب', c: 'ايرادات شهرية', sar: 1000, r: 12.75, egp: 12750 },
    { y: 2026, m: 'يناير', d: 'ايجار', c: 'التزامات شهرية', sar: 200, r: 12.75, egp: 2550 },
    { y: 2026, m: 'ابريل', d: 'اكل', c: 'مصاريف شخصية', sar: 300, r: 14, egp: 4200 },
    { y: 2027, m: 'يناير', d: 'راتب', c: 'ايرادات شهرية', sar: 1500, r: 15, egp: 22500 },
    { y: 2026, m: 'مايو', d: 'هدية', c: 'فئة جديدة', sar: 50, r: 14, egp: 700 },
  ],
  goals: [{ name: 'طوارئ', target: 5000, current: 1200, cat: 'طوارئ', priority: 'عالية', due: '2026-12' }],
};

test('ترحيل البيانات القديمة بدون تكرار وبدون خلط السنوات', async () => {
  store.useLocal();
  assert.equal(await store.importBackup(legacy), 5);
  assert.equal(await store.importBackup(legacy), 5);
  assert.equal(store.state.transactions.length, 5, 'إعادة الاستيراد لا تكرر العمليات');
  assert.equal(store.state.goals.length, 1);
  const jan26 = calc.summarize(calc.filterTx(store.state.transactions, { month: '2026-01' }));
  assert.equal(jan26.inc, 1000);
  assert.equal(jan26.exp, 200);
  const jan27 = calc.summarize(calc.filterTx(store.state.transactions, { month: '2027-01' }));
  assert.equal(jan27.inc, 1500, 'يناير 2027 منفصل عن يناير 2026');
  assert.ok(store.state.transactions.some((t) => t.date === '2026-04-01'), 'ابريل بدون همزة يُفهم');
  assert.ok(store.state.categories.some((c) => c.name === 'فئة جديدة'), 'الفئات غير المعروفة تُنشأ');
  assert.equal(store.state.transactions.find((t) => t.desc === 'ايجار').amount2, 2550, 'المبلغ بالعملة الثانية محفوظ كما هو');
});

test('تصدير CSV ثم استيراده يعطي نفس العمليات (مع فواصل وعلامات تنصيص)', async () => {
  store.saveTransaction({ catId: 'other', desc: 'وصف، فيه "تنصيص", وفاصلة', amount: 12.5, rate: 14, date: '2026-06-15', note: 'سطر\nجديد' });
  const csv = store.exportCSV();
  const before = store.state.transactions.length;
  await store.wipeAll({ keepCategories: true });
  assert.equal(store.state.transactions.length, 0);
  const r = await store.importCSV(csv);
  assert.equal(r.added, before);
  const t = store.state.transactions.find((x) => x.amount === 12.5);
  assert.equal(t.desc, 'وصف، فيه "تنصيص", وفاصلة');
  assert.equal(t.note, 'سطر\nجديد');
  assert.equal(t.date, '2026-06-15');
});

test('استيراد CSV بالصيغة القديمة وبأرقام عربية', async () => {
  const r = await store.importCSV('2026,يونيو,راتب,ايرادات شهرية,1000,14,14000\nسطر غير صالح');
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 1);
  assert.equal(fmt.parseNum('١٢٣٫٥'), 123.5);
  assert.equal(fmt.parseNum('1,250'), 1250);
  assert.ok(Number.isNaN(fmt.parseNum('abc')));
});

test('نسخ شهر يضبط اليوم لآخر الشهر', async () => {
  await store.wipeAll({ keepCategories: true });
  store.saveTransaction({ catId: 'bills', desc: 'إيجار', amount: 100, date: '2026-01-31' });
  const n = await store.copyMonth('2026-01', '2026-02');
  assert.equal(n, 1);
  assert.ok(store.state.transactions.some((t) => t.date === '2026-02-28'));
});

test('التوقع والتدفق التراكمي', async () => {
  await store.wipeAll({ keepCategories: true });
  for (const m of ['01', '02', '03']) {
    store.saveTransaction({ catId: 'inc', desc: 'راتب', amount: 1000, date: `2025-${m}-01` });
    store.saveTransaction({ catId: 'bills', desc: 'إيجار', amount: 400, date: `2025-${m}-02` });
  }
  const f = calc.forecast(store.state.transactions, 2025);
  assert.equal(f.baseInc, 1000);
  assert.equal(f.baseExp, 400);
  assert.equal(Math.round(f.yearInc), 12000);
  assert.equal(Math.round(f.yearNet), 7200);
  const cum = calc.cumulative(calc.monthlySeries(store.state.transactions, 2025));
  assert.deepEqual(cum.slice(0, 4), [600, 1200, 1800, null]);
});

test('حذف فئة ينقل عملياتها', async () => {
  const c = store.saveCategory({ name: 'مؤقتة', type: 'expense' });
  const t = store.saveTransaction({ catId: c.id, desc: 'x', amount: 5 });
  await store.deleteCategory(c.id, 'other');
  assert.equal(store.state.transactions.find((x) => x.id === t.id).catId, 'other');
  assert.ok(!store.catById(c.id));
});

test('تهريب HTML', () => {
  assert.equal(fmt.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});

test('ملف النسخة القديمة الحقيقي (إن وُجد محلياً) يطابق مجاميع التطبيق القديم', { skip: !existsSync('backup/legacy-data.json') }, async () => {
  const real = JSON.parse(readFileSync('backup/legacy-data.json', 'utf8'));
  await store.wipeAll({ keepCategories: true });
  await store.importBackup(real);
  for (const [i, m] of ['يناير', 'فبراير', 'مارس', 'ابريل', 'مايو'].entries()) {
    const rows = real.DATA.filter((r) => r.m === m);
    const inc = rows.filter((r) => r.c === 'ايرادات شهرية').reduce((s, r) => s + r.sar, 0);
    const exp = rows.filter((r) => r.c !== 'ايرادات شهرية').reduce((s, r) => s + r.sar, 0);
    const s = calc.summarize(calc.filterTx(store.state.transactions, { month: `2026-0${i + 1}` }));
    assert.equal(s.inc.toFixed(2), inc.toFixed(2), m);
    assert.equal(s.exp.toFixed(2), exp.toFixed(2), m);
  }
});

test('العمليات المتكررة: تُنشأ مرة واحدة لكل شهر وتلحق الشهور الفائتة', async () => {
  await store.wipeAll({ keepCategories: true });
  store.saveSettings({ rate: 14 });
  const r = store.saveRecurring({ desc: 'إيجار', catId: 'bills', fixedIn: 'cur2', amount: 3000, day: 31, start: '2026-01' });
  assert.equal(await store.applyRecurring('2026-03-15'), 2, 'يناير وفبراير فقط (مارس لم يحن يومه)');
  assert.ok(store.state.transactions.some((t) => t.date === '2026-02-28'), 'يوم 31 يصبح آخر فبراير');
  const feb = store.state.transactions.find((t) => t.date === '2026-02-28');
  assert.equal(feb.amount2, 3000);
  assert.equal(feb.amount, Math.round((3000 / 14) * 100) / 100);
  assert.equal(await store.applyRecurring('2026-03-15'), 0, 'لا تكرار عند التشغيل مرة ثانية');
  assert.equal(await store.applyRecurring('2026-03-31'), 1);
  store.deleteTransaction(store.state.transactions.find((t) => t.date === '2026-03-31').id);
  assert.equal(await store.applyRecurring('2026-03-31'), 0, 'العملية المحذوفة لا تُعاد');
  store.saveRecurring({ ...store.state.recurring.find((x) => x.id === r.id), active: false });
  assert.equal(await store.applyRecurring('2026-06-30'), 0, 'المتوقفة لا تُنشئ شيئاً');
});

test('الأقساط: المدفوع والمتبقي والدفع التلقائي يتوقف عند الانتهاء', async () => {
  await store.wipeAll({ keepCategories: true });
  const d = store.saveDebt({ name: 'قرض تجريبي', total: 1000, installment: 300, fixedIn: 'cur1', initialPaid: 100, dueDay: 5 });
  let st = store.debtStatus(d);
  assert.equal(st.remaining, 900);
  assert.equal(st.left, 3);
  store.payDebt(d, 300, '2026-01-05');
  st = store.debtStatus(d);
  assert.equal(st.paid, 400);
  assert.equal(st.left, 2);
  store.setDebtAuto(d, true);
  const rule = store.state.recurring.find((x) => x.debtId === d.id);
  store.saveRecurring({ ...rule, start: '2026-02', lastApplied: '' });
  const n = await store.applyRecurring('2026-12-31');
  assert.equal(n, 2, 'قسطان فقط حتى يكتمل المبلغ');
  assert.ok(store.debtStatus(d).done);
});

test('التحويل بين الحسابات لا يُحسب إيراداً ولا مصروفاً ويؤثر على الأرصدة', async () => {
  await store.wipeAll({ keepCategories: true });
  const bank = store.saveAccount({ name: 'بنك', cur: 'cur1', opening: 1000 });
  const cash = store.saveAccount({ name: 'كاش مصر', cur: 'cur2', opening: 0 });
  store.saveTransaction({ catId: 'inc', desc: 'راتب', amount: 2000, rate: 14, accountId: bank.id, date: '2026-05-01' });
  store.saveTransaction({ type: 'transfer', amount: 500, rate: 14, accountId: bank.id, toAccountId: cash.id, date: '2026-05-02' });
  store.saveTransaction({ catId: 'personal', desc: 'اكل', amount: 100, rate: 14, amount2: 1400, accountId: cash.id, date: '2026-05-03' });
  const s = calc.summarize(store.state.transactions);
  assert.equal(s.inc, 2000);
  assert.equal(s.exp, 100);
  assert.equal(s.count, 2);
  const bal = Object.fromEntries(calc.accountBalances(store.state.transactions, store.accountsList()).map((b) => [b.acc.name, b.balance]));
  assert.equal(bal['بنك'], 2500);
  assert.equal(bal['كاش مصر'], 7000 - 1400);
});

test('التحليل الذكي يكتشف البنود المتكررة والمصروف غير المعتاد', async () => {
  await store.wipeAll({ keepCategories: true });
  for (const m of ['01', '02', '03', '04']) {
    store.saveTransaction({ catId: 'bills', desc: 'نت', amount: 100, date: `2026-${m}-10` });
    store.saveTransaction({ catId: 'personal', desc: 'بنزين', amount: m === '04' ? 400 : 150, date: `2026-${m}-12` });
  }
  const a = calc.analyze(store.state.transactions, store.state.categories, '2026-04', []);
  assert.ok(a.candidates.some((c) => c.desc === 'نت' && c.stable));
  assert.ok(a.unusual.some((u) => u.t.desc === 'بنزين'));
  assert.ok(a.catChanges.find((c) => c.catId === 'personal').diff > 0);
});

test('النسخة الاحتياطية تشمل الحسابات والمتكرر والأقساط', async () => {
  const backup = JSON.parse(JSON.stringify(store.exportBackup()));
  store.saveRecurring({ desc: 'x', amount: 1, day: 1 });
  store.saveDebt({ name: 'y', total: 10, installment: 1 });
  const full = JSON.parse(JSON.stringify(store.exportBackup()));
  await store.wipeAll();
  await store.importBackup(full, { replace: true });
  assert.equal(store.state.recurring.length, full.recurring.length);
  assert.equal(store.state.debts.length, full.debts.length);
  assert.equal(store.state.accounts.length, full.accounts.length);
  assert.ok(backup.version >= 3);
});

test('مقارنة أرقام الإصدارات للتحديث', async () => {
  const { isNewer } = await import('../src/core/updater.js');
  assert.ok(isNewer('2.1.10', '2.1.9'));
  assert.ok(isNewer('v2.2.0', '2.1.9'));
  assert.ok(isNewer('3.0', '2.9.9'));
  assert.ok(!isNewer('2.1.1', '2.1.1'));
  assert.ok(!isNewer('2.1.0', '2.1.1'));
});
