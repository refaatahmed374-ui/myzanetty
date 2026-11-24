// حسابات مالية نقية (بدون DOM) — كل التجميعات تعتمد على المفتاح YYYY-MM فلا تختلط السنوات
import { monthKeyOf, yearOf, monthsOfYear, currentMonthKey, shiftMonth, monthLabel, money, pct, num, int } from './format.js';

export const isIncome = (t) => t.type === 'income';

export function summarize(list) {
  let inc = 0, exp = 0, inc2 = 0, exp2 = 0;
  for (const t of list) {
    if (isIncome(t)) {
      inc += t.amount;
      inc2 += t.amount2;
    } else {
      exp += t.amount;
      exp2 += t.amount2;
    }
  }
  const net = inc - exp;
  return { inc, exp, net, inc2, exp2, net2: inc2 - exp2, count: list.length, saveRate: inc > 0 ? (net / inc) * 100 : 0 };
}

/** فلترة حسب الفترة: period = {year:'all'|number, month:'all'|'YYYY-MM'} */
export function filterTx(list, { year = 'all', month = 'all', catId = 'all', type = 'all', q = '' } = {}) {
  const query = q.trim().toLowerCase();
  return list.filter(
    (t) =>
      (year === 'all' || yearOf(t.date) === Number(year)) &&
      (month === 'all' || monthKeyOf(t.date) === month) &&
      (catId === 'all' || t.catId === catId) &&
      (type === 'all' || t.type === type) &&
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
    if (type && t.type !== type) continue;
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
  for (const t of list) if (!isIncome(t)) m.set(t.desc || '—', (m.get(t.desc || '—') || 0) + t.amount);
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
  const rows = list.filter((t) => monthKeyOf(t.date) === monthKey && !isIncome(t));
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
  const r1 = list.filter((t) => monthKeyOf(t.date) === k1);
  const r2 = list.filter((t) => monthKeyOf(t.date) === k2);
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
