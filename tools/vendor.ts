export {};
const { mkdirSync, copyFileSync } = require('node:fs');
import { join } from 'node:path';
const root = join(__dirname, '../..');
mkdirSync(join(root, 'vendor'), { recursive: true });
copyFileSync(join(root, 'node_modules/dompurify/dist/purify.min.js'), join(root, 'vendor/purify.min.js'));
copyFileSync(join(root, 'node_modules/dompurify/LICENSE'), join(root, 'vendor/DOMPurify-LICENSE'));
