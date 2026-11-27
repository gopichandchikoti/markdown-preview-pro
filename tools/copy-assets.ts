export {};
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
// Copy the compiled browser scripts into public/ so a static host serves
// the same files the local server maps from dist/src and vendor.
fs.rmSync(path.join(root, 'public/src'), { recursive: true, force: true });
fs.rmSync(path.join(root, 'public/vendor'), { recursive: true, force: true });
fs.cpSync(path.join(root, 'dist/src'), path.join(root, 'public/src'), { recursive: true });
fs.mkdirSync(path.join(root, 'public/vendor'), { recursive: true });
fs.copyFileSync(path.join(root, 'vendor/purify.min.js'), path.join(root, 'public/vendor/purify.min.js'));
for (const dir of ['katex', 'mermaid']) fs.cpSync(path.join(root, 'vendor', dir), path.join(root, 'public/vendor', dir), { recursive: true });
console.log('Copied compiled browser assets to public/.');
