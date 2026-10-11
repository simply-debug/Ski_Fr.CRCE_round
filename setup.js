#!/usr/bin/env node
// One-time setup: downloads the MediaPipe files the extension needs into ./lib
// (Chrome extensions may not load code from a CDN, so the files must live inside the extension folder.)
// Usage:  node setup.js        (needs Node 18 or newer)

const fs = require('fs');
const path = require('path');

const VERSION = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const FILES = [
  [`${CDN}/vision_bundle.mjs`, 'lib/vision_bundle.mjs'],
  [`${CDN}/wasm/vision_wasm_internal.js`, 'lib/wasm/vision_wasm_internal.js'],
  [`${CDN}/wasm/vision_wasm_internal.wasm`, 'lib/wasm/vision_wasm_internal.wasm'],
  [`${CDN}/wasm/vision_wasm_nosimd_internal.js`, 'lib/wasm/vision_wasm_nosimd_internal.js'],
  [`${CDN}/wasm/vision_wasm_nosimd_internal.wasm`, 'lib/wasm/vision_wasm_nosimd_internal.wasm'],
  [MODEL, 'lib/face_landmarker.task'],
  [HAND_MODEL, 'lib/hand_landmarker.task'],
];

async function download(url, dest) {
  const full = path.join(__dirname, dest);
  if (fs.existsSync(full) && fs.statSync(full).size > 1000) {
    console.log('  already have', dest);
    return true;
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) throw new Error('file too small (' + buf.length + ' bytes)');
    fs.writeFileSync(full, buf);
    console.log('  saved       ', dest, `(${(buf.length / 1024).toFixed(0)} KB)`);
    return true;
  } catch (err) {
    console.log('  FAILED      ', dest, '-', err.message);
    return false;
  }
}

(async () => {
  if (typeof fetch !== 'function') {
    console.error('This script needs Node 18 or newer. Install it from https://nodejs.org or use the manual steps in README.md.');
    process.exit(1);
  }
  console.log('Downloading MediaPipe files into ./lib ...');
  const failed = [];
  for (const [url, dest] of FILES) {
    if (!(await download(url, dest))) failed.push([url, dest]);
  }
  if (failed.length) {
    console.log('\nSome files failed. Download these in your browser and save them at the paths shown:\n');
    for (const [url, dest] of failed) console.log(`  ${dest}\n    <- ${url}`);
    process.exit(1);
  }
  console.log('\nAll set. Now load this folder in chrome://extensions (Developer mode -> Load unpacked).');
})();