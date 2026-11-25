// التحقق من التحديثات وتثبيتها من داخل التطبيق (أندرويد: صفحة الإصدارات على GitHub — الويب: Service Worker)
import { Capacitor, registerPlugin } from '@capacitor/core';
import { APP_VERSION } from '../config.js';

const REPO = 'refaatahmed374-ui/myzanetty';
const LAST_CHECK_KEY = 'myz.v2.updateCheck';
const CHECK_EVERY = 6 * 60 * 60 * 1000; // 6 ساعات
const isNative = Capacitor.isNativePlatform();
const AppUpdater = isNative ? registerPlugin('AppUpdater') : null;

const parse = (v) => String(v || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);

/** هل الإصدار a أحدث من b؟ */
export function isNewer(a, b) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

export const currentVersion = () => APP_VERSION;

/** يجلب أحدث إصدار منشور. يرجع { latest, newer, url, size, notes, date } */
export async function checkForUpdate() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(res.status === 403 ? 'محاولات كثيرة، جرّب بعد شوية' : `HTTP ${res.status}`);
    const r = await res.json();
    const apk = (r.assets || []).find((a) => /\.apk$/i.test(a.name) && !/debug/i.test(a.name));
    try {
      localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
    } catch {}
    const latest = String(r.tag_name || '').replace(/^v/i, '');
    return {
      latest,
      newer: isNewer(latest, APP_VERSION),
      url: apk?.browser_download_url || r.html_url,
      size: apk?.size || 0,
      notes: String(r.body || '').trim(),
      date: r.published_at,
      page: r.html_url,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** فحص تلقائي هادئ (مرة كل 6 ساعات) — يرجع معلومات التحديث لو فيه إصدار أحدث */
export async function autoCheck() {
  if (!isNative || !navigator.onLine) return null;
  let last = 0;
  try {
    last = Number(localStorage.getItem(LAST_CHECK_KEY)) || 0;
  } catch {}
  if (Date.now() - last < CHECK_EVERY) return null;
  try {
    const info = await checkForUpdate();
    return info.newer ? info : null;
  } catch {
    return null;
  }
}

export async function canInstall() {
  if (!AppUpdater) return false;
  return (await AppUpdater.canInstall()).allowed;
}

export const openInstallSettings = () => AppUpdater?.openInstallSettings();

/** تنزيل ملف التحديث ثم فتح شاشة التثبيت. onProgress(0..1) */
export async function downloadAndInstall(info, onProgress) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const path = `myzanetty-${info.latest}.apk`;
  const listener = await Filesystem.addListener('progress', (s) => {
    const total = s.contentLength > 0 ? s.contentLength : info.size;
    if (total > 0) onProgress?.(Math.min(1, s.bytes / total));
  });
  try {
    try {
      await Filesystem.deleteFile({ path, directory: Directory.Cache });
    } catch {}
    const res = await Filesystem.downloadFile({ url: info.url, path, directory: Directory.Cache, progress: true, recursive: true });
    let filePath = res.path;
    if (!filePath) filePath = (await Filesystem.getUri({ path, directory: Directory.Cache })).uri;
    onProgress?.(1);
    await AppUpdater.install({ path: filePath });
  } finally {
    listener?.remove?.();
  }
}

/** الويب: إجبار Service Worker على البحث عن نسخة جديدة. يرجع true لو فيه تحديث جاهز */
export async function checkWebUpdate() {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  await reg.update();
  return !!(reg.waiting || reg.installing);
}
