// مخزن الحالة المركزي — مصدر واحد للبيانات، مع واجهة تخزين قابلة للتبديل (محلي / سحابي)
import { uid, todayISO, round2, monthKeyOf, configureFormat, makeMonthKey, currentMonthKey, shiftMonth } from './format.js';

const DATA_KEY = 'myz.v2.data';
const PREFS_KEY = 'myz.v2.prefs';

/** كل المجموعات المحفوظة (محلياً وفي Firestore تحت users/{uid}/...) */
export const COLLECTIONS = ['transactions', 'goals', 'categories', 'accounts', 'recurring', 'debts'];

export const DEFAULT_CATEGORIES = [
  { id: 'inc', name: 'إيرادات', type: 'income', color: '#0f9d76', budget: 0, order: 0 },
  { id: 'bills', name: 'التزامات شهرية', type: 'expense', color: '#e0524f', budget: 0, order: 1 },
  { id: 'personal', name: 'مصاريف شخصية', type: 'expense', color: '#d4880f', budget: 0, order: 2 },
  { id: 'savings', name: 'مدخرات', type: 'expense', color: '#3b82f6', budget: 0, order: 3 },
  { id: 'other', name: 'أخرى', type: 'expense', color: '#8b5cf6', budget: 0, order: 4 },
];

export const DEFAULT_ACCOUNTS = [{ id: 'main', name: 'الحساب الرئيسي', kind: 'bank', cur: 'cur1', opening: 0, color: '#0f766e', order: 0 }];

/** إعدادات تتم مزامنتها مع الحساب */
export const DEFAULT_SETTINGS = {
  cur1: 'ر.س',
  cur2: 'ج.م',
  code1: 'SAR',
  code2: 'EGP',
  rate: 14,
  autoRate: true,
  rateUpdatedAt: 0,
  expenseLimit: 80,
  minSaving: 200,
};
/** تفضيلات خاصة بهذا الجهاز فقط */
export const DEFAULT_PREFS = { theme: 'auto', notifyDaily: false, notifyTime: '21:00', notifyDue: true, bioUnlock: false };

const emptyData = () => ({
  transactions: [],
  goals: [],
  categories: structuredClone(DEFAULT_CATEGORIES),
  accounts: structuredClone(DEFAULT_ACCOUNTS),
  recurring: [],
  debts: [],
});

export const state = {
  ...emptyData(),
  settings: { ...DEFAULT_SETTINGS },
  prefs: { ...DEFAULT_PREFS },
  mode: 'local', // local | cloud
  user: null,
  sync: 'local', // local | syncing | ok | offline | error
  ready: false,
};

// ---------- أحداث ----------
const listeners = new Set();
let queued = false;
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    configureFormat({ cur1: state.settings.cur1, cur2: state.settings.cur2 });
    listeners.forEach((fn) => fn(state));
  });
}

// ---------- التخزين المحلي ----------
function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readLocalData() {
  const d = readJSON(DATA_KEY) || {};
  const base = emptyData();
  for (const name of COLLECTIONS) {
    if (Array.isArray(d[name]) && (d[name].length || !['categories', 'accounts'].includes(name))) base[name] = d[name];
  }
  return { ...base, settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) } };
}

function saveLocal() {
  if (state.mode !== 'local') return;
  const data = { v: 3, settings: state.settings };
  for (const name of COLLECTIONS) data[name] = state[name];
  if (!writeJSON(DATA_KEY, data)) console.warn('تعذر الحفظ المحلي (المساحة ممتلئة؟)');
}

export function clearLocalData() {
  try {
    localStorage.removeItem(DATA_KEY);
  } catch {}
}

/** الواجهة المحلية: الحالة نفسها هي المصدر، ونحفظها كاملة عند أي تغيير */
export const localBackend = {
  kind: 'local',
  put: saveLocal,
  del: saveLocal,
  putSettings: saveLocal,
  bulk: async () => saveLocal(),
  wipe: async () => saveLocal(),
};

let backend = localBackend;

export function useLocal() {
  const d = readLocalData();
  backend = localBackend;
  Object.assign(state, d, { mode: 'local', user: null, sync: 'local', ready: true });
  emit();
}

/** تفعيل الواجهة السحابية — البيانات ستصل عبر setCollection من مستمعي Firestore */
export function useBackend(b, patch = {}) {
  if (b) backend = b;
  Object.assign(state, patch);
  emit();
}

export function setCollection(name, items) {
  if (name === 'categories' && !items.length) items = structuredClone(DEFAULT_CATEGORIES);
  if (name === 'accounts' && !items.length) items = structuredClone(DEFAULT_ACCOUNTS);
  state[name] = items;
  emit();
}

export function setSettingsFromCloud(s) {
  state.settings = { ...DEFAULT_SETTINGS, ...(s || {}) };
  emit();
}

export function setSync(status) {
  if (state.sync !== status) {
    state.sync = status;
    emit();
  }
}

// ---------- التفضيلات ----------
export function loadPrefs() {
  state.prefs = { ...DEFAULT_PREFS, ...(readJSON(PREFS_KEY) || {}) };
}
export function setPrefs(patch) {
  state.prefs = { ...state.prefs, ...patch };
  writeJSON(PREFS_KEY, state.prefs);
  emit();
}

// ---------- أدوات عامة ----------
function upsert(arr, item) {
  const i = arr.findIndex((x) => x.id === item.id);
  if (i >= 0) arr[i] = item;
  else arr.push(item);
}

function putItem(name, item) {
  upsert(state[name], item);
  backend.put(name, item);
  emit();
  return item;
}

function delItem(name, id) {
  state[name] = state[name].filter((x) => x.id !== id);
  backend.del(name, id);
  emit();
}

export const catById = (id) => state.categories.find((c) => c.id === id);
export const catName = (id) => (id === 'transfer' ? 'تحويل' : catById(id)?.name || 'غير مصنف');
export const catColor = (id) => (id === 'transfer' ? '#64748b' : catById(id)?.color || '#8a8f98');

export function sortedCategories(type) {
  return state.categories
    .filter((c) => !type || c.type === type)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name, 'ar'));
}

// ---------- الحسابات (المحافظ) ----------
export const accountsList = () => [...(state.accounts.length ? state.accounts : DEFAULT_ACCOUNTS)].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
export const accountById = (id) => accountsList().find((a) => a.id === id);
export const accountName = (id) => accountById(id)?.name || 'الحساب الرئيسي';
export const defaultAccountId = () => accountsList()[0]?.id || 'main';

export function saveAccount(input) {
  const a = {
    id: input.id || uid(),
    name: String(input.name || '').trim().slice(0, 40) || 'حساب',
    kind: ['cash', 'bank', 'wallet', 'card'].includes(input.kind) ? input.kind : 'bank',
    cur: input.cur === 'cur2' ? 'cur2' : 'cur1',
    opening: round2(Number(input.opening) || 0),
    color: /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : '#0f766e',
    order: Number.isFinite(input.order) ? input.order : state.accounts.length,
  };
  if (!state.accounts.length) state.accounts = structuredClone(DEFAULT_ACCOUNTS);
  return putItem('accounts', a);
}

export async function deleteAccount(id, moveTo) {
  const moved = state.transactions
    .filter((t) => t.accountId === id || t.toAccountId === id)
    .map((t) => normalizeTx({ ...t, accountId: t.accountId === id ? moveTo : t.accountId, toAccountId: t.toAccountId === id ? moveTo : t.toAccountId, updatedAt: Date.now() }));
  moved.forEach((t) => upsert(state.transactions, t));
  delItem('accounts', id);
  if (moved.length) await backend.bulk({ transactions: moved });
  emit();
}

// ---------- العمليات ----------
function validDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : todayISO();
}

export function normalizeTx(t) {
  const isTransfer = t.type === 'transfer';
  const cat = isTransfer ? null : catById(t.catId);
  const amount = round2(Math.abs(Number(t.amount) || 0));
  const rate = Number(t.rate) > 0 ? Number(t.rate) : Number(state.settings.rate) || 1;
  const amount2 = Number(t.amount2) > 0 ? round2(t.amount2) : round2(amount * rate);
  const tx = {
    id: t.id || uid(),
    date: validDate(t.date),
    type: isTransfer ? 'transfer' : cat ? cat.type : t.type === 'income' ? 'income' : 'expense',
    catId: isTransfer ? 'transfer' : t.catId || 'other',
    accountId: t.accountId || defaultAccountId(),
    desc: String(t.desc || '').trim().slice(0, 120),
    note: String(t.note || '').trim().slice(0, 500),
    amount,
    rate,
    amount2,
    createdAt: t.createdAt || Date.now(),
    updatedAt: t.updatedAt || Date.now(),
  };
  if (isTransfer) tx.toAccountId = t.toAccountId || defaultAccountId();
  if (t.debtId) tx.debtId = t.debtId;
  if (t.recurringId) tx.recurringId = t.recurringId;
  return tx;
}

export function saveTransaction(input) {
  const tx = normalizeTx({ ...input, updatedAt: Date.now() });
  return putItem('transactions', tx);
}

export function deleteTransaction(id) {
  delItem('transactions', id);
}

/** نسخ عمليات شهر إلى شهر آخر (مثل الالتزامات الثابتة) */
export async function copyMonth(fromKey, toKey, ids) {
  const [ty, tm] = toKey.split('-').map(Number);
  const lastDay = new Date(ty, tm, 0).getDate();
  const src = state.transactions.filter((t) => monthKeyOf(t.date) === fromKey && (!ids || ids.includes(t.id)));
  const now = Date.now();
  const copies = src.map((t, i) => {
    const day = Math.min(Number(t.date.slice(8, 10)) || 1, lastDay);
    const { recurringId, ...rest } = t;
    return normalizeTx({ ...rest, id: uid(), date: `${toKey}-${String(day).padStart(2, '0')}`, createdAt: now + i, updatedAt: now + i });
  });
  state.transactions.push(...copies);
  await backend.bulk({ transactions: copies });
  emit();
  return copies.length;
}

// ---------- الأهداف ----------
export function saveGoal(input) {
  return putItem('goals', {
    id: input.id || uid(),
    name: String(input.name || '').trim().slice(0, 80),
    target: Math.max(0, Number(input.target) || 0),
    current: Math.max(0, Number(input.current) || 0),
    kind: input.kind || 'ادخار',
    priority: input.priority || 'متوسطة',
    due: /^\d{4}-\d{2}$/.test(input.due || '') ? input.due : '',
    createdAt: input.createdAt || Date.now(),
    updatedAt: Date.now(),
  });
}

export const deleteGoal = (id) => delItem('goals', id);

// ---------- الفئات ----------
export function saveCategory(input) {
  const c = {
    id: input.id || uid(),
    name: String(input.name || '').trim().slice(0, 40) || 'فئة',
    type: input.type === 'income' ? 'income' : 'expense',
    color: /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : '#8b5cf6',
    budget: Math.max(0, Number(input.budget) || 0),
    order: Number.isFinite(input.order) ? input.order : state.categories.length,
  };
  const prev = catById(c.id);
  putItem('categories', c);
  // لو تغيّر نوع الفئة نحدّث نوع عملياتها
  if (prev && prev.type !== c.type) {
    const changed = state.transactions.filter((t) => t.catId === c.id).map((t) => ({ ...t, type: c.type, updatedAt: Date.now() }));
    changed.forEach((t) => upsert(state.transactions, t));
    backend.bulk({ transactions: changed });
    emit();
  }
  return c;
}

export async function deleteCategory(id, reassignTo) {
  const moved = state.transactions.filter((t) => t.catId === id).map((t) => normalizeTx({ ...t, catId: reassignTo, updatedAt: Date.now() }));
  moved.forEach((t) => upsert(state.transactions, t));
  delItem('categories', id);
  if (moved.length) await backend.bulk({ transactions: moved });
  emit();
}

export function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  backend.putSettings(state.settings);
  emit();
}

// ---------- العمليات المتكررة ----------
/**
 * قاعدة تكرار: تُنشئ عملية كل شهر في يوم محدد. المبلغ ثابت بعملة واحدة (fixedIn)
 * والعملة الأخرى تُحسب بسعر الصرف وقت الإنشاء.
 */
export function saveRecurring(input) {
  const r = {
    id: input.id || uid(),
    desc: String(input.desc || '').trim().slice(0, 120) || 'عملية متكررة',
    catId: input.catId || 'bills',
    accountId: input.accountId || defaultAccountId(),
    fixedIn: input.fixedIn === 'cur2' ? 'cur2' : 'cur1',
    amount: round2(Math.abs(Number(input.amount) || 0)),
    day: Math.min(31, Math.max(1, Number(input.day) || 1)),
    start: /^\d{4}-\d{2}$/.test(input.start || '') ? input.start : currentMonthKey(),
    end: /^\d{4}-\d{2}$/.test(input.end || '') ? input.end : '',
    active: input.active !== false,
    lastApplied: input.lastApplied || '',
    note: String(input.note || '').slice(0, 300),
    createdAt: input.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  if (input.debtId) r.debtId = input.debtId;
  return putItem('recurring', r);
}

export const deleteRecurring = (id) => delItem('recurring', id);

function amountsFor(fixedIn, value, rate) {
  return fixedIn === 'cur2' ? { amount: round2(value / rate), amount2: round2(value), rate } : { amount: round2(value), amount2: round2(value * rate), rate };
}

/** إنشاء العمليات المستحقة من القواعد المتكررة (حتى اليوم). يرجع عدد العمليات الجديدة */
export async function applyRecurring(today = todayISO()) {
  const nowKey = monthKeyOf(today);
  const todayDay = Number(today.slice(8, 10));
  const rate = Number(state.settings.rate) || 1;
  const created = [];
  const updatedRules = [];
  for (const r of state.recurring) {
    if (!r.active || !(r.amount > 0)) continue;
    const debt = r.debtId ? state.debts.find((d) => d.id === r.debtId) : null;
    let key = r.lastApplied ? shiftMonth(r.lastApplied, 1) : r.start;
    // لا نُنشئ أكثر من 24 شهراً متأخراً دفعة واحدة
    const oldest = shiftMonth(nowKey, -23);
    if (key < oldest) key = oldest;
    let last = r.lastApplied;
    while (key <= nowKey && (!r.end || key <= r.end)) {
      const [y, m] = key.split('-').map(Number);
      const day = Math.min(r.day, new Date(y, m, 0).getDate());
      if (key === nowKey && todayDay < day) break;
      if (debt && debtStatus(debt).remaining <= 0.01) break;
      const id = `rc${r.id}${key.replace('-', '')}`;
      if (!state.transactions.some((t) => t.id === id)) {
        const tx = normalizeTx({
          id,
          date: `${key}-${String(day).padStart(2, '0')}`,
          catId: r.catId,
          accountId: r.accountId,
          desc: r.desc,
          note: r.note,
          recurringId: r.id,
          debtId: r.debtId,
          ...amountsFor(r.fixedIn, r.amount, rate),
        });
        state.transactions.push(tx);
        created.push(tx);
      }
      last = key;
      key = shiftMonth(key, 1);
    }
    if (last !== r.lastApplied) {
      const nr = { ...r, lastApplied: last, updatedAt: Date.now() };
      upsert(state.recurring, nr);
      updatedRules.push(nr);
    }
  }
  if (created.length || updatedRules.length) {
    await backend.bulk({ transactions: created, recurring: updatedRules });
    emit();
  }
  return created.length;
}

// ---------- الأقساط والديون ----------
export function saveDebt(input) {
  const d = {
    id: input.id || uid(),
    name: String(input.name || '').trim().slice(0, 80) || 'قسط',
    total: round2(Math.abs(Number(input.total) || 0)),
    installment: round2(Math.abs(Number(input.installment) || 0)),
    fixedIn: input.fixedIn === 'cur2' ? 'cur2' : 'cur1',
    initialPaid: round2(Math.abs(Number(input.initialPaid) || 0)),
    dueDay: Math.min(31, Math.max(1, Number(input.dueDay) || 1)),
    catId: input.catId || 'bills',
    accountId: input.accountId || defaultAccountId(),
    note: String(input.note || '').slice(0, 300),
    createdAt: input.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  return putItem('debts', d);
}

export function deleteDebt(id) {
  // نوقف أي تكرار مرتبط بالقسط، ونترك العمليات المسجلة كما هي
  state.recurring.filter((r) => r.debtId === id).forEach((r) => saveRecurring({ ...r, active: false, debtId: undefined }));
  delItem('debts', id);
}

/** حالة القسط: المدفوع والمتبقي وعدد الأقساط الباقية وتاريخ الانتهاء المتوقع */
export function debtStatus(d) {
  const val = (t) => (d.fixedIn === 'cur2' ? t.amount2 : t.amount);
  const payments = state.transactions.filter((t) => t.debtId === d.id);
  const paid = round2((d.initialPaid || 0) + payments.reduce((s, t) => s + val(t), 0));
  const remaining = round2(Math.max(0, d.total - paid));
  const left = d.installment > 0 ? Math.ceil(remaining / d.installment - 1e-9) : null;
  const paidThisMonth = payments.some((t) => monthKeyOf(t.date) === currentMonthKey());
  const endMonth = left ? shiftMonth(currentMonthKey(), paidThisMonth ? left : left - 1) : null;
  const auto = state.recurring.find((r) => r.debtId === d.id && r.active);
  return { paid, remaining, left, endMonth, ratio: d.total > 0 ? paid / d.total : 0, payments, paidThisMonth, auto, done: remaining <= 0.01 };
}

/** تسجيل دفعة قسط كعملية مصروف مرتبطة بالقسط */
export function payDebt(d, value, date = todayISO()) {
  const rate = Number(state.settings.rate) || 1;
  return saveTransaction({ date, catId: d.catId, accountId: d.accountId, desc: `قسط ${d.name}`, debtId: d.id, ...amountsFor(d.fixedIn, value, rate) });
}

/** تفعيل الدفع التلقائي الشهري للقسط (قاعدة تكرار مرتبطة) */
export function setDebtAuto(d, on) {
  const existing = state.recurring.find((r) => r.debtId === d.id);
  if (on) {
    const st = debtStatus(d);
    saveRecurring({
      ...(existing || {}),
      desc: `قسط ${d.name}`,
      catId: d.catId,
      accountId: d.accountId,
      fixedIn: d.fixedIn,
      amount: d.installment,
      day: d.dueDay,
      start: existing?.start || currentMonthKey(),
      lastApplied: existing?.lastApplied || (st.paidThisMonth ? currentMonthKey() : ''),
      active: true,
      debtId: d.id,
    });
  } else if (existing) saveRecurring({ ...existing, active: false });
}

// ---------- النسخ الاحتياطي والاستيراد ----------
export function exportBackup() {
  const out = { app: 'myzanetty', version: 3, exportedAt: new Date().toISOString(), settings: state.settings };
  for (const name of COLLECTIONS) out[name] = state[name];
  return out;
}

const LEGACY_CAT = { 'ايرادات شهرية': 'inc', 'التزامات شهرية': 'bills', 'مصاريف شخصية': 'personal', مدخرات: 'savings', أخرى: 'other', اخرى: 'other' };
const normAr = (s) => String(s || '').trim().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const LEGACY_MONTHS = ['يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو', 'يوليو', 'اغسطس', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر'].map(normAr);

export function legacyMonthIndex(m) {
  const n = normAr(m);
  const i = LEGACY_MONTHS.indexOf(n);
  if (i >= 0) return i + 1;
  const asNum = Number(m);
  return asNum >= 1 && asNum <= 12 ? asNum : 0;
}

/** تحويل بيانات النسخة القديمة (DATA / goals) إلى البنية الجديدة. المعرّفات ثابتة لمنع التكرار عند إعادة الاستيراد. */
export function convertLegacy(legacy) {
  const extraCats = [];
  const catFor = (name) => {
    const n = String(name || '').trim();
    if (LEGACY_CAT[n]) return LEGACY_CAT[n];
    const existing = [...state.categories, ...extraCats].find((c) => normAr(c.name) === normAr(n));
    if (existing) return existing.id;
    const c = { id: uid(), name: n || 'أخرى', type: 'expense', color: '#64748b', budget: 0, order: 50 + extraCats.length };
    extraCats.push(c);
    return c.id;
  };
  const transactions = (legacy.DATA || [])
    .map((r, i) => {
      const mi = legacyMonthIndex(r.m);
      if (!mi) return null;
      const y = Number(r.y) || 2026;
      const catId = catFor(r.c);
      return {
        id: `lg${y}${String(mi).padStart(2, '0')}${String(i).padStart(4, '0')}`,
        date: `${makeMonthKey(y, mi)}-01`,
        catId,
        type: catId === 'inc' ? 'income' : 'expense',
        desc: r.d,
        amount: r.sar,
        rate: r.r,
        amount2: r.egp,
        createdAt: Date.now() + i,
      };
    })
    .filter(Boolean);
  const goals = (legacy.goals || []).map((g, i) => ({
    id: `lggoal${i}`,
    name: g.name,
    target: g.target,
    current: g.current,
    kind: g.cat,
    priority: g.priority,
    due: g.due,
  }));
  return { transactions, goals, extraCats };
}

/** استيراد نسخة احتياطية (جديدة أو قديمة). يرجع عدد العمليات المستوردة */
export async function importBackup(obj, { replace = false } = {}) {
  let incoming;
  if (Array.isArray(obj?.DATA)) {
    const c = convertLegacy(obj);
    incoming = { transactions: c.transactions, goals: c.goals, categories: c.extraCats };
  } else if (obj?.app === 'myzanetty' || Array.isArray(obj?.transactions)) {
    incoming = { settings: obj.settings };
    for (const name of COLLECTIONS) incoming[name] = Array.isArray(obj[name]) ? obj[name] : [];
  } else {
    throw new Error('صيغة الملف غير معروفة');
  }
  for (const name of COLLECTIONS) incoming[name] ||= [];

  if (replace) await wipeAll({ keepCategories: !incoming.categories.length });

  incoming.categories.forEach((c) => upsert(state.categories, { ...c }));
  incoming.accounts.forEach((a) => upsert(state.accounts, { ...a }));
  const out = {
    transactions: incoming.transactions.map((t) => normalizeTx(t)),
    goals: incoming.goals.map((g) => ({ ...g, id: g.id || uid(), updatedAt: Date.now() })),
    recurring: incoming.recurring.map((r) => ({ ...r, id: r.id || uid() })),
    debts: incoming.debts.map((d) => ({ ...d, id: d.id || uid() })),
    categories: incoming.categories,
    accounts: incoming.accounts,
  };
  for (const name of ['transactions', 'goals', 'recurring', 'debts']) out[name].forEach((x) => upsert(state[name], x));
  if (incoming.settings) state.settings = { ...state.settings, ...incoming.settings };

  await backend.bulk({ ...out, settings: incoming.settings ? state.settings : null });
  emit();
  return out.transactions.length;
}

export async function wipeAll({ keepCategories = false } = {}) {
  const ids = {};
  for (const name of COLLECTIONS) ids[name] = keepCategories && name === 'categories' ? [] : state[name].map((x) => x.id);
  const fresh = emptyData();
  for (const name of COLLECTIONS) if (!(keepCategories && name === 'categories')) state[name] = fresh[name];
  await backend.wipe(ids, { categories: keepCategories ? [] : state.categories, accounts: state.accounts });
  emit();
}

// ---------- CSV ----------
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const TYPE_LABEL = { income: 'إيراد', expense: 'مصروف', transfer: 'تحويل' };

export function exportCSV(list = state.transactions) {
  const head = ['التاريخ', 'النوع', 'الفئة', 'البيان', `المبلغ (${state.settings.cur1})`, 'سعر الصرف', `المبلغ (${state.settings.cur2})`, 'ملاحظات', 'الحساب'];
  const rows = [...list]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [t.date, TYPE_LABEL[t.type] || t.type, catName(t.catId), t.desc, t.amount, t.rate, t.amount2, t.note, t.type === 'transfer' ? `${accountName(t.accountId)} ← ${accountName(t.toAccountId)}` : accountName(t.accountId)]);
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === '،' || ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

/**
 * يقبل صيغتين:
 *  الجديدة: التاريخ, النوع, الفئة, البيان, المبلغ, سعر الصرف, المبلغ2, ملاحظات[, الحساب]
 *  القديمة: السنة, الشهر, البيان, التصنيف, القيمة_ريال, سعر_الصرف, القيمة_جنيه
 */
export async function importCSV(text) {
  const rows = parseCSV(text);
  const findOrCreateCat = (name, type) => {
    const n = normAr(name);
    let c = state.categories.find((x) => normAr(x.name) === n);
    if (!c && LEGACY_CAT[String(name).trim()]) c = catById(LEGACY_CAT[String(name).trim()]);
    if (!c) c = saveCategory({ name: name || 'أخرى', type, color: '#64748b' });
    return c;
  };
  const accByName = (name) => accountsList().find((a) => normAr(a.name) === normAr(name))?.id;
  const txs = [];
  let skipped = 0;
  for (const r of rows) {
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(r[0])) {
      const [y, m, d] = r[0].split('-').map(Number);
      const amount = Number(r[4]);
      if (!(amount > 0) || /تحويل|transfer/i.test(r[1])) {
        skipped++;
        continue;
      }
      const type = /ايراد|إيراد|income/i.test(r[1]) ? 'income' : 'expense';
      const c = findOrCreateCat(r[2], type);
      txs.push(normalizeTx({ date: `${makeMonthKey(y, m)}-${String(d).padStart(2, '0')}`, catId: c.id, desc: r[3], amount, rate: Number(r[5]), amount2: Number(r[6]), note: r[7], accountId: accByName(r[8]) }));
    } else if (/^\d{4}$/.test(r[0]) && r.length >= 5) {
      const mi = legacyMonthIndex(r[1]);
      const amount = Number(r[4]);
      if (!mi || !(amount > 0)) {
        skipped++;
        continue;
      }
      const isInc = normAr(r[3]).includes('ايراد');
      const c = findOrCreateCat(r[3], isInc ? 'income' : 'expense');
      txs.push(normalizeTx({ date: `${makeMonthKey(Number(r[0]), mi)}-01`, catId: c.id, desc: r[2], amount, rate: Number(r[5]), amount2: Number(r[6]) }));
    } else {
      skipped++; // سطر عناوين أو غير صالح
    }
  }
  txs.forEach((t) => upsert(state.transactions, t));
  await backend.bulk({ transactions: txs });
  emit();
  return { added: txs.length, skipped };
}

/** قائمة أوصاف سابقة للإكمال التلقائي */
export function knownDescriptions(catId) {
  const counts = new Map();
  for (const t of state.transactions) {
    if (catId && t.catId !== catId) continue;
    if (t.desc && t.type !== 'transfer') counts.set(t.desc, (counts.get(t.desc) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d).slice(0, 40);
}

/** آخر قيمة استُخدمت لوصف معيّن — لتعبئة المبلغ تلقائياً */
export function lastTxFor(desc) {
  let best = null;
  for (const t of state.transactions) if (t.desc === desc && t.type !== 'transfer' && (!best || t.date > best.date)) best = t;
  return best;
}
