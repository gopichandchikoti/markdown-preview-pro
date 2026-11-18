export {};
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { create, validate } = require('../src/content');
const { reconcile, read, write } = require('../src/workspace/workspace-state');
test('content adapter validates parity, placeholders, fallback and never renders unknown keys', () => {
  const model = { schemaVersion: 1, defaultLocale: 'en', locales: { en: { greeting: 'Hi {name}' },
    fr: { greeting: 'Bonjour {name}' } } };
  assert.equal(create(model, 'unknown').t('greeting', { name: 'Reader' }), 'Hi Reader');
  assert.equal(create(model, 'fr').t('greeting', { name: 'Reader' }), 'Bonjour Reader');
  assert.throws(() => create(model).t('missing'), /Missing content/);
  assert.throws(() => validate({ ...model, locales: { ...model.locales, fr: {} } }), /key mismatch/);
  assert.throws(() => validate({ ...model, locales: { ...model.locales, fr: { greeting: '{wrong}' } } }), /placeholder/);
});
test('UI state recovers invalid references, deduplicates tabs and safely handles denied/corrupt preferences', () => {
  const snapshot = { folders: [{ id: 'f' }], documents: [{ id: 'a' }, { id: 'b' }] };
  const value = reconcile({ tabs: ['a', 'a', 'deleted'], active: 'deleted', selectedFolder: 'gone' }, snapshot);
  assert.deepEqual(value.tabs, ['a']); assert.equal(value.active, 'a'); assert.equal(value.selectedFolder, 'f');
  assert.equal(reconcile({ tabs: [], active: 'a' }, snapshot).active, null);
  assert.equal(reconcile({ tabs: ['gone'] }, snapshot).active, 'a');
  assert.deepEqual(read({ getItem() { throw Error('denied'); } }), {});
  assert.equal(write({}, { setItem() { throw Error('quota'); } }), false);
});
