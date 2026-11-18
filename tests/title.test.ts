export {};
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { suggest } = require('../src/workspace/title');
test('offline title picks ATX then Setext then meaningful prose and strips unsafe syntax', () => {
  assert.equal(suggest('First prose\n\n# My **Project**'), 'My Project.md');
  assert.equal(suggest('My Project\n=========='), 'My Project.md');
  assert.equal(suggest('A meaningful first text line.'), 'A meaningful first text line.md');
  assert.equal(suggest('# [Project](example) / Plan: draft?'), 'Project Plan draft.md');
  assert.equal(suggest('```md\n# Hidden\n```\n# Real Project'), 'Real Project.md');
  assert.equal(suggest('~~~\n# Hidden\n~~~\n# Café notes'), 'Café notes.md');
  for (const source of ['', '---', '# Untitled', 'text', 'https://example.com', '<h1>HTML</h1>', '```\n# Code'])
    assert.equal(suggest(source), null);
});
