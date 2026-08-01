// Smoke test for AutocompleteInput.tsx's filtering/highlighting logic (see
// utils/autocomplete.ts, where it lives specifically so it's unit-testable -
// this harness runs plain node:test and can't render a React/RN component
// tree). Run with `npm run test:smoke`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterSuggestions, splitHighlightMatch } from '../autocomplete';

const stores = ['Ice Cream Junction', 'Ice World', 'ICE CREAM PARADISE', 'Cool Corner', ''];

test('filterSuggestions: empty query returns nothing (no suggestions shown on an untouched field)', () => {
  assert.deepEqual(filterSuggestions(stores, ''), []);
  assert.deepEqual(filterSuggestions(stores, '   '), []);
});

test('filterSuggestions: case-insensitive substring match', () => {
  assert.deepEqual(filterSuggestions(stores, 'ice'), ['Ice Cream Junction', 'Ice World', 'ICE CREAM PARADISE']);
});

test('filterSuggestions: matches anywhere in the string, not just the start', () => {
  assert.deepEqual(filterSuggestions(stores, 'corner'), ['Cool Corner']);
});

test('filterSuggestions: excludes an entry that already equals the query exactly, but keeps a superstring match', () => {
  // Nothing useful to suggest for a value that's already fully typed - but a
  // longer name that happens to contain it verbatim is still a real match.
  const withSuperstring = ['Ice World', 'Ice World Junction', 'Cool Corner'];
  assert.deepEqual(filterSuggestions(withSuperstring, 'ice world'), ['Ice World Junction']);
});

test('filterSuggestions: dedupes entries that only differ by case', () => {
  const withDupes = ['Konkan Dairy', 'konkan dairy', 'KONKAN DAIRY', 'Konkan Traders'];
  assert.deepEqual(filterSuggestions(withDupes, 'konkan'), ['Konkan Dairy', 'Konkan Traders']);
});

test('filterSuggestions: skips blank/whitespace-only entries in the source pool', () => {
  assert.deepEqual(filterSuggestions(['', '   ', 'Ice World'], 'ice'), ['Ice World']);
});

test('filterSuggestions: caps results at maxSuggestions', () => {
  const many = ['Store 1', 'Store 2', 'Store 3', 'Store 4', 'Store 5'];
  assert.deepEqual(filterSuggestions(many, 'store', 3), ['Store 1', 'Store 2', 'Store 3']);
});

test('filterSuggestions: no match returns an empty list rather than throwing', () => {
  assert.deepEqual(filterSuggestions(stores, 'xyz-not-present'), []);
});

test('splitHighlightMatch: highlights a mid-string match', () => {
  assert.deepEqual(splitHighlightMatch('Ice Cream Junction', 'cream'), [
    { text: 'Ice ', matched: false },
    { text: 'Cream', matched: true },
    { text: ' Junction', matched: false },
  ]);
});

test('splitHighlightMatch: highlights a match at the very start (no leading segment)', () => {
  assert.deepEqual(splitHighlightMatch('Ice World', 'ice'), [
    { text: 'Ice', matched: true },
    { text: ' World', matched: false },
  ]);
});

test('splitHighlightMatch: highlights a match at the very end (no trailing segment)', () => {
  assert.deepEqual(splitHighlightMatch('Cool Corner', 'corner'), [
    { text: 'Cool ', matched: false },
    { text: 'Corner', matched: true },
  ]);
});

test('splitHighlightMatch: empty query returns the whole string unmatched', () => {
  assert.deepEqual(splitHighlightMatch('Ice World', ''), [{ text: 'Ice World', matched: false }]);
});

test('splitHighlightMatch: no match returns the whole string unmatched rather than throwing', () => {
  assert.deepEqual(splitHighlightMatch('Ice World', 'zzz'), [{ text: 'Ice World', matched: false }]);
});
