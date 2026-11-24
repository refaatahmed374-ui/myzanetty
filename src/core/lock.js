// قفل التطبيق برمز PIN على هذا الجهاز فقط.
// يُخزَّن تجزئة SHA-256 مع ملح عشوائي (وليس الرمز نفسه). هذا قفل للخصوصية على الجهاز،
// أما حماية البيانات الحقيقية فهي تسجيل الدخول + قواعد Firestore.
const KEY = 'myz.v2.lock';
const FAIL_KEY = 'myz.v2.lockFails';

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hash(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  let out = await crypto.subtle.digest('SHA-256', data);
  for (let i = 0; i < 999; i++) out = await crypto.subtle.digest('SHA-256', out);
  return toHex(out);
}

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export const isLockEnabled = () => !!read()?.hash;

export async function setPin(pin) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  localStorage.setItem(KEY, JSON.stringify({ salt, hash: await hash(pin, salt) }));
  localStorage.removeItem(FAIL_KEY);
}

export function removePin() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(FAIL_KEY);
}

function fails() {
  try {
    return JSON.parse(localStorage.getItem(FAIL_KEY) || '{"n":0,"until":0}');
  } catch {
    return { n: 0, until: 0 };
  }
}

/** ثوانٍ متبقية قبل السماح بمحاولة جديدة */
export function lockoutSeconds() {
  return Math.max(0, Math.ceil((fails().until - Date.now()) / 1000));
}

export async function verifyPin(pin) {
  const rec = read();
  if (!rec) return true;
  if (lockoutSeconds() > 0) return false;
  const ok = (await hash(pin, rec.salt)) === rec.hash;
  if (ok) localStorage.removeItem(FAIL_KEY);
  else {
    const f = fails();
    f.n++;
    if (f.n >= 5) f.until = Date.now() + Math.min(300, 30 * 2 ** (f.n - 5)) * 1000;
    localStorage.setItem(FAIL_KEY, JSON.stringify(f));
  }
  return ok;
}
