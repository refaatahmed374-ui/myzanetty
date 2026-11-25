// حسابات مالية نقية (بدون DOM) — كل التجميعات تعتمد على المفتاح YYYY-MM فلا تختلط السنوات
import { monthKeyOf, yearOf, monthsOfYear, currentMonthKey, shiftMonth, monthLabel, money, pct, num, int } from './format.js';

export const isIncome = (t) => t.type === 'income';
export const isExpense = (t) => t.type === 'expense';

/** التحويلات بين الحسابات لا تُحسب إيراداً ولا مصروفاً */
export function summarize(list) {
  let inc = 0, exp = 0, inc2 = 0, exp2 = 0, count = 0;
  for (const t of list) {
    if (t.type === 'transfer') continue;
    count++;
    if (isIncome(t)) {
      inc += t.amount;
      inc2 += t.amount2;
    } else {
      exp += t.amount;
      exp2 += t.amount2;
    }
  }
  const net = inc - exp;
  return { inc, exp, net, inc2, exp2, net2: inc2 - exp2, count, saveRate: inc > 0 ? (net / inc) * 100 : 0 };
}

/** فلترة حسب الفترة: period = {year:'all'|number, month:'all'|'YYYY-MM'} */
export function filterTx(list, { year = 'all', month = 'all', catId = 'all', type = 'all', q = '', accountId = 'all' } = {}) {
  const query = q.trim().toLowerCase();
  return list.filter(
    (t) =>
      (year === 'all' || yearOf(t.date) === Number(year)) &&
      (month === 'all' || monthKeyOf(t.date) === month) &&
      (catId === 'all' || t.catId === catId) &&
      (type === 'all' || t.type === type) &&
      (accountId === 'all' || t.accountId === accountId || t.toAccountId === accountId) &&
      (!query || t.desc.toLowerCase().includes(query) || (t.note || '').toLowerCase().includes(query)),
  );
}

export const sortByDateDesc = (list) => [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));

export function yearsWithData(list) {
  const ys = new Set(list.map((t) => yearOf(t.date)));
  ys.add(Number(currentMonthKey().slice(0, 4)));
  return [...ys].sort((a, b) => b - a);
}

export function monthsWithData(list) {
  return [...new Set(list.map((t) => monthKeyOf(t.date)))].sort();
}

/** ملخص لكل شهر من شهور السنة (12 شهراً، الفارغ منها hasData=false) */
export function monthlySeries(list, year) {
  const groups = new Map();
  for (const t of list) {
    if (yearOf(t.date) !== Number(year)) continue;
    const k = monthKeyOf(t.date);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  return monthsOfYear(year).map((key) => {
    const rows = groups.get(key) || [];
    return { key, hasData: rows.length > 0, rows, ...summarize(rows) };
  });
}

export function byCategory(list, categories, type) {
  const map = new Map();
  for (const t of list) {
    if ((type && t.type !== type) || t.type === 'transfer') continue;
    if (!map.has(t.catId)) map.set(t.catId, { catId: t.catId, total: 0, total2: 0, count: 0, items: new Map() });
    const e = map.get(t.catId);
    e.total += t.amount;
    e.total2 += t.amount2;
    e.count++;
    e.items.set(t.desc, (e.items.get(t.desc) || 0) + t.amount);
  }
  const all = [...map.values()].sort((a, b) => b.total - a.total);
  const sum = all.reduce((s, e) => s + e.total, 0);
  return all.map((e) => ({
    ...e,
    cat: categories.find((c) => c.id === e.catId),
    share: sum > 0 ? (e.total / sum) * 100 : 0,
    items: [...e.items.entries()].sort((a, b) => b[1] - a[1]),
  }));
}

export function topExpenses(list, n = 6) {
  const m = new Map();
  for (const t of list) if (isExpense(t)) m.set(t.desc || '—', (m.get(t.desc || '—') || 0) + t.amount);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** الرصيد التراكمي: الأشهر الفارغة بين أول وآخر شهر به بيانات تحتفظ بالرصيد السابق */
export function cumulative(series) {
  const first = series.findIndex((s) => s.hasData);
  const last = series.map((s) => s.hasData).lastIndexOf(true);
  let c = 0;
  return series.map((s, i) => {
    if (first < 0 || i < first || i > last) return null;
    c += s.net;
    return c;
  });
}

/**
 * توقع بقية السنة: الأساس = متوسط آخر 3 أشهر فعلية (حتى الشهر الحالي)،
 * ثم يُطبَّق نمو شهري مركّب للأشهر القادمة.
 */
export function forecast(list, year, { incGrowth = 0, expGrowth = 0 } = {}) {
  const series = monthlySeries(list, year);
  const nowKey = currentMonthKey();
  let actual = series.filter((s) => s.hasData && s.key <= nowKey);
  if (!actual.length) actual = monthlySeries(list, Number(year) - 1).filter((s) => s.hasData);
  const base = actual.slice(-3);
  const baseInc = base.length ? base.reduce((s, m) => s + m.inc, 0) / base.length : 0;
  const baseExp = base.length ? base.reduce((s, m) => s + m.exp, 0) / base.length : 0;
  const lastActual = series.filter((s) => s.hasData && s.key <= nowKey).pop()?.key || `${Number(year) - 1}-12`;
  let step = 0;
  const rows = series.map((s) => {
    if (s.key <= lastActual) return { key: s.key, actual: true, inc: s.inc, exp: s.exp, net: s.net };
    step++;
    const inc = baseInc * Math.pow(1 + incGrowth / 100, step);
    const exp = baseExp * Math.pow(1 + expGrowth / 100, step);
    return { key: s.key, actual: false, inc, exp, net: inc - exp };
  });
  const yearInc = rows.reduce((s, r) => s + r.inc, 0);
  const yearExp = rows.reduce((s, r) => s + r.exp, 0);
  return { rows, baseInc, baseExp, baseMonths: base.length, yearInc, yearExp, yearNet: yearInc - yearExp, saveRate: yearInc > 0 ? ((yearInc - yearExp) / yearInc) * 100 : 0 };
}

/** متابعة الميزانية لفئات المصروفات التي لها حد شهري */
export function budgetStatus(list, categories, monthKey) {
  const rows = list.filter((t) => monthKeyOf(t.date) === monthKey && isExpense(t));
  return categories
    .filter((c) => c.type === 'expense' && c.budget > 0)
    .map((c) => {
      const spent = rows.filter((t) => t.catId === c.id).reduce((s, t) => s + t.amount, 0);
      return { cat: c, spent, budget: c.budget, ratio: spent / c.budget };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** تنبيهات وملاحظات ذكية: level = danger | warn | good | info */
export function insights(list, categories, settings, year) {
  const out = [];
  const series = monthlySeries(list, year).filter((s) => s.hasData);
  const limit = Number(settings.expenseLimit) || 80;
  const minSave = Number(settings.minSaving) || 0;

  for (const s of series) {
    if (s.inc > 0 && (s.exp / s.inc) * 100 > limit)
      out.push({ level: 'danger', month: s.key, text: `${monthLabel(s.key)}: المصروفات ${money(s.exp)} تجاوزت ${pct(limit)} من الإيرادات (${pct((s.exp / s.inc) * 100)})` });
    else if (s.inc === 0 && s.exp > 0) out.push({ level: 'warn', month: s.key, text: `${monthLabel(s.key)}: مصروفات ${money(s.exp)} بدون إيرادات مسجلة` });
    if (s.inc > 0 && s.net < minSave) out.push({ level: 'warn', month: s.key, text: `${monthLabel(s.key)}: صافي الادخار ${money(s.net)} أقل من الحد الأدنى ${money(minSave)}` });
  }

  const nowKey = currentMonthKey();
  for (const b of budgetStatus(list, categories, nowKey)) {
    if (b.ratio >= 1) out.push({ level: 'danger', month: nowKey, text: `ميزانية «${b.cat.name}» هذا الشهر تجاوزت الحد: ${money(b.spent)} من ${money(b.budget)}` });
    else if (b.ratio >= 0.8) out.push({ level: 'warn', month: nowKey, text: `اقتربت من حد ميزانية «${b.cat.name}»: ${pct(b.ratio * 100)} مستخدمة` });
  }

  if (series.length >= 2) {
    const [prev, last] = series.slice(-2);
    if (prev.exp > 0) {
      const ch = ((last.exp - prev.exp) / prev.exp) * 100;
      if (ch >= 15) out.push({ level: 'warn', month: last.key, text: `مصروفات ${monthLabel(last.key)} زادت ${pct(ch)} عن ${monthLabel(prev.key)}` });
      else if (ch <= -10) out.push({ level: 'good', month: last.key, text: `أحسنت! مصروفات ${monthLabel(last.key)} انخفضت ${pct(-ch)} عن ${monthLabel(prev.key)}` });
    }
    if (prev.inc > 0) {
      const ci = ((last.inc - prev.inc) / prev.inc) * 100;
      if (ci >= 10) out.push({ level: 'good', month: last.key, text: `الإيرادات في ${monthLabel(last.key)} ارتفعت ${pct(ci)} عن الشهر السابق` });
    }
  }

  const total = summarize(series.flatMap((s) => s.rows));
  if (total.inc > 0) {
    if (total.saveRate >= 20) out.push({ level: 'good', text: `معدل ادخارك في ${int(year)} ممتاز: ${pct(total.saveRate, 1)} من الإيرادات` });
    else if (total.saveRate < 0) out.push({ level: 'danger', text: `إجمالي المصروفات في ${int(year)} أعلى من الإيرادات بـ ${money(-total.net)}` });
  }

  const order = { danger: 0, warn: 1, good: 2, info: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level] || (b.month || '').localeCompare(a.month || ''));
}

/** مقارنة شهرين */
export function compareMonths(list, categories, k1, k2) {
  const r1 = list.filter((t) => monthKeyOf(t.date) === k1 && t.type !== 'transfer');
  const r2 = list.filter((t) => monthKeyOf(t.date) === k2 && t.type !== 'transfer');
  const s1 = summarize(r1), s2 = summarize(r2);
  const ids = [...new Set([...r1, ...r2].map((t) => t.catId))];
  const cats = ids.map((id) => {
    const v1 = r1.filter((t) => t.catId === id).reduce((s, t) => s + t.amount, 0);
    const v2 = r2.filter((t) => t.catId === id).reduce((s, t) => s + t.amount, 0);
    return { cat: categories.find((c) => c.id === id), catId: id, v1, v2, diff: v2 - v1 };
  });
  return { s1, s2, cats };
}

export function previousMonthWithData(list, key) {
  const ms = monthsWithData(list).filter((k) => k < key);
  return ms.pop() || shiftMonth(key, -1);
}

/** المبلغ المطلوب شهرياً لتحقيق الهدف في موعده */
export function goalPlan(g) {
  const remaining = Math.max(0, g.target - g.current);
  if (!g.due) return { remaining, monthsLeft: null, perMonth: null };
  const [y, m] = g.due.split('-').map(Number);
  const [cy, cm] = currentMonthKey().split('-').map(Number);
  const monthsLeft = (y - cy) * 12 + (m - cm) + 1;
  return { remaining, monthsLeft, perMonth: monthsLeft > 0 ? remaining / monthsLeft : null };
}

/** رصيد كل حساب = الرصيد الافتتاحي + الإيرادات − المصروفات ± التحويلات (بعملة الحساب) */
export function accountBalances(list, accounts) {
  const bal = new Map(accounts.map((a) => [a.id, Number(a.opening) || 0]));
  const curOf = new Map(accounts.map((a) => [a.id, a.cur]));
  const val = (t, accId) => (curOf.get(accId) === 'cur2' ? t.amount2 : t.amount);
  const first = accounts[0]?.id;
  const add = (id, v) => {
    const k = bal.has(id) ? id : first;
    if (k) bal.set(k, (bal.get(k) || 0) + v);
  };
  for (const t of list) {
    if (t.type === 'transfer') {
      add(t.accountId, -val(t, t.accountId));
      add(t.toAccountId, val(t, t.toAccountId));
    } else add(t.accountId, t.type === 'income' ? val(t, t.accountId) : -val(t, t.accountId));
  }
  return accounts.map((a) => ({ acc: a, balance: bal.get(a.id) || 0 }));
}

const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * تحليل ذكي لشهر معيّن (بدون أي خدمة خارجية — كل الحساب على الجهاز):
 * - تغيّر كل فئة مقارنة بمتوسط آخر 3 أشهر
 * - مصروفات غير معتادة مقارنة بتاريخ نفس البند
 * - بنود تتكرر كل شهر ويمكن تحويلها لعمليات متكررة
 * - توقع مصروف الشهر الحالي حسب معدل الصرف اليومي
 * - فرصة توفير
 */
export function analyze(list, categories, monthKey, recurring = []) {
  const months = monthsWithData(list).filter((k) => k < monthKey).slice(-3);
  const cur = list.filter((t) => monthKeyOf(t.date) === monthKey && isExpense(t));
  const prev = list.filter((t) => months.includes(monthKeyOf(t.date)) && isExpense(t));
  const n = months.length || 1;

  // 1) تغيّر الفئات
  const catIds = [...new Set([...cur, ...prev].map((t) => t.catId))];
  const catChanges = catIds
    .map((id) => {
      const now = cur.filter((t) => t.catId === id).reduce((s, t) => s + t.amount, 0);
      const avg = prev.filter((t) => t.catId === id).reduce((s, t) => s + t.amount, 0) / n;
      return { cat: categories.find((c) => c.id === id), catId: id, now, avg, diff: now - avg, pct: avg > 0 ? ((now - avg) / avg) * 100 : null };
    })
    .filter((c) => months.length && (c.now > 0 || c.avg > 0))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  // 2) مصروفات غير معتادة
  const unusual = cur
    .map((t) => {
      const hist = list.filter((x) => x.desc === t.desc && isExpense(x) && x.id !== t.id && x.date < t.date).map((x) => x.amount);
      const med = median(hist);
      return { t, med, ratio: med > 0 ? t.amount / med : null, hist: hist.length };
    })
    .filter((u) => u.hist >= 2 && u.ratio >= 1.5)
    .sort((a, b) => b.t.amount - b.med - (a.t.amount - a.med))
    .slice(0, 5);

  // 3) بنود متكررة غير مسجلة كعمليات متكررة
  const last4 = monthsWithData(list).filter((k) => k <= monthKey).slice(-4);
  const recDescs = new Set(recurring.filter((r) => r.active).map((r) => r.desc));
  const byDesc = new Map();
  for (const t of list) {
    if (t.type === 'transfer' || t.recurringId || !last4.includes(monthKeyOf(t.date))) continue;
    if (!byDesc.has(t.desc)) byDesc.set(t.desc, new Map());
    byDesc.get(t.desc).set(monthKeyOf(t.date), t);
  }
  const candidates = [...byDesc.entries()]
    .filter(([d, m]) => d && m.size >= 3 && !recDescs.has(d))
    .map(([desc, m]) => {
      const txs = [...m.values()].sort((a, b) => b.date.localeCompare(a.date));
      const amounts = txs.map((t) => t.amount);
      const stable = Math.max(...amounts) - Math.min(...amounts) <= median(amounts) * 0.15;
      return { desc, last: txs[0], months: m.size, stable };
    })
    .sort((a, b) => b.months - a.months || b.last.amount - a.last.amount)
    .slice(0, 6);

  // 4) معدل الصرف في الشهر الحالي
  let pace = null;
  if (monthKey === currentMonthKey()) {
    const [y, m] = monthKey.split('-').map(Number);
    const daysIn = new Date(y, m, 0).getDate();
    const day = new Date().getDate();
    const variable = cur.filter((t) => !t.recurringId && !t.debtId);
    const spent = variable.reduce((s, t) => s + t.amount, 0);
    const fixed = cur.filter((t) => t.recurringId || t.debtId).reduce((s, t) => s + t.amount, 0);
    const avgPrev = prev.reduce((s, t) => s + t.amount, 0) / n;
    if (day >= 3 && spent > 0) pace = { spent, fixed, projected: fixed + (spent / day) * daysIn, avgPrev: months.length ? avgPrev : null, day, daysIn };
  }

  // 5) فرصة توفير: أكبر فئة مصروفات متغيرة
  const top = byCategory(cur.filter((t) => !t.debtId), categories, 'expense')[0];
  const saving = top && top.total > 0 ? { cat: top.cat, catId: top.catId, total: top.total, save10: top.total * 0.1 } : null;

  return { months, catChanges, unusual, candidates, pace, saving };
}
