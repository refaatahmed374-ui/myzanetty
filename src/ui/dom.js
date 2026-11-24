import { Capacitor } from '@capacitor/core';
import { esc } from '../core/format.js';
import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const isNative = Capacitor.isNativePlatform();

// ---------- Toast ----------
let toastHost;
export function toast(text, type = 'ok', ms = 2600) {
  toastHost ||= document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toasts', role: 'status' }));
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icon(type === 'err' ? 'alert-circle' : type === 'warn' ? 'alert-triangle' : 'circle-check')}<span>${esc(text)}</span>`;
  toastHost.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 250);
  }, ms);
}

// ---------- Sheets (نوافذ منبثقة من الأسفل) ----------
const stack = [];

export function openSheet({ title, body, footer = '', size = '', onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <div class="sheet ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-handle"></div>
      <header class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="إغلاق">${icon('x')}</button></header>
      <div class="sheet-body">${body}</div>
      ${footer ? `<footer class="sheet-foot">${footer}</footer>` : ''}
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  const api = {
    el: wrap,
    close() {
      const i = stack.indexOf(api);
      if (i < 0) return;
      stack.splice(i, 1);
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 220);
      if (!stack.length) document.body.classList.remove('no-scroll');
      onClose?.();
    },
  };
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) api.close();
  });
  stack.push(api);
  requestAnimationFrame(() => wrap.classList.add('open'));
  setTimeout(() => wrap.querySelector('[autofocus]')?.focus(), 60);
  return api;
}

export function closeTopSheet() {
  const top = stack[stack.length - 1];
  if (top) {
    top.close();
    return true;
  }
  return false;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeTopSheet();
});

export function confirmDialog({ title = 'تأكيد', text = '', ok = 'تأكيد', cancel = 'إلغاء', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const s = openSheet({
      title,
      size: 'sheet-sm',
      body: `<p class="dialog-text">${esc(text)}</p>`,
      footer: `<button class="btn btn-ghost" data-r="0">${esc(cancel)}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1" autofocus>${esc(ok)}</button>`,
      onClose: () => !done && resolve(false),
    });
    s.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      done = true;
      resolve(b.dataset.r === '1');
      s.close();
    });
  });
}

// ---------- الملفات ----------
export async function saveFile(name, content, mime = 'text/plain') {
  if (isNative) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const res = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, files: [res.uri], dialogTitle: 'حفظ / مشاركة الملف' });
    return;
  }
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? await f.text() : null);
    };
    input.click();
  });
}

// ---------- مساعدات العرض ----------
export function emptyState(ic, title, text = '', action = '') {
  return `<div class="empty">${icon(ic, 'empty-ic')}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}

export function options(list, selected) {
  return list.map(([v, label]) => `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`).join('');
}

/** حفظ موضع التركيز قبل إعادة الرسم واستعادته بعده (لحقول البحث) */
export function preserveFocus(root, fn) {
  const a = document.activeElement;
  const id = a && root.contains(a) ? a.id : null;
  const sel = id && 'selectionStart' in a ? [a.selectionStart, a.selectionEnd] : null;
  fn();
  if (id) {
    const el = document.getElementById(id);
    if (el) {
      el.focus({ preventScroll: true });
      if (sel) try { el.setSelectionRange(...sel); } catch {}
    }
  }
}
