// إعدادات Firebase للويب — هذه القيم ليست سرية (الحماية الفعلية في firestore.rules).
export const firebaseConfig = {
  apiKey: 'AIzaSyABoBENu_C0usQg_vWLm76n3A08_rdStWI',
  authDomain: 'myzanetty-2026.firebaseapp.com',
  projectId: 'myzanetty-2026',
  storageBucket: 'myzanetty-2026.firebasestorage.app',
  messagingSenderId: '496699644075',
  appId: '1:496699644075:web:8b82badd2639c9a10a7fee',
};

// مطلوب لتسجيل الدخول بـ Google داخل تطبيق أندرويد فقط.
// Firebase Console ← Authentication ← Sign-in method ← Google ← "Web SDK configuration" ← Web client ID
// (انظر README.md — قسم "تسجيل الدخول على أندرويد")
export const GOOGLE_WEB_CLIENT_ID = '496699644075-o8cu28acaucrrdju4722k5f3ft2438co.apps.googleusercontent.com';

export const APP_VERSION = '2.0.1';
