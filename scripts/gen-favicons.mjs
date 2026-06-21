// One-off generator: rasterise public/favicon.svg into the square PNG + ICO
// fallbacks search engines and non-SVG crawlers need. Re-run after the SVG
// changes:  node scripts/gen-favicons.mjs
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub  = join(root, 'public');
const svg  = readFileSync(join(pub, 'favicon.svg'));

const PAPER = { r: 0xF4, g: 0xED, b: 0xDF, alpha: 1 }; // brand --paper
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

// Render the (near-square) SVG centred on a square canvas so nothing is
// stretched. `contain` keeps the art's aspect; the tiny side padding is
// invisible at favicon sizes.
async function png(size, bg) {
  return sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: bg })
    .png()
    .toBuffer();
}

// Transparent icons (tab / search result — sit on the browser's own colour).
for (const s of [96]) writeFileSync(join(pub, `favicon-${s}.png`), await png(s, CLEAR));
// Solid-paper icons (home-screen / PWA — need a filled background).
writeFileSync(join(pub, 'apple-touch-icon.png'), await png(180, PAPER));
writeFileSync(join(pub, 'icon-192.png'), await png(192, PAPER));
writeFileSync(join(pub, 'icon-512.png'), await png(512, PAPER));

// favicon.ico — pack 16/32/48 transparent PNGs into the ICO container
// (PNG-in-ICO; supported by every modern browser + Googlebot).
const sizes = [16, 32, 48];
const imgs = await Promise.all(sizes.map((s) => png(s, CLEAR)));
const count = imgs.length;
const header = Buffer.alloc(6 + 16 * count);
header.writeUInt16LE(0, 0);      // reserved
header.writeUInt16LE(1, 2);      // type 1 = icon
header.writeUInt16LE(count, 4);  // image count
let offset = header.length;
imgs.forEach((buf, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], e);     // width
  header.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], e + 1); // height
  header.writeUInt8(0, e + 2);            // palette
  header.writeUInt8(0, e + 3);            // reserved
  header.writeUInt16LE(1, e + 4);         // colour planes
  header.writeUInt16LE(32, e + 6);        // bits per pixel
  header.writeUInt32LE(buf.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += buf.length;
});
writeFileSync(join(pub, 'favicon.ico'), Buffer.concat([header, ...imgs]));

console.log('Generated:', ['favicon.ico', 'favicon-96.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'].join(', '));
