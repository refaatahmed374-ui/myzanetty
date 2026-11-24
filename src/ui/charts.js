import Chart from 'chart.js/auto';
import { num } from '../core/format.js';

const live = new Map();

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function themeColors() {
  return {
    text: css('--text-2'),
    grid: css('--border'),
    income: css('--income'),
    expense: css('--expense'),
    primary: css('--primary'),
    info: css('--info'),
    surface: css('--surface'),
    muted: css('--text-3'),
  };
}

/** إنشاء/استبدال رسم بياني على canvas داخل root */
export function drawChart(canvas, config) {
  if (!canvas) return null;
  const old = live.get(canvas.id);
  if (old) old.destroy();
  const c = themeColors();
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = c.text;
  const opts = config.options || {};
  const merged = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    interaction: { mode: 'index', intersect: false },
    ...opts,
    plugins: {
      legend: { display: false, rtl: true, labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        rtl: true,
        textDirection: 'rtl',
        callbacks: { label: (ctx) => `${ctx.dataset.label ? ctx.dataset.label + ': ' : ''}${num(ctx.parsed.y ?? ctx.parsed)}` },
      },
      ...(opts.plugins || {}),
    },
  };
  if (config.type !== 'doughnut') {
    merged.scales = {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 0, autoSkip: true }, reverse: true },
      y: { grid: { color: c.grid }, border: { display: false }, ticks: { font: { size: 10 }, callback: (v) => num(v) }, position: 'right' },
      ...(opts.scales || {}),
    };
  }
  const chart = new Chart(canvas, { ...config, options: merged });
  live.set(canvas.id, chart);
  return chart;
}

export function destroyCharts() {
  live.forEach((c) => c.destroy());
  live.clear();
}
