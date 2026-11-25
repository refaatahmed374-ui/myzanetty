import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css';
import '@fontsource/ibm-plex-sans-arabic/latin-400.css';
import '@fontsource/ibm-plex-sans-arabic/latin-600.css';
import './styles.css';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';

import { state, subscribe, useLocal, useBackend, loadPrefs, readLocalData, clearLocalData, applyRecurring, DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS } from './core/store.js';
import { maybeUpdateRate } from './core/rates.js';
import { rescheduleSoon, onNotificationTap } from './core/notify.js';
import { updateWidgetSoon } from './core/widget.js';
import { todayISO } from './core/format.js';
import { isLockEnabled, removePin } from './core/lock.js';
import { icon } from './ui/icons.js';
import { $, $$, toast, confirmDialog, closeTopSheet, isNative } from './ui/dom.js';
import { destroyCharts } from './ui/charts.js';
import { openTxForm } from './ui/txForm.js';
import { showLockScreen } from './ui/lockScreen.js';
import dashboard from './pages/dashboard.js';
import transactions from './pages/transactions.js';
import reports from './pages/reports.js';
import goals from './pages/goals.js';
import settings from './pages/settings.js';

const MODE_KEY = 'myz.v2.mode';
const ROUTES = { '/': dashboard, '/tx': transactions, '/reports': reports, '/goals': goals, '/settings': settings };
const NAV = [
  ['/', 'الرئيسية', 'layout-dashboard'],
  ['/tx', 'العمليات', 'list-details'],
  ['/reports', 'التقارير', 'chart-histogram'],
  ['/goals', 'الأهداف', 'target'],
];

// ---------- الهيكل ----------
const navLink = ([path, label, ic]) => `<a href="#${path}" class="nav-link" data-path="${path}">${icon(ic)}<span>${label}</span></a>`;
document.getElementById('app').innerHTML = `
  <div class="shell">
    <aside class="rail" aria-label="التنقل">
      <div class="brand">${icon('report-money')}<b>ميزانيتي</b></div>
      <button class="btn btn-primary rail-add" data-act="add-tx">${icon('plus')} عملية جديدة</button>
      <nav>${NAV.map(navLink).join('')}${navLink(['/settings', 'الإعدادات', 'settings'])}</nav>
    </aside>
    <div class="content">
      <header class="appbar">
        <h1 id="page-title">ميزانيتي</h1>
        <div class="appbar-x"><span id="sync-chip"></span><a href="#/settings" class="icon-btn appbar-settings" aria-label="الإعدادات">${icon('settings')}</a></div>
      </header>
      <main id="view" class="main" tabindex="-1"></main>
    </div>
    <nav class="bottom-nav" aria-label="التنقل">
      ${navLink(NAV[0])}${navLink(NAV[1])}
      <button class="fab" data-act="add-tx" aria-label="إضافة عملية">${icon('plus')}</button>
      ${navLink(NAV[2])}${navLink(NAV[3])}
    </nav>
  </div>`;

const viewEl = $('#view');
let page = null;
let section = null;
const ctx = { rerender: () => renderPage(), go: (p) => (location.hash = '#' + p) };

function skeleton() {
  return `<div class="skeleton"><div class="sk sk-row"></div><div class="kpis">${'<div class="sk sk-kpi"></div>'.repeat(4)}</div><div class="sk sk-card"></div><div class="sk sk-card"></div></div>`;
}

function renderPage() {
  if (!section) return;
  if (!state.ready) {
    section.innerHTML = skeleton();
    return;
  }
  try {
    page.render(section, ctx);
  } catch (e) {
    console.error(e);
    section.innerHTML = `<div class="empty">${icon('alert-triangle', 'empty-ic')}<h3>حدث خطأ في عرض الصفحة</h3><p>${String(e.message || e)}</p></div>`;
  }
}

function route() {
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  const next = ROUTES[path] || dashboard;
  if (next !== page) {
    destroyCharts();
    page = next;
    section = document.createElement('section');
    section.className = 'page';
    viewEl.replaceChildren(section);
    page.mount(section, ctx);
    window.scrollTo({ top: 0 });
  }
  $('#page-title').textContent = page.title;
  document.title = `${page.title} · ميزانيتي`;
  $$('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.path === path || (!ROUTES[path] && a.dataset.path === '/')));
  renderPage();
}
window.addEventListener('hashchange', route);

// إعادة الرسم عند تغيّر البيانات — مع تأجيلها أثناء الكتابة في حقل حتى لا يضيع ما يكتبه المستخدم
let pending = false;
let frame = 0;
function scheduleRender() {
  const a = document.activeElement;
  if (section && a && section.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['radio', 'checkbox', 'range', 'button'].includes(a.type)) && a.id !== 'tx-q')) {
    pending = true;
    return;
  }
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(renderPage);
}
viewEl.addEventListener('focusout', () => {
  if (pending) {
    pending = false;
    setTimeout(scheduleRender, 0);
  }
});

// ---------- السمة ----------
const dark = window.matchMedia('(prefers-color-scheme: dark)');
let lastTheme = '';
function applyTheme() {
  const t = state.prefs.theme;
  const eff = t === 'auto' ? (dark.matches ? 'dark' : 'light') : t;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', eff === 'dark' ? '#12161c' : '#f4f6f8');
  if (eff !== lastTheme) {
    const changed = !!lastTheme;
    lastTheme = eff;
    if (isNative) SystemBars.setStyle({ style: eff === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
    if (changed) {
      destroyCharts();
      renderPage();
    }
  }
}
dark.addEventListener?.('change', applyTheme);

// ---------- شارة المزامنة ----------
const SYNC = { ok: ['cloud-check', 'متزامن'], syncing: ['refresh', 'مزامنة…'], offline: ['cloud-off', 'غير متصل'], error: ['alert-triangle', 'خطأ'], local: ['device-desktop', 'محلي'] };
function renderSyncChip() {
  const [ic, txt] = SYNC[state.sync] || SYNC.local;
  $('#sync-chip').innerHTML = `<a href="#/settings" class="sync-chip s-${state.sync}" title="حالة المزامنة">${icon(ic)}<span>${txt}</span></a>`;
}

subscribe(() => {
  applyTheme();
  renderSyncChip();
  scheduleRender();
  rescheduleSoon();
  updateWidgetSoon();
});

// ---------- مهام دورية: العمليات المتكررة + سعر الصرف ----------
let maintTimer = 0;
let maintTries = 0;
let maintDay = '';
function scheduleMaintenance(delay = 2500) {
  clearTimeout(maintTimer);
  maintTimer = setTimeout(runMaintenance, delay);
}
async function runMaintenance() {
  if (!state.ready) return scheduleMaintenance(1500);
  // في وضع السحابة ننتظر أول مزامنة من الخادم حتى لا نعتمد على نسخة قديمة
  if (state.mode === 'cloud' && state.sync === 'syncing' && maintTries++ < 6) return scheduleMaintenance(2000);
  maintTries = 0;
  maintDay = todayISO();
  try {
    const n = await applyRecurring();
    if (n) toast(`تمت إضافة ${n} عملية متكررة مستحقة`, 'ok', 4000);
  } catch (e) {
    console.warn('recurring', e);
  }
  maybeUpdateRate().catch((e) => console.warn('rate', e));
}

// ---------- الحساب والسحابة ----------
let cloud = null;
let detach = null;
let cloudPromise = null;

function ensureCloud() {
  cloudPromise ||= import('./core/cloud.js').then((m) => (cloud = m));
  return cloudPromise;
}

function askMerge(n) {
  return confirmDialog({
    title: 'بيانات على هذا الجهاز',
    text: `يوجد ${n} عملية محفوظة على هذا الجهاز فقط. هل تريد إضافتها إلى حسابك في السحابة؟`,
    ok: 'نعم، أضفها',
    cancel: 'لا',
  });
}

async function startCloud() {
  try {
    await ensureCloud();
  } catch (e) {
    console.warn('تعذر تحميل Firebase', e);
    if (!state.ready) useLocal();
    return;
  }
  cloud.onUser(async (user) => {
    if (detach) {
      detach();
      detach = null;
    }
    if (!user) {
      try { localStorage.setItem(MODE_KEY, 'local'); } catch {}
      useLocal();
      scheduleMaintenance();
      return;
    }
    try { localStorage.setItem(MODE_KEY, 'cloud'); } catch {}
    const profile = { uid: user.uid, name: user.displayName, email: user.email, photo: user.photoURL };
    useBackend(null, { mode: 'cloud', user: profile, sync: 'syncing', ready: false });
    try {
      const r = await cloud.prepareAccount(user.uid, readLocalData(), askMerge);
      if (r.clearLocal) clearLocalData();
      if (r.migrated) toast(`تم نقل ${r.migrated} عملية من النسخة القديمة إلى النظام الجديد`, 'ok', 5000);
      else if (r.merged) toast(`تمت إضافة ${r.merged} عملية من هذا الجهاز إلى حسابك`, 'ok', 4000);
    } catch (e) {
      console.error('prepareAccount', e);
    }
    const a = cloud.attach(user.uid);
    detach = a.detach;
    useBackend(a.backend, { mode: 'cloud', user: profile, transactions: [], goals: [], recurring: [], debts: [], categories: structuredClone(DEFAULT_CATEGORIES), accounts: structuredClone(DEFAULT_ACCOUNTS), ready: true });
    scheduleMaintenance(3000);
  });
}

async function login() {
  try {
    await ensureCloud();
    await cloud.signIn();
  } catch (e) {
    console.error(e);
    const msg = cloud?.authErrorMessage ? cloud.authErrorMessage(e) : e.message;
    if (e?.code !== 'auth/popup-closed-by-user') toast(msg, 'err', 6000);
  }
}

async function logout() {
  if (!(await confirmDialog({ title: 'تسجيل الخروج', text: 'ستبقى بياناتك محفوظة في حسابك، وسيتم مسح نسختها من هذا الجهاز.', ok: 'خروج' }))) return;
  await ensureCloud();
  await cloud.signOutAndClear();
  try { localStorage.setItem(MODE_KEY, 'local'); } catch {}
  location.reload();
}

// ---------- أحداث عامة ----------
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const act = a.dataset.act;
  if (act === 'add-tx') openTxForm();
  else if (act === 'edit-tx') {
    const tx = state.transactions.find((t) => t.id === a.dataset.id);
    if (tx) openTxForm(tx);
  } else if (act === 'login') login();
  else if (act === 'logout') logout();
});

// ---------- القفل ----------
async function forgotPin() {
  const isCloud = state.mode === 'cloud';
  const ok = await confirmDialog({
    title: 'نسيت رمز القفل؟',
    text: isCloud
      ? 'سيتم إلغاء القفل وتسجيل خروجك من هذا الجهاز. بياناتك آمنة في حسابك، ويمكنك الدخول مرة أخرى بحساب Google.'
      : 'سيتم إلغاء القفل وحذف البيانات المحفوظة على هذا الجهاز فقط (لأنها غير محفوظة في السحابة). لا يمكن التراجع.',
    ok: isCloud ? 'خروج وإلغاء القفل' : 'حذف وإلغاء القفل',
    danger: true,
  });
  if (!ok) return false;
  removePin();
  if (isCloud) {
    await ensureCloud();
    await cloud.signOutAndClear();
  } else clearLocalData();
  location.reload();
  return true;
}

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else {
    if (isLockEnabled() && hiddenAt && Date.now() - hiddenAt > 60_000) showLockScreen({ onForgot: forgotPin });
    if (maintDay && maintDay !== todayISO()) scheduleMaintenance(1000);
  }
});

// ---------- أندرويد ----------
async function setupNative() {
  if (!isNative) return;
  document.documentElement.classList.add('native');
  const { App } = await import('@capacitor/app');
  // زر "+" في الودجت يفتح التطبيق على رابط myzanetty://add
  const handleUrl = (url) => {
    if (String(url || '').startsWith('myzanetty://add')) setTimeout(() => openTxForm(), 400);
  };
  App.addListener('appUrlOpen', (e) => handleUrl(e.url));
  App.getLaunchUrl().then((r) => handleUrl(r?.url)).catch(() => {});
  onNotificationTap(() => setTimeout(() => openTxForm(), 400));
  App.addListener('backButton', () => {
    if (closeTopSheet()) return;
    const path = location.hash.replace(/^#/, '') || '/';
    if (path !== '/') location.hash = '#/';
    else App.exitApp();
  });
}

// ---------- PWA ----------
async function setupPWA() {
  if (isNative || !('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const { registerSW } = await import('virtual:pwa-register');
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      const bar = document.createElement('div');
      bar.className = 'update-bar';
      bar.innerHTML = `${icon('refresh')}<span>يتوفر إصدار جديد من التطبيق</span><button class="btn btn-primary btn-sm">تحديث الآن</button>`;
      bar.querySelector('button').onclick = () => update(true);
      document.body.appendChild(bar);
    },
  });
}

// ---------- التشغيل ----------
loadPrefs();
applyTheme();
let lastMode = 'local';
try { lastMode = localStorage.getItem(MODE_KEY) || 'local'; } catch {}
if (lastMode === 'cloud') {
  state.mode = 'cloud';
  state.sync = 'syncing';
  state.ready = false; // ننتظر Firebase حتى لا تظهر بيانات خاطئة للحظة
} else {
  useLocal();
  scheduleMaintenance();
}

if (!location.hash) history.replaceState(null, '', '#/');
route();
renderSyncChip();
if (isLockEnabled()) showLockScreen({ onForgot: forgotPin });
startCloud();
setupNative();
setupPWA();
