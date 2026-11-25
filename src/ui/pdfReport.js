// تقرير PDF شهري/سنوي — يُرسم بالمتصفح نفسه (فيدعم العربية تماماً) ثم يُحوَّل لصفحات A4
import { state, catName, catColor, accountsList, accountName, debtStatus } from '../core/store.js';
import { summarize, filterTx, byCategory, monthlySeries, budgetStatus, accountBalances, sortByDateDesc } from '../core/calc.js';
import { esc, money, money2, num, pct, monthLabel, monthName, int, todayISO, dateLabel, signedMoney } from '../core/format.js';
import { saveFile, toast } from './dom.js';

const W = 794; // عرض صفحة A4 بالبكسل (96dpi)
const PAGE_H = Math.round((W * 297) / 210);
const MARGIN = 30;

const CSS = `
.pdf-root{position:fixed;top:0;left:-20000px;width:${W}px;background:#fff;color:#14171c;direction:rtl;
  font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif;font-size:13px;line-height:1.55;padding:${MARGIN}px 40px}
.pdf-root *{box-sizing:border-box}
.pdf-h{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0f766e;padding-bottom:12px;margin-bottom:18px}
.pdf-h h1{font-size:24px;margin:0;color:#0f766e}.pdf-h p{margin:2px 0 0;color:#6b7280;font-size:12px}
.pdf-k{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
.pdf-k div{border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px}
.pdf-k span{display:block;color:#6b7280;font-size:11.5px}.pdf-k b{display:block;font-size:17px;margin-top:2px}
.pdf-k small{color:#6b7280;font-size:11px}
.pdf-s{margin:0 0 16px}.pdf-s h2{font-size:15px;margin:0 0 8px;color:#0f766e}
table.pdf-t{width:100%;border-collapse:collapse;font-size:12px}
.pdf-t th{background:#f1f5f9;text-align:right;padding:7px 8px;font-weight:600;color:#475569}
.pdf-t td{padding:6px 8px;border-bottom:1px solid #eef0f3;vertical-align:middle}
.pdf-t td.n{white-space:nowrap;text-align:left;direction:ltr;unicode-bidi:isolate}
.pdf-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-left:6px;vertical-align:middle}
.pdf-bar{height:7px;background:#eef2f7;border-radius:9px;overflow:hidden;min-width:120px}.pdf-bar i{display:block;height:100%;border-radius:9px}
.pos{color:#0f9d76}.neg{color:#dc4c4a}.mut{color:#6b7280}
.pdf-f{margin-top:20px;padding-top:10px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px;text-align:center}
`;

function kpis(s) {
  return `<div class="pdf-k" data-pb>
    <div><span>الإيرادات</span><b class="pos">${money(s.inc)}</b><small>${money2(s.inc2)}</small></div>
    <div><span>المصروفات</span><b class="neg">${money(s.exp)}</b><small>${money2(s.exp2)}</small></div>
    <div><span>الصافي</span><b class="${s.net >= 0 ? 'pos' : 'neg'}">${money(s.net)}</b><small>${money2(s.net2)}</small></div>
    <div><span>معدل الادخار</span><b>${pct(s.saveRate, 1)}</b><small>${num(s.count)} عملية</small></div>
  </div>`;
}

function categoriesTable(rows) {
  const cats = byCategory(rows, state.categories, 'expense');
  if (!cats.length) return '';
  const max = cats[0].total;
  return `<div class="pdf-s"><h2 data-pb>المصروفات حسب الفئة</h2><table class="pdf-t"><thead><tr data-pb><th>الفئة</th><th style="width:40%"></th><th>النسبة</th><th>المبلغ</th></tr></thead><tbody>
    ${cats.map((c) => `<tr data-pb><td><span class="pdf-dot" style="background:${esc(catColor(c.catId))}"></span>${esc(catName(c.catId))}</td><td><div class="pdf-bar"><i style="width:${((c.total / max) * 100).toFixed(1)}%;background:${esc(catColor(c.catId))}"></i></div></td><td class="n">${pct(c.share, 1)}</td><td class="n">${money(c.total)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function accountsTable() {
  const accs = accountsList();
  if (accs.length < 2) return '';
  const bal = accountBalances(state.transactions, accs);
  return `<div class="pdf-s"><h2 data-pb>أرصدة الحسابات (حتى اليوم)</h2><table class="pdf-t"><tbody>
    ${bal.map((b) => `<tr data-pb><td>${esc(b.acc.name)}</td><td class="n ${b.balance >= 0 ? '' : 'neg'}">${b.acc.cur === 'cur2' ? money2(b.balance) : money(b.balance)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function debtsTable() {
  const debts = state.debts.map((d) => ({ d, st: debtStatus(d) })).filter((x) => !x.st.done);
  if (!debts.length) return '';
  const fmt = (d, v) => (d.fixedIn === 'cur2' ? money2(v) : money(v));
  return `<div class="pdf-s"><h2 data-pb>الأقساط والديون</h2><table class="pdf-t"><thead><tr data-pb><th>القسط</th><th>المدفوع</th><th>المتبقي</th><th>الأقساط الباقية</th><th>الانتهاء المتوقع</th></tr></thead><tbody>
    ${debts.map(({ d, st }) => `<tr data-pb><td>${esc(d.name)}</td><td class="n">${fmt(d, st.paid)}</td><td class="n neg">${fmt(d, st.remaining)}</td><td class="n">${st.left ?? '—'}</td><td>${st.endMonth ? monthLabel(st.endMonth) : '—'}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function monthReport(key) {
  const rows = sortByDateDesc(filterTx(state.transactions, { month: key }));
  const s = summarize(rows);
  const budgets = budgetStatus(state.transactions, state.categories, key);
  return `
    ${kpis(s)}
    ${categoriesTable(rows)}
    ${budgets.length ? `<div class="pdf-s"><h2 data-pb>الميزانيات</h2><table class="pdf-t"><tbody>${budgets.map((b) => `<tr data-pb><td>${esc(b.cat.name)}</td><td><div class="pdf-bar"><i style="width:${Math.min(100, b.ratio * 100).toFixed(1)}%;background:${b.ratio >= 1 ? '#dc4c4a' : b.ratio >= 0.8 ? '#d4880f' : '#0f9d76'}"></i></div></td><td class="n">${money(b.spent)} / ${money(b.budget)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${accountsTable()}
    ${debtsTable()}
    <div class="pdf-s"><h2 data-pb>العمليات (${num(rows.length)})</h2><table class="pdf-t"><thead><tr data-pb><th>التاريخ</th><th>البيان</th><th>الفئة</th><th>الحساب</th><th>${esc(state.settings.cur1)}</th><th>${esc(state.settings.cur2)}</th></tr></thead><tbody>
      ${rows
        .map((t) => {
          const sign = t.type === 'income' ? '+' : t.type === 'transfer' ? '⇄' : '-';
          const cls = t.type === 'income' ? 'pos' : t.type === 'transfer' ? 'mut' : 'neg';
          return `<tr data-pb><td style="white-space:nowrap">${dateLabel(t.date)}</td><td>${esc(t.desc)}</td><td>${esc(catName(t.catId))}</td><td>${esc(t.type === 'transfer' ? `${accountName(t.accountId)} ← ${accountName(t.toAccountId)}` : accountName(t.accountId))}</td><td class="n ${cls}">${sign}${num(t.amount, 2)}</td><td class="n mut">${num(t.amount2)}</td></tr>`;
        })
        .join('')}
    </tbody></table></div>`;
}

function yearReport(year) {
  const rows = filterTx(state.transactions, { year });
  const s = summarize(rows);
  const series = monthlySeries(state.transactions, year).filter((m) => m.hasData);
  return `
    ${kpis(s)}
    <div class="pdf-s"><h2 data-pb>ملخص الشهور</h2><table class="pdf-t"><thead><tr data-pb><th>الشهر</th><th>الإيرادات</th><th>المصروفات</th><th>الصافي</th><th>معدل الادخار</th></tr></thead><tbody>
      ${series.map((m) => `<tr data-pb><td>${monthName(m.key)}</td><td class="n pos">${money(m.inc)}</td><td class="n neg">${money(m.exp)}</td><td class="n ${m.net >= 0 ? 'pos' : 'neg'}">${signedMoney(m.net)}</td><td class="n">${pct(m.saveRate, 1)}</td></tr>`).join('')}
    </tbody></table></div>
    ${categoriesTable(rows)}
    ${accountsTable()}
    ${debtsTable()}`;
}

/** period = { month: 'YYYY-MM' } أو { year: 2026 } */
export async function exportPdfReport(period) {
  toast('جارٍ تجهيز التقرير…', 'ok', 1800);
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const title = period.month ? `تقرير شهر ${monthLabel(period.month)}` : `تقرير سنة ${int(period.year)}`;
  const root = document.createElement('div');
  root.className = 'pdf-root';
  root.innerHTML = `<style>${CSS}</style>
    <header class="pdf-h" data-pb><div><h1>ميزانيتي</h1><p>${esc(title)}</p></div>
      <p>${state.user?.name ? esc(state.user.name) + ' · ' : ''}تاريخ الإصدار: ${dateLabel(todayISO())}<br>سعر الصرف الحالي: ${num(state.settings.rate, 2)}</p></header>
    ${period.month ? monthReport(period.month) : yearReport(period.year)}
    <div class="pdf-f" data-pb>تم إنشاء هذا التقرير من تطبيق ميزانيتي</div>`;
  document.body.appendChild(root);
  try {
    await document.fonts?.ready;
    const total = root.scrollHeight;
    // نقاط القطع: لا نقسم صفاً بين صفحتين
    const base = root.getBoundingClientRect().top;
    const bottoms = [...root.querySelectorAll('[data-pb]')].map((e) => e.getBoundingClientRect().bottom - base).sort((a, b) => a - b);
    const usable = PAGE_H - MARGIN * 2;
    const slices = [];
    let start = 0;
    // آخر عنصر فعلي — نتجاهل أي مسافة فارغة بعده حتى لا تُنشأ صفحة شبه فارغة
    const contentEnd = Math.min(total, Math.ceil((bottoms[bottoms.length - 1] || total) + 6));
    while (start < contentEnd - 12) {
      // الصفحة الأولى تبدأ من أعلى الصفحة (الهامش جزء من التصميم)، وباقي الصفحات لها هامش علوي
      const limit = start + (slices.length ? usable : PAGE_H - MARGIN);
      const end = limit >= contentEnd ? contentEnd : bottoms.filter((b) => b > start + 40 && b <= limit).pop() || limit;
      slices.push([start, end]);
      start = end;
    }
    const scale = 2;
    const canvas = await toCanvas(root, { pixelRatio: scale, backgroundColor: '#ffffff', width: W, height: total, style: { left: '0', position: 'static' } });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pw = pdf.internal.pageSize.getWidth();
    const k = pw / W;
    slices.forEach(([a, b], i) => {
      const c = document.createElement('canvas');
      c.width = W * scale;
      c.height = Math.ceil((b - a) * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(canvas, 0, a * scale, c.width, c.height, 0, 0, c.width, c.height);
      if (i) pdf.addPage();
      pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, i ? MARGIN * k : 0, pw, (b - a) * k);
      pdf.setFontSize(8);
      pdf.setTextColor(160);
      pdf.text(`${i + 1} / ${slices.length}`, pw / 2, pdf.internal.pageSize.getHeight() - 14, { align: 'center' });
    });
    const name = period.month ? `ميزانيتي-تقرير-${period.month}.pdf` : `ميزانيتي-تقرير-${period.year}.pdf`;
    await saveFile(name, new Uint8Array(pdf.output('arraybuffer')), 'application/pdf');
    toast('تم إنشاء التقرير');
  } catch (e) {
    console.error(e);
    toast('تعذر إنشاء التقرير: ' + (e.message || e), 'err', 5000);
  } finally {
    root.remove();
  }
}
