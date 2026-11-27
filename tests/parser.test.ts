export {};
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { join } = require('node:path');

function load() {
  const context:Record<string, unknown> = { Content: { t: (key:string) => key } };
  vm.createContext(context);
  vm.runInContext(readFileSync(join(__dirname, '../src/parser.js'), 'utf8') + '\nthis.parseMD = parseMD;', context);
  return context.parseMD as (source:string) => string;
}

test('fenced code highlights keywords, strings, numbers and comments and escapes markup', () => {
  const html = load()('```js\n// note\nconst a = "x" < 42;\n```');
  assert.match(html, /<span class="tok-c">\/\/ note<\/span>/);
  assert.match(html, /<span class="tok-k">const<\/span>/);
  assert.match(html, /<span class="tok-s">"x"<\/span>/);
  assert.match(html, /<span class="tok-n">42<\/span>/);
  assert.match(html, /&lt;/);
  assert.doesNotMatch(html, /<script/i);
});

test('unknown fence languages stay plain and escaped', () => {
  assert.match(load()('```text\n<b>x</b>\n```'), /&lt;b&gt;x&lt;\/b&gt;/);
});

test('emoji shortcodes convert outside code spans only', () => {
  const html = load()('Go :rocket: and `:rocket:` now :unknown:');
  assert.match(html, /Go 🚀 and <code>:rocket:<\/code> now :unknown:/);
});

test('footnotes are numbered in order of use with a back link and no stray definition line', () => {
  const html = load()('A[^b] then B[^a]\n\n[^a]: Alpha\n[^b]: Beta');
  assert.match(html, /fn-ref-1" href="#">1<\/a>[\s\S]*fn-ref-2" href="#">2<\/a>/);
  assert.match(html, /fn-def-1"><span>Beta<\/span>/);
  assert.match(html, /fn-def-2"><span>Alpha<\/span>/);
  assert.doesNotMatch(html, /\[\^a\]:/);
});

test('inline and display math become placeholders; money and escaped dollars stay text', () => {
  const parse = load();
  assert.match(parse('Energy $E = mc^2$ here'), /<span class="math-inline">E = mc\^2<\/span>/);
  assert.match(parse('It costs $5 and $10 today'), /costs \$5 and \$10/);
  assert.doesNotMatch(parse('It costs $5 and $10 today'), /math-inline/);
  assert.doesNotMatch(parse('Escaped \\$x\\$ stays'), /math-inline/);
  assert.match(parse('$$\n\\int_0^1 x^2\\,dx\n$$'), /<div class="math-block">\\int_0\^1 x\^2\\,dx<\/div>/);
  assert.match(parse('$$a<b$$'), /<div class="math-block">a&lt;b<\/div>/);
  assert.match(parse('`$a$` code'), /<code>\$a\$<\/code>/);
});

test('mermaid fences become diagram blocks with escaped source and no code chrome', () => {
  const html = load()('```mermaid\ngraph TD\n  A-->B\n```');
  assert.match(html, /<div class="mermaid-block">graph TD\n  A--&gt;B<\/div>/);
  assert.doesNotMatch(html, /copy-btn/);
});

test('local images keep their reference form for the sanitizer', () => {
  assert.match(load()('![shot](#img-0123abcd-4567)'), /<img src="#img-0123abcd-4567" alt="shot">/);
});
