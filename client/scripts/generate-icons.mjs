import sharp from 'sharp';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '../public/icons');

// SVG icon design - dark background with gold book
const svgIcon = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" rx="200" fill="#07090f"/>
  <!-- Book outline -->
  <path d="M 280 240 L 280 760 L 744 760 L 744 240 Z" fill="none" stroke="#c9a84c" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Book spine -->
  <line x1="512" y1="240" x2="512" y2="760" stroke="#c9a84c" stroke-width="40" stroke-linecap="round"/>
  <!-- Page lines -->
  <line x1="320" y1="320" x2="472" y2="320" stroke="#c9a84c" stroke-width="24" stroke-linecap="round" opacity="0.6"/>
  <line x1="320" y1="400" x2="472" y2="400" stroke="#c9a84c" stroke-width="24" stroke-linecap="round" opacity="0.6"/>
  <line x1="320" y1="480" x2="472" y2="480" stroke="#c9a84c" stroke-width="24" stroke-linecap="round" opacity="0.6"/>
  <line x1="552" y1="320" x2="704" y2="320" stroke="#c9a84c" stroke-width="24" stroke-linecap="round" opacity="0.6"/>
  <line x1="552" y1="400" x2="704" y2="400" stroke="#c9a84c" stroke-width="24" stroke-linecap="round" opacity="0.6"/>
  <line x1="552" y1="480" x2="704" y2="480" stroke="#c9a84c" stroke-width="24" stroke-linecap="round" opacity="0.6"/>
  <!-- Bookmark -->
  <path d="M 640 200 L 640 540 L 600 500 L 560 540 L 560 200 Z" fill="#c9a84c"/>
</svg>
`;

async function generateIcons() {
  const sizes = [192, 512, 1024];

  for (const size of sizes) {
    console.log(`Generating ${size}x${size} icon...`);

    const buffer = Buffer.from(svgIcon);
    await sharp(buffer)
      .resize(size, size)
      .png()
      .toFile(join(iconsDir, `icon-${size}.png`));

    console.log(`✓ Created icon-${size}.png`);
  }

  console.log('\n✓ All icons generated successfully!');
}

generateIcons().catch(console.error);
