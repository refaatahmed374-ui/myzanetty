// إشعارات محلية على أندرويد (بدون سيرفر): تذكير يومي + تذكير بمواعيد الالتزامات والأقساط
import { Capacitor } from '@capacitor/core';
import { state, debtStatus, catById } from './store.js';
import { money, money2 } from './format.js';

const isNative = Capacitor.isNativePlatform();
const DAILY_ID = 1000;
const DUE_BASE = 2000;
const CHANNEL = 'reminders';

// ملاحظة: لا نُرجع الإضافة من دالة async (كائن Proxy له .then فيتعلق الـ await للأبد)
let LN = null;
async function ready() {
  if (!isNative) return false;
  if (!LN) {
    const mod = await import('@capacitor/local-notifications');
    LN = mod.LocalNotifications;
    try {
      await LN.createChannel({ id: CHANNEL, name: 'التذكيرات', description: 'تذكير يومي ومواعيد الأقساط', importance: 4, visibility: 1 });
    } catch {}
  }
  return true;
}

export const notificationsSupported = () => isNative;

/** طلب إذن الإشعارات. يرجع true لو مسموح */
export async function ensurePermission() {
  if (!(await ready())) return false;
  const p = LN;
  let st = await p.checkPermissions();
  if (st.display !== 'granted') st = await p.requestPermissions();
  return st.display === 'granted';
}

/** المواعيد الشهرية: القواعد المتكررة للمصروفات + الأقساط المفتوحة */
export function dueItems() {
  const items = [];
  for (const r of state.recurring) {
    if (!r.active || catById(r.catId)?.type === 'income') continue;
    items.push({ key: 'r' + r.id, title: r.desc, day: r.day, amount: r.amount, fixedIn: r.fixedIn, auto: true });
  }
  for (const d of state.debts) {
    const st = debtStatus(d);
    if (st.done || st.auto) continue; // المرتبط بتكرار تلقائي مذكور أعلاه
    items.push({ key: 'd' + d.id, title: `قسط ${d.name}`, day: d.dueDay, amount: d.installment, fixedIn: d.fixedIn, auto: false });
  }
  return items.sort((a, b) => a.day - b.day);
}

let timer = 0;
/** إعادة جدولة كل الإشعارات (تُستدعى عند تغيّر البيانات أو الإعدادات) */
export function rescheduleSoon() {
  if (!isNative) return;
  clearTimeout(timer);
  timer = setTimeout(() => reschedule().catch((e) => console.warn('notify', e)), 1500);
}

let lastSig = '';
async function reschedule() {
  if (!(await ready())) return;
  const p = LN;
  const prefs = state.prefs;
  const items = prefs.notifyDue ? dueItems() : [];
  const sig = JSON.stringify([prefs.notifyDaily, prefs.notifyTime, items, state.settings.cur1, state.settings.cur2]);
  if (sig === lastSig) return;
  lastSig = sig;

  const pending = await p.getPending();
  const ours = pending.notifications.filter((n) => n.id === DAILY_ID || (n.id >= DUE_BASE && n.id < DUE_BASE + 500));
  if (ours.length) await p.cancel({ notifications: ours.map((n) => ({ id: n.id })) });

  if (!prefs.notifyDaily && !items.length) return;
  if ((await p.checkPermissions()).display !== 'granted') return;

  const list = [];
  if (prefs.notifyDaily) {
    const [hour, minute] = (prefs.notifyTime || '21:00').split(':').map(Number);
    list.push({
      id: DAILY_ID,
      channelId: CHANNEL,
      title: 'ميزانيتي',
      body: 'سجّلت مصروفات النهارده؟ اضغط لإضافتها 📝',
      schedule: { on: { hour, minute }, allowWhileIdle: true },
      extra: { action: 'add' },
    });
  }
  items.slice(0, 400).forEach((it, i) => {
    // تذكير قبل الموعد بيوم الساعة 10 صباحاً (أو في نفس اليوم 9 صباحاً لو الموعد أول الشهر)
    const sameDay = it.day <= 1;
    const amount = it.fixedIn === 'cur2' ? money2(it.amount) : money(it.amount);
    list.push({
      id: DUE_BASE + i,
      channelId: CHANNEL,
      title: sameDay ? `اليوم موعد: ${it.title}` : `بكرة موعد: ${it.title}`,
      body: `${amount}${it.auto ? ' — هتتسجل تلقائياً' : ' — متنساش تسجّل الدفعة'}`,
      schedule: { on: { day: sameDay ? 1 : Math.min(it.day - 1, 28), hour: sameDay ? 9 : 10, minute: 0 }, allowWhileIdle: true },
    });
  });
  if (list.length) await p.schedule({ notifications: list });
}

/** فتح نموذج الإضافة عند الضغط على التذكير اليومي */
export async function onNotificationTap(cb) {
  if (!(await ready())) return;
  const p = LN;
  p.addListener('localNotificationActionPerformed', (e) => {
    if (e?.notification?.extra?.action === 'add') cb();
  });
}
