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
