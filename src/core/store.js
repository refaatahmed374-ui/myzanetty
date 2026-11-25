// مخزن الحالة المركزي — مصدر واحد للبيانات، مع واجهة تخزين قابلة للتبديل (محلي / سحابي)
import { uid, todayISO, round2, monthKeyOf, configureFormat, makeMonthKey } from './format.js';

const DATA_KEY = 'myz.v2.data';
const PREFS_KEY = 'myz.v2.prefs';

export const DEFAULT_CATEGORIES = [
  { id: 'inc', name: 'إيرادات', type: 'income', color: '#0f9d76', budget: 0, order: 0 },
  { id: 'bills', name: 'التزامات شهرية', type: 'expense', color: '#e0524f', budget: 0, order: 1 },
  { id: 'personal', name: 'مصاريف شخصية', type: 'expense', color: '#d4880f', budget: 0, order: 2 },
  { id: 'savings', name: 'مدخرات', type: 'expense', color: '#3b82f6', budget: 0, order: 3 },
  { id: 'other', name: 'أخرى', type: 'expense', color: '#8b5cf6', budget: 0, order: 4 },
];

/** إعدادات تتم مزامنتها مع الحساب */
export const DEFAULT_SETTINGS = { cur1: 'ر.س', cur2: 'ج.م', rate: 14, expenseLimit: 80, minSaving: 200 };
/** تفضيلات خاصة بهذا الجهاز فقط */
export const DEFAULT_PREFS = { theme: 'auto' };

export const state = {
  transactions: [],
  goals: [],
  categories: structuredClone(DEFAULT_CATEGORIES),
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
  const d = readJSON(DATA_KEY);
  return {
    transactions: Array.isArray(d?.transactions) ? d.transactions : [],
    goals: Array.isArray(d?.goals) ? d.goals : [],
    categories: Array.isArray(d?.categories) && d.categories.length ? d.categories : structuredClone(DEFAULT_CATEGORIES),
    settings: { ...DEFAULT_SETTINGS, ...(d?.settings || {}) },
  };
}

function saveLocal() {
  if (state.mode !== 'local') return;
  const ok = writeJSON(DATA_KEY, {
    v: 2,
    transactions: state.transactions,
    goals: state.goals,
    categories: state.categories,
    settings: state.settings,
  });
  if (!ok) console.warn('تعذر الحفظ المحلي (المساحة ممتلئة؟)');
}

export function clearLocalData() {
  try {
    localStorage.removeItem(DATA_KEY);
  } catch {}
}

export const localBackend = {
  kind: 'local',
  putTx: saveLocal,
  delTx: saveLocal,
  putGoal: saveLocal,
  delGoal: saveLocal,
  putCat: saveLocal,
  delCat: saveLocal,
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

// ---------- أدوات ----------
function upsert(arr, item) {
  const i = arr.findIndex((x) => x.id === item.id);
  if (i >= 0) arr[i] = item;
  else arr.push(item);
}

export const catById = (id) => state.categories.find((c) => c.id === id);
export const catName = (id) => catById(id)?.name || 'غير مصنف';
export const catColor = (id) => catById(id)?.color || '#8a8f98';

export function sortedCategories(type) {
  return state.categories
    .filter((c) => !type || c.type === type)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name, 'ar'));
}

function validDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : todayISO();
}

export function normalizeTx(t) {
  const cat = catById(t.catId);
  const amount = round2(Math.abs(Number(t.amount) || 0));
  const rate = Number(t.rate) > 0 ? Number(t.rate) : Number(state.settings.rate) || 1;
  const amount2 = Number(t.amount2) > 0 ? round2(t.amount2) : round2(amount * rate);
  return {
    id: t.id || uid(),
    date: validDate(t.date),
    type: cat ? cat.type : t.type === 'income' ? 'income' : 'expense',
    catId: t.catId || 'other',
    desc: String(t.desc || '').trim().slice(0, 120),
    note: String(t.note || '').trim().slice(0, 500),
    amount,
    rate,
    amount2,
    createdAt: t.createdAt || Date.now(),
    updatedAt: t.updatedAt || Date.now(),
  };
}

// ---------- العمليات ----------
export function saveTransaction(input) {
  const tx = normalizeTx({ ...input, updatedAt: Date.now() });
  upsert(state.transactions, tx);
  backend.putTx(tx);
  emit();
  return tx;
}

export function deleteTransaction(id) {
  state.transactions = state.transactions.filter((t) => t.id !== id);
  backend.delTx(id);
  emit();
}

/** نسخ عمليات شهر إلى شهر آخر (مثل الالتزامات الثابتة) */
export async function copyMonth(fromKey, toKey, ids) {
  const [ty, tm] = toKey.split('-').map(Number);
  const lastDay = new Date(ty, tm, 0).getDate();
  const src = state.transactions.filter((t) => monthKeyOf(t.date) === fromKey && (!ids || ids.includes(t.id)));
  const now = Date.now();
  const copies = src.map((t, i) => {
    const day = Math.min(Number(t.date.slice(8, 10)) || 1, lastDay);
    return normalizeTx({ ...t, id: uid(), date: `${toKey}-${String(day).padStart(2, '0')}`, createdAt: now + i, updatedAt: now + i });
  });
  state.transactions.push(...copies);
  await backend.bulk({ transactions: copies });
  emit();
  return copies.length;
}

// ---------- الأهداف ----------
export function saveGoal(input) {
  const g = {
    id: input.id || uid(),
    name: String(input.name || '').trim().slice(0, 80),
    target: Math.max(0, Number(input.target) || 0),
    current: Math.max(0, Number(input.current) || 0),
    kind: input.kind || 'ادخار',
    priority: input.priority || 'متوسطة',
    due: /^\d{4}-\d{2}$/.test(input.due || '') ? input.due : '',
    createdAt: input.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  upsert(state.goals, g);
  backend.putGoal(g);
  emit();
  return g;
}

export function deleteGoal(id) {
  state.goals = state.goals.filter((g) => g.id !== id);
  backend.delGoal(id);
  emit();
}

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
  upsert(state.categories, c);
  backend.putCat(c);
  // لو تغيّر نوع الفئة نحدّث نوع عملياتها
  if (prev && prev.type !== c.type) {
    const changed = state.transactions.filter((t) => t.catId === c.id).map((t) => ({ ...t, type: c.type, updatedAt: Date.now() }));
    changed.forEach((t) => upsert(state.transactions, t));
    backend.bulk({ transactions: changed });
  }
  emit();
  return c;
}

export async function deleteCategory(id, reassignTo) {
  const moved = state.transactions
    .filter((t) => t.catId === id)
    .map((t) => normalizeTx({ ...t, catId: reassignTo, updatedAt: Date.now() }));
  state.categories = state.categories.filter((c) => c.id !== id);
  moved.forEach((t) => upsert(state.transactions, t));
  backend.delCat(id);
  if (moved.length) await backend.bulk({ transactions: moved });
  emit();
}

export function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  backend.putSettings(state.settings);
  emit();
}

// ---------- النسخ الاحتياطي والاستيراد ----------
export function exportBackup() {
  return {
    app: 'myzanetty',
    version: 2,
    exportedAt: new Date().toISOString(),
    transactions: state.transactions,
    goals: state.goals,
    categories: state.categories,
    settings: state.settings,
  };
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
    incoming = {
      transactions: obj.transactions || [],
      goals: obj.goals || [],
      categories: obj.categories || [],
      settings: obj.settings,
    };
  } else {
    throw new Error('صيغة الملف غير معروفة');
  }

  if (replace) await wipeAll({ keepCategories: !incoming.categories.length });

  incoming.categories.forEach((c) => upsert(state.categories, { ...c }));
  const txs = incoming.transactions.map((t) => normalizeTx(t));
  const goals = incoming.goals.map((g) => ({ ...g, id: g.id || uid(), updatedAt: Date.now() }));
  txs.forEach((t) => upsert(state.transactions, t));
  goals.forEach((g) => upsert(state.goals, g));
  if (incoming.settings) state.settings = { ...state.settings, ...incoming.settings };

  await backend.bulk({ transactions: txs, goals, categories: incoming.categories, settings: incoming.settings ? state.settings : null });
  emit();
  return txs.length;
}

export async function wipeAll({ keepCategories = false } = {}) {
  const snapshot = {
    transactions: state.transactions.map((t) => t.id),
    goals: state.goals.map((g) => g.id),
    categories: keepCategories ? [] : state.categories.map((c) => c.id),
  };
  state.transactions = [];
  state.goals = [];
  if (!keepCategories) state.categories = structuredClone(DEFAULT_CATEGORIES);
  await backend.wipe(snapshot, keepCategories ? null : state.categories);
  emit();
}

// ---------- CSV ----------
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCSV(list = state.transactions) {
  const head = ['التاريخ', 'النوع', 'الفئة', 'البيان', `المبلغ (${state.settings.cur1})`, 'سعر الصرف', `المبلغ (${state.settings.cur2})`, 'ملاحظات'];
  const rows = [...list]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [t.date, t.type === 'income' ? 'إيراد' : 'مصروف', catName(t.catId), t.desc, t.amount, t.rate, t.amount2, t.note]);
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
 *  الجديدة: التاريخ, النوع, الفئة, البيان, المبلغ, سعر الصرف, المبلغ2, ملاحظات
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
  const txs = [];
  let skipped = 0;
  for (const r of rows) {
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(r[0])) {
      const [y, m, d] = r[0].split('-').map(Number);
      const type = /ايراد|إيراد|income/i.test(r[1]) ? 'income' : 'expense';
      const c = findOrCreateCat(r[2], type);
      const amount = Number(r[4]);
      if (!(amount > 0)) {
        skipped++;
        continue;
      }
      txs.push(normalizeTx({ date: `${makeMonthKey(y, m)}-${String(d).padStart(2, '0')}`, catId: c.id, desc: r[3], amount, rate: Number(r[5]), amount2: Number(r[6]), note: r[7] }));
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
    if (t.desc) counts.set(t.desc, (counts.get(t.desc) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d).slice(0, 40);
}

/** آخر قيمة استُخدمت لوصف معيّن — لتعبئة المبلغ تلقائياً */
export function lastTxFor(desc) {
  let best = null;
  for (const t of state.transactions) if (t.desc === desc && (!best || t.date > best.date)) best = t;
  return best;
}
