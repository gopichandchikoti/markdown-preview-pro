export {};
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createAppServer } = require('../tools/server');
const ROOT = join(__dirname, '../..');

test('every script and stylesheet that index.html loads is served by the app server and exists after a build', async () => {
  const html = readFileSync(join(ROOT, 'public/index.html'), 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="((?:src|vendor)\/[^"]+|[\w-]+\.css)"/g)].map(m => m[1]);
  assert.ok(assets.length > 30, 'expected many assets, found ' + assets.length);
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const missing:string[] = [];
    for (const asset of assets) { const response = await fetch(base + '/' + asset); await response.arrayBuffer(); if (response.status !== 200) missing.push(asset + ' -> ' + response.status); }
    assert.deepEqual(missing, []);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('removed features leave no script behind in the page or server', async () => {
  const html = readFileSync(join(ROOT, 'public/index.html'), 'utf8');
  assert.doesNotMatch(html, /history\.js|historyDialog|openHistory/);
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { assert.equal((await fetch('http://127.0.0.1:' + server.address().port + '/src/editor/history.js')).status, 404); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
