/**
 * Generate transparent PNG icons from the SVG source.
 * Run: node scripts/generate-icon.cjs
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, '..', 'public', 'icon.svg');
const OUT_DIR = path.join(__dirname, '..', 'public');

const SIZES = [256, 128, 64, 48, 32, 16];

async function generate() {
    const svgBuffer = fs.readFileSync(SVG_PATH);

    // Main icon (256px) for Electron window
    await sharp(svgBuffer)
        .resize(256, 256)
        .png({ quality: 100 })
        .toFile(path.join(OUT_DIR, 'icon-v2.png'));

    console.log('✅ Generated icon-v2.png (256px)');

    // Additional sizes for multi-res
    for (const size of SIZES) {
        await sharp(svgBuffer)
            .resize(size, size)
            .png({ quality: 100 })
            .toFile(path.join(OUT_DIR, `icon-${size}.png`));
        console.log(`✅ Generated icon-${size}.png`);
    }

    console.log('\nDone! Icons generated with transparent backgrounds.');
}

generate().catch(console.error);
