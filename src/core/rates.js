// تحديث سعر الصرف تلقائياً من خدمة مجانية (ExchangeRate-API — open access، بدون مفتاح)
// لا يُرسل أي بيانات شخصية: الطلب يحتوي على رمز العملة فقط.
import { state, saveSettings } from './store.js';

const API = 'https://open.er-api.com/v6/latest/';
const MAX_AGE = 12 * 60 * 60 * 1000; // 12 ساعة

export const CURRENCIES = [
  ['SAR', 'ريال سعودي', 'ر.س'],
  ['EGP', 'جنيه مصري', 'ج.م'],
  ['USD', 'دولار أمريكي', '$'],
  ['EUR', 'يورو', '€'],
  ['AED', 'درهم إماراتي', 'د.إ'],
  ['KWD', 'دينار كويتي', 'د.ك'],
  ['QAR', 'ريال قطري', 'ر.ق'],
  ['BHD', 'دينار بحريني', 'د.ب'],
  ['OMR', 'ريال عماني', 'ر.ع'],
  ['JOD', 'دينار أردني', 'د.أ'],
  ['GBP', 'جنيه إسترليني', '£'],
  ['TRY', 'ليرة تركية', '₺'],
];

export async function fetchRate(from, to) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(API + encodeURIComponent(from), { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const r = data?.rates?.[to];
    if (data?.result !== 'success' || !(r > 0)) throw new Error('العملة غير متاحة');
    return Math.round(r * 10000) / 10000;
  } finally {
    clearTimeout(timer);
  }
}

/** يحدّث السعر لو التحديث التلقائي مفعّل ومر وقت كافٍ. force = تحديث فوري */
export async function maybeUpdateRate({ force = false } = {}) {
  const s = state.settings;
  if (!force && (!s.autoRate || Date.now() - (s.rateUpdatedAt || 0) < MAX_AGE)) return null;
  if (!navigator.onLine) return null;
  const rate = await fetchRate(s.code1 || 'SAR', s.code2 || 'EGP');
  saveSettings({ rate, rateUpdatedAt: Date.now() });
  return rate;
}
