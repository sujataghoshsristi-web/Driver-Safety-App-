import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgBuffer = fs.readFileSync(path.resolve('./public/icon.svg'));

async function generate() {
  console.log('Generating PWA icons from icon.svg...');

  // 192x192 standard
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.resolve('./public/pwa-192x192.png'));

  // 512x512 standard
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve('./public/pwa-512x512.png'));

  // 180x180 for iOS Apple Touch Icon
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.resolve('./public/apple-touch-icon.png'));

  // 512x512 maskable (with 15% inner padding)
  await sharp(svgBuffer)
    .resize(410, 410)
    .extend({
      top: 51,
      bottom: 51,
      left: 51,
      right: 51,
      background: '#051424'
    })
    .png()
    .toFile(path.resolve('./public/pwa-maskable-512x512.png'));

  // 32x32 favicon
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.resolve('./public/favicon.ico'));

  console.log('All PWA PNG icons generated successfully in /public!');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
