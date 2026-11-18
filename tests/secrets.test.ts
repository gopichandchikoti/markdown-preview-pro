import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanText } from '../tools/secrets';

test('secret scanner detects synthetic positives without reporting matching values', () => {
  const controls = [
    { value:'-----BEGIN ' + 'PRIVATE KEY-----', rule:'private-key' },
    { value:'gh' + 'p_' + 'x'.repeat(36), rule:'github-token' },
    { value:'AK' + 'IA' + 'A'.repeat(16), rule:'aws-access-key' },
    { value:'sk_' + 'test_' + 'x'.repeat(25), rule:'stripe-secret' },
  ];
  for (const control of controls) assert.deepEqual(scanText(control.value), [control.rule]);
  assert.deepEqual(scanText('Example placeholder, safe Markdown and public URL https://example.com'), []);
  assert.deepEqual(scanText('github_pat_<placeholder> and AKIA_EXAMPLE'), []);
});
