export {};
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { validate } = require('../src/content');
const { parseJSON } = require('../src/json');
const root = path.join(__dirname, '../..');
const model = validate(parseJSON(fs.readFileSync(path.join(root, 'public/markdown-preview-pro.model.json'), 'utf8')));
fs.writeFileSync(path.join(root, 'src/content-data.ts'),
  '// Generated from public/markdown-preview-pro.model.json. Edit the model.\n' +
  'globalThis.ContentModel = ' + JSON.stringify(model) + ';\n');

fs.mkdirSync(path.join(root, 'dist/public'), { recursive:true });
fs.copyFileSync(path.join(root, 'public/markdown-preview-pro.model.json'), path.join(root, 'dist/public/markdown-preview-pro.model.json'));
