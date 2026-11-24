export const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const fmtState = { locale: 'ar-EG', cur1: 'ر.س', cur2: 'ج.م' };

export function configureFormat({ digits, cur1, cur2 }) {
  fmtState.locale = digits === 'latin' ? 'en-US' : 'ar-EG';
  if (cur1) fmtState.cur1 = cur1;
  if (cur2) fmtState.cur2 = cur2;
}

export const cur1 = () => fmtState.cur1;
export const cur2 = () => fmtState.cur2;

const LRI = '⁦';
const PDI = '⁩';
const abs = (v, digits) => Math.abs(v).toLocaleString(fmtState.locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** رقم مع فواصل الآلاف. السالب يُعزل باتجاه LTR حتى تظهر الإشارة بوضوح: ‎-1,234 */
export function num(n, digits = 0) {
  const v = Number(n) || 0;
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return r < 0 ? `${LRI}-${abs(r, digits)}${PDI}` : abs(r, digits);
}

/** رقم بدون فواصل (للسنوات) */
export const int = (n) => (Number(n) || 0).toLocaleString(fmtState.locale, { useGrouping: false });

export const money = (n, digits = 0) => `${num(n, digits)} ${fmtState.cur1}`;
export const money2 = (n, digits = 0) => `${num(n, digits)} ${fmtState.cur2}`;
/** مبلغ بإشارة صريحة (+/-) */
export const signedMoney = (n, digits = 0, sign = n >= 0 ? '+' : '-') => `${LRI}${sign}${abs(n, digits)}${PDI} ${fmtState.cur1}`;
export const signed = (n) => (Math.round(n) === 0 ? num(0) : `${LRI}${n > 0 ? '+' : '-'}${abs(n, 0)}${PDI}`);
export function pct(n, digits = 0) {
  const v = Number(n) || 0;
  return v < 0 ? `${LRI}-${abs(v, digits)}٪${PDI}` : `${abs(v, digits)}٪`;
}

/** تهريب أي نص يأتي من المستخدم قبل وضعه في HTML */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const pad = (n) => String(n).padStart(2, '0');

/** تاريخ اليوم بصيغة YYYY-MM-DD حسب التوقيت المحلي */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const monthKeyOf = (date) => String(date).slice(0, 7);
export const yearOf = (date) => Number(String(date).slice(0, 4));
export const currentMonthKey = () => monthKeyOf(todayISO());
export const makeMonthKey = (y, m) => `${y}-${pad(m)}`;

export function monthName(key) {
  return MONTHS[Number(String(key).slice(5, 7)) - 1] || '';
}

export function monthLabel(key, withYear = true) {
  const y = String(key).slice(0, 4);
  return withYear ? `${monthName(key)} ${int(y)}` : monthName(key);
}

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return makeMonthKey(d.getFullYear(), d.getMonth() + 1);
}

export function monthsOfYear(year) {
  return Array.from({ length: 12 }, (_, i) => makeMonthKey(year, i + 1));
}

export function dateLabel(date) {
  const [y, m, d] = String(date).split('-');
  return `${int(Number(d))} ${MONTHS[Number(m) - 1]} ${int(y)}`;
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** تحويل نص رقمي (يقبل الأرقام العربية والفاصلة العشرية العربية) إلى رقم */
export function parseNum(s) {
  const t = String(s ?? '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/٫/g, '.')
    .replace(/[٬,\s]/g, '')
    .replace(/[^\d.-]/g, '');
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : NaN;
}

/** عرض رقم داخل حقل إدخال (أرقام لاتينية بدون فواصل) */
export const inputNum = (n) => (Number.isFinite(Number(n)) && n !== '' && n != null ? String(round2(n)) : '');
