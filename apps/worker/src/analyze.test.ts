import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeText } from './analyze';

test('analyzes words, sentences, characters, and reading time', () => {
  assert.deepEqual(analyzeText('VEGAH builds cloud systems. This is a queued job!'), {
    characters: 49,
    words: 9,
    sentences: 2,
    estimatedReadingSeconds: 3,
  });
});

test('handles whitespace-only input', () => {
  assert.deepEqual(analyzeText('   '), {
    characters: 3,
    words: 0,
    sentences: 0,
    estimatedReadingSeconds: 0,
  });
});
