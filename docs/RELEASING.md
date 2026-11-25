# خطوات إصدار نسخة جديدة

> بعد هذه الخطوات: الموقع يتحدث تلقائياً، وملف APK جديد يُنشر، والتطبيق على الموبايل يعرض "يتوفر إصدار جديد".

## 1. قبل الإصدار

```bash
npm test          # لازم كل الاختبارات ok
npm run build     # لازم يقول ✓ built
```

لو عدّلت أي شيء في `android/` أو أضفت إضافة Capacitor:
```bash
npx cap sync android
git checkout -- android/gradle/wrapper/gradle-wrapper.properties   # لو تغيّر لوحده
```

## 2. رفع رقم الإصدار (في مكانين)

| الملف | السطر |
|---|---|
| `package.json` | `"version": "2.4.0"` — أو `npm pkg set version=2.4.0` |
| `src/config.js` | `export const APP_VERSION = '2.4.0';` |

**قاعدة الترقيم:** `رئيسي.ميزة.إصلاح` — إصلاح خطأ ← `2.3.1 → 2.3.2`، ميزة جديدة ← `2.3.2 → 2.4.0`.
لازم الرقم الجديد يكون **أكبر** من الحالي، وإلا التطبيق لن يعرض التحديث.

## 3. رسالة الـ commit = ملاحظات الإصدار

السطور التي تبدأ بـ `-` تظهر للمستخدم في نافذة التحديث داخل التطبيق تحت "الجديد في هذا الإصدار":

```
ميزانيتي 2.4.0

- وصف الميزة الأولى بالعربي
- إصلاح: وصف المشكلة التي اتصلحت

Co-Authored-By: ...
```

## 4. الرفع

```bash
git add -A
git commit -F message.txt        # أو -m مع الرسالة
git tag -a v2.4.0 -m "ميزانيتي 2.4.0"
git push origin main v2.4.0
```

## 5. المتابعة

- GitHub ← **Actions**:
  - "Deploy web app" ← ينشر الموقع (حوالي دقيقة).
  - "Android APK" ← يبني ويوقّع وينشر Release (حوالي 3 دقائق).
- تأكد من ظهور الإصدار في [Releases](https://github.com/refaatahmed374-ui/myzanetty/releases) ومعه ملف `myzanetty-2.4.0.apk`.
- على الموبايل: الإعدادات ← التحقق من التحديثات.

لو فشل البناء: افتح التشغيل الفاشل في Actions ← الخطوة الحمراء ← [دليل الإصلاح](TROUBLESHOOTING.md) (قسم "مشاكل البناء").

## 6. تنظيف (اختياري)

الإصدارات القديمة لا يحتاجها التطبيق (التحديث يقرأ آخر إصدار فقط). يمكن حذفها مع الإبقاء على الـ tag لإعادة البناء وقت الحاجة:
```bash
gh release delete v2.3.0 -R refaatahmed374-ui/myzanetty --yes
```

## الأسرار المطلوبة في GitHub (مرة واحدة)

Settings ← Secrets and variables ← Actions:

| الاسم | المصدر |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `keys/myzanetty-release.p12` بصيغة base64 |
| `ANDROID_KEYSTORE_PASSWORD` | كلمة المرور في `keys/KEYSTORE-INFO.txt` (32 حرفاً بالضبط) |

بدونها يُبنى APK بنسخة debug (لا يعمل معها تسجيل الدخول بـ Google ولا التحديث فوق النسخة الموقّعة).
