export {};
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
const { createSecurity, validDocument, safeUrl } = require('../src/security');
const { createAppServer } = require('../tools/server');
import { get } from 'node:http';

test('sanitizes executable markup, clobbering attributes, forms and unsafe destinations', () => {
  const window = new JSDOM('').window;
  const security = createSecurity(createDOMPurify(window));
  const fragment = security.sanitize('<script>bad()</script><svg onload="bad()"></svg>' +
    '<a id="editor" href="javascript:bad()" onclick="bad()">bad</a>' +
    '<form action="https://bad.example"><input name="editor" type="password"></form>' +
    '<img src="data:image/svg+xml,bad" onerror="bad()"><iframe src="https://bad.example"></iframe>');
  assert.equal(fragment.querySelectorAll('script,svg,form,iframe,input,[id],[name],[onclick],[onerror],[src]').length, 0);
  assert.equal(fragment.querySelector('a').hasAttribute('href'), false);
  window.close();
});

test('keeps formatting and checkboxes but defers remote image loading and protects links', () => {
  const window = new JSDOM('').window;
  const fragment = createSecurity(createDOMPurify(window)).sanitize('<h1>Heading</h1><strong>Bold</strong>' +
    '<img src="https://images.example/photo.png" alt="Photo"><a href="https://example.com">Link</a>' +
    '<ul><li><input type="checkbox" checked>Task</li></ul>');
  assert.equal(fragment.querySelector('img').hasAttribute('src'), false);
  assert.equal(fragment.querySelector('img').dataset.remoteSrc, 'https://images.example/photo.png');
  assert.equal(fragment.querySelector('a').rel, 'noopener noreferrer');
  assert.equal(fragment.querySelector('input').checked, true);
  assert.equal(fragment.querySelector('strong').textContent, 'Bold');
  window.close();
});

test('bounds documents and normalizes destinations without accepting credentials or dangerous schemes', () => {
  assert.equal(validDocument('x'.repeat(10000)), true);
  for (const input of ['x'.repeat(10001), 'x\n'.repeat(10001), 'x'.repeat(200001), null])
    assert.equal(validDocument(input), false);
  for (const url of ['javascript:alert(1)', 'data:text/html,bad', 'file:///secret', 'https://user:pass@example.com'])
    assert.equal(safeUrl(url), null);
  assert.equal(safeUrl('/relative', true), null);
  assert.equal(safeUrl('mailto:hello@example.com'), 'mailto:hello@example.com');
});

test('server serves only runtime files, denies foreign hosts/mutations and adds browser protections', async () => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy') || '', /script-src 'self'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    for (const path of ['/.git/config', '/package.json', '/node_modules/dompurify/package.json', '/.env'])
      assert.equal((await fetch(base + path)).status, 404);
    const foreignStatus = await new Promise((resolve, reject) => {
      get(base, { headers: { host: 'attacker.example' } }, response => {
        response.resume(); resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(foreignStatus, 403);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    assert.equal((await fetch(base, { method: 'HEAD' })).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('stored-image references become data attributes without a src, and look-alikes stay inert', () => {
  const window = new JSDOM('').window;
  const security = createSecurity(createDOMPurify(window));
  const fragment = security.sanitize('<img src="#img-0123abcd-4567" alt="ok"><img src="#img-x" alt="short"><img src="#other" alt="no">' +
    '<span class="math-inline">x^2</span><div class="mermaid-block">graph TD</div>');
  const images = [...fragment.querySelectorAll('img')];
  assert.equal(images[0].dataset.localImage, '0123abcd-4567'); assert.equal(images[0].hasAttribute('src'), false);
  assert.equal(images[1].dataset.localImage, undefined); assert.equal(images[2].dataset.localImage, undefined);
  assert.ok(fragment.querySelector('.math-inline')); assert.ok(fragment.querySelector('.mermaid-block'));
  window.close();
});
