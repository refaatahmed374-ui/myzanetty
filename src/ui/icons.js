// أيقونات Tabler (SVG) — يتم تضمين المستخدم منها فقط
import i0 from '@tabler/icons/outline/layout-dashboard.svg?raw';
import i1 from '@tabler/icons/outline/list-details.svg?raw';
import i2 from '@tabler/icons/outline/plus.svg?raw';
import i3 from '@tabler/icons/outline/chart-histogram.svg?raw';
import i4 from '@tabler/icons/outline/target.svg?raw';
import i5 from '@tabler/icons/outline/settings.svg?raw';
import i6 from '@tabler/icons/outline/trending-up.svg?raw';
import i7 from '@tabler/icons/outline/trending-down.svg?raw';
import i8 from '@tabler/icons/outline/scale.svg?raw';
import i9 from '@tabler/icons/outline/pig-money.svg?raw';
import i10 from '@tabler/icons/outline/search.svg?raw';
import i11 from '@tabler/icons/outline/filter.svg?raw';
import i12 from '@tabler/icons/outline/x.svg?raw';
import i13 from '@tabler/icons/outline/check.svg?raw';
import i14 from '@tabler/icons/outline/trash.svg?raw';
import i15 from '@tabler/icons/outline/pencil.svg?raw';
import i16 from '@tabler/icons/outline/copy.svg?raw';
import i17 from '@tabler/icons/outline/download.svg?raw';
import i18 from '@tabler/icons/outline/upload.svg?raw';
import i19 from '@tabler/icons/outline/cloud.svg?raw';
import i20 from '@tabler/icons/outline/cloud-off.svg?raw';
import i21 from '@tabler/icons/outline/cloud-check.svg?raw';
import i22 from '@tabler/icons/outline/refresh.svg?raw';
import i23 from '@tabler/icons/outline/logout.svg?raw';
import i24 from '@tabler/icons/outline/brand-google.svg?raw';
import i25 from '@tabler/icons/outline/lock.svg?raw';
import i26 from '@tabler/icons/outline/alert-triangle.svg?raw';
import i27 from '@tabler/icons/outline/alert-circle.svg?raw';
import i28 from '@tabler/icons/outline/circle-check.svg?raw';
import i29 from '@tabler/icons/outline/info-circle.svg?raw';
import i30 from '@tabler/icons/outline/chevron-left.svg?raw';
import i31 from '@tabler/icons/outline/chevron-right.svg?raw';
import i32 from '@tabler/icons/outline/chevron-down.svg?raw';
import i33 from '@tabler/icons/outline/calendar.svg?raw';
import i34 from '@tabler/icons/outline/wallet.svg?raw';
import i35 from '@tabler/icons/outline/report-money.svg?raw';
import i36 from '@tabler/icons/outline/moon.svg?raw';
import i37 from '@tabler/icons/outline/sun.svg?raw';
import i38 from '@tabler/icons/outline/device-desktop.svg?raw';
import i39 from '@tabler/icons/outline/file-spreadsheet.svg?raw';
import i40 from '@tabler/icons/outline/database-export.svg?raw';
import i41 from '@tabler/icons/outline/database-import.svg?raw';
import i42 from '@tabler/icons/outline/tag.svg?raw';
import i43 from '@tabler/icons/outline/coins.svg?raw';
import i44 from '@tabler/icons/outline/arrows-diff.svg?raw';
import i45 from '@tabler/icons/outline/chart-line.svg?raw';
import i46 from '@tabler/icons/outline/crystal-ball.svg?raw';
import i47 from '@tabler/icons/outline/calendar-stats.svg?raw';
import i48 from '@tabler/icons/outline/dots-vertical.svg?raw';
import i49 from '@tabler/icons/outline/backspace.svg?raw';
import i50 from '@tabler/icons/outline/user.svg?raw';
import i51 from '@tabler/icons/outline/palette.svg?raw';
import i52 from '@tabler/icons/outline/shield-lock.svg?raw';
import i53 from '@tabler/icons/outline/category.svg?raw';
import i54 from '@tabler/icons/outline/cash.svg?raw';
import i55 from '@tabler/icons/outline/bulb.svg?raw';
import i56 from '@tabler/icons/outline/loader-2.svg?raw';
import i57 from '@tabler/icons/outline/receipt.svg?raw';
import i58 from '@tabler/icons/outline/fingerprint.svg?raw';

const RAW = {
  'fingerprint': i58,
  'layout-dashboard': i0,
  'list-details': i1,
  'plus': i2,
  'chart-histogram': i3,
  'target': i4,
  'settings': i5,
  'trending-up': i6,
  'trending-down': i7,
  'scale': i8,
  'pig-money': i9,
  'search': i10,
  'filter': i11,
  'x': i12,
  'check': i13,
  'trash': i14,
  'pencil': i15,
  'copy': i16,
  'download': i17,
  'upload': i18,
  'cloud': i19,
  'cloud-off': i20,
  'cloud-check': i21,
  'refresh': i22,
  'logout': i23,
  'brand-google': i24,
  'lock': i25,
  'alert-triangle': i26,
  'alert-circle': i27,
  'circle-check': i28,
  'info-circle': i29,
  'chevron-left': i30,
  'chevron-right': i31,
  'chevron-down': i32,
  'calendar': i33,
  'wallet': i34,
  'report-money': i35,
  'moon': i36,
  'sun': i37,
  'device-desktop': i38,
  'file-spreadsheet': i39,
  'database-export': i40,
  'database-import': i41,
  'tag': i42,
  'coins': i43,
  'arrows-diff': i44,
  'chart-line': i45,
  'crystal-ball': i46,
  'calendar-stats': i47,
  'dots-vertical': i48,
  'backspace': i49,
  'user': i50,
  'palette': i51,
  'shield-lock': i52,
  'category': i53,
  'cash': i54,
  'bulb': i55,
  'loader-2': i56,
  'receipt': i57,
};

const cache = {};
/** يرجع أيقونة SVG كنص HTML */
export function icon(name, cls = '') {
  const key = name + '|' + cls;
  if (cache[key]) return cache[key];
  const raw = RAW[name];
  if (!raw) return '';
  const svg = raw
    .replace(/\s+/g, ' ')
    .replace(/class="[^"]*"/, `class="ic ${cls}" aria-hidden="true"`)
    .replace(/ width="24" height="24"/, '')
    .replace('<path stroke="none" d="M0 0h24v24H0z" fill="none" />', '')
    .trim();
  return (cache[key] = svg);
}
