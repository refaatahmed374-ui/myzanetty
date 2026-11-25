// تحديث ودجت الشاشة الرئيسية في أندرويد بملخص الشهر الحالي (عبر إضافة WidgetBridge المحلية)
import { Capacitor, registerPlugin } from '@capacitor/core';
import { state } from './store.js';
import { summarize, filterTx } from './calc.js';
import { currentMonthKey, monthLabel, money, signedMoney } from './format.js';

const isNative = Capacitor.isNativePlatform();
const WidgetBridge = isNative ? registerPlugin('WidgetBridge') : null;

let timer = 0;
let lastSig = '';

export function updateWidgetSoon() {
  if (!WidgetBridge || !state.ready) return;
  clearTimeout(timer);
  timer = setTimeout(push, 1200);
}

async function push() {
  const key = currentMonthKey();
  const s = summarize(filterTx(state.transactions, { month: key }));
  const data = {
    title: monthLabel(key),
    income: money(s.inc),
    expense: money(s.exp),
    net: signedMoney(s.net).replace(/[⁦⁩]/g, ''),
    positive: s.net >= 0 ? 'true' : 'false',
  };
  const sig = JSON.stringify(data);
  if (sig === lastSig) return;
  lastSig = sig;
  try {
    await WidgetBridge.update(data);
  } catch (e) {
    console.warn('widget', e);
  }
}
