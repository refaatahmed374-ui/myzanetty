// طبقة Firebase — تُحمَّل عند الحاجة فقط (dynamic import) حتى يفتح التطبيق بسرعة حتى بدون إنترنت
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  onAuthStateChanged,
  signOut as fbSignOut,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  limit,
  query,
  serverTimestamp,
  terminate,
  clearIndexedDbPersistence,
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { firebaseConfig, GOOGLE_WEB_CLIENT_ID } from '../config.js';
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, DEFAULT_SETTINGS, COLLECTIONS, convertLegacy, setCollection, setSettingsFromCloud, setSync } from './store.js';

const isNative = Capacitor.isNativePlatform();
const app = initializeApp(firebaseConfig);
const auth = isNative
  ? initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })
  : getAuth(app);
auth.languageCode = 'ar';

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
});

// ---------- المصادقة ----------
export function onUser(cb) {
  if (!isNative) getRedirectResult(auth).catch((e) => console.warn('redirect', e));
  return onAuthStateChanged(auth, cb);
}

let socialReady = null;
async function nativeGoogleIdToken() {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error('تسجيل الدخول على أندرويد غير مُعدّ بعد: أضف GOOGLE_WEB_CLIENT_ID في src/config.js (راجع README).');
  }
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  socialReady ||= SocialLogin.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID, mode: 'online' } });
  await socialReady;
  const res = await SocialLogin.login({ provider: 'google', options: {} });
  const token = res?.result?.idToken;
  if (!token) throw new Error('لم يتم استلام رمز الدخول من Google');
  return token;
}

export async function signIn() {
  if (isNative) {
    const idToken = await nativeGoogleIdToken();
    return signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    return await signInWithPopup(auth, provider);
  } catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
      return signInWithRedirect(auth, provider);
    }
    throw e;
  }
}

export async function signOut() {
  if (isNative) {
    try {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.logout({ provider: 'google' });
    } catch {}
  }
  await fbSignOut(auth);
}

/** تسجيل الخروج ومسح النسخة المحلية من بيانات السحابة على هذا الجهاز (للخصوصية) */
export async function signOutAndClear() {
  await signOut();
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (e) {
    console.warn('clear cache', e);
  }
}

export function authErrorMessage(e) {
  const map = {
    'auth/popup-closed-by-user': 'تم إغلاق نافذة تسجيل الدخول',
    'auth/network-request-failed': 'لا يوجد اتصال بالإنترنت',
    'auth/unauthorized-domain': 'هذا النطاق غير مصرح له في إعدادات Firebase',
    'auth/too-many-requests': 'محاولات كثيرة، حاول لاحقاً',
  };
  return map[e?.code] || e?.message || 'حدث خطأ غير متوقع';
}

// ---------- البيانات ----------
const userRef = (uid) => doc(db, 'users', uid);
const col = (uid, name) => collection(db, 'users', uid, name);

async function commitInChunks(ops) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db);
    ops.slice(i, i + 450).forEach((fn) => fn(batch));
    await batch.commit();
  }
}

/**
 * تجهيز حساب المستخدم في السحابة:
 * - ترحيل البيانات من الصيغة القديمة (حقل DATA في users/{uid}) مرة واحدة
 * - إنشاء الفئات الافتراضية إن لم توجد
 * - دمج البيانات المحلية (عند الحاجة) بعد موافقة المستخدم
 */
export async function prepareAccount(uid, local, askMerge) {
  const result = { migrated: 0, merged: 0 };
  let userSnap = null;
  try {
    userSnap = await getDoc(userRef(uid));
  } catch (e) {
    console.warn('تعذر قراءة حساب المستخدم (غير متصل؟)', e);
  }
  const [catSnap, txSnap] = await Promise.all([getDocs(col(uid, 'categories')), getDocs(query(col(uid, 'transactions'), limit(1)))]);
  const ops = [];

  const cats = catSnap.docs.map((d) => d.data());
  if (!cats.length) {
    const base = local.categories?.length ? local.categories : DEFAULT_CATEGORIES;
    base.forEach((c) => ops.push((b) => b.set(doc(col(uid, 'categories'), c.id), c)));
  }

  const ud = userSnap?.exists() ? userSnap.data() : null;
  if (ud && Array.isArray(ud.DATA) && !ud.v2MigratedAt) {
    const conv = convertLegacy(ud);
    conv.extraCats.forEach((c) => ops.push((b) => b.set(doc(col(uid, 'categories'), c.id), c)));
    conv.transactions.forEach((t) => ops.push((b) => b.set(doc(col(uid, 'transactions'), t.id), normalizeLegacyTx(t))));
    conv.goals.forEach((g) => ops.push((b) => b.set(doc(col(uid, 'goals'), g.id), { ...g, updatedAt: Date.now() })));
    // نترك الحقل القديم كما هو كنسخة احتياطية، ونضع علامة أنه تم الترحيل
    ops.push((b) => b.set(userRef(uid), { v2MigratedAt: serverTimestamp() }, { merge: true }));
    result.migrated = conv.transactions.length;
  }

  const accSnap = await getDocs(query(col(uid, 'accounts'), limit(1)));
  const hasLocal = local.transactions.length || local.goals.length || local.recurring?.length || local.debts?.length;
  if (hasLocal) {
    const cloudEmpty = txSnap.empty && !result.migrated;
    const ok = cloudEmpty ? true : await askMerge(local.transactions.length);
    if (ok) {
      for (const name of ['transactions', 'goals', 'recurring', 'debts', 'accounts']) {
        (local[name] || []).forEach((x) => ops.push((b) => b.set(doc(col(uid, name), x.id), x)));
      }
      result.merged = local.transactions.length;
      result.clearLocal = true;
    }
  }
  if (accSnap.empty && !(result.clearLocal && local.accounts?.length)) {
    DEFAULT_ACCOUNTS.forEach((a) => ops.push((b) => b.set(doc(col(uid, 'accounts'), a.id), a)));
  }

  if (!ud?.createdAt) ops.push((b) => b.set(userRef(uid), { createdAt: serverTimestamp() }, { merge: true }));
  if (ops.length) await commitInChunks(ops);
  return result;
}

function normalizeLegacyTx(t) {
  const amount = Math.round(Math.abs(Number(t.amount) || 0) * 100) / 100;
  const rate = Number(t.rate) > 0 ? Number(t.rate) : DEFAULT_SETTINGS.rate;
  return {
    id: t.id,
    date: t.date,
    type: t.type,
    catId: t.catId,
    desc: String(t.desc || '').trim(),
    note: '',
    amount,
    rate,
    amount2: Number(t.amount2) > 0 ? Number(t.amount2) : Math.round(amount * rate * 100) / 100,
    createdAt: t.createdAt,
    updatedAt: Date.now(),
  };
}

/** يبدأ الاستماع اللحظي لبيانات المستخدم ويرجع واجهة الكتابة + دالة الإيقاف */
export function attach(uid) {
  const pending = {};
  const fromCache = {};
  const updateSync = () => {
    const anyPending = Object.values(pending).some(Boolean);
    const cached = Object.values(fromCache).some(Boolean);
    if (!navigator.onLine) setSync('offline');
    else if (anyPending || cached) setSync('syncing');
    else setSync('ok');
  };
  const listen = (name) =>
    onSnapshot(
      col(uid, name),
      { includeMetadataChanges: true },
      (snap) => {
        pending[name] = snap.metadata.hasPendingWrites;
        fromCache[name] = snap.metadata.fromCache;
        setCollection(name, snap.docs.map((d) => d.data()));
        updateSync();
      },
      (err) => {
        console.error(name, err);
        setSync('error');
      },
    );

  const unsubs = [
    ...COLLECTIONS.map(listen),
    onSnapshot(doc(db, 'users', uid, 'meta', 'settings'), (snap) => setSettingsFromCloud(snap.data()), () => {}),
  ];
  const onNet = () => updateSync();
  window.addEventListener('online', onNet);
  window.addEventListener('offline', onNet);

  const fail = (e) => {
    console.error(e);
    setSync('error');
  };

  const backend = {
    kind: 'cloud',
    put: (name, item) => setDoc(doc(col(uid, name), item.id), item).catch(fail),
    del: (name, id) => deleteDoc(doc(col(uid, name), id)).catch(fail),
    putSettings: (s) => setDoc(doc(db, 'users', uid, 'meta', 'settings'), s).catch(fail),
    /** items = { collectionName: [docs] } — يُكتب دفعة واحدة */
    async bulk({ settings = null, ...items }) {
      const ops = [];
      for (const [name, list] of Object.entries(items)) {
        if (!COLLECTIONS.includes(name)) continue;
        (list || []).forEach((x) => ops.push((b) => b.set(doc(col(uid, name), x.id), x)));
      }
      if (settings) ops.push((b) => b.set(doc(db, 'users', uid, 'meta', 'settings'), settings));
      // لا ننتظر تأكيد الخادم: Firestore يحفظ محلياً ويزامن لاحقاً حتى بدون إنترنت
      commitInChunks(ops).catch(fail);
    },
    async wipe(ids, fresh = {}) {
      const ops = [];
      for (const [name, list] of Object.entries(ids)) list.forEach((id) => ops.push((b) => b.delete(doc(col(uid, name), id))));
      for (const [name, list] of Object.entries(fresh)) (list || []).forEach((x) => ops.push((b) => b.set(doc(col(uid, name), x.id), x)));
      commitInChunks(ops).catch(fail);
    },
  };

  const detach = () => {
    unsubs.forEach((u) => u());
    window.removeEventListener('online', onNet);
    window.removeEventListener('offline', onNet);
  };
  return { backend, detach };
}
