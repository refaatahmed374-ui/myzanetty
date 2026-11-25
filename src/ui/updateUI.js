// واجهة التحديث: نافذة التحديث مع شريط التقدم + بانر "يتوفر إصدار جديد"
import { checkForUpdate, downloadAndInstall, canInstall, openInstallSettings, checkWebUpdate, currentVersion } from '../core/updater.js';
import { esc, num, dateLabel } from '../core/format.js';
import { openSheet, toast, isNative, $ } from './dom.js';
import { icon } from './icons.js';

const mb = (bytes) => (bytes ? `${num(bytes / 1048576, 1)} ميجا` : '');

function notesHTML(notes) {
  const lines = String(notes || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^Co-Authored-By/i.test(l) && !/^حمّل ملف APK/.test(l));
  if (!lines.length) return '';
  return `<div class="update-notes"><b>الجديد في هذا الإصدار:</b><ul>${lines.map((l) => `<li>${esc(l.replace(/^[-*•]\s*/, ''))}</li>`).join('')}</ul></div>`;
}

export function openUpdateSheet(info) {
  const sheet = openSheet({
    title: 'تحديث التطبيق',
    size: 'sheet-sm',
    body: `<div class="update-head">${icon('download', 'update-ic')}<div><b>إصدار جديد: ${esc(info.latest)}</b><span class="muted small">الإصدار الحالي ${esc(currentVersion())}${info.date ? ` · نُشر ${dateLabel(info.date.slice(0, 10))}` : ''}${info.size ? ` · ${mb(info.size)}` : ''}</span></div></div>
      ${notesHTML(info.notes)}
      <div id="up-step"></div>`,
    footer: `<button class="btn btn-ghost" data-close>لاحقاً</button><button class="btn btn-primary" data-act="go">${icon('download')} تحديث الآن</button>`,
  });
  const el = sheet.el;
  const step = $('#up-step', el);
  const goBtn = $('[data-act=go]', el);
  let busy = false;

  const run = async () => {
    if (busy) return;
    busy = true;
    goBtn.disabled = true;
    try {
      if (!(await canInstall())) {
        step.innerHTML = `<div class="hint">${icon('shield-lock')} أول مرة بس: لازم تسمح لـ "ميزانيتي" بتثبيت التحديثات. هيفتحلك إعدادات الموبايل — فعّل "السماح من هذا المصدر" وارجع للتطبيق.</div>
          <button class="btn btn-primary wide" data-act="perm" style="margin-top:10px">${icon('settings')} فتح الإعدادات</button>`;
        busy = false;
        goBtn.disabled = false;
        return;
      }
      step.innerHTML = `<p class="muted small" id="up-txt">جارٍ تنزيل التحديث…</p><div class="progress info"><span id="up-bar" style="width:0%"></span></div>`;
      await downloadAndInstall(info, (p) => {
        const bar = $('#up-bar', el);
        const txt = $('#up-txt', el);
        if (bar) bar.style.width = `${(p * 100).toFixed(0)}%`;
        if (txt) txt.textContent = p >= 1 ? 'تم التنزيل — اضغط "تحديث" في الشاشة اللي هتظهر' : `جارٍ تنزيل التحديث… ${num(p * 100)}%`;
      });
      step.innerHTML = `<div class="hint">${icon('circle-check')} اضغط <b>تحديث</b> في شاشة أندرويد. بياناتك مش هتتأثر. لو الشاشة اتقفلت من غير تحديث، اضغط "تحديث الآن" تاني.</div>`;
    } catch (e) {
      console.error(e);
      step.innerHTML = `<div class="hint err">${icon('alert-triangle')} تعذر التحديث: ${esc(e.message || e)}</div>
        <a class="btn btn-ghost wide" href="${esc(info.url)}" target="_blank" rel="noopener" style="margin-top:10px">${icon('download')} تنزيل من المتصفح بدلاً من ذلك</a>`;
    }
    busy = false;
    goBtn.disabled = false;
  };

  // بعد الرجوع من شاشة الإذن نكمل تلقائياً
  const onVisible = async () => {
    if (!document.hidden && step.querySelector('[data-act=perm]') && (await canInstall())) run();
  };
  document.addEventListener('visibilitychange', onVisible);
  const obs = new MutationObserver(() => {
    if (!document.body.contains(el)) {
      document.removeEventListener('visibilitychange', onVisible);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true });

  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'go') run();
    if (act === 'perm') openInstallSettings();
  });
}

/** زر "التحقق من التحديثات" */
export async function checkUpdatesInteractive(btn) {
  if (btn) btn.disabled = true;
  try {
    if (isNative) {
      const info = await checkForUpdate();
      if (info.newer) openUpdateSheet(info);
      else toast(`عندك أحدث إصدار (${currentVersion()}) 👍`);
    } else {
      const has = await checkWebUpdate();
      toast(has ? 'تم العثور على تحديث — هيظهرلك زر "تحديث الآن" فوق' : `عندك أحدث نسخة (${currentVersion()}) 👍`);
    }
  } catch (e) {
    toast(`تعذر التحقق من التحديثات: ${e.message || 'لا يوجد اتصال بالإنترنت'}`, 'warn', 5000);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** بانر أعلى الشاشة عند وجود إصدار جديد */
export function showUpdateBanner(info) {
  if (document.querySelector('.update-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.innerHTML = `${icon('download')}<span>يتوفر إصدار جديد ${esc(info.latest)}</span><button class="btn btn-primary btn-sm" data-u="go">تحديث</button><button class="icon-btn" data-u="x" aria-label="إغلاق">${icon('x')}</button>`;
  bar.addEventListener('click', (e) => {
    const u = e.target.closest('[data-u]')?.dataset.u;
    if (u === 'go') openUpdateSheet(info);
    if (u) bar.remove();
  });
  document.body.appendChild(bar);
}
