#!/usr/bin/env node
// Validate the actual shipped two-tone desktop bitmaps, not only their source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

const root = resolve(import.meta.dirname ?? '.', '../../');
const file = (p) => readFileSync(resolve(root, p));
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const navy = [16, 29, 51];
const cyan = [77, 216, 245];

function png(path, expectedSize) {
  const data = file(path);
  assert.ok(data.subarray(0, 8).equals(sig), path + ' missing PNG signature');
  let offset = 8, width, height, palette, alpha, raw;
  while (offset + 12 <= data.length) {
    const n = data.readUInt32BE(offset), type = data.toString('ascii', offset + 4, offset + 8);
    assert.ok(offset + n + 12 <= data.length, path + ' has malformed chunk');
    const payload = data.subarray(offset + 8, offset + 8 + n);
    if (type === 'IHDR') {
      width = payload.readUInt32BE(0); height = payload.readUInt32BE(4);
      assert.equal(payload[8], 8, 'Expected 8-bit palette');
      assert.equal(payload[9], 3, 'Expected paletted PNG');
    }
    if (type === 'PLTE') palette = payload;
    if (type === 'tRNS') alpha = payload;
    if (type === 'IDAT') raw = raw ? Buffer.concat([raw, payload]) : payload;
    offset += 12 + n;
    if (type === 'IEND') break;
  }
  assert.equal(width, expectedSize, path + ' incorrect width');
  assert.equal(height, expectedSize, path + ' incorrect height');
  assert.ok(palette && alpha && raw, path + ' missing palette/transparency/pixels');
  assert.equal(palette.length / 3, alpha.length, 'Palette alpha mismatch');
  assert.deepEqual([...palette.subarray(0, 3)], navy, 'Expected midnight navy base');
  assert.deepEqual([...palette.subarray(palette.length - 3)], cyan, 'Expected electric cyan accent');
  const pixels = inflateSync(raw);
  assert.equal(pixels.length, (width + 1) * height, path + ' invalid pixel scanlines');
  for (let y = 0; y < height; y++) {
    assert.equal(pixels[y * (width + 1)], 0, 'Unexpected PNG filter type');
  }
  return data;
}

function ico(path) {
  const data = file(path);
  assert.equal(data.readUInt16LE(0), 0);
  assert.equal(data.readUInt16LE(2), 1);
  const count = data.readUInt16LE(4);
  assert.ok(count >= 4, 'ICO lacks multi-resolution icons');
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16, len = data.readUInt32LE(entry + 8), offset = data.readUInt32LE(entry + 12);
    assert.ok(offset + len <= data.length && len > 0, 'ICO image outside file');
    assert.ok(data.subarray(offset, offset + 8).equals(sig), 'ICO image not PNG');
  }
}

function icns(path) {
  const data = file(path);
  assert.equal(data.toString('ascii', 0, 4), 'icns');
  assert.equal(data.readUInt32BE(4), data.length);
  let offset = 8, entries = 0;
  while (offset < data.length) {
    const len = data.readUInt32BE(offset + 4);
    assert.ok(len > 8 && offset + len <= data.length, 'Malformed ICNS entry');
    assert.ok(data.subarray(offset + 8, offset + 16).equals(sig), 'ICNS bitmap not PNG');
    offset += len; entries++;
  }
  assert.ok(entries >= 6, 'ICNS lacks high-DPI variants');
}

const generated = [
  ['src-tauri/icons/32x32.png', 32],
  ['src-tauri/icons/64x64.png', 64],
  ['src-tauri/icons/128x128.png', 128],
  ['src-tauri/icons/128x128@2x.png', 256],
  ['src-tauri/icons/icon.png', 512],
  ['src-tauri/icons/dev/32x32.png', 32],
  ['src-tauri/icons/dev/128x128.png', 128],
  ['src-tauri/icons/dev/128x128@2x.png', 256],
  ['src-tauri/icons/dev/icon.png', 512],
  ['src-tauri/icons/dock/dark.png', 512],
];
for (const [path, n] of generated) png(path, n);
assert.ok(file('src-tauri/icons/icon.png').equals(file('src-tauri/icons/dock/dark.png')),
  'macOS live Dock must use the same mark as the installer');
assert.ok(!file('src-tauri/icons/icon.png').equals(file('src-tauri/icons/dev/icon.png')),
  'Dev must be recognizable and distinguishable from production');

for (const path of ['src-tauri/icons/icon.ico', 'src-tauri/icons/dev/icon.ico']) ico(path);
for (const path of ['src-tauri/icons/icon.icns', 'src-tauri/icons/dev/icon.icns']) icns(path);

for (const path of ['assets/branding/tp-agent-studio.svg', 'assets/branding/tp-agent-studio-dev.svg']) {
  const source = file(path).toString('utf8');
  assert.ok(source.includes('#101D33') && source.includes('#4DD8F5'),
    path + ' must preserve the two-ink brand palette');
}
for (const configFile of ['src-tauri/tauri.conf.json', 'src-tauri/tauri.dev.conf.json']) {
  const config = JSON.parse(file(configFile).toString('utf8'));
  for (const icon of config.bundle.icon) {
    file(resolve('src-tauri', icon));
  }
}
console.log('Two-tone desktop icon sources, multi-resolution PNG, ICO and ICNS passed');
