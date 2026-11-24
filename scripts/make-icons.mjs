// يولّد أيقونات PNG من public/icon.svg (للويب PWA ولأندرويد عبر @capacitor/assets)
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';

const svg = readFileSync('public/icon.svg');
mkdirSync('public/icons', { recursive: true });
mkdirSync('assets', { recursive: true });

const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png();
await png(192).toFile('public/icons/icon-192.png');
await png(512).toFile('public/icons/icon-512.png');
await png(180).toFile('public/icons/apple-touch-icon.png');

// maskable: الشعار داخل منطقة آمنة 80% على خلفية كاملة
const inner = await sharp(Buffer.from(svg.toString().replace(/<rect width="512"[^>]*\/>/, '')), { density: 384 }).resize(400, 400).png().toBuffer();
const bg = { create: { width: 512, height: 512, channels: 4, background: '#0f766e' } };
await sharp(bg).composite([{ input: inner, gravity: 'center' }]).png().toFile('public/icons/maskable-512.png');

// مصادر @capacitor/assets لأندرويد
await png(1024).toFile('assets/icon-only.png');
// الواجهة الأمامية للأيقونة التكيفية: الرسم فقط بدون الخلفية
const glyph = Buffer.from(svg.toString().replace(/<rect width="512"[^>]*\/>/, ''));
const fg = await sharp(glyph, { density: 384 }).resize(640, 640).png().toBuffer();
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: fg, gravity: 'center' }]).png().toFile('assets/icon-foreground.png');
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#0f766e' } }).png().toFile('assets/icon-background.png');
const splashLogo = await png(520).toBuffer();
for (const [name, bgc] of [['splash.png', '#f4f6f8'], ['splash-dark.png', '#0e1217']]) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: bgc } })
    .composite([{ input: splashLogo, gravity: 'center' }]).png().toFile(`assets/${name}`);
}
console.log('icons generated');
