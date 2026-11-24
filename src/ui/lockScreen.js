import { verifyPin, lockoutSeconds } from '../core/lock.js';
import { openSheet, $ } from './dom.js';
import { icon } from './icons.js';
import { num } from '../core/format.js';

const PIN_LEN = 4;

function padHTML(extraKey = '') {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', extraKey, '0', 'del'];
  return `<div class="pin-dots" aria-live="polite">${'<i></i>'.repeat(PIN_LEN)}</div>
    <p class="pin-msg" role="alert"></p>
    <div class="pin-pad">${keys
      .map((k) =>
        k === 'del'
          ? `<button class="pin-key" data-k="del" aria-label="مسح">${icon('backspace')}</button>`
          : k === ''
            ? '<span></span>'
            : k.length > 1
              ? k
              : `<button class="pin-key" data-k="${k}">${num(Number(k))}</button>`,
      )
      .join('')}</div>`;
}

/** يربط لوحة الأرقام بعنصر؛ onComplete(pin) ترجع true لمسح الإدخال */
function bindPad(root, onComplete) {
  let val = '';
  let busy = false;
  const dots = () => root.querySelectorAll('.pin-dots i').forEach((d, i) => d.classList.toggle('on', i < val.length));
  const press = async (k) => {
    if (busy) return;
    if (k === 'del') val = val.slice(0, -1);
    else if (/^\d$/.test(k) && val.length < PIN_LEN) val += k;
    dots();
    if (val.length === PIN_LEN) {
      busy = true;
      const pin = val;
      await onComplete(pin);
      val = '';
      busy = false;
      setTimeout(dots, 180);
    }
  };
  root.addEventListener('click', (e) => {
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (k) press(k);
  });
  const onKey = (e) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
  };
  document.addEventListener('keydown', onKey);
  return { msg: (t, bad = true) => { const m = $('.pin-msg', root); m.textContent = t; m.classList.toggle('bad', bad); if (bad) { root.querySelector('.pin-dots').classList.add('shake'); setTimeout(() => root.querySelector('.pin-dots')?.classList.remove('shake'), 400); } }, off: () => document.removeEventListener('keydown', onKey) };
}

let showing = false;
/** شاشة القفل — تُحل عند إدخال الرمز الصحيح أو اختيار "نسيت الرمز" */
export function showLockScreen({ onForgot } = {}) {
  if (showing) return Promise.resolve();
  showing = true;
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'lock-screen';
    el.innerHTML = `<div class="lock-box">
      <div class="lock-logo">${icon('lock')}</div>
      <h1>ميزانيتي</h1><p class="muted">أدخل رمز القفل</p>
      ${padHTML('<button class="pin-key text" data-forgot>نسيت؟</button>')}
    </div>`;
    document.body.appendChild(el);
    document.body.classList.add('locked');
    const finish = () => {
      pad.off();
      el.remove();
      document.body.classList.remove('locked');
      showing = false;
      resolve();
    };
    const pad = bindPad(el, async (pin) => {
      const wait = lockoutSeconds();
      if (wait) return pad.msg(`محاولات كثيرة — انتظر ${num(wait)} ثانية`);
      if (await verifyPin(pin)) finish();
      else pad.msg(lockoutSeconds() ? `محاولات كثيرة — انتظر ${num(lockoutSeconds())} ثانية` : 'رمز غير صحيح');
    });
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-forgot]') && onForgot) {
        if (await onForgot()) finish();
      }
    });
  });
}

/** نافذة إنشاء رمز جديد (إدخال مرتين). ترجع الرمز أو null */
export function askNewPin() {
  return new Promise((resolve) => {
    let first = null;
    let done = false;
    const sheet = openSheet({
      title: 'تعيين رمز القفل',
      size: 'sheet-sm',
      body: `<p class="muted center" id="pin-step">أدخل رمزاً من ${num(PIN_LEN)} أرقام</p>${padHTML()}`,
      onClose: () => {
        pad.off();
        if (!done) resolve(null);
      },
    });
    const pad = bindPad(sheet.el, async (pin) => {
      if (!first) {
        first = pin;
        $('#pin-step', sheet.el).textContent = 'أعد إدخال الرمز للتأكيد';
        pad.msg('', false);
      } else if (pin === first) {
        done = true;
        resolve(pin);
        sheet.close();
      } else {
        first = null;
        $('#pin-step', sheet.el).textContent = `أدخل رمزاً من ${num(PIN_LEN)} أرقام`;
        pad.msg('الرمزان غير متطابقين، حاول مرة أخرى');
      }
    });
  });
}

/** التحقق من الرمز الحالي داخل نافذة (لإلغاء القفل) */
export function askCurrentPin() {
  return new Promise((resolve) => {
    let done = false;
    const sheet = openSheet({
      title: 'أدخل الرمز الحالي',
      size: 'sheet-sm',
      body: padHTML(),
      onClose: () => {
        pad.off();
        if (!done) resolve(false);
      },
    });
    const pad = bindPad(sheet.el, async (pin) => {
      if (await verifyPin(pin)) {
        done = true;
        resolve(true);
        sheet.close();
      } else pad.msg(lockoutSeconds() ? `انتظر ${num(lockoutSeconds())} ثانية` : 'رمز غير صحيح');
    });
  });
}
