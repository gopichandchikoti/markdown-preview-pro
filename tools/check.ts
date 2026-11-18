export {};
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const { spawnSync } = require('node:child_process');
import { JSDOM } from 'jsdom';
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ?
    files(join(directory, entry.name)) : [join(directory, entry.name)]);
}
for (const file of [...files('dist/src'), ...files('dist/tools'), ...files('dist/tests'), ...files('dist/e2e')]) {
  if (!/\.(?:js|cjs)$/.test(file)) continue;
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const model = require('../../public/markdown-preview-pro.model.json');
const { validate } = require('../src/content'); validate(model);
const html = new JSDOM(readFileSync('public/index.html', 'utf8'));
for (const element of html.window.document.querySelectorAll<HTMLElement>('[data-text], [data-label], [data-placeholder], [data-tip-key]')) {
  for (const field of ['text', 'label', 'placeholder', 'tipKey']) if (element.dataset[field] &&
    !Object.hasOwn(model.locales[model.defaultLocale], element.dataset[field])) throw Error('Missing content key');
}
html.window.close();
console.log('Syntax and content references passed.');
