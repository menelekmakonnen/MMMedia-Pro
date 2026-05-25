/**
 * Generate transparent PNG icons AND a proper multi-resolution .ico from the SVG source.
 * Run: node scripts/generate-icon.cjs
 *
 * The .ico is critical for Windows taskbar icon persistence when the app is pinned.
 * It embeds 16, 32, 48, 64, 128, and 256px versions so Windows can pick the right
 * size for any context (taskbar, Alt-Tab, window title bar, etc.)
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, '..', 'public', 'icon.svg');
const OUT_DIR = path.join(__dirname, '..', 'public');

const SIZES = [256, 128, 64, 48, 32, 16];

/**
 * Creates a Windows .ico file from multiple PNG buffers.
 * ICO format: header + directory entries + image data
 */
function createIco(pngBuffers) {
    const numImages = pngBuffers.length;
    const headerSize = 6;
    const dirEntrySize = 16;
    const dirSize = dirEntrySize * numImages;

    // Calculate offsets
    let dataOffset = headerSize + dirSize;
    const offsets = [];
    for (const buf of pngBuffers) {
        offsets.push(dataOffset);
        dataOffset += buf.length;
    }

    // ICO header: reserved (2) + type=1 (2) + count (2)
    const header = Buffer.alloc(headerSize);
    header.writeUInt16LE(0, 0);        // reserved
    header.writeUInt16LE(1, 2);        // type: 1 = icon
    header.writeUInt16LE(numImages, 4); // number of images

    // Directory entries
    const dir = Buffer.alloc(dirSize);
    for (let i = 0; i < numImages; i++) {
        const size = SIZES[i];
        const offset = i * dirEntrySize;
        dir.writeUInt8(size >= 256 ? 0 : size, offset);     // width (0 = 256)
        dir.writeUInt8(size >= 256 ? 0 : size, offset + 1); // height (0 = 256)
        dir.writeUInt8(0, offset + 2);                        // color palette
        dir.writeUInt8(0, offset + 3);                        // reserved
        dir.writeUInt16LE(1, offset + 4);                     // color planes
        dir.writeUInt16LE(32, offset + 6);                    // bits per pixel
        dir.writeUInt32LE(pngBuffers[i].length, offset + 8);  // image size
        dir.writeUInt32LE(offsets[i], offset + 12);            // offset to data
    }

    return Buffer.concat([header, dir, ...pngBuffers]);
}

async function generate() {
    const svgBuffer = fs.readFileSync(SVG_PATH);

    // Main icon (256px) for Electron window
    await sharp(svgBuffer)
        .resize(256, 256)
        .png({ quality: 100 })
        .toFile(path.join(OUT_DIR, 'icon-v2.png'));

    console.log('✅ Generated icon-v2.png (256px)');

    // Generate all sizes as PNGs and collect buffers for .ico
    const pngBuffers = [];
    for (const size of SIZES) {
        const pngBuffer = await sharp(svgBuffer)
            .resize(size, size)
            .png({ quality: 100 })
            .toBuffer();

        // Also write individual PNGs
        fs.writeFileSync(path.join(OUT_DIR, `icon-${size}.png`), pngBuffer);
        console.log(`✅ Generated icon-${size}.png`);

        pngBuffers.push(pngBuffer);
    }

    // Also generate the large icon.png (used as source reference)
    await sharp(svgBuffer)
        .resize(512, 512)
        .png({ quality: 100 })
        .toFile(path.join(OUT_DIR, 'icon.png'));
    console.log('✅ Generated icon.png (512px)');

    // Generate .ico with all sizes embedded
    const icoBuffer = createIco(pngBuffers);
    fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), icoBuffer);
    console.log(`✅ Generated icon.ico (${SIZES.join(', ')}px — ${(icoBuffer.length / 1024).toFixed(1)}KB)`);

    console.log('\nDone! All icons generated from current SVG source.');
}

generate().catch(console.error);
