/**
 * Akù — App Icon Generator
 * Run with: node scripts/generate-icons.js
 * Requires: npm install canvas (local dev only)
 *
 * Generates 1024×1024 icon PNG files for each variant.
 * Place output in assets/images/icons/
 */
const path = require('path');
const fs   = require('fs');

const ICONS = [
  { name: 'icon-midnight', bg: '#0F1110', text: '#C9A96A', textSecondary: 'rgba(201,169,106,0.6)' },
  { name: 'icon-gold',     bg: '#C9A96A', text: '#163A2F', textSecondary: 'rgba(22,58,47,0.6)' },
  { name: 'icon-linen',    bg: '#FAFAF8', text: '#163A2F', textSecondary: 'rgba(22,58,47,0.5)' },
  { name: 'icon-graphite', bg: '#2A2D2B', text: '#C9A96A', textSecondary: 'rgba(201,169,106,0.6)' },
  { name: 'icon-coral',    bg: '#E8734A', text: '#FAFAF8', textSecondary: 'rgba(250,250,248,0.7)' },
];

const outDir = path.join(__dirname, '..', 'assets', 'images', 'icons');

try {
  const { createCanvas } = require('canvas');

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const icon of ICONS) {
    const size   = 1024;
    const canvas = createCanvas(size, size);
    const ctx    = canvas.getContext('2d');

    // Background
    ctx.fillStyle = icon.bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 200);
    ctx.fill();

    // Wordmark — "Akù"
    ctx.fillStyle = icon.text;
    ctx.font      = '200px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Akù', size / 2, size / 2);

    const buf  = canvas.toBuffer('image/png');
    const file = path.join(outDir, `${icon.name}.png`);
    fs.writeFileSync(file, buf);
    console.log(`  ✓ ${icon.name}.png`);
  }

  console.log('\nAll icons generated in assets/images/icons/');
} catch {
  // canvas not installed — print instructions
  console.log('Icon variants to create (run after: npm install canvas):\n');
  ICONS.forEach((i) => console.log(`  ${i.name}: bg=${i.bg} text=${i.text}`));
  console.log('\nPlace 1024×1024 PNG files at assets/images/icons/ before running eas build.');
  console.log('Output directory:', outDir);
}
